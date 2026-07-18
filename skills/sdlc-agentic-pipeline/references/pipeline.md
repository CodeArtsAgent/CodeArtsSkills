# SDLC Agentic Pipeline — Orchestration Reference

Detailed per-step orchestration for the agentic SDLC flow. For the high-level
overview (10-step table, agent routing, Jira lifecycle, setup warnings), see
`../SKILL.md`.


## SDLC Agentic Flow — 10-Step Pipeline

### Pipeline Overview

```
Branch Strategy:  main (production) ← dev (integration) ← feature/fix/bug/docs branches

Step 1: PM Agent — Requirement Breakdown (PRD + GitHub + Jira)
   │
   ├─→ Step 1b: Frontend/Backend Agent — Requirement Review (approve or flag gaps)
   │      │
   │      └─→ Step 2: PM Agent — Sprint Start & SDD Setup (Jira sprint + SDD docs PR → dev)
   │             │
   │             └─→ Step 3: Frontend/Backend Agent — Development, Semgrep Pre-Scan & Fix (branch from dev, PR → dev)
   │                    │
   │                    └─→ Step 4: Code Reviewer Agent — PR Review & Approval
   │                           │
   │                           └─→ Step 5: Tester Agent — E2E Testing (Playwright skill)
   │                                  │
   │                                  └─→ Step 6: DevOps Engineer Agent — CI/CD (SonarCloud + build + JFrog upload via GitHub Actions)
   │                                         │
   │                                         └─→ Step 6: DevOps Engineer Agent — JFrog Artifactory Verification
   │                                                │
   │                                                └─-> Step 7: PM + Developer - Release Review -> merge dev -> main (simplified conflict resolution)
   │                                                       │
   │                                                       └─-> Step 8: PM + DevOps - Deployment on ECS (PM authorizes, DevOps executes)
   │                                                              │
   │                                                              └─-> Step 9: PM + Developer - Sprint Close, Retrospective + Report
```

---


## Step Details

> **Idempotency:** If the pipeline is re-run for the same sprint, the PM Agent must:
> 1. Check if a sprint already exists and is active (skip Step 2 sprint creation)
> 2. Check existing Jira tasks (skip Step 1 if tasks already created)
> 3. Check PR status (skip Steps 3-5 if PRs already merged into `dev`)
> 4. Check CI/CD workflow runs (skip Step 6 if already passed)
> 5. Check JFrog artifacts (skip Step 6 if already verified)
> 6. Check if `dev` is already merged to `main` (skip Step 7 if already merged)
> 7. Check if deployment is already live (skip Step 8 if health check passes)
> 8. Always run Step 9 (sprint close + report) if not yet completed

### Step 1: PM Agent — Requirement Breakdown
- **Owner**: PM Agent
- **Tools**: GitHub MCP, Jira MCP, PRD Skill
- **Actions**:
  1. Analyze GitHub repository structure
  2. Generate PRD via `prd` skill
  3. Break down requirements into Jira tasks with agent routing labels
  4. Link related issues (Blocks, Relates)
  5. Request requirement review from Frontend & Backend Agents via Jira comments
  6. **Present all created Jira tasks as clickable hyperlinks to the user in the response**
     - URL pattern: `https://{JIRA_CLOUD_ID}/browse/{ISSUE-KEY}`
     - `JIRA_CLOUD_ID` is read from the `.env` file (e.g., `<your-site>.atlassian.net`)
     - Each created issue key (returned by `createJiraIssue`) is appended as: `https://<site>/browse/<KEY>`
     - Format example (Markdown table in the response to the user):
       ```
       | # | Task | Jira Link | Label |
       |---|------|-----------|-------|
       | 1 | Backend API for projects | [SCRUM-12](https://<your-site>.atlassian.net/browse/SCRUM-12) | agent:backend |
       | 2 | Frontend project list page | [SCRUM-13](https://<your-site>.atlassian.net/browse/SCRUM-13) | agent:frontend |
       ```
     - The user must be able to click each link and go directly to the Jira issue in their **external system browser** (e.g., Chrome, Edge, Safari)
     - **Do NOT use the `browser` tool** (which opens the CodeArts IDE built-in browser). The links must be plain Markdown hyperlinks in the response text so they open in the user's default system browser when clicked
