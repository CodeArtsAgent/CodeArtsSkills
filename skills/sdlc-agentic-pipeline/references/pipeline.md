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

[Step 0.F — Optional, Figma-to-Code] PM Agent (entry point)
   |
   |  User provides: raw requirement + Figma URL + node-id
   |  pm-agent -> brainstorm -> creates requirement.md -> hands off to figma-design-agent
   |  figma-design-agent -> figma.get_figma_data -> figma-extract.md
   |  Figma-vs-SDD diff (requirement.md): Missing in spec / Missing in Figma / Mismatch / Outdated
   |  User confirmation -> pm-agent updates requirement.md + creates tasks.md
   |  figma-design-agent hands off to pm-agent with routing breakdown
   |  pm-agent -> breaks down tasks per tasks.md -> pushes to Azure DevOps
   v
Step 0.DA: Architect Agent — Design Phase
   |
   v
Step 1: PM Agent — Requirement Breakdown
   |
   +-> Step 1b: Frontend/Backend Agent — Requirement Review
         |
         +-> Step 2: PM Agent — Sprint Start & SDD Setup
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
>
> **Platform routing:** When `azure-devops` is selected (can coexist
> with GitHub + Jira), Azure DevOps CLI handles Azure Repos, Boards,
> and Pipelines operations. When `github` is also selected, GitHub MCP
> handles GitHub repos/issues in parallel. When `jira` is also selected,
> Jira MCP handles Jira boards in parallel. Agents route by platform.
> Config: org URL + project in `.env`, PAT via `AZURE_DEVOPS_EXT_PAT`
> **user-level** env var (persisted during onboarding, shared across all
> agents/sessions; the CLI auto-reads it). Consult the `azure-devops-cli`
> skill's reference files for CLI command syntax.

> **Idempotency:** If the pipeline is re-run for the same sprint, the PM Agent must:
> 1. Check if a sprint already exists and is active (skip Step 2 sprint creation)
> 2. Check existing work items (skip Step 1 if the Epic → Issue → Task tree already exists)
> 3. Check PR status (skip Steps 3-5 if PRs already merged into `dev`)
> 4. Check CI/CD workflow runs (skip Step 6 if already passed)
> 5. Check JFrog artifacts (skip Step 6 if already verified)
> 6. Check if `dev` is already merged to `main` (skip Step 7 if already merged)
> 7. Check if deployment is already live (skip Step 8 if health check passes)
> 8. Always run Step 9 (sprint close + report) if not yet completed

### Step 0.F: Figma-to-Code (PM → Figma Design → PM)
- **Owner**: PM Agent (entry point + requirement.md creation + task breakdown + Azure push) → Figma Design Agent (extraction + diff)
- **Conditional**: `figma` NOT selected -> skip. Runs when the user provides a raw requirement + Figma URL + node-id to `pm-agent`.
- **Tools**: Figma MCP (`figma.get_figma_data`, `figma.download_figma_images`) — EXCLUSIVE to `figma-design-agent`
- **Actions**:
  1. `pm-agent` receives raw requirement + Figma URL + node-id from the user; uses `sdlc-brainstorming` to clarify the requirement
  2. `pm-agent` creates `requirement.md` from the raw requirement (pm-agent owns `requirement.md`)
  3. `pm-agent` hands off to `figma-design-agent` with: `requirement.md` path + Figma URL + node-id
  4. `figma-design-agent` reads `requirement.md` (comparison baseline), runs `figma.get_figma_data` (file key + node-id) — EXCLUSIVE MCP call
  5. `figma-design-agent` runs `figma.download_figma_images` for icons, illustrations, image assets — EXCLUSIVE MCP call
  6. `figma-design-agent` persists raw extraction: `specs/<YYYY-MM-DD-...>/figma-extract.md`
  7. `figma-design-agent` diffs Figma vs `requirement.md`, categorizes each finding:
     - Missing in spec / Missing in Figma / Mismatch / Outdated
     - Cite frame-ids and spec section numbers
  8. `figma-design-agent` presents structured diff list, asks user to confirm each category
  9. After user confirmation: `pm-agent` updates `requirement.md` + creates `tasks.md` — pm-agent is the SOLE owner of `requirement.md` and `tasks.md`
  10. `figma-design-agent` hands off to `pm-agent` with: `requirement.md` path, `tasks.md` path, `figma-extract.md` path, file key + node-id, **routing breakdown**
  11. `pm-agent` breaks down tasks per `tasks.md`, creates Epic → Issue → Task hierarchy, pushes to Azure DevOps (or Jira if selected)
