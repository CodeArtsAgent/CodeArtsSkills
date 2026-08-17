<#
.SYNOPSIS
    Extracts a Figma file via REST API and writes figma-extract.md +
    tree.txt + optional assets/. No JSON files are produced.

.PARAMETER FigmaUrl
    Full Figma URL, e.g.
    https://www.figma.com/design/KEY/name?node-id=0-1

.PARAMETER Token
    Figma personal access token. Falls back to $env:FIGMA_TOKEN.

.PARAMETER RequirementName
    Kebab-case slug appended to the date to form the spec folder name
    (e.g. "saas-website"). Only used when -OutputDir is not provided.
    Default: "figma-extract".

.PARAMETER OutputDir
    Directory to write artifacts. Default: ./specs/<YYYY-MM-DD-requirement-name>/figma-output

.PARAMETER DownloadAssets
    Download PNG (scale=2) + SVG assets into $OutputDir/assets.
    Off by default (text-only extract).

.PARAMETER IncludeFrames
    Also collect FRAME, GROUP, INSTANCE, and SECTION nodes for asset
    rendering (not just vectors/images/components). Use with
    -DownloadAssets. Can produce many files on large designs.

.EXAMPLE
    pwsh ./extract-figma.ps1 -FigmaUrl 'https://www.figma.com/design/KEY/name?node-id=0-1' -Token 'figd_...'
.EXAMPLE
    pwsh ./extract-figma.ps1 -FigmaUrl '...' -DownloadAssets
.EXAMPLE
    pwsh ./extract-figma.ps1 -FigmaUrl '...' -OutputDir ./out
#>
param(
  [Parameter(Mandatory=$true)][string]$FigmaUrl,
  [string]$Token=$env:FIGMA_TOKEN,
  [string]$RequirementName='figma-extract',
  [string]$OutputDir,
  [switch]$DownloadAssets,
  [switch]$IncludeFrames
)

$ErrorActionPreference="Stop"
if(!$Token){throw "Set FIGMA_TOKEN or use -Token"}

# Resolve OutputDir default: specs/<YYYY-MM-DD-requirement-name>/figma-output
if([string]::IsNullOrWhiteSpace($OutputDir)){
  $dateSlug=Get-Date -Format 'yyyy-MM-dd'
  $specDir=Join-Path './specs' ('{0}-{1}' -f $dateSlug,$RequirementName)
  $OutputDir=Join-Path $specDir 'figma-output'
}

# ---------- Parse URL ----------
if($FigmaUrl -notmatch "/(design|file)/([A-Za-z0-9]+)"){throw "Invalid Figma URL"}
$key=$Matches[2]

$node="0:1"
if($FigmaUrl -match "[?&]node-id=([^&]+)"){$node=$Matches[1] -replace "-",":"}

$h=@{"X-Figma-Token"=$Token}
New-Item -ItemType Directory -Force -Path $OutputDir,"$OutputDir/assets"|Out-Null

function Get-Figma($url){
  Invoke-RestMethod -Uri $url -Headers $h -Method Get -TimeoutSec 60
}

# Fetch one endpoint. Returns parsed object, or $null on failure.
# Retries up to 5 times on 429 (Too Many Requests) with exponential backoff.
function Fetch-FigmaEndpoint($Label,$Url){
  $maxRetries=5
  for($retry=0; $retry -lt $maxRetries; $retry++){
    try{
      $resp=Get-Figma $Url
      Write-Host "OK $Label"
      return $resp
    }catch{
      $isRateLimit=$_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 429
      if($isRateLimit -and $retry -lt ($maxRetries-1)){
        $wait=10*($retry+1)
        Write-Warning "$Label rate limited (429), retry $($retry+1)/$maxRetries in ${wait}s..."
        Start-Sleep -Seconds $wait
      }else{
        Write-Warning "$Label unavailable: $($_.Exception.Message)"
        return $null
      }
    }
  }
  return $null
}

