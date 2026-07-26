<#
.SYNOPSIS
  Applies tool selections to agent definition files.
  Reads tool-selections.json + skill-registry.json, rewrites the
  permission.skill block in each agent file (methodology skills only).
  Built-in utility skills are NEVER touched.

.DESCRIPTION
  Per the multi-tool-selection-plan.md §6.5, this script runs after agent
  files are copied to .codeartsdoer/agents/ in Step 0.0. It grants or
  revokes methodology skill permissions based on the user's selections.
  It is idempotent - safe to re-run after selection changes.

.PARAMETER SelectionsFile
  Path to tool-selections.json. Default: .codeartsdoer/tool-selections.json

.PARAMETER RegistryFile
  Path to skill-registry.json. Default: .codeartsdoer/skills/sdlc-agentic-pipeline/references/skill-registry.json

.PARAMETER AgentsDir
  Directory containing the 6 agent .md files. Default: .codeartsdoer/agents
#>

param(
    [string]$SelectionsFile = ".codeartsdoer/tool-selections.json",
    [string]$RegistryFile = ".codeartsdoer/skills/sdlc-agentic-pipeline/references/skill-registry.json",
    [string]$AgentsDir = ".codeartsdoer/agents"
)

# Built-in utility skills - NEVER added, removed, or modified by this script.
# These are the always-on baseline that every agent keeps regardless of selection.
$BuiltInKeys = @('ide-tool', 'doc-expert', 'pptx', 'data-analysis', 'prd', 'frontend-design', 'i18n-integration')

# --- Load selections ---
if (-not (Test-Path $SelectionsFile)) {
    Write-Error "tool-selections.json not found at: $SelectionsFile`nRun Step 0.0.5 (multi-tool selection) first."
    exit 1
}
$selections = Get-Content $SelectionsFile -Raw -Encoding UTF8 | ConvertFrom-Json

# --- Load registry ---
if (-not (Test-Path $RegistryFile)) {
    Write-Error "skill-registry.json not found at: $RegistryFile"
    exit 1
}
$registry = Get-Content $RegistryFile -Raw -Encoding UTF8 | ConvertFrom-Json

# --- Build: agent type -> desired methodology frontmatter keys ---
# agent type is derived from filename: pm-agent.md -> "pm"
$agentDesiredKeys = @{}

# Collect ALL methodology keys from registry (for knowing what to remove)
$allMethodologyKeys = @{}

foreach ($skill in $registry.methodologySkills) {
    # Only available skills can be selected (planned ones are never in selections)
    foreach ($key in $skill.frontmatterKeys) {
        $allMethodologyKeys[$key] = $true
    }

    if ($skill.status -ne 'available') { continue }

    # Check if this skill was selected by the user
    $skillId = $skill.id
    $isSelected = $selections.tools.$skillId
    if (-not $isSelected) { continue }

    # Grant to mapped agents
    foreach ($agentType in $skill.grantedToAgents) {
        if (-not $agentDesiredKeys.ContainsKey($agentType)) {
            $agentDesiredKeys[$agentType] = @()
        }
        foreach ($key in $skill.frontmatterKeys) {
            if ($agentDesiredKeys[$agentType] -notcontains $key) {
                $agentDesiredKeys[$agentType] += $key
            }
        }
    }
}

# --- Validate grantedToAgents against existing agent files ---
$agentFiles = Get-ChildItem -Path $AgentsDir -Filter "*-agent.md" -File -ErrorAction SilentlyContinue

if (-not $agentFiles -or $agentFiles.Count -eq 0) {
    Write-Error "No agent files found in: $AgentsDir`nRun Step 0.0 (auto-provision) first."
    exit 1
}

$existingAgentTypes = $agentFiles | ForEach-Object { $_.BaseName -replace '-agent$', '' }