- **Critical**: Backend requirements revealed by Figma diff MUST be assigned to `backend-agent` (not `frontend-agent`).
- **Exclusivity**: No other agent (Architect, Backend, Frontend, Tester, etc.) calls Figma MCP. They consume Figma data via `figma-extract.md` + `requirement.md`.
- **SDD ownership**: `pm-agent` owns `requirement.md` + `tasks.md`.
- **Output**: `figma-extract.md`, updated `requirement.md` + `tasks.md`, work items pushed to Azure DevOps
- **Full details**: See `agents/figma-design-agent.md`

### Step 0.DA: Architect Agent — Design Phase
- **Owner**: Architect Agent (creates `design.md` ONLY)
- **Conditional**: If Step 0.F (Figma-to-Code) already ran -> **SKIP this step entirely**. `requirement.md` + `tasks.md` already created by `pm-agent` based on `figma-extract.md`. No `design.md` is created. If Step 0.F did NOT run: proceed normally — architect creates `design.md` from `requirement.md`. If `figma` selected AND `figma-extract.md` exists but Step 0.F did not run -> incorporate Figma tokens (colors, typography, spacing), component inventory, and asset list into `design.md`. NEVER call Figma MCP — read the file only. **You create ONLY `design.md`** — `requirement.md` and `tasks.md` are owned by `pm-agent`.
- **Input**: `requirement.md` (from `pm-agent`), optional `figma-extract.md`
- **Actions**: classify task, produce / update `design.md`, surface DDD/SDD/TDD scope
- **Full details**: See `agents/architect-agent.md`

### Step 1: PM Agent — Requirement Breakdown
- **Owner**: PM Agent (creates `requirement.md` + `tasks.md`; delegates `design.md` to Architect Agent)
- **Conditional**: `jira` NOT selected -> skip Jira task creation; derive from PRD/local. `github` NOT selected -> analyze local directory. `azure-devops` selected -> use `azure-devops-cli` skill (`references/boards-and-iterations.md`) for Azure work items. When both `azure-devops` and `jira` are selected, create work items on both platforms. When both `azure-devops` and `github` are selected, analyze both repos. `prd` always available.
- **Input**: CURATED CONTEXT from Step 0.DA (if architect agent ran)
- **Actions**:
  1. Analyze GitHub repository structure (READ-ONLY via GitHub MCP) or local directory
  2. Collect raw requirements (user input, repo analysis, existing docs)
   3. **If `sdd` or `openspec` selected**: create SDD files in strict order — SDD ownership is split between `pm-agent` and `architect-agent`. **Do NOT skip any step** — all three files are MANDATORY and must be created sequentially:
      - **If Step 0.F (Figma-to-Code) already ran**: `requirement.md` + `tasks.md` already created by `pm-agent` based on `figma-extract.md`. Skip `design.md` — proceed to step 4 (work item creation).
      - **If Step 0.F did NOT run** (normal flow):
        - a. `requirement.md` — from raw requirements (WHAT to build) — created by **pm-agent** — **MUST create first, do NOT skip**
        - b. `design.md` — from `requirement.md` (HOW to build) — delegate to **architect-agent** — **MUST create after requirement.md, do NOT skip**
        - c. `tasks.md` — from `design.md` (implementation task breakdown) — created by **pm-agent** — **MUST create after design.md, do NOT skip**
      - SDD files are created BEFORE any work items are pushed to Jira/Azure
  4. **Create work items as Epic → Issue → Task hierarchy** based on SDD `tasks.md` (if SDD created) or raw requirements (if SDD not selected). See `agents/pm-agent.md` §Work Item Hierarchy. Jira: `createJiraIssue` (Epic → Story → Sub-task with parent links). Azure DevOps: `az boards work-item create --assigned-to "$AZURE_DEVOPS_ASSIGNED_TO"` (Epic → Issue → Task with `relation add --relation-type parent`).
  5. Cross-link Issues with Blocks/Relates for cross-domain dependencies
  6. **MANDATORY**: Post creation comment on each work item — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:pm Work item created - <summary>"`. Then request requirement review from Frontend & Backend Agents — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:frontend @agent:backend Please review requirements for <Task Name>"`
  7. Present all created work items as clickable hyperlinks to the user (Jira: `https://{JIRA_CLOUD_ID}/browse/{KEY}`; Azure DevOps: `https://dev.azure.com/{ORG}/{PROJECT}/_workitems/edit/{ID}`). Do NOT use the `browser` tool.
