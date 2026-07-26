# Critical Setup Warnings (Single Source of Truth)

> This file consolidates ALL critical warnings, gotchas, and pitfalls for the
> SDLC agentic pipeline. Other files reference these by their warning ID
> (e.g., "See `critical-warnings.md#WARN-SONAR-AUTO`").

---

## WARN-SONAR-AUTO: SonarCloud Automatic Analysis Conflict

**MUST** be disabled before any CI/CD run. If left enabled alongside the
GitHub Actions scan, the pipeline crashes with:
`"You are running CI analysis while Automatic Analysis is enabled"`.

**Fix:** Project Dashboard > Administration > Analysis Method > turn OFF
"SonarCloud Automatic Analysis" toggle. Requires **Project Administrator**
permissions (org-level alone is insufficient).

---

## WARN-JIRA-401: Jira Direct REST API 401

Direct calls to `{site}.atlassian.net` with Basic auth (`email:api_token`)
return **401 Unauthorized**. The MCP auth header (same Base64 `email:token`)
works via the **Atlassian API gateway** at
`api.atlassian.com/ex/jira/{cloudUuid}/rest/...`.

The cloud UUID is NOT the site URL — it must be discovered separately by
calling `atlassian-rovo-mcp_getVisibleJiraProjects` and extracting the UUID
from the `self` URL in the response:
```
"self": "https://api.atlassian.com/ex/jira/{cloudUuid}/rest/api/3/project/search..."
```

Use the `Authorization` header from `.codeartsdoer/mcp/mcp_settings.json`
(`mcpServers["atlassian-rovo-mcp"].headers.Authorization`). Any other auth
token will fail.

---

## WARN-WIN-PS-DOLLAR: Windows PowerShell $ Stripping

The CodeArts Bash tool strips `$` from inline PowerShell commands. **Always
write a `.ps1` script file first**, then execute with:
```
powershell -NoProfile -ExecutionPolicy Bypass -File "path/to/script.ps1"
```

**Delete the script file after execution** (it contains auth tokens).

Cross-platform template scripts are available at
`references/templates/sprint-scripts/`.

---

## WARN-JIRA-SPRINT-NAME: Sprint Name Length

Sprint name **must be shorter than 30 characters** or the Jira API returns
400 Bad Request.

---

## WARN-JIRA-SPRINT-FIELD: Sprint Field Value Type

`customfield_10020` (Sprint field) must be a **number** (sprint ID), NOT an
array. Example: `{ "customfield_10020": 34 }` (correct), NOT
`{ "customfield_10020": [34] }` (wrong).

---

## WARN-JIRA-SPRINT-CLOSE: Sprint Close Requires Full Object

`PUT /rest/agile/1.0/sprint/{id}` does **NOT** support partial updates.
Sending only `{ "state": "closed" }` returns 400 Bad Request.

**Solution:** First `GET /sprint/{id}` to fetch existing `name` and
`startDate`, then `PUT` with the complete body:
`{ state, name, startDate, endDate, goal }`.

Must also use the Atlassian API gateway URL + MCP auth header
(see `#WARN-JIRA-401` and `#WARN-WIN-PS-DOLLAR`).

---

## WARN-MANUAL-INTEGRATIONS: Manual Integrations Required

The following cross-platform links must be configured manually in each
platform's UI (not automatable):
1. GitHub <-> Jira
2. GitHub <-> SonarCloud
3. GitHub <-> Semgrep

---

## WARN-JIRA-IN-TESTING: 'In Testing' Status Required

The pipeline uses 'In Testing' during Step 5 (E2E). This status does **NOT**
exist by default in Jira. Must be manually added:
Settings -> Work items -> Workflows -> Edit -> Add status -> Create 'In Testing'
(category: In Progress) -> Enable 'Allow all statuses to transition to this one'.

---

## WARN-NO-DIRECT-MAIN: Never Push Directly to Main

All changes — including SDD documentation — must go through a feature/docs
branch and PR targeting `dev` (or user-chosen integration branch). Enable
GitHub branch protection rules on both `main` and `dev`
(Settings > Branches > Branch protection rules).

`main` is only updated via `dev` -> `main` merge at release time (Step 7).

---

## WARN-JFROG-REPO-NAME: JFrog Docker Repository Naming

Do **NOT** use underscores in repository names (DNS limitation). Use hyphens
(e.g., `docker-dev-local` not `docker_dev_local`).

---

## WARN-JFROG-BUILD-API: JFrog Build API Requires Project Param

`GET /artifactory/api/build/{name}` returns 404 without the
`?project={project-key}` query parameter.

---

## WARN-JIRA-ISSUES-SPRINT: Adding Issues to Sprint via API Gateway

`POST /sprint/{id}/issue` returns 401 scope error via the API gateway.
Instead, use `atlassian-rovo-mcp_editJiraIssue` with
`customfield_10020: <sprint_id>` (number, not array) to set the Sprint
field on each issue individually.

---

## WARN-GITHUB-WORKFLOW-DISPATCH: GitHub MCP Lacks Workflow Dispatch

GitHub MCP does not support workflow dispatch. Use the REST API with GitHub
PAT from `.codeartsdoer/mcp/mcp_settings.json`:

**macOS/Linux:**
```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/actions/workflows/ci-cd.yml/dispatches" \
  -d '{"ref":"dev"}'
```

**Windows:**
```powershell
Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/actions/workflows/ci-cd.yml/dispatches" -Method Post -Headers @{Authorization="Bearer $GITHUB_PAT"; Accept="application/vnd.github+json"} -Body '{"ref":"dev"}'
```

---

## WARN-SONAR-TOKEN: SonarCloud Token != GitHub PAT

SonarCloud MCP requires a SonarCloud-specific token
(from `sonarcloud.io/account/security/`), not a GitHub PAT.

---

## WARN-SPA-404: SPA 404 Limitation

With `try_files $uri $uri/ /index.html`, Nginx always returns 200 — 404 for
invalid routes must be handled client-side by the SPA router.

---

## WARN-ANGULAR15-BUILD: Angular 15 Build Command

Use `npx ng build --configuration=production`, NOT `npm run build --prod`
(deprecated in Angular 15+).

---

## WARN-SEMGREP-TIMEOUT: Semgrep MCP Sandbox Timeout

Semgrep MCP can timeout in sandbox mode due to network restrictions.
CLI fallback: `semgrep ci`.

---

## WARN-ARTIFACT-SYMLINKS: Artifact Upload Breaks Symlinks

Splitting `npm ci` and `npm run build` into separate GitHub Actions jobs
breaks `.bin` symlinks — keep install + build in the **same job**.