- **Output**: Jira tasks in "To Do" status with labels `agent:frontend`, `agent:backend`, etc., presented to user as clickable hyperlinks (open in external system browser)

### Step 1b: Frontend/Backend Agent — Requirement Review
- **Owner**: Frontend Agent, Backend Agent
- **Tools**: Jira MCP, GitHub MCP
- **Actions**:
  1. Receive review request from PM Agent via Jira comment
  2. Evaluate requirements from frontend/backend perspective (feasibility, completeness, API contracts, dependencies, estimates)
  3. If requirements are clear → comment `@agent:pm Review approved`
  4. If requirements need changes → comment `@agent:pm Review feedback: <issues>`
  5. PM Agent updates requirements based on feedback
- **Gate**: Both agents must approve before proceeding to Step 2
- **Error throwback**: If review flags issues, PM Agent revises requirements and re-requests review

### Step 2: PM Agent — Sprint Start & SDD Setup
- **Owner**: PM Agent (sprint) + Developer Agent (SDD file writes)
- **Tools**: Jira MCP, Bash (Jira Agile REST API), creating-sdd-directory skill, question tool
- **Actions**:
  1. Find Jira board ID via REST API: `GET /rest/agile/1.0/board`
  2. **Ask user for sprint name** via `question` tool
     - Note: Sprint name must be up to 30 characters
  3. Create sprint via REST API: `POST /rest/agile/1.0/sprint`
  4. Add all issues to sprint via REST API: `POST /rest/agile/1.0/sprint/{id}/issue`
  5. Start sprint (set state to "active"): `PUT /rest/agile/1.0/sprint/{id}`
  6. Invoke `creating-sdd-directory` skill for each task to initialize spec-driven development
  7. **Delegate SDD file creation to a developer agent** (the PM Agent is read-only with the repo):
     - The developer agent creates `spec.md`, `design.md`, `tasks.md` from Jira requirements
     - The developer agent works on a docs branch (e.g., `docs/sdd-<feature>`), commits, pushes, and creates a PR to `dev`
     - The developer agent merges the PR after user review
  8. Post SDD-complete comments on all Jira tasks
- **Output**: Active sprint with all issues, SDD directories created and merged to `dev`

### Step 3: Frontend/Backend Agent — Development, Semgrep Pre-Scan & Fix
- **Owner**: Frontend Agent, Backend Agent
- **Tools**: GitHub MCP, Jira MCP, Bash (linters), Semgrep MCP
- **Actions**:
  1. **Transition Jira task to "In Progress"** (mandatory)
  2. Create feature branch from `dev`, write code
  3. Run local linters (ESLint, Prettier, Ruff, mypy)
  4. Write unit/component tests; write API tests (happy path, 4xx/5xx errors, auth, validation, edge cases) — see `backend-agent.md` §3.6 for full scope — all must pass before PR
  5. **Run local Semgrep scan** (security, quality, best practices) — fix CRITICAL findings before PR
  6. Push and create PR (base: `dev`, include Semgrep scan summary in PR comment)
  7. **Transition Jira task to "In Review"**
  8. Comment `@agent:code-reviewer PR #X ready for review - Semgrep pre-scan passed`
- **Quality Gate Prevention Guidelines** (every commit must pass QG):
  - Check code duplication < 3% before committing (avoid copy-paste patterns)
  - Ensure security rating A (no vulnerabilities, no hardcoded secrets)
  - Write unit tests alongside code (target > 80% coverage)
  - Run local linters and tests before pushing
  - Consider SonarCloud QG thresholds: coverage ≥ 80%, duplication ≤ 3%, ratings ≥ A