- **Output**: SDD files (if selected) + Epic → Issue → Task tree in "To Do" status; routing labels on Task-level items only
- **Full details**: See `agents/pm-agent.md` §Work Item Hierarchy

### Step 1b: Frontend/Backend Agent — Requirement Review
- **Owner**: Frontend Agent, Backend Agent
- **Conditional**: `jira` NOT selected -> skip entirely. `github` NOT selected -> review via local file diff. `azure-devops` selected -> use `azure-devops-cli` skill (`references/boards-and-iterations.md`) for Azure work item review comments, (`references/repos-and-prs.md`) for Azure PR review. When both platforms selected, agents review on both.
- **Actions**:
  1. Receive review request from PM Agent via Jira comment
  2. Evaluate requirements from frontend/backend perspective
  3. If clear -> **MANDATORY**: post comment — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:pm Review approved"`
  4. If changes needed -> **MANDATORY**: post comment — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:pm Review feedback: <issues>"`
  5. PM Agent updates requirements based on feedback
- **Gate**: Both agents must approve before proceeding to Step 2
- **Full details**: See `agents/shared/developer-agent-base.md` §STEP 1

### Step 2: PM Agent — Sprint Start & SDD Setup
- **Owner**: PM Agent (sprint setup only — SDD already created in Step 1)
- **Conditional**: `jira` NOT selected AND `azure-devops` NOT selected -> skip sprint creation. SDD files already created in Step 1 (if `sdd` or `openspec` selected). `azure-devops` selected -> sprint = iteration management via `azure-devops-cli` skill (`references/boards-and-iterations.md`). When both `jira` and `azure-devops` selected, manage sprint/iteration on both platforms.
- **Tools**: Jira MCP, Bash (Jira Agile REST API), openspec CLI, question tool, Azure DevOps CLI (if `azure-devops` selected)
- **Actions**:
  1. **Sprint/Iteration setup** (skip if both `jira` AND `azure-devops` NOT selected):
     - **Jira mode:**
       1. Find Jira board ID via REST API: `GET /rest/agile/1.0/board`
       2. Ask user for sprint name via `question` tool (max 30 chars — see `setup/critical-warnings.md#WARN-JIRA-SPRINT-NAME`)
       3. Create sprint: `POST /rest/agile/1.0/sprint`
       4. Add **Tasks (leaf level only)** to sprint — Jira: `editJiraIssue` with `customfield_10020` on each Sub-task (see `setup/critical-warnings.md#WARN-JIRA-ISSUES-SPRINT`)
       5. Start sprint: `PUT /rest/agile/1.0/sprint/{id}`
      - **Azure DevOps mode:**
        1. List iterations: `az boards iteration project list --project <PROJECT>`
        2. Ask user for sprint name via `question` tool
        3. Create or update iteration: `az boards iteration project create --name "<SPRINT_NAME>" --path "<Project>\<SPRINT_NAME>" --project <PROJECT> --start-date "<YYYY-MM-DD>" --finish-date "<YYYY-MM-DD>"` (if already exists, use `az boards iteration project update --path "<Project>\<SPRINT_NAME>" --project <PROJECT> --start-date "<YYYY-MM-DD>" --finish-date "<YYYY-MM-DD>"`)
        4. Set team default iteration: `az boards iteration team set-default-iteration --team "<TEAM_NAME>" --path "<Project>\<SPRINT_NAME>" --project <PROJECT>`
        5. Add Tasks to iteration: `az boards work-item update --id <ID> --iteration "<Project>\<SPRINT_NAME>"` for each Task
        6. Verify: `az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task' AND [System.IterationPath] = '<Project>\<SPRINT_NAME>'"`
  2. If `openspec` selected: run `openspec validate`, `openspec show --deltas-only` on SDD files created in Step 1
  3. **MANDATORY**: Post SDD-complete comments on all Task-level work items — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:pm SDD complete - requirement.md/design.md/tasks.md created (requirement.md + tasks.md by pm-agent, design.md by architect-agent)"`