# Sanitize a Figma node id for use as a Windows filename.
# Node ids contain ":" (e.g. "0:1") which is illegal in Windows paths.
function Safe-Name($id){ return ($id -replace '[\\/:*?"<>|]','-') }

Write-Host "File: $key"
Write-Host "Node: $node"
Write-Host "DownloadAssets: $($DownloadAssets.IsPresent)"
Write-Host "IncludeFrames: $($IncludeFrames.IsPresent)"

# ---------- File data ----------
$file=Fetch-FigmaEndpoint "node-tree" "https://api.figma.com/v1/files/$key/nodes?ids=$node"
if(!$file){throw "Node-tree fetch failed; cannot continue."}

# ---------- Comments ----------
$comments=Fetch-FigmaEndpoint "comments" "https://api.figma.com/v1/files/$key/comments"

# ---------- Styles ----------
$styles=Fetch-FigmaEndpoint "styles" "https://api.figma.com/v1/files/$key/styles"

# ---------- Components ----------
$components=Fetch-FigmaEndpoint "components" "https://api.figma.com/v1/files/$key/components"

# ---------- Component Sets ----------
$componentSets=Fetch-FigmaEndpoint "component-sets" "https://api.figma.com/v1/files/$key/component_sets"

# ---------- Dev resources ----------
$devResources=Fetch-FigmaEndpoint "dev-resources" "https://api.figma.com/v1/files/$key/dev_resources"

# ---------- Version history ----------
$versions=Fetch-FigmaEndpoint "versions" "https://api.figma.com/v1/files/$key/versions"

# ---------- Collect asset nodes ----------
# Images (uploaded pictures) -> PNG ; Icons (vectors/components) -> SVG
$imageNodes=@{}
$iconNodes=@{}
function Walk-Assets($n){
  if(!$n){return}
  switch($n.type){
    "IMAGE"             { $script:imageNodes[$n.id]=$n }
    "VECTOR"            { $script:iconNodes[$n.id]=$n }
    "BOOLEAN_OPERATION" { $script:iconNodes[$n.id]=$n }
    "COMPONENT"         { $script:iconNodes[$n.id]=$n }
    "COMPONENT_SET"     { $script:iconNodes[$n.id]=$n }
    default {
      if($IncludeFrames -and $n.type -in @("FRAME","GROUP","INSTANCE","SECTION")){
        $script:iconNodes[$n.id]=$n
      }
    }
  }
  if($n.children){foreach($c in $n.children){Walk-Assets $c}}
}

$root=$file.nodes.$node.document
if(!$root){Write-Warning "Root node '$node' not found in response; tree/asset walk skipped."}
else{Walk-Assets $root}

# ---------- Render/download assets (opt-in, batched) ----------
# Batch ids (50 per request) to avoid over-long URLs on large node sets.
function Download-RenderedAssets($Nodes,$Format,$Scale,$Ext){
  $idArray=@($Nodes.Keys)
  $batchSize=50
  $urlMap=@{}
  $downloaded=0
  for($b=0; $b -lt $idArray.Count; $b+=$batchSize){
    $end=[math]::Min($b+$batchSize-1,$idArray.Count-1)
    $batch=$idArray[$b..$end]
    $ids=($batch -join ",")
    $scaleParam=if($Scale){"&scale=$Scale"}else{""}
    $uri="https://api.figma.com/v1/images/${key}?ids=$ids&format=$Format$scaleParam"
    $resp=$null
    for($retry=0; $retry -lt 3; $retry++){
      try{
        $resp=Get-Figma $uri
        break
      }catch{
        if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 429){
          $wait=10*($retry+1)
          Write-Warning "Rate limited (batch $b), retry $retry in ${wait}s..."
          Start-Sleep -Seconds $wait
        }else{
          Write-Warning "$Format render failed (batch $b): $($_.Exception.Message)"
          break
        }
      }
    }
    if($resp -and $resp.images){
      foreach($id in $resp.images.PSObject.Properties){
        if($id.Value){
          $urlMap[$id.Name]=$id.Value
          try{
            Invoke-WebRequest $id.Value -OutFile (Join-Path $OutputDir "assets/$(Safe-Name $id.Name).$Ext")
            $downloaded++
          }catch{ Write-Warning "$Ext failed: $($id.Name)" }
        }
      }
    }
    Start-Sleep -Seconds 2
  }

  return $downloaded
}

