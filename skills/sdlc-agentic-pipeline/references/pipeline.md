# SDLC Agentic Pipeline — Orchestration Reference

Detailed per-step orchestration for the agentic SDLC flow.

> **Cross-references:**
> - High-level overview (step table, agent routing) -> `../SKILL.md`
> - Branch strategy, PR merge gate, Jira lifecycle, error throwback ->
>   `../branch-strategy.md`
> - Critical warnings -> `../setup/critical-warnings.md`
> - Report spec -> `../report-spec.md`
> - Config templates -> `../config-reference.md`
> - Agent definitions -> `agents/` directory

---

## SDLC Agentic Flow — 10-Step Pipeline

```
Branch Strategy:  main (production) <- dev (integration) <- feature/fix/bug/docs branches

Step 1: PM Agent — Requirement Breakdown (PRD + Jira)
   |
   +-> Step 1b: Frontend/Backend Agent — Requirement Review (approve or flag gaps)
         |
         +-> Step 2: PM Agent — Sprint Start & SDD Setup (Jira sprint + SDD docs PR -> dev)
               |
               +-> Step 3: Frontend/Backend Agent — Development & Pre-Scan
                     |
                     +-> Step 4: Code Reviewer Agent — PR Review & Approval
                           |
                           +-> Step 5: Tester Agent — E2E Testing
                                 |
                                 +-> Step 6: DevOps Agent — CI/CD + Artifact Verification
                                       |
                                       +-> Step 7: PM + Developer - Release Review -> merge dev -> main
                                             |
                                             +-> Step 8: PM + DevOps - Deployment
                                                   |
                                                   +-> Step 9: PM + Developer - Sprint Close, Retro + Report
```

---

## Step Details

> **Conditional Pipeline Execution:** Each step checks
> `.codeartsdoer/tool-selections.json` (via `isSelected(toolId)`) and degrades
> gracefully. Steps that depend on unselected tools are **skipped, not errored**.
> If the file is missing, treat all tools as selected (backward-compatible
> default = full pipeline). See `setup/multi-tool-selection-plan.md` §7.

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
- **Conditional**: `jira` NOT selected -> skip Jira task creation; derive from PRD/local. `github` NOT selected -> analyze local directory. `prd` always available.
- **Input**: CURATED CONTEXT from Step 0.DA (if architect agent ran)
- **Actions**:
  1. Analyze GitHub repository structure (READ-ONLY via GitHub MCP)
  2. Generate PRD via `prd` skill
  3. Break down requirements into Jira tasks with agent routing labels
  4. Link related issues (Blocks, Relates)
  5. Request requirement review from Frontend & Backend Agents via Jira comments
  6. Present all created Jira tasks as clickable hyperlinks to the user
     - URL pattern: `https://{JIRA_CLOUD_ID}/browse/{ISSUE-KEY}`
     - **Do NOT use the `browser` tool** — links must be plain Markdown hyperlinks
- **Output**: Jira tasks in "To Do" status with routing labels
- **Full details**: See `agents/pm-agent.md` §STEP 1

### Step 1b: Frontend/Backend Agent — Requirement Review
- **Owner**: Frontend Agent, Backend Agent
- **Conditional**: `jira` NOT selected -> skip entirely. `github` NOT selected -> review via local file diff.
- **Actions**:
  1. Receive review request from PM Agent via Jira comment
  2. Evaluate requirements from frontend/backend perspective
  3. If clear -> comment `@agent:pm Review approved`
  4. If changes needed -> comment `@agent:pm Review feedback: <issues>`
  5. PM Agent updates requirements based on feedback
- **Gate**: Both agents must approve before proceeding to Step 2
- **Full details**: See `agents/shared/developer-agent-base.md` §STEP 1

### Step 2: PM Agent — Sprint Start & SDD Setup
- **Owner**: PM Agent (sprint) + Developer Agent (SDD file writes)
- **Conditional**: `jira` NOT selected -> skip sprint creation. `sdd` NOT selected AND `openspec` NOT selected -> skip SDD directory creation.
- **Tools**: Jira MCP, Bash (Jira Agile REST API), creating-sdd-directory skill, openspec CLI, question tool
- **Actions**:
  1. Find Jira board ID via REST API: `GET /rest/agile/1.0/board`
  2. Ask user for sprint name via `question` tool (max 30 chars — see `setup/critical-warnings.md#WARN-JIRA-SPRINT-NAME`)
  3. Create sprint: `POST /rest/agile/1.0/sprint`
  4. Add issues to sprint (use `editJiraIssue` with `customfield_10020` — see `setup/critical-warnings.md#WARN-JIRA-ISSUES-SPRINT`)
  5. Start sprint: `PUT /rest/agile/1.0/sprint/{id}`
  6. SDD Setup (conditional based on tool selection):
     - If `openspec` selected: `openspec new change`, `openspec validate`, `openspec show --deltas-only`
     - If `sdd` selected: invoke `creating-sdd-directory` skill, delegate file creation to developer agent
     - If both: OpenSpec is primary; SDD Toolkit is supplementary
  7. Post SDD-complete comments on all Jira tasks
