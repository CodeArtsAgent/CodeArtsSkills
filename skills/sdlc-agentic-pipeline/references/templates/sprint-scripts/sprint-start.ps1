# sprint-start.ps1 - Start a Jira Sprint (Windows Template)
#
# USAGE:
#   1. Replace all <PLACEHOLDER> values below
#   2. Execute via CodeArts Bash tool:
#      powershell -NoProfile -ExecutionPolicy Bypass -File "sprint-start.ps1"
#   3. Delete this file after execution
#
# VALUES SOURCE:
#   - CLOUD_UUID: from atlassian-rovo-mcp_getVisibleJiraProjects (extract from self URL)
#   - AUTH_HEADER: from .codeartsdoer/mcp/mcp_settings.json -> mcpServers["atlassian-rovo-mcp"].headers.Authorization
#   - BOARD_ID: from GET /rest/agile/1.0/board (filter by project key)
#   - SPRINT_ID: from POST /rest/agile/1.0/sprint (after creating the sprint)
#
# CRITICAL:
#   - Do NOT use {site}.atlassian.net — always use api.atlassian.com gateway
#   - Do NOT use any auth token except the one from mcp_settings.json
#   - Sprint name must be < 30 characters
#   - Sprint must be in "future" state before starting

# ============================================================
# CONFIG — Replace all <PLACEHOLDER> values
# ============================================================

$cloudUuid  = "<CLOUD_UUID>"        # e.g. "0a03a862-9e72-4256-af89-a6c4c96cf0e8"
$authHeader = "<AUTH_HEADER>"        # e.g. "Basic Y29kZWFydHN0ZXN0..."
$boardId    = "<BOARD_ID>"           # e.g. 42
$sprintId   = "<SPRINT_ID>"          # e.g. 232
$sprintName = "<SPRINT_NAME>"        # e.g. "Sprint 2 - Features" (max 30 chars!)
$sprintGoal = "<SPRINT_GOAL>"        # e.g. "Deliver feature X, Y, Z"

# ============================================================
# EXECUTION — Do not edit below
# ============================================================

$baseUrl = "https://api.atlassian.com/ex/jira/${cloudUuid}/rest/agile/1.0"
$headers = @{
    Authorization  = $authHeader
    "Content-Type" = "application/json"
}

# Step 1: Verify sprint exists and is in "future" state
Write-Output "Step 1: Verifying sprint ${sprintId}..."
$uri = "${baseUrl}/sprint/${sprintId}"
$sprint = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
Write-Output "  Name: $($sprint.name)"
Write-Output "  State: $($sprint.state)"

if ($sprint.state -ne "future") {
    Write-Output "ERROR: Sprint is in '$($sprint.state)' state. Must be 'future' to start."
    exit 1
}

# Step 2: Start sprint (PUT with full object)
Write-Output ""
Write-Output "Step 2: Starting sprint..."
$startDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$endDate = (Get-Date).AddDays(14).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$body = @{
    state     = "active"
    name      = $sprint.name
    startDate = $startDate
    endDate   = $endDate
    goal      = $sprintGoal
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $uri -Method Put -Headers $headers -Body $body
Write-Output "  Result state: $($response.state)"
Write-Output "  Start date: $($response.startDate)"
Write-Output "  End date: $($response.endDate)"

if ($response.state -eq "active") {
    Write-Output ""
    Write-Output "SUCCESS: Sprint started."
} else {
    Write-Output ""
    Write-Output "ERROR: Sprint state is '$($response.state)', expected 'active'."
    exit 1
}