if($DownloadAssets){
  if($imageNodes.Count){
    $pngCount=Download-RenderedAssets $imageNodes "png" 2 "png"
    Write-Host "OK PNG images: $pngCount files to $OutputDir/assets/"
  }
  if($iconNodes.Count){
    $svgCount=Download-RenderedAssets $iconNodes "svg" $null "svg"
    Write-Host "OK SVG icons: $svgCount files to $OutputDir/assets/"
  }
  if(-not $imageNodes.Count -and -not $iconNodes.Count){
    Write-Host "No image or icon nodes found to download."
  }
}elseif($imageNodes.Count -or $iconNodes.Count){
  $total=$imageNodes.Count + $iconNodes.Count
  Write-Host "Asset nodes found: $total (skipped; pass -DownloadAssets to fetch)"
}

# ---------- Simple tree ----------
$treePath=Join-Path $OutputDir "tree.txt"
function Write-Tree($n,$d=0){
  if(!$n){return}
  Add-Content $treePath ("  "*$d+"$($n.id) | $($n.type) | $($n.name)")
  if($n.type -eq "TEXT"){
    Add-Content $treePath ("  "*($d+1)+"TEXT: $($n.characters)")
    Add-Content $treePath ("  "*($d+1)+"FONT: $($n.style.fontFamily) $($n.style.fontSize) $($n.style.fontWeight)")
  }
  if($n.fills){
    foreach($f in $n.fills){
      if($f.color){
        Add-Content $treePath ("  "*($d+1)+"COLOR: R=$($f.color.r) G=$($f.color.g) B=$($f.color.b)")
      }
    }
  }
  if($n.children){foreach($c in $n.children){Write-Tree $c ($d+1)}}
}

Remove-Item $treePath -ErrorAction SilentlyContinue
if($root){Write-Tree $root}

# ---------- Color / design helpers ----------
function ConvertTo-FigmaHex($Color){
  if($null -eq $Color){return $null}
  $r=[Convert]::ToString([math]::Round($Color.r*255),16).PadLeft(2,'0').ToUpper()
  $g=[Convert]::ToString([math]::Round($Color.g*255),16).PadLeft(2,'0').ToUpper()
  $b=[Convert]::ToString([math]::Round($Color.b*255),16).PadLeft(2,'0').ToUpper()
  return ('#{0}{1}{2}' -f $r,$g,$b)
}
function Get-FigmaFills($Node){
  $hexes=@()
  if($Node.fills){foreach($f in $Node.fills){if($f.type -eq 'SOLID' -and $f.color){$h=ConvertTo-FigmaHex $f.color;if($h){$hexes+=$h}}}}
  if($Node.background){foreach($f in $Node.background){if($f.type -eq 'SOLID' -and $f.color){$h=ConvertTo-FigmaHex $f.color;if($h){$hexes+=$h}}}}
  if($Node.strokes){foreach($f in $Node.strokes){if($f.type -eq 'SOLID' -and $f.color){$h=ConvertTo-FigmaHex $f.color;if($h){$hexes+=$h}}}}
  return ($hexes | Select-Object -Unique)
}

# ---------- Markdown extract ----------
$mdPath=Join-Path $OutputDir "figma-extract.md"
$sb=[System.Text.StringBuilder]::new()
function Add-Md([string]$t){[void]$sb.AppendLine($t)}

Add-Md "# Figma Extract"
Add-Md ""
Add-Md "- Generated by: extract-figma.ps1"
Add-Md "- Generated at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Md "- File key: $key"
Add-Md "- Node: $node"
if($file.name){ Add-Md "- File name: $($file.name)" }
if($file.lastModified){ Add-Md "- Last modified: $($file.lastModified)" }
if($file.editorType){ Add-Md "- Editor type: $($file.editorType)" }
if($file.schemaVersion){ Add-Md "- Schema version: $($file.schemaVersion)" }
if($file.version){ Add-Md "- Version (snapshot): $($file.version)" }
Add-Md ""