- **Output**: Active sprint with all issues, SDD/openspec directories created and merged to `dev`
- **Full details**: See `agents/pm-agent.md` §STEP 2

### Step 3: Frontend/Backend Agent — Development & Pre-Scan
- **Owner**: Frontend Agent, Backend Agent
- **Conditional**: `github` NOT selected -> no feature branches, no PRs; commit locally. `semgrep` NOT selected -> skip local pre-scan.
- **Tools**: GitHub MCP, Jira MCP, Bash (linters)
- **Actions**:
  1. Transition Jira task to "In Progress" (mandatory)
  2. Create feature branch from integration branch, write code
  3. Run local linters, fix all errors
  4. Write unit/component tests; write API tests (backend only)
  5. Run local security scan — fix CRITICAL findings before PR
  6. Push and create PR (base: integration branch, include scan summary in PR comment)
  7. Transition Jira task to "In Review"
  8. Comment `@agent:code-reviewer PR #X ready for review`
- **Quality Gate Prevention**: duplication < 3%, security rating A, coverage > 80%
- **Full details**: See `agents/shared/developer-agent-base.md` §STEP 3 + domain-specific agent file

### Step 4: Code Reviewer Agent — PR Review & Approval
- **Owner**: Code Reviewer Agent
- **Conditional**: `github` NOT selected -> skip entirely. `semgrep` NOT selected -> skip cross-referencing.
- **Tools**: GitHub MCP (PR review, secret scanning), Jira MCP
- **Actions**:
  1. Fetch tasks in "In Review" status
  2. Read PR diff and changed files
  3. Review for code quality, conventions, logic errors, security patterns
  4. Cross-reference with security pre-scan summary from Step 3 PR comment
  5. Run `github_run_secret_scanning` for leaked secrets
  6. Submit GitHub PR review (APPROVE / REQUEST_CHANGES)
  7. If CRITICAL issues -> REQUEST_CHANGES, transition Jira BACK to "In Progress"
  8. If approved -> comment `@agent:tester Code review approved - ready for E2E testing`
- **Full details**: See `agents/code-reviewer-agent.md`

### Step 5: Tester Agent - E2E Testing
- **Conditional**: `playwright` NOT selected -> skip E2E; Tester produces "no E2E coverage" sign-off. `github` NOT selected -> run tests against local working directory.
- **Owner**: Tester Agent
- **Tools**: E2E testing skill, Jira MCP, Bash
- **Actions**:
  1. Transition Jira task to "In Testing"
  2. Checkout the feature branch (Tester handles this itself)
  3. Write E2E test scenarios via E2E testing skill
  4. Set up test configurations and dependencies
  5. Run E2E tests locally (must be executed, not just written)
  6. Fix test errors until all pass
  7. If tests fail after fixes -> transition Jira BACK to "In Progress", comment throwback
  8. If tests pass -> comment `@agent:devops E2E sign-off complete, ready for CI/CD`
- **Full details**: See `agents/tester-agent.md`

### Step 5 (continued): Auto-Merge Feature PRs into `dev`
- **Owner**: PM Agent (authorizes) + Developer Agent (executes merge)
- **Gate**: See `branch-strategy.md` §"PR Merge Gate — Feature PR"
- **Actions**:
  1. PM Agent verifies all feature PRs have Code Reviewer + Tester sign-off
  2. PM Agent asks user for approval via `question` tool
  3. PM Agent delegates to Developer Agent to merge each feature PR via GitHub MCP
  4. Developer Agent verifies all feature branches are merged into `dev`
- **Output**: All feature code merged into `dev`, CI/CD auto-triggers
- **Full details**: See `agents/shared/developer-agent-base.md` §STEP 5

> **NOTE:** CI green and SonarCloud QG are NOT required at this stage.
> They are gates for the Release Merge (`dev` -> `main`) in Step 7.

### Step 6: DevOps Agent — CI/CD (Auto-Triggered)
- **Owner**: DevOps Agent
- **Conditional**: `github` NOT selected -> skip. `sonarcloud` NOT selected -> remove quality scan stages. `jfrog` NOT selected -> remove artifact publish stages.
- **Tools**: GitHub MCP, Bash (GitHub API), Jira MCP
- **Pipeline stages**: build (1), quality-scan (2), quality-gate-check (3), publish-artifacts (4), verify-artifacts (5)
- **Actions**:
  1. Transition Jira task to "In Progress" (CI/CD phase)
  2. Verify/update GitHub Actions workflow (auto-triggered on push to `dev`)
  3. Monitor auto-triggered CI/CD — see `agents/devops-agent.md` §6.5-6.6
  4. If CI fails -> identify failing job+step, trigger error throwback
  5. If CI passes -> proceed to artifact + quality gate verification
- **Artifact verification**: REST API directly (no MCP server) — see `agents/devops-agent.md` §6.7
- **Quality Gate**: If fails (coverage < 80%, duplication > 3%, security < A) -> do NOT proceed to Step 7
- **Full details**: See `agents/devops-agent.md`