### Step 4: Code Reviewer Agent — PR Review & Approval
- **Owner**: Code Reviewer Agent
- **Tools**: GitHub MCP (PR review, secret scanning), Jira MCP
- **Note**: Semgrep local scanning is performed by Frontend/Backend agents in Step 3.
  This agent focuses on PR diff review, secret scanning, and approval sign-off.
  Semgrep MCP is available for optional re-verification on throwback.
- **Actions**:
  1. Fetch tasks in "In Review" status
  2. Read PR diff and changed files
  3. Review PR diff for code quality, conventions, logic errors, and security patterns
  4. Cross-reference with Semgrep pre-scan summary from Step 3 PR comment
  5. Run `github_run_secret_scanning` for leaked secrets
  6. Submit GitHub PR review (APPROVE / REQUEST_CHANGES)
  7. If CRITICAL issues → REQUEST_CHANGES, transition Jira BACK to "In Progress"
  8. If approved → comment `@agent:tester Code review approved - ready for E2E testing`


### Step 5: Tester Agent - E2E Testing (Playwright)
- **Owner**: Tester Agent
- **Tools**: playwright-cli skill, Jira MCP, Bash (test runners, git checkout for feature branch)
- **Actions**:
  1. **Transition Jira task to "In Testing"**
  2. **Checkout the feature branch** from GitHub (code was pushed in Step 3) - Tester Agent handles this itself, PM Agent is NOT involved in any git operations
  3. Write E2E test scenarios via `playwright-cli` skill
  4. Set up necessary test configurations (playwright.config.js, test dependencies)
  5. **Run E2E tests locally** - tests must be executed, not just written
  6. Fix any test errors until all tests pass (error-free before sign-off)
  7. If tests fail after fixes -> transition Jira BACK to "In Progress",
     comment `@agent:frontend Test failed: <details>` (throwback to Step 3)
  8. If tests pass -> comment `@agent:devops E2E sign-off complete, ready for CI/CD`
  - Developer fixes → re-run tests → pass before proceeding


### Step 5 (continued): Auto-Merge Feature PRs into `dev` (PM + Developer Agent)
> Step 5b has been merged into Step 5. After Tester E2E sign-off, PM immediately
> verifies gates, asks for human approval, and developer agent merges PRs.
> CI/CD auto-triggers on dev push (no separate Step 6 manual trigger).
- **Owner**: PM Agent (authorizes) + Developer Agent (executes merge)
  - Developer Agent = Backend Agent if both active, otherwise sole developer agent
- **Gate**: Feature PR Merge Gate (see SKILL.md):
  1. Code Reviewer Agent sign-off comment exists on Jira task
  2. Tester Agent E2E sign-off comment exists on Jira task
  3. Human approval (via PM Agent question tool)
- **Actions**:
  1. PM Agent verifies all feature PRs have Code Reviewer + Tester sign-off
  2. PM Agent asks user for approval via `question` tool
     - If user REJECTS -> pause pipeline, ask user for feedback via `question` tool, route tasks back to Step 3 if needed
  3. PM Agent delegates to Developer Agent to merge each feature PR into `dev` via GitHub MCP
  4. Developer Agent verifies all feature branches are merged into `dev`
- **Output**: All feature code merged into `dev` branch, ready for CI/CD

> **NOTE:** CI green and SonarCloud QG are NOT required at this stage.
> They are gates for the Release Merge (`dev` -> `main`) in Step 8.

