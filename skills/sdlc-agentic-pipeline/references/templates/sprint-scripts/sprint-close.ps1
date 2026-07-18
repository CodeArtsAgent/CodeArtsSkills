# sprint-close.ps1 - Close a Jira Sprint (Windows Template)
#
# USAGE:
#   1. Replace all <PLACEHOLDER> values below
#   2. Execute via CodeArts Bash tool:
#      powershell -NoProfile -ExecutionPolicy Bypass -File "sprint-close.ps1"
#   3. Delete this file after execution
#
# VALUES SOURCE:
#   - CLOUD_UUID: from atlassian-rovo-mcp_getVisibleJiraProjects (extract from self URL)
#   - AUTH_HEADER: from .codeartsdoer/mcp/mcp_settings.json -> mcpServers["atlassian-rovo-mcp"].headers.Authorization
#   - SPRINT_ID: the sprint to close
#
# CRITICAL:
#   - Do NOT use {site}.atlassian.net — always use api.atlassian.com gateway
#   - Do NOT use any auth token except the one from mcp_settings.json
#   - PUT requires FULL object (partial updates return 400)
#   - Sprint must be in "active" state to close
#   - Always GET sprint first to fetch existing name/startDate/goal

# ============================================================
# CONFIG — Replace all <PLACEHOLDER> values
# ============================================================

$cloudUuid  = "<CLOUD_UUID>"        # e.g. "0a03a862-9e72-4256-af89-a6c4c96cf0e8"
$authHeader = "<AUTH_HEADER>"        # e.g. "Basic Y29kZWFydHN0ZXN0..."
$sprintId   = "<SPRINT_ID>"          # e.g. 232

# ============================================================
# EXECUTION — Do not edit below
# ============================================================

$baseUrl = "https://api.atlassian.com/ex/jira/${cloudUuid}/rest/agile/1.0"
$headers = @{
    Authorization  = $authHeader
    "Content-Type" = "application/json"
}

# Step 1: GET sprint to fetch existing fields
Write-Output "Step 1: Fetching sprint ${sprintId}..."
$uri = "${baseUrl}/sprint/${sprintId}"
$sprint = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
Write-Output "  Name: $($sprint.name)"
Write-Output "  State: $($sprint.state)"
Write-Output "  StartDate: $($sprint.startDate)"

if ($sprint.state -ne "active") {
    Write-Output "ERROR: Sprint is in '$($sprint.state)' state. Must be 'active' to close."
    exit 1
}

# Step 2: PUT with complete body (all required fields)
Write-Output ""
Write-Output "Step 2: Closing sprint..."
$endDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$body = @{
    state     = "closed"
    name      = $sprint.name
    startDate = $sprint.startDate
    endDate   = $endDate
    goal      = $sprint.goal
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $uri -Method Put -Headers $headers -Body $body
Write-Output "  Result state: $($response.state)"

if ($response.state -eq "closed") {
    Write-Output ""
    Write-Output "SUCCESS: Sprint closed."
} else {
    Write-Output ""
    Write-Output "ERROR: Sprint state is '$($response.state)', expected 'closed'."
    exit 1
}