### Step 7: PM + Developer - Release Review & Merge
- **Owner**: PM Agent (authorizes) + Developer Agent (executes merge)
- **Conditional**: `github` NOT selected -> skip `dev`->`main` merge. `jira` NOT selected -> skip "Done" transitions.
- **Tools**: Jira MCP, GitHub MCP, question tool
- **Actions**:
  1. Verify ALL tasks have Code Reviewer sign-off
  2. Verify ALL tasks have Tester E2E sign-off
  3. Verify quality gate + artifacts verified (from Step 6)
  4. Verify CI/CD pipeline passed
  5. Verify no open bugs or security vulnerabilities
  6. Verify all feature PRs merged into `dev`
  7. Require human approval via `question` tool
  8. Delegate to Developer Agent: create and merge `dev` -> `main` PR
  9. Transition tasks to "Done" via `transitionJiraIssue`
  10. If ANY check fails -> trigger error throwback
- **Conflict resolution**: Simplified "prefer dev" strategy (domain-owner resolution only if CI/CD fails — see `agents/shared/developer-agent-base.md` §7.3)
- **Full details**: See `agents/pm-agent.md` §STEP 7 + `agents/shared/developer-agent-base.md` §STEP 7

### Step 8: PM + DevOps - Deployment
- **Owner**: PM Agent (authorizes) + DevOps Agent (executes SSH + Docker)
- **Conditional**: `huawei-ecs` NOT selected -> skip entirely. `jfrog` NOT selected but `huawei-ecs` IS -> warn no Docker image source.
- **Tools**: Jira MCP, question tool, Bash (SSH via DevOps Agent)
- **Prerequisite**: ECS pre-configured during Step 0 (SSH key, Docker, registry login)
- **Actions**:
  1. PM Agent requires human approval via `question` tool
  2. DevOps Agent pulls Docker image on ECS via SSH
  3. DevOps Agent stops existing container, starts new container
  4. DevOps Agent verifies deployment health check: `curl -s -o /dev/null -w '%{http_code}' http://<ECS_HOST>:80`
  5. If deployment fails -> DevOps Agent rolls back: stop new, restart previous
  6. If deployment succeeds -> PM Agent comments `@agent:all Deployment complete`
- **Full details**: See `agents/pm-agent.md` §STEP 8 + `agents/devops-agent.md` §STEP 8

### Step 9: PM + Developer - Sprint Close, Retrospective + Report
- **Owner**: PM Agent (sprint close + report) + Developer Agent (report push)
- **Conditional**: `jira` NOT selected -> skip sprint close. Report generation always runs.
- **Tools**: Bash (Jira Agile REST API), Jira MCP, GitHub MCP, question tool
- **Actions**:
  1. Verify ALL tasks are in "Done" status (ask user how to handle incomplete tasks)
  2. Close sprint via REST API (`PUT /sprint/{id}` — see `setup/critical-warnings.md#WARN-JIRA-SPRINT-CLOSE`)
  3. Generate sprint summary (completed vs. incomplete, velocity metrics)
  4. Post retrospective comment on the Epic
  5. Archive SDD documents (`openspec archive` if selected; push final SDD versions if selected)
  6. Generate SDLC Process Report (HTML) — see `report-spec.md`
  7. Push report to GitHub — see `agents/shared/developer-agent-base.md` §STEP 9
  8. Present report to user (file path + GitHub PR link)
- **Output**: Sprint closed, retrospective posted, HTML report generated + pushed
- **Full details**: See `agents/pm-agent.md` §STEP 9

---

## Key Discoveries & Gotchas

> All critical warnings have been consolidated in
> `setup/critical-warnings.md`. The items below are **pipeline-specific
> behavioral notes** not covered by the warnings file.

1. **Cross-platform shell syntax**: On Windows (PowerShell), use semicolons
   instead of `\n` for multi-statement commands; `&&` doesn't work in
   PowerShell 5.1. On macOS/Linux (Bash), use `&&` or `;`.

2. **Security scan MCP timeout**: See
   `setup/critical-warnings.md#WARN-SEMGREP-TIMEOUT`.

3. **GitHub MCP workflow dispatch**: See
   `setup/critical-warnings.md#WARN-GITHUB-WORKFLOW-DISPATCH`.

4. **Artifact upload breaks symlinks**: See
   `setup/critical-warnings.md#WARN-ARTIFACT-SYMLINKS`.

5. **Quality gate token vs GitHub PAT**: See
   `setup/critical-warnings.md#WARN-SONAR-TOKEN`.

6. **Quality gate Automatic Analysis conflict**: See
   `setup/critical-warnings.md#WARN-SONAR-AUTO`.

7. **Jira API auth via Atlassian gateway only**: See
   `setup/critical-warnings.md#WARN-JIRA-401`.

8. **Adding issues to sprint**: See
   `setup/critical-warnings.md#WARN-JIRA-ISSUES-SPRINT`.