- **Output**: Active sprint/iteration containing all leaf-level Tasks; SDD files already created in Step 1
- **Full details**: See `agents/pm-agent.md` §STEP 2

### Step 3: Frontend/Backend Agent — Development & Pre-Scan
- **Owner**: Frontend Agent, Backend Agent
- **Conditional**: `github` NOT selected AND `azure-devops` NOT selected -> no feature branches, no PRs; commit locally. `azure-devops` selected -> use `azure-devops-cli` skill (`references/repos-and-prs.md`) for Azure branches/PRs, (`references/boards-and-iterations.md`) for Azure status transitions. When both `github` and `azure-devops` selected, create PRs on both platforms. `semgrep` NOT selected -> skip local pre-scan. `figma` selected -> Frontend agent reads `specs/<...>/figma-extract.md` for design tokens, components, and asset paths.
- **Tools**: GitHub MCP, Jira MCP, Bash (linters), Azure DevOps CLI (if `azure-devops` selected), figma-extract.md (read-only, if `figma` selected)
- **Actions**:
  1. **Prerequisite gate**: verify your assigned Task-level work items exist (Jira: JQL `labels = agent:<this-agent> AND issuetype = Sub-task`; Azure DevOps: WIQL `[System.Tags] CONTAINS 'agent:<this-agent>' AND [System.WorkItemType] = 'Task'`). If none found → report to `@agent:pm`, do NOT start coding.
  2. **MANDATORY**: Transition work item to "In Progress" BEFORE writing any code — Azure DevOps: `az boards work-item update --id <ID> --state Active` (Agile) or `--state Doing` (Basic). See `critical-warnings.md#WARN-AZURE-BASIC-STATES`.
  3. Create feature branch from integration branch, write code
  4. **Push initial code to remote** — Azure DevOps: `git add -A && git commit -m "feat: initial implementation" && git push origin feature/<agent>/<short-description>`
  5. **Frontend (if `figma` selected)**: Read `figma-extract.md` for design tokens, component inventory, and asset paths. Reference downloaded Figma images (saved by `figma-design-agent` next to `figma-extract.md`). Apply Code Connect mappings to MUI components. Map Figma variants -> React props.
  6. Run local linters, fix all errors
  7. Write unit/component tests; write API tests (backend only)
  8. Run local security scan — fix CRITICAL findings before PR
  9. **Push final code and create PR** — Azure DevOps: `git add -A && git commit -m "feat: complete implementation" && git push origin feature/<agent>/<short-description>` then create PR via `azure-devops-cli` skill
  10. Transition work item to "In Review"
  11. **MANDATORY**: Comment `@agent:code-reviewer PR #X ready for review` — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:code-reviewer PR #<PR_ID> ready for review"`
  12. **MANDATORY**: Post full report content to work item comment (see `developer-agent-base.md` §3.8)