### Step 6: DevOps Engineer Agent — CI/CD (Auto-Triggered, Node.js 22, FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true)
- **Owner**: DevOps Engineer Agent
- **Tools**: GitHub MCP, Bash (PowerShell/Bash + GitHub API), Jira MCP, SonarCloud MCP
- **Includes**: build (Stage 1), sonar-scan (Stage 2), sonar-qg-check (Stage 3), deploy-to-jfrog (Stage 4), verify-jfrog (Stage 5). Uses sonarcloud-github-action@master (NOT sonarqube-scan-action)
- **Actions**:
  1. **Transition Jira task to "In Progress"** (CI/CD phase - task moves from "In Testing" back to "In Progress" to indicate active pipeline work)
   2. Verify/update GitHub Actions workflow (SonarCloud scan → build → JFrog upload; auto-triggered on push to `dev`)
   3. **Monitor auto-triggered CI/CD** (auto-triggers on dev push) and **monitor workflow runs** — see `references/agents/devops-agent.md` §6.5–6.6 for detailed PowerShell and Bash commands
  4. If CI fails → identify failing job+step:
     - **Build/test error** (Stage 2 fails): transition Jira BACK to "In Progress", comment `@agent:frontend` or `@agent:backend Build/test failed at <step>: <error>`
     - **Pipeline config error** (Stage 1/3 fails, workflow YAML issue): DevOps self-fixes, re-trigger pipeline
  5. If CI passes (all 3 stages) → proceed to JFrog + SonarCloud QG verification (combined in Step 6 CI/CD pipeline)

### Step 6: DevOps Engineer Agent — JFrog Artifactory Verification
- **Owner**: DevOps Engineer Agent
- **Tools**: Bash (JFrog REST API), SonarCloud MCP, Jira MCP
- **Gate**: PRE-RELEASE quality gate. If ANY check fails, code is NOT released (Step 8) or deployed (Step 9).
- **NOTE**: Upload is handled by GitHub Actions pipeline. Agent only VERIFIES.
  If JFrog MCP is unavailable, use the JFrog Artifactory REST API as a fallback.
- **Authentication**: Bearer token in `Authorization` header
- **REST API Endpoints** (base URL: `<JFROG_PLATFORM_URL>/artifactory/api/` — the URL already includes the scheme):
  1. **List repositories**: `GET /artifactory/api/repositories` — verify repo exists
  2. **List artifacts in repo**: `GET /artifactory/api/storage/<repo-key>` — find Docker image
  3. **List image tags**: `GET /artifactory/api/storage/<repo-key>/<image-name>` — verify tags (latest + commit SHA)
  4. **Artifact stats**: `GET /artifactory/api/storage/<repo-key>/<image-name>/<tag>?stats` — download count, last modified
  5. **Docker manifest**: `GET /artifactory/api/docker/<repo-key>/v2/<image-name>/manifests/<tag>` — verify image validity
  6. **Build info**: `GET /artifactory/api/build/<build-name>?project=<project-key>` — cross-reference with GitHub Actions run
     - **NOTE:** The `?project=<project-key>` parameter is REQUIRED — without it, the API returns 404
  7. **All build names**: `GET /artifactory/api/build?project=<project-key>` — list registered builds
- **Xray security scan**: `GET /xray/api/v1/artifacts/summary?repo=<repo>&path=<path>&project=<project>`
  - NOTE: Xray may not be available on all JFrog instances (returns 404). Non-blocking if unavailable.
- **Actions**:
  1. Verify repository exists (endpoint 1)
  2. Verify Docker image and tags exist (endpoints 2-3)
  3. Verify artifact stats and traceability (endpoint 4, match timestamps)
  4. Verify Docker manifest is valid (endpoint 5)
  5. Check build info if available (endpoint 6, non-blocking if 404)
  6. Check Xray if available (non-blocking if 404)
  7. If artifacts not found → check GitHub Actions secrets (JFrog credentials), re-trigger pipeline
  8. If Xray finds vulnerabilities → transition Jira BACK to "In Progress", comment `@agent:frontend` or `@agent:backend Xray vulnerability found: <details>`
  9b. If SonarCloud QG fails (coverage < 80%, duplication > 3%, security rating < A) -> do NOT proceed to Step 8
  10. If SonarCloud QG FAILS -> transition Jira BACK to "In Progress", comment `@agent:frontend` or `@agent:backend SonarCloud QG failed: <details>`
  9. If all verified → proceed to Step 7 (Release Review)

### Step 7: PM + Developer - Release Review & Merge
- **Owner**: PM Agent (authorizes) + Developer Agent (executes merge)
  - Developer Agent = Backend Agent if both active, otherwise sole developer agent