# -- (a) Design Overview --
Add-Md "## a. Design Overview"
Add-Md ""
if($root){
  Add-Md "| Property | Value |"
  Add-Md "|---|---|"
  Add-Md "| Canvas / page name | $($root.name) (node $node) |"
  $frameCount=if($root.children){$root.children.Count}else{0}
  Add-Md "| Frame count (top-level) | $frameCount |"
  Add-Md ""
  Add-Md "### Top-level frames"
  Add-Md ""
  Add-Md "| # | Node name | Node-id | Size |"
  Add-Md "|---|---|---|---|"
  $i=0
  foreach($frame in $root.children){
    $i++
    $box=$frame.absoluteBoundingBox
    $size=""
    if($box -and $box.width -and $box.height){
      $w=[math]::Round([decimal]$box.width)
      $h=[math]::Round([decimal]$box.height)
      $size="$w x $h"
    }
    Add-Md "| $i | $($frame.name) | $($frame.id) | $size |"
  }
}
Add-Md ""

# -- (b) Color Tokens --
Add-Md "## b. Color Tokens"
Add-Md ""
$allColors=[System.Collections.Generic.HashSet[string]]::new()
function Collect-Colors($Node){
  if(!$Node){return}
  $fills=Get-FigmaFills $Node
  foreach($h in $fills){[void]$allColors.Add($h)}
  if($Node.children){foreach($c in $Node.children){Collect-Colors $c}}
}
if($root){foreach($frame in $root.children){Collect-Colors $frame}}
$colorToToken=@{
  '#FFFFFF'='--bg-primary'
  '#F8FAFC'='--bg-subtle'
  '#0F172A'='--ink-strong'
  '#475569'='--ink-muted'
  '#64748B'='--ink-muted-2'
  '#3B82F6'='--accent-primary'
  '#E2E8F0'='--border-default'
}
Add-Md "| Hex | Token name (suggested) |"
Add-Md "|---|---|"
foreach($h in ($allColors | Sort-Object)){
  $name=if($colorToToken.ContainsKey($h)){$colorToToken[$h]}else{'--color-custom'}
  Add-Md "| $h | $name |"
}
Add-Md ""