- **Quality Gate Prevention**: duplication < 3%, security rating A, coverage > 80%
- **Full details**: See `agents/shared/developer-agent-base.md` §STEP 3 + domain-specific agent file

### Step 4: Code Reviewer Agent — PR Review & Approval
- **Owner**: Code Reviewer Agent
- **Conditional**: `github` NOT selected AND `azure-devops` NOT selected -> skip entirely. `azure-devops` selected -> use `azure-devops-cli` skill (`references/repos-and-prs.md`) for Azure PR review. When both selected, review PRs on both platforms. `semgrep` NOT selected -> skip cross-referencing.
- **Tools**: GitHub MCP (PR review, secret scanning), Jira MCP
- **Actions**:
  1. Fetch tasks in "In Review" status
  2. Read PR diff and changed files
  3. Review for code quality, conventions, logic errors, security patterns
  4. Cross-reference with security pre-scan summary from Step 3 PR comment
  5. Run `github_run_secret_scanning` for leaked secrets
  6. Submit GitHub PR review (APPROVE / REQUEST_CHANGES)
  7. If CRITICAL issues -> REQUEST_CHANGES, transition work item BACK to "In Progress" (Jira: `transitionJiraIssue`; Azure DevOps: `az boards work-item update --id <ID> --state Active` (Agile) or `--state Doing` (Basic))
  8. If approved -> **MANDATORY**: comment — Azure DevOps: `az boards work-item update --id <ID> --discussion "@agent:tester Code review approved - ready for E2E testing"`
  9. **MANDATORY**: Post full review report to work item comment (see `code-reviewer-agent.md` Hands-off)
- **Full details**: See `agents/code-reviewer-agent.md`

### Step 5: Tester Agent - E2E Testing + Visual Validation
- **Conditional**: `playwright` NOT selected -> skip E2E; Tester produces "no E2E coverage" sign-off. `github` NOT selected AND `azure-devops` NOT selected -> run tests against local working directory. `figma` selected -> run Playwright screenshot capture and visual diff against locally-saved Figma images.
- **Owner**: Tester Agent
- **Tools**: E2E testing skill, Jira MCP, Bash, Playwright (visual diff if `figma` selected)
- **Actions**:
  1. Transition work item to "In Testing" (Jira: `transitionJiraIssue`; Azure DevOps: keep "Active", comment `@agent:pm Entering testing phase`)
  2. Checkout the feature branch (Tester handles this itself)
  3. Write E2E test scenarios via E2E testing skill
  4. Set up test configurations and dependencies
  5. Enable Playwright tracing (`tracing-start`), then run E2E tests locally (must be executed, not just written). Stop tracing after (`tracing-stop`) — trace files saved to `traces/` as evidence.
  6. **Optional video**: record `.webm` for complex multi-step user flows via `playwright-cli video-start`/`video-stop`.
  7. **Visual diff (if `figma` selected)**: for every screen in `figma-extract.md`, capture a Playwright screenshot at the same viewport and compare against the saved Figma image. Report diff results alongside functional E2E.
  8. Fix test errors until all pass (functional + visual)
  9. If tests fail after fixes -> transition work item BACK to "In Progress" (Jira: `transitionJiraIssue`; Azure DevOps: `az boards work-item update --id <ID> --state Active` (Agile) or `--state Doing` (Basic)), comment throwback
  10. If tests pass -> comment `@agent:devops E2E sign-off complete, ready for CI/CD`
  11. Post full test report to work item comment (see `tester-agent.md` Hand-off)
- **Full details**: See `agents/tester-agent.md`