- **Tools**: Jira MCP, GitHub MCP, question tool
- **Actions**:
  1. Verify ALL tasks have Code Reviewer sign-off
  2. Verify ALL tasks have Tester E2E sign-off
  3. Verify SonarCloud QG + JFrog artifacts verified (completed in Step 7)
  4. Verify CI/CD pipeline passed
  5. Verify no open bugs or security vulnerabilities
  6. Verify all feature PRs have been merged into `dev`
  7. If ALL checks pass -> **require human approval** via `question` tool
  7b. If user REJECTS release -> pause pipeline, ask user for feedback, route specific tasks back to the failing step
  8. **PM Agent delegates to Developer Agent** to create and merge `dev` -> `main` PR via GitHub MCP
  9. Transition tasks to "Done" via `atlassian-rovo-mcp_transitionJiraIssue`
  10. If ANY check fails -> trigger error throwback to the failing step

### Step 8: PM + DevOps - Deployment on Huawei Cloud ECS
- **Owner**: PM Agent (authorizes) + DevOps Agent (executes SSH + Docker)
- **Tools**: Jira MCP, question tool, Bash (SSH via DevOps Agent)
- **Prerequisite**: ECS is pre-configured during Step 0 (SSH key, Docker, JFrog Docker login)
- **Actions**:
  1. **PM Agent requires human approval** before deployment via `question` tool
     - If user REJECTS deployment -> do NOT deploy, keep current version running, ask user for feedback
  2. **DevOps Agent pulls Docker image** on ECS via SSH:
     ```
     ssh -i ~/.ssh/id_rsa <ECS_USER>@<ECS_HOST> "docker pull <JFROG_DOCKER_REGISTRY>/<JFROG_REPO_KEY>/<GITHUB_REPO>:latest"
     ```
  3. **DevOps Agent stops existing container** (if running) and **starts new container**:
     ```
     ssh -i ~/.ssh/id_rsa <ECS_USER>@<ECS_HOST> "docker stop <container-name> 2>/dev/null; docker rm <container-name> 2>/dev/null; docker run -d --name <container-name> -p 80:80 <JFROG_DOCKER_REGISTRY>/<JFROG_REPO_KEY>/<GITHUB_REPO>:latest"
     ```
  4. **DevOps Agent verifies deployment health check**: `curl -s -o /dev/null -w '%{http_code}' http://<ECS_HOST>:80`
     - Expected: `200`
  5. If deployment fails -> **DevOps Agent rolls back**: stop new container, restart previous image
  6. If deployment succeeds -> **PM Agent comments** `@agent:all Deployment complete - version <tag> live at http://<ECS_HOST>`

### Step 9: PM + Developer - Sprint Close, Retrospective + Report Generation
- **Owner**: PM Agent (sprint close + report generation) + Developer Agent (report push)
  - Developer Agent = Backend Agent if both active, otherwise sole developer agent
