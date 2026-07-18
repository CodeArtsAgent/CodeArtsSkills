#!/usr/bin/env bash
# sprint-close.sh - Close a Jira Sprint (macOS/Linux Template)
#
# USAGE:
#   1. Replace all <PLACEHOLDER> values below
#   2. Run: chmod +x sprint-close.sh && ./sprint-close.sh
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

CLOUD_UUID="<CLOUD_UUID>"            # e.g. "0a03a862-9e72-4256-af89-a6c4c96cf0e8"
AUTH_HEADER="<AUTH_HEADER>"          # e.g. "Basic Y29kZWFydHN0ZXN0..."
SPRINT_ID="<SPRINT_ID>"             # e.g. 232

# ============================================================
# EXECUTION — Do not edit below
# ============================================================

BASE_URL="https://api.atlassian.com/ex/jira/${CLOUD_UUID}/rest/agile/1.0"

# Step 1: GET sprint to fetch existing fields
echo "Step 1: Fetching sprint ${SPRINT_ID}..."
sprint=$(curl -s -H "Authorization: ${AUTH_HEADER}" "${BASE_URL}/sprint/${SPRINT_ID}")
state=$(echo "$sprint" | jq -r '.state')
name=$(echo "$sprint" | jq -r '.name')
startDate=$(echo "$sprint" | jq -r '.startDate')
echo "  Name: $name"
echo "  State: $state"
echo "  StartDate: $startDate"

if [ "$state" != "active" ]; then
    echo "ERROR: Sprint is in '$state' state. Must be 'active' to close."
    exit 1
fi

# Step 2: PUT with complete body (all required fields)
echo ""
echo "Step 2: Closing sprint..."
endDate=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

body=$(echo "$sprint" | jq --arg state "closed" --arg endDate "$endDate" \
  '{state: $state, name: .name, startDate: .startDate, endDate: $endDate, goal: .goal}')

response=$(curl -s -X PUT -H "Authorization: ${AUTH_HEADER}" -H "Content-Type: application/json" -d "$body" "${BASE_URL}/sprint/${SPRINT_ID}")
resultState=$(echo "$response" | jq -r '.state')

if [ "$resultState" = "closed" ]; then
    echo ""
    echo "SUCCESS: Sprint closed."
else
    echo ""
    echo "ERROR: Sprint state is '$resultState', expected 'closed'."
    exit 1
fi