foreach ($agentType in $agentDesiredKeys.Keys) {
    if ($existingAgentTypes -notcontains $agentType) {
        Write-Warning "grantedToAgents references '$agentType' but no ${agentType}-agent.md found in $AgentsDir. Skill permissions for this agent will be skipped."
    }
}

foreach ($file in $agentFiles) {
    # Derive agent type from filename: "pm-agent.md" -> "pm"
    $agentType = $file.BaseName -replace '-agent$', ''

    # Determine desired methodology keys for this agent
    $desired = @()
    if ($agentDesiredKeys.ContainsKey($agentType)) {
        $desired = $agentDesiredKeys[$agentType]
    }

    # Read file content
    $content = Get-Content $file.FullName -Raw -Encoding UTF8

    # Split into frontmatter (between first two ---) and body
    if ($content -notmatch '(?s)^(---\r?\n)(.*?)(\r?\n---\r?\n)(.*)$') {
        Write-Warning "No YAML frontmatter found in $($file.Name) - skipping"
        continue
    }

    $fmOpen  = $matches[1]
    $fmBody  = $matches[2]
    $fmClose = $matches[3]
    $docBody = $matches[4]

    $lines = $fmBody -split "`r?`n"
    $result = @()
    $i = 0
    $changed = $false

    while ($i -lt $lines.Count) {
        $line = $lines[$i]

        # Detect "permission:" at column 0
        if ($line -match '^permission:\s*$') {
            $result += $line
            $i++

            # Next line should be "  skill:"
            if ($i -lt $lines.Count -and $lines[$i] -match '^(\s+)skill:\s*$') {
                $result += $lines[$i]
                $skillEntryIndent = $matches[1] + '  '   # one level deeper than "  skill:"
                $i++

                # Collect existing entries in the skill block
                $hasWildcard = $false
                $builtInEntries = [ordered]@{}

                while ($i -lt $lines.Count -and $lines[$i] -match "^    (\S[^:]*):\s*(.+)$") {
                    $ek = $matches[1]
                    $ev = $matches[2].Trim()

                    if ($ek -eq "'*'") {
                        $hasWildcard = $true
                    } elseif ($BuiltInKeys -contains $ek) {
                        $builtInEntries[$ek] = $ev
                    }
                    # methodology keys are dropped here (will be re-added if desired)
                    $i++
                }

                # Rebuild the skill block:
                #   1. '*': deny  (always first)
                #   2. all other keys sorted alphabetically (built-in + desired methodology)
                if ($hasWildcard) {
                    $result += "    '*': deny"
                }

                $combined = @()
                foreach ($k in $builtInEntries.Keys) {
                    $combined += [PSCustomObject]@{ Key = $k; Val = $builtInEntries[$k] }
                }
                foreach ($k in $desired) {
                    if (-not $builtInEntries.Contains($k)) {
                        $combined += [PSCustomObject]@{ Key = $k; Val = 'allow' }
                    }
                }

                $sorted = $combined | Sort-Object Key
                foreach ($entry in $sorted) {
                    $result += "    $($entry.Key): $($entry.Val)"
                }

                $changed = $true
            }
            # If no skill: block, just continue (permission without skill)
        } else {
            $result += $line
            $i++
        }
    }

    if (-not $changed) {
        Write-Output "Skipped (no permission.skill block): $($file.Name)"
        continue
    }

    # Reassemble and write
    $newFm = ($result -join "`n")
    $newContent = $fmOpen + $newFm + $fmClose + $docBody
    Set-Content -Path $file.FullName -Value $newContent -NoNewline -Encoding UTF8

    $keyList = if ($desired.Count -gt 0) { $desired -join ', ' } else { '(none)' }
    Write-Output "Updated: $($file.Name)  [agent: $agentType]  methodology keys: $keyList"
}

Write-Output ""
Write-Output "Done. Agent frontmatter permission.skill blocks updated based on tool selections."
Write-Output "Built-in utility skills (ide-tool, doc-expert, pptx, data-analysis, prd, frontend-design, i18n-integration) were not modified."