- **Tools**: Bash (Jira Agile REST API), Jira MCP, GitHub MCP, question tool
- **Actions**:
  1. Verify ALL tasks are in "Done" status
     - If some tasks are NOT Done -> ask user via `question` tool:
       - Option 1: "Wait" -> pause Step 9 until all tasks are Done
       - Option 2: "Move to next sprint" -> move incomplete tasks to the next sprint (remove from current sprint via `customfield_10020` update), then proceed with closing
       - Option 3: "Close as Won't Do" -> mark incomplete tasks as "Won't Do" and proceed with closing
   2. Close sprint via REST API: `PUT /rest/agile/1.0/sprint/{id}`
      - **WARNING:** The Jira Agile REST API does NOT support partial updates.
        You must send the FULL sprint object, not just the changed field.
        - ❌ Wrong: `{ "state": "closed" }` → 400 Bad Request
        - ✅ Right: `{ "state": "closed", "name": "...", "startDate": "...", "endDate": "...", "goal": "..." }`
      - **Solution:** First `GET /rest/agile/1.0/sprint/{id}` to fetch existing `name` and `startDate`,
        then `PUT` with the complete body including all required fields.
      - Required fields: `state`, `name`, `startDate`, `endDate` (set to current time)
      - **CRITICAL — Auth & URL:** Direct site URL (`{site}.atlassian.net`) always returns 401.
        Must use the Atlassian API gateway (`https://api.atlassian.com/ex/jira/{cloudUuid}/rest/agile/1.0`)
        with the `Authorization` header from `.codeartsdoer/mcp/mcp_settings.json`
        (`mcpServers["atlassian-rovo-mcp"].headers.Authorization`). Any other auth token will fail.
      - **Windows:** The CodeArts Bash tool strips `$` from inline PowerShell. Always write a `.ps1`
        script file first, then execute with `powershell -NoProfile -ExecutionPolicy Bypass -File "path/to/script.ps1"`.
        Delete the script file after execution.
      - **Cross-platform templates** are available at `references/templates/sprint-scripts/`:
        - `sprint-close.ps1` / `sprint-close.sh` — close an active sprint
        - `sprint-start.ps1` / `sprint-start.sh` — start a future sprint
        - Copy the appropriate script, replace `<PLACEHOLDER>` values, execute, then delete.
  3. Generate sprint summary (completed vs. incomplete, velocity metrics)
  4. Post retrospective comment on the Epic
  5. Archive SDD documents
  6. **Generate SDLC Process Report (HTML)**
      - Create a self-contained `reports/sdlc-report.html` in the repository directory
      - Vanilla HTML/CSS (no frameworks) - inline CSS, no external dependencies
      - All hyperlinks must open in the user's **external system browser** (use `target="_blank"`)
      - All hyperlinks must be **real working URLs** (not `#` placeholders) constructed from `.env` values
      - Contents (single-page scrollable report):
        - Header: project name (linked to GitHub repo), sprint name, date range, overall status badge
        - Summary table: step | status | agent | key outcome
        - Step-by-step detail cards with expand/collapse sections:
          - Step 0: Service links (GitHub repo, Jira board, SonarCloud dashboard, JFrog repo) - all clickable
          - Step 1: Jira tasks table with clickable hyperlinks to each Jira issue (key, summary, label, status)
          - Step 3: Development table with branch names, PR links (clickable), merge status per Jira task
          - Step 5: E2E test results table with test scenarios, PASS/FAIL badges, durations, total count
          - Step 6: CI/CD pipeline stages with GitHub Actions link, stage-by-stage pass/fail status
          - Step 6: JFrog Docker image table (image name, tags, size, verified badge) + SonarCloud QG metric cards:
            - Coverage %, Duplication %, Security rating, Reliability rating, Maintainability rating
            - Bugs count, Vulnerabilities count, Code smells count
          - Step 8: Deployment details (Docker pull, container start, health check HTTP code, deployment URL)
          - Sprint velocity chart (CSS-based bar chart)
        - Retrospective section: what went well, what didn't, action items
   7. **Push report to GitHub**
      - Delegate to Developer Agent (Backend if both active, otherwise sole developer)
      - Create a docs branch (e.g., `docs/sdlc-reports`), commit `reports/sdlc-report.html`, push branch
      - Create PR targeting `dev` and merge it (GitHub branch protection applies to the whole branch, so a PR is required)
  8. **Present report to user**
     - Show file path to `reports/sdlc-report.html`
     - Show GitHub PR link where report was pushed
- **Output**: Sprint closed, retrospective posted, `reports/sdlc-report.html` generated, pushed to GitHub, presented to user

---

## Error Throwback Protocol

See `references/agents/pm-agent.md` — Error Throwback Protocol section for full details.

---

## Jira Status Lifecycle

See `references/agents/pm-agent.md` — Jira Status Lifecycle section for full details.

---

## Jira Sprint Management (REST API)

See `references/agents/pm-agent.md` §2.2 for sprint creation/management commands (Windows PowerShell + macOS/Linux Bash).

---

## GitHub Actions Workflow Trigger (REST API)

See `references/agents/devops-agent.md` §6.5–6.6 for auth setup, trigger, and monitoring commands (Windows PowerShell + macOS/Linux Bash).

