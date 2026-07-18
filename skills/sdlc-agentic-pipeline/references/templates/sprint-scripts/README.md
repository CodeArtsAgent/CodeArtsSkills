# Sprint Management Scripts (Cross-Platform Templates)

Templates for managing Jira sprints via the Atlassian API gateway.
Used by the PM Agent in Steps 2 (sprint start) and 9 (sprint close).

## Files

| File | Platform | Purpose |
|------|----------|---------|
| `sprint-start.ps1` | Windows | Start a future sprint (set state to "active") |
| `sprint-start.sh` | macOS/Linux | Start a future sprint (set state to "active") |
| `sprint-close.ps1` | Windows | Close an active sprint (set state to "closed") |
| `sprint-close.sh` | macOS/Linux | Close an active sprint (set state to "closed") |

## Prerequisites

- **Cloud UUID**: Discovered via `atlassian-rovo-mcp_getVisibleJiraProjects`.
  Extract the UUID from the `self` URL in the response:
  `https://api.atlassian.com/ex/jira/{cloudUuid}/rest/api/3/...`
- **Auth header**: Read from `.codeartsdoer/mcp/mcp_settings.json`,
  key: `mcpServers["atlassian-rovo-mcp"].headers.Authorization`
- **Board ID**: Found by listing boards and filtering by project key

## Critical Rules

1. **Never use the site URL** (`{site}.atlassian.net`) — it always returns 401.
   Always use the gateway: `https://api.atlassian.com/ex/jira/{cloudUuid}/rest/agile/1.0`
2. **Never use any auth token** other than the one from `mcp_settings.json`.
3. **Windows**: The CodeArts Bash tool strips `$` from inline PowerShell.
   Always write a `.ps1` file first, then execute with:
   `powershell -NoProfile -ExecutionPolicy Bypass -File "script.ps1"`
4. **Sprint name** must be shorter than 30 characters.
5. **PUT requires full object** — partial updates return 400.
   Always GET the sprint first, then PUT with all required fields.
6. **Delete script files** after execution (they contain auth tokens).