# -- (c) Typography --
Add-Md "## c. Typography"
Add-Md ""
Add-Md "| Node-id | Sample text | Size / Weight | Section |"
Add-Md "|---|---|---|---|"
function Collect-Typography($Node,$Section){
  if(!$Node){return}
  if($Node.type -eq 'TEXT' -and $Node.characters){
    $chars=$Node.characters
    if($chars.Length -gt 50){$chars=$chars.Substring(0,50)+"..."}
    $sz=if($Node.style.fontSize){$Node.style.fontSize}else{'?'}
    $wt=if($Node.style.fontWeight){$Node.style.fontWeight}else{'?'}
    $sample=$chars -replace '\|','\|' -replace "`n",' '
    Add-Md "| $($Node.id) | `"$sample`" | $sz / $wt | $Section |"
  }
  if($Node.children){foreach($c in $Node.children){Collect-Typography $c $Section}}
}
if($root){foreach($frame in $root.children){Collect-Typography $frame $frame.name}}
Add-Md ""

# -- (d) Spacing / Radius --
Add-Md "## d. Spacing / Radius"
Add-Md ""
Add-Md "| Value | Notes |"
Add-Md "|---|---|"
$radii=[System.Collections.Generic.HashSet[int]]::new()
function Collect-Radii($Node){
  if(!$Node){return}
  if($Node.cornerRadius){[void]$radii.Add([int]$Node.cornerRadius)}
  if($Node.children){foreach($c in $Node.children){Collect-Radii $c}}
}
if($root){foreach($frame in $root.children){Collect-Radii $frame}}
foreach($r in ($radii | Sort-Object)){Add-Md "| $r px | detected |"}
Add-Md ""

# -- (e) Section Inventory --
Add-Md "## e. Section Inventory"
Add-Md ""
if($root){
  foreach($frame in $root.children){
    Add-Md ""
    Add-Md "### $($frame.name) frame ($($frame.id))"
    Add-Md ""
    Add-Md "| # | Section name | Node-id | Children |"
    Add-Md "|---|---|---|---|"
    $j=0
    if($frame.children){
      foreach($section in $frame.children){
        $j++
        $childCount=if($section.children){$section.children.Count}else{0}
        Add-Md "| $j | $($section.name) | $($section.id) | $childCount |"
      }
    }
  }
}
Add-Md ""

# -- Comments --
Add-Md "## Comments"
Add-Md ""
if($comments -and $comments.comments){
  $cList=@($comments.comments)
  Add-Md "Total: $($cList.Count)"
  Add-Md ""
  Add-Md "| # | Author | Message | Node | Resolved | Created |"
  Add-Md "|---|---|---|---|---|---|"
  $i=0
  foreach($c in $cList){
    $i++
    $author=if($c.user -and $c.user.handle){$c.user.handle}else{"-"}
    $msg=if($c.message){$c.message}else{""}
    $msg=($msg -replace '\|','\|' -replace "`n",' ' -replace "`r",' ')
    if($msg.Length -gt 80){$msg=$msg.Substring(0,80)+"..."}
    $nid=if($c.client_meta -and $c.client_meta.node_id){$c.client_meta.node_id}else{"-"}
    $res=if($c.resolved){"yes"}else{"no"}
    $created=if($c.created_at){$c.created_at}else{"-"}
    Add-Md "| $i | $author | `"$msg`" | $nid | $res | $created |"
  }
}else{
  Add-Md "No comments available."
}
Add-Md ""

# -- Styles --
Add-Md "## Styles"
Add-Md ""
if($styles -and $styles.meta -and $styles.meta.styles){
  $sList=@($styles.meta.styles)
  Add-Md "Total: $($sList.Count)"
  Add-Md ""
  Add-Md "| # | Name | Type | Node | Description |"
  Add-Md "|---|---|---|---|---|"
  $i=0
  foreach($s in $sList){
    $i++
    $desc=if($s.description){$s.description}else{""}
    $desc=($desc -replace '\|','\|')
    if($desc.Length -gt 60){$desc=$desc.Substring(0,60)+"..."}
    Add-Md "| $i | $($s.name) | $($s.style_type) | $($s.node_id) | $desc |"
  }
}else{
  Add-Md "No styles available."
}
Add-Md ""

# -- Components --
Add-Md "## Components"
Add-Md ""
if($components -and $components.meta -and $components.meta.components){
  $compList=@($components.meta.components)
  Add-Md "Total: $($compList.Count)"
  Add-Md ""
  Add-Md "| # | Name | Key | Node |"
  Add-Md "|---|---|---|---|"
  $i=0
  foreach($c in $compList){
    $i++
    Add-Md "| $i | $($c.name) | $($c.key) | $($c.node_id) |"
  }
}else{
  Add-Md "No components available."
}
Add-Md ""

# -- Component Sets --
Add-Md "## Component Sets"
Add-Md ""
if($componentSets -and $componentSets.meta -and $componentSets.meta.component_sets){
  $setList=@($componentSets.meta.component_sets)
  Add-Md "Total: $($setList.Count)"
  Add-Md ""
  Add-Md "| # | Name | Key | Node |"
  Add-Md "|---|---|---|---|"
  $i=0
  foreach($c in $setList){
    $i++
    Add-Md "| $i | $($c.name) | $($c.key) | $($c.node_id) |"
  }
}else{
  Add-Md "No component sets available."
}
Add-Md ""