---

> **IMPORTANT:** The 'In Testing' status does NOT exist by default in Jira.
> Must be manually added: Settings -> Work items -> Workflows -> Edit -> Add status
> -> Create 'In Testing' (category: In Progress) -> Enable 'Allow all statuses to
> transition to this one'. See 
references/setup/service-onboarding.md for details.

## Agent Routing Labels, Domain Labels, Jira Comment Format, Jira Task Discovery JQL, Branch Naming Convention, PR Merge Gate

See `../SKILL.md` — these sections are defined there as the PM Agent owns agent coordination.

---

## Test Ownership

| Test Type | Owner | Tool |
|-----------|-------|------|
| Unit tests | Frontend/Backend Agent | Jest, Vitest, pytest |
| Component integration tests | Frontend Agent | Jest, Vitest |
| API tests (happy path, errors, auth, validation, edge cases) | Backend Agent | pytest, Jest+Supertest, newman — see `backend-agent.md` §3.6 |
| E2E tests | Tester Agent (exclusive) | Playwright (playwright-cli skill) |

---

## Key Discoveries & Gotchas

1. **Jira API auth via Atlassian gateway only** — Jira API token does NOT work for direct REST API Basic Auth (`{cloudId}.atlassian.net` returns 401). Must use Atlassian API gateway (`api.atlassian.com/ex/jira/{cloudId}/rest/...`) with the MCP auth header from `mcp_settings.json`
2. **Adding issues to sprint via Jira MCP** — POST `/sprint/{id}/issue` returns 401 scope error via the API gateway. Instead, use `atlassian-rovo-mcp_editJiraIssue` with `customfield_10020: <sprint_id>` (number, not array) to set the Sprint field on each issue individually
3. **Cross-platform shell syntax**: On Windows (PowerShell), use semicolons instead of `\n` for multi-statement commands; `&&` doesn't work in PowerShell 5.1. On macOS/Linux (Bash), use `&&` for conditional chaining (only run next command if previous succeeds) or `;` for unconditional chaining. All command blocks in agent reference files now include both Windows (PowerShell) and macOS/Linux (Bash) variants.
4. **SPA 404 limitation**: With `try_files $uri $uri/ /index.html`, Nginx always returns 200 — 404 for invalid routes must be handled client-side by Angular Router
5. **Angular 15 build**: Use `npx ng build --configuration=production`, NOT `npm run build --prod` (deprecated in Angular 15+)
6. **Semgrep MCP**: Can timeout in sandbox mode due to network restrictions; CLI fallback: `semgrep ci`
8. **GitHub MCP lacks workflow dispatch**: Use REST API with GitHub PAT from `.codeartsdoer/mcp/mcp_settings.json` to call `POST /repos/{owner}/{repo}/actions/workflows/ci-cd.yml/dispatches` (via `curl` on macOS/Linux or `Invoke-RestMethod` on Windows)
8. **GitHub MCP lacks workflow dispatch**: Use `Invoke-RestMethod` with GitHub PAT from `.codeartsdoer/mcp/mcp_settings.json` to call `POST /repos/{owner}/{repo}/actions/workflows/ci-cd.yml/dispatches`
9. **Artifact upload breaks symlinks**: Splitting npm ci and npm run build into separate GitHub Actions jobs breaks `.bin` symlinks — keep install + build in the same job
10. **SonarCloud token ≠ GitHub PAT**: SonarCloud MCP requires a SonarCloud-specific token (from sonarcloud.io/account/security/), not a GitHub PAT
11. **SonarCloud Automatic Analysis conflicts with GitHub Actions**: If both are enabled simultaneously, the GitHub Actions workflow crashes with "You are running CI analysis while Automatic Analysis is enabled". To fix: go to SonarCloud → Project Dashboard → Administration → Analysis Method → turn OFF "SonarCloud Automatic Analysis" toggle. Requires Project Administrator permissions (org-level alone is insufficient). This must be done before triggering any CI/CD pipeline that includes a SonarCloud scan stage.