### Step 5 (continued): Auto-Merge Feature PRs into `dev`
- **Owner**: PM Agent (authorizes) + Developer Agent (executes merge)
- **Gate**: See `branch-strategy.md` §"PR Merge Gate — Feature PR"
- **Actions**:
  1. PM Agent verifies all feature PRs have Code Reviewer + Tester sign-off
  2. PM Agent asks user for approval via `question` tool
  3. PM Agent delegates to Developer Agent to merge each feature PR via GitHub MCP
  4. Developer Agent verifies all feature branches are merged into `dev`
  5. **MANDATORY**: Remind user via `question` tool to confirm all PRs merged successfully (especially for manually created PRs on GitHub/etc.) — do NOT proceed to Step 6 until user confirms merge is complete
- **Output**: All feature code merged into `dev`, CI/CD auto-triggers
- **Full details**: See `agents/shared/developer-agent-base.md` §STEP 5

> **NOTE:** CI green and SonarCloud QG are NOT required at this stage.
> They are gates for the Release Merge (`dev` -> `main`) in Step 7.

### Step 6: DevOps Agent — CI/CD (Auto-Triggered)
- **Owner**: DevOps Agent
- **Conditional**: `github` NOT selected AND `azure-devops` NOT selected -> skip. `azure-devops` selected -> CI/CD via Azure Pipelines (see `azure-devops-cli` skill, `references/pipelines-and-builds.md`), secrets/vars in variable groups. When both `github` and `azure-devops` selected, run CI/CD on both platforms. `sonarcloud` NOT selected -> remove SonarCloud tasks from Build stage. `jfrog` NOT selected -> use Azure Artifacts/ACR instead of JFrog (if `azure-devops` selected); remove JFrog stages.
- **Tools**: GitHub MCP, Bash (GitHub API), Jira MCP, Azure DevOps CLI (if `azure-devops` selected)
- **Pipeline stages (GitHub mode)**: build, sonar-scan, deploy-to-jfrog, verify-jfrog
- **Pipeline stages (Azure mode)**: Build (incl. SonarCloud tasks), DeployToJFrog/DeployToAzureArtifacts, VerifyJFrog/VerifyAzureArtifacts
- **Actions**:
  1. Transition Jira task to "In Progress" (CI/CD phase)
  2. Verify/update GitHub Actions workflow (auto-triggered on push to `dev`)
  3. Monitor auto-triggered CI/CD — see `agents/devops-agent.md` §6.5-6.6
  4. If CI fails -> identify failing job+step, trigger error throwback
  5. If CI passes -> proceed to artifact + quality gate verification
  6. **MANDATORY**: Post full CI/CD report to work item comment (see `devops-agent.md` §7.9) — Azure DevOps: `az boards work-item update --id <ID> --discussion "<HTML_CONTENT>"` (see `developer-agent-base.md` §3.8 for HTML formatting)
- **Artifact verification**: REST API directly (no MCP server) — see `agents/devops-agent.md` §6.7
- **Quality Gate**: If fails (coverage < 80%, duplication > 3%, security < A) -> do NOT proceed to Step 7
- **Full details**: See `agents/devops-agent.md`