# -- Dev Resources --
Add-Md "## Dev Resources"
Add-Md ""
if($devResources -and $devResources.meta -and $devResources.meta.dev_resources){
  $devList=@($devResources.meta.dev_resources)
  Add-Md "Total: $($devList.Count)"
  Add-Md ""
  Add-Md "| # | Name | Type | Node | URL |"
  Add-Md "|---|---|---|---|---|"
  $i=0
  foreach($d in $devList){
    $i++
    $url=if($d.url){$d.url}else{"-"}
    $url=($url -replace '\|','\|')
    Add-Md "| $i | $($d.name) | $($d.type) | $($d.node_id) | $url |"
  }
}else{
  Add-Md "No dev resources available."
}
Add-Md ""

# -- Version History --
Add-Md "## Version History"
Add-Md ""
if($versions -and $versions.versions){
  $vList=@($versions.versions)
  Add-Md "Total: $($vList.Count)"
  Add-Md ""
  Add-Md "| # | Label | Author | Created | Description |"
  Add-Md "|---|---|---|---|---|"
  $i=0
  foreach($v in $vList){
    $i++
    $label=if($v.label){$v.label}else{"-"}
    $label=($label -replace '\|','\|')
    if($label.Length -gt 40){$label=$label.Substring(0,40)+"..."}
    $author=if($v.user -and $v.user.handle){$v.user.handle}else{"-"}
    $created=if($v.created_at){$v.created_at}else{"-"}
    $desc=if($v.description){$v.description}else{""}
    $desc=($desc -replace '\|','\|' -replace "`n",' ' -replace "`r",' ')
    if($desc.Length -gt 60){$desc=$desc.Substring(0,60)+"..."}
    Add-Md "| $i | $label | $author | $created | $desc |"
  }
}else{
  Add-Md "No version history available."
}
Add-Md ""

# -- Asset Manifest --
Add-Md "## Asset Manifest"
Add-Md ""
$totalAssets=$imageNodes.Count + $iconNodes.Count
if($totalAssets){
  Add-Md "Images (PNG): $($imageNodes.Count) | Icons (SVG): $($iconNodes.Count)"
  Add-Md ""
  if($DownloadAssets){
    Add-Md "Assets downloaded to assets/."
  }else{
    Add-Md "Assets NOT downloaded. Pass -DownloadAssets to fetch."
  }
  Add-Md ""
  if($imageNodes.Count){
    Add-Md "### Images (PNG)"
    Add-Md ""
    Add-Md "| # | Node ID | Name |"
    Add-Md "|---|---|---|"
    $i=0
    foreach($k in ($imageNodes.Keys | Sort-Object)){
      $i++
      $n=$imageNodes[$k]
      Add-Md "| $i | $k | $($n.name) |"
    }
    Add-Md ""
  }
  if($iconNodes.Count){
    Add-Md "### Icons (SVG)"
    Add-Md ""
    Add-Md "| # | Node ID | Type | Name |"
    Add-Md "|---|---|---|---|"
    $i=0
    foreach($k in ($iconNodes.Keys | Sort-Object)){
      $i++
      $n=$iconNodes[$k]
      Add-Md "| $i | $k | $($n.type) | $($n.name) |"
    }
  }
}else{
  Add-Md "No image or icon nodes detected."
}
Add-Md ""

Add-Md "---"
Add-Md ""
Add-Md "*Generated by extract-figma.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')*"

$sb.ToString() | Set-Content $mdPath -Encoding utf8
Write-Host "OK markdown extract: $mdPath ($((Get-Item $mdPath).Length) bytes)"

# ---------- Summary ----------
Write-Host ""
Write-Host "========== DONE =========="
Write-Host "Output: $OutputDir"
Write-Host "  figma-extract.md"
Write-Host "  tree.txt"
if($DownloadAssets){ Write-Host "  assets/ (png+svg)" }
$commentCount=if($comments -and $comments.comments){@($comments.comments).Count}else{0}
Write-Host "Comments: $commentCount"
Write-Host "Images (PNG): $($imageNodes.Count)"
Write-Host "Icons (SVG): $($iconNodes.Count)"
