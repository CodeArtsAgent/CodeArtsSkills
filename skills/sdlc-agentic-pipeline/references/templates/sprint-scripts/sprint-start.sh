#!/usr/bin/env bash
# sprint-start.sh - Start a Jira Sprint (macOS/Linux Template)
#
# USAGE:
#   1. Replace all <PLACEHOLDER> values below
#   2. Run: chmod +x sprint-start.sh && ./sprint-start.sh
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

CLOUD_UUID="<CLOUD_UUID>"            # e.g. "0a03a862-9e72-4256-af89-a6c4c96cf0e8"
AUTH_HEADER="<AUTH_HEADER>"          # e.g. "Basic Y29kZWFydHN0ZXN0..."
BOARD_ID="<BOARD_ID>"               # e.g. 42
SPRINT_ID="<SPRINT_ID>"             # e.g. 232
SPRINT_GOAL="<SPRINT_GOAL>"         # e.g. "Deliver feature X, Y, Z"

# ============================================================
# EXECUTION — Do not edit below
# ============================================================

BASE_URL="https://api.atlassian.com/ex/jira/${CLOUD_UUID}/rest/agile/1.0"

# Step 1: Verify sprint exists and is in "future" state
echo "Step 1: Verifying sprint ${SPRINT_ID}..."
sprint=$(curl -s -H "Authorization: ${AUTH_HEADER}" "${BASE_URL}/sprint/${SPRINT_ID}")
state=$(echo "$sprint" | jq -r '.state')
name=$(echo "$sprint" | jq -r '.name')
echo "  Name: $name"
echo "  State: $state"

if [ "$state" != "future" ]; then
    echo "ERROR: Sprint is in '$state' state. Must be 'future' to start."
    exit 1
fi

# Step 2: Start sprint (PUT with full object)
echo ""
echo "Step 2: Starting sprint..."
startDate=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
endDate=$(date -u -v+14d +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "+14 days" +"%Y-%m-%dT%H:%M:%S.000Z")

body=$(echo "$sprint" | jq --arg state "active" --arg startDate "$startDate" --arg endDate "$endDate" --arg goal "$SPRINT_GOAL" \
  '{state: $state, name: .name, startDate: $startDate, endDate: $endDate, goal: $goal}')

response=$(curl -s -X PUT -H "Authorization: ${AUTH_HEADER}" -H "Content-Type: application/json" -d "$body" "${BASE_URL}/sprint/${SPRINT_ID}")
resultState=$(echo "$response" | jq -r '.state')
echo "  Result state: $resultState"
echo "  Start date: $(echo "$response" | jq -r '.startDate')"
echo "  End date: $(echo "$response" | jq -r '.endDate')"

if [ "$resultState" = "active" ]; then
    echo ""
    echo "SUCCESS: Sprint started."
else
    echo ""
    echo "ERROR: Sprint state is '$resultState', expected 'active'."
    exit 1
fi