### Step 7: PM + Developer - Release Review & Merge
- **Owner**: PM Agent (authorizes) + Developer Agent (executes merge)
- **Conditional**: `github` NOT selected AND `azure-devops` NOT selected -> skip `dev`->`main` merge. `azure-devops` selected -> use `azure-devops-cli` skill (`references/repos-and-prs.md`) for Azure merge. When both selected, merge on both platforms. `jira` NOT selected AND `azure-devops` NOT selected -> skip "Done"/"Closed" transitions.
- **Tools**: Jira MCP, GitHub MCP, question tool, Azure DevOps CLI (if `azure-devops` selected)
- **Actions**:
  1. Verify ALL tasks have Code Reviewer sign-off
  2. Verify ALL tasks have Tester E2E sign-off
  3. Verify quality gate + artifacts verified (from Step 6)
  4. Verify CI/CD pipeline passed
  5. Verify no open bugs or security vulnerabilities
  6. Verify all feature PRs merged into `dev`
  7. Require human approval via `question` tool
  8. Delegate to Developer Agent: create and merge `dev` -> `main` PR
  9. **MANDATORY**: Remind user via `question` tool to confirm the release PR (`dev` -> `main`) was merged successfully — do NOT proceed to Step 8 (deployment) until user confirms merge is complete
  10. Transition Tasks (leaf level) to "Done" — Jira: `transitionJiraIssue` to "Done"; Azure DevOps: `az boards work-item update --id <ID> --state Closed` (Agile) or `--state Done` (Basic/Scrum). See `critical-warnings.md#WARN-AZURE-BASIC-STATES`.
  11. If ANY check fails -> trigger error throwback
- **Conflict resolution**: Simplified "prefer dev" strategy (domain-owner resolution only if CI/CD fails — see `agents/shared/developer-agent-base.md` §7.3)
- **Full details**: See `agents/pm-agent.md` §STEP 7 + `agents/shared/developer-agent-base.md` §STEP 7

### Step 8: PM + DevOps - Deployment
- **Owner**: PM Agent (authorizes) + DevOps Agent (executes deployment)
- **Conditional**: If no deployment target (`huawei-ecs`, `azure-app-service`, `azure-container-apps`, `azure-aks`, `azure-vm`) selected during onboarding -> DevOps Agent asks user at deploy time (§8.0) and runs §0.10 inline. If user skips -> skip Step 8. `jfrog` NOT selected but deployment target IS -> use ACR image source (if `azure-devops` selected) or warn no Docker image source. Azure deploy targets use `az` CLI (App Service: `az webapp config container set`, Container Apps: `az containerapp update`, AKS: `kubectl set image`, VM: SSH + Docker). See `agents/devops-agent.md` §8.A-§8.D.
- **Tools**: Jira MCP, question tool, Bash (SSH via DevOps Agent)
- **Prerequisite**: ECS pre-configured during Step 0 (SSH key, Docker, registry login)
- **Actions**:
  1. PM Agent requires human approval via `question` tool
  2. DevOps Agent pulls Docker image on ECS via SSH
  3. DevOps Agent stops existing container, starts new container
  4. DevOps Agent verifies deployment health check: `curl -s -o /dev/null -w '%{http_code}' http://<ECS_HOST>:80`
  5. If deployment fails -> DevOps Agent rolls back: stop new, restart previous
  6. If deployment succeeds -> PM Agent comments `@agent:all Deployment complete` + DevOps Agent posts full deployment report to work item comment (see `devops-agent.md` §7.9)
- **Full details**: See `agents/pm-agent.md` §STEP 8 + `agents/devops-agent.md` §STEP 8

### Step 9: PM + Developer - Sprint Close, Retrospective + Report
- **Owner**: PM Agent (sprint close + report) + Developer Agent (report push)
- **Conditional**: `jira` NOT selected -> skip sprint close. `azure-devops` selected -> sprint close via `azure-devops-cli` skill (`references/boards-and-iterations.md`). When both `jira` and `azure-devops` selected, close sprint/iteration on both platforms. Report generation always runs.
- **Tools**: Bash (Jira Agile REST API), Jira MCP, GitHub MCP, question tool
- **Actions**:
  1. Verify ALL leaf-level Tasks are in "Done" status (ask user how to handle incomplete tasks)
  2. Close sprint via REST API (`PUT /sprint/{id}` — see `setup/critical-warnings.md#WARN-JIRA-SPRINT-CLOSE`)
  3. Generate sprint summary (completed vs. incomplete, velocity metrics)
  4. **MANDATORY**: Post retrospective comment on the Epic — Azure DevOps: `az boards work-item update --id <EPIC_ID> --discussion "@agent:all Sprint retrospective - <summary>"`
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
