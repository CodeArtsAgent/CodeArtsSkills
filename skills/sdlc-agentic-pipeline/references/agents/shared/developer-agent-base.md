# Shared Developer Agent Base

> This file contains the **common behavior** shared by both the Backend Agent
> and Frontend Agent. Each agent file (`backend-agent.md`, `frontend-agent.md`)
> references this base and overrides only its domain-specific sections.
>
> **Agent-specific overrides are marked with `[OVERRIDE]` in each agent file.**

> **Platform routing:** When `azure-devops` is selected (Step 0.0.5), it is
> **mutually exclusive** with GitHub + Jira. All Jira MCP calls become
> Azure DevOps Boards operations; all GitHub MCP calls become Azure DevOps
> Repos operations. Config: org URL + project in `<project-root>/.env`, PAT in
> AZURE_DEVOPS_EXT_PAT env var at runtime. See `config-reference.md`.
>
> **Azure DevOps mode convention:** Inline **Azure DevOps mode** sections
> below describe WHAT to do. Consult the `azure-devops-cli` skill's reference
> files for exact CLI command syntax:
> - `references/repos-and-prs.md` — repos, branches, PRs, branch policies
> - `references/boards-and-iterations.md` — work items, WIQL queries, iterations
> - `references/pipelines-and-builds.md` — pipelines, builds, releases, artifacts
> - `references/variables-and-agents.md` — pipeline variables, variable groups

---

## PR Operation Routing

> **PR routing rules** are identical for both developer agents. See
> `SKILL.md` §"PR Operation Routing" for the routing table and
> `references/branch-strategy.md` §"PR Merge Gate" for gate requirements.

| Scenario | PR Operations Owner |
|----------|-------------------|
| Only Frontend Agent active | Frontend Agent |
| Only Backend Agent active | Backend Agent |
| Both Frontend + Backend active | Backend Agent (primary) |

This applies to ALL PR operations across the pipeline:
- Step 5: Auto-merge feature PRs into integration branch after E2E sign-off
- Step 7: Creating and merging `dev` -> `main` release PR
- Step 9: Pushing report to GitHub (PR to integration branch)
- Option A Step 3: Creating PRs for DevOps infrastructure changes

---

## STEP 1: Requirement Review (Shared Template)

> **Platform routing:** If `azure-devops` is selected (mutually exclusive with
> GitHub + Jira), use the `azure-devops-cli` skill instead of Jira MCP and
> GitHub MCP throughout this step.

### 1.1 Receive Review Request from PM Agent
- **Jira mode:** Monitor Jira tasks with label `agent:<this-agent>` and status "To Do"
  for PM review request comments. Look for comment: `@agent:<this-agent> Please review requirements - confirm feasibility, flag gaps, suggest changes`
- **Azure DevOps mode:** Monitor work items via `azure-devops-cli` skill
  (`references/boards-and-iterations.md`) — query for items tagged with
  `agent:<this-agent>` and state "New". Check work item comments by showing
  the work item (discussion is included in the output by default).

### 1.2 Review Requirements
For each task, evaluate from the `[OVERRIDE: domain-specific perspective]`:
- **Feasibility**: Can this be implemented with the current stack?
- **Completeness**: Are requirements clearly specified?
- **Dependencies**: Are there dependencies on other agents' work?
- **Estimates**: Is the effort estimate realistic?

> **[OVERRIDE]**: Each agent file provides its own review perspective
> (backend: APIs, DB, security / frontend: UI, API contracts, UX).

### 1.3 Provide Review Feedback
- **Jira mode:**
  - If requirements are **clear and feasible**: Comment on Jira task: `@agent:pm <Agent> review approved - requirements are clear and feasible`
  - If requirements **need changes**: Comment on Jira task: `@agent:pm <Agent> review feedback: <specific issues, gaps, or suggestions>`
- **Azure DevOps mode:**
  - Comment on work item: Use `azure-devops-cli` skill
    (`references/boards-and-iterations.md`) to add a discussion comment to
    work item `<ID>` with the same message format.
  - Use the same `@agent:pm` prefix convention in discussion comments
- PM Agent will update requirements based on feedback and re-request review if needed

---

## STEP 2: Spec-Driven Development Setup (Shared)

### 2.1 Initialize SDD Directory
- Invoke the `creating-sdd-directory` skill to set up the spec-driven
  development structure
- This creates `spec.md`, `design.md`, and `tasks.md` documents
- Read requirements from Jira tasks assigned with label `agent:<this-agent>`

### 2.2 Requirement Fetching
- **Jira mode:** Discover own tasks via JQL: `labels = agent:<this-agent> AND status = "To Do"`.
  Use `atlassian-rovo-mcp_searchJiraIssuesUsingJql` to fetch tasks. Read task description, timeline,
  and inter-agent comments. Parse acceptance criteria and technical requirements.
- **Azure DevOps mode:** Discover own work items via `azure-devops-cli` skill
  (`references/boards-and-iterations.md`) — WIQL query for items where
  `[System.Tags]` CONTAINS `agent:<this-agent>` AND `[System.State]` = `New`.
  Read work item details by showing the work item.

### 2.3 SDD Document Population
- Populate `spec.md` with "what to build" based on Jira task requirements
- Populate `design.md` with "how to build" (`[OVERRIDE: domain-specific]`)
- Populate `tasks.md` with implementation tasks derived from the design

### 2.4 Push SDD Directories to GitHub / Azure Repos
After creating/updating SDD documents locally, push them to the remote
repository so all agents can access them:
1. Verify all SDD files are created under `.opencode/specs/`
2. **Ask user to review** the SDD files before pushing (use `question` tool)
3. Create a dedicated docs branch: `git checkout -b docs/sdd-<feature_name>`
4. Stage, commit, and push:
   ```bash
   git add .opencode/
   git commit -m "chore: add/update SDD docs for <feature_name>"
   git push origin docs/sdd-<feature_name>
   ```
5. Create a PR:
   - **GitHub mode:** `github_create_pull_request` (base: user-chosen integration branch, head: `docs/sdd-<feature_name>`)
    - **Azure DevOps mode:** Use `azure-devops-cli` skill (`references/repos-and-prs.md`) to create a PR from `docs/sdd-<feature_name>` → `<integration-branch>` with title `"chore: add/update SDD docs for <feature_name>"`
6. Merge the SDD docs PR immediately (lightweight — documentation only, no
   Code Reviewer/Tester sign-off required):
   - **GitHub mode:** `github_merge_pull_request`
  - **Azure DevOps mode:** Use `azure-devops-cli` skill (`references/repos-and-prs.md`) to complete (merge) PR `<PR_ID>`
- After merge: `main` now contains all released code for deployment
7. **Do NOT push directly to main** — always use a PR

---

## STEP 3: Code Development & Bug Fixes (Shared Template)

> **Prerequisite gate:** Before starting any coding, verify that your assigned
> work items (Task-level, with your `agent:*` label) exist in Jira or Azure
> DevOps. If no work items are found, DO NOT start coding — report to
> `@agent:pm` that the Epic → Issue → Task hierarchy has not been created yet.

### 3.0 Read Figma Data

> **Read-only Figma consumption:** Frontend Agent NEVER calls
> `figma.get_figma_data` or `figma.download_figma_images`. Figma MCP is
> EXCLUSIVE to `figma-design-agent` (Step 0.F). All Figma data flows through
> the file `specs/<YYYY-MM-DD-...>/figma-extract.md` and the SDD docs that
> `figma-design-agent` updates.

If `figma` is selected AND `figma-extract.md` exists in the active SDD
directory:

1. Read `figma-extract.md` for:
   - Design tokens (colors, typography, spacing, radii, shadows)
   - Component inventory (name, variant, props)
   - Asset list (paths to locally-saved Figma images, icons, illustrations)
2. Map Figma semantic components to production components:
   - Web / Mobile Web -> MUI (preferred) or React Native Paper (native)
   - Apply Code Connect mappings (Figma component -> MUI `import` + props)
3. Copy Figma assets into the repo's `assets/` directory using the paths
   recorded in `figma-extract.md` (paths are already local after Step 0.F).
4. Resolve any **Mismatch** items per the user-confirmed diff in SDD docs
   (Figma wins where the user said so; spec wins otherwise).
5. Backend agent ignores this section even when `figma` is selected —
   backend consumes only `design.md` (backend section) and the SDD docs.

If `figma` is NOT selected, skip this section entirely.



### 3.1 Status Transition - In Progress
- **Jira mode:** **IMMEDIATELY** upon starting work, transition Jira task status to
  "In Progress":
  ```
  atlassian-rovo-mcp_transitionJiraIssue(cloudId, issueIdOrKey,
    { transition: { id: "<In Progress transition ID>" } })
  ```
  Comment on Jira task: `@agent:pm Starting work on <task summary>`
- **Azure DevOps mode:** Use `azure-devops-cli` skill
  (`references/boards-and-iterations.md`) to:
  - Update work item `<WORK_ITEM_ID>` state to "Active"
  - Add discussion comment: `@agent:pm Starting work on <task summary>`

### 3.2 Branch Management
- Pull latest code from remote, create feature branch
  (`feature/<agent>/<short-description>`) from the integration branch
- The integration branch is determined by the user's branch strategy choice
  (Step 0.A.6 for Option A, `dev` for Option B)
- **GitHub mode:** Use `github_create_branch` to create branch from the chosen integration branch
- **Azure DevOps mode:** Create branch locally and push to Azure Repos:
  ```bash
  git checkout -b feature/<agent>/<short-description>
  git push origin feature/<agent>/<short-description>
  ```
  (Azure DevOps auto-creates the remote ref on push — no separate branch command needed; see `azure-devops-cli` skill `references/repos-and-prs.md`)

### 3.3 Code Development
> **[OVERRIDE]**: Each agent file provides its own code development details
> (backend: APIs, models, migrations / frontend: UI, components, styles).
> For Frontend with `figma` selected, see §3.0 above for Figma data
> consumption and component mapping.

**Push initial code to remote after writing first code files:**
```bash
git add -A
git commit -m "feat: initial implementation - <agent>"
git push origin feature/<agent>/<short-description>
```
This is mandatory before proceeding to quality control.

### 3.4 Local Quality Control (Pre-Commit)
- Run local linters via Bash (`[OVERRIDE: agent-specific linters]`)
- Fix all lint errors, type errors, and formatting issues before committing
- Do NOT use SonarCloud MCP for local analysis — it only reads remote results
- **Quality Gate Prevention** (every commit must pass SonarCloud QG):
  - Check code duplication < 3% before committing (avoid copy-paste patterns,
    extract shared utilities/components)
  - Ensure security rating A (no vulnerabilities, no hardcoded secrets)
  - Write unit tests alongside code (target > 80% coverage, configure
    coverage reporting)
  - Consider QG thresholds: coverage >= 80%, duplication <= 3%, ratings >= A

### 3.5 Local Semgrep Security Scan (Pre-PR Gate)
- Use `semgrep` MCP to scan changed files locally for:
  - **Security vulnerabilities**: `[OVERRIDE: agent-specific threats]`
  - **Code quality issues**: code smells, anti-patterns, complexity
  - **Best practice violations**: OWASP Top 10, CWE patterns
- If CRITICAL findings:
  - Fix issues before creating PR
  - Re-scan to verify resolution
- If only WARNING/INFO findings:
  - Document findings in PR description for Code Reviewer awareness
  - Proceed with PR creation
- Record scan summary: number of critical/warning/info findings

### 3.6 Testing
> **[OVERRIDE]**: Each agent file provides its own test ownership details.
> Backend: API tests (§3.6 in backend-agent.md).
> Frontend: Component-level tests (§3.6 in frontend-agent.md).

### 3.7 PR Process & Status Update
- Commit and push final code to remote:
  ```bash
  git add -A
  git commit -m "feat: complete implementation - <agent>"
  git push origin feature/<agent>/<short-description>
  ```
- Create PR:
  - **GitHub mode:** `github_create_pull_request` (base: user-chosen integration branch, head: `feature/<agent>/<short-description>`)
  - **Azure DevOps mode:** Use `azure-devops-cli` skill (`references/repos-and-prs.md`) to create a PR from `feature/<agent>/<short-description>` → `<integration-branch>` with title `"<title>"`
- Transition task status:
  - **Jira mode:** Transition Jira task to "In Review" status
  - **Azure DevOps mode:** `az boards work-item update --id <ID> --state Active` (`@agent:code-reviewer` comment marks review phase)
- Comment for Code Reviewer:
  - **Jira mode:** Comment on the Jira task: `@agent:code-reviewer PR #X ready for review - <agent> implementation complete - Semgrep pre-scan passed (0 critical, N warnings)`
  - **Azure DevOps mode:** Add discussion comment to work item `<ID>`: `@agent:code-reviewer PR #<PR_ID> ready for review - <agent> implementation complete - Semgrep pre-scan passed (0 critical, N warnings)`
- Do NOT auto-merge — wait for Code Reviewer sign-off + Tester sign-off +
  PM/human approval

### 3.8 Post Report Content to Work Item Comment
After writing the local report file and before reporting back to PM Agent, post the full report content to the work item comment field so all agents can read the details inline.

- **Jira mode:** Add a Jira comment with the full report content via `atlassian-rovo-mcp` MCP
- **Azure DevOps mode:** Add discussion comment to work item `<ID>`

Comment format:
```
@agent:pm Task Report — <Task-ID> <Task Name>

Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT

## What was implemented
<summary of implementation>

## Test results
<test summary, e.g. "14/14 passing">

## Files changed
<file list>

## TDD Evidence (if applicable)
RED: <command + failing output>
GREEN: <command + passing output>

## Self-review findings
<findings or "none">

## Issues / concerns
<concerns or "none">

Report file: task-reports/<task-id>-<task-name>.md
```

> This is SEPARATE from the short `@agent:code-reviewer` routing comment in 3.7. The routing comment triggers the next agent; this report comment provides the full evidence trail on the work item.

---

## STEP 5: Auto-Merge Feature PRs (Shared)

> **PR routing:** Executed by the primary developer agent (Backend if both
> active, otherwise sole developer). See PR Operation Routing table above.

### 5b.1 Verify PR Merge Gate
Before merging any feature PR, verify ALL of the following
(see `branch-strategy.md` §"PR Merge Gate"):
1. Code Reviewer Agent sign-off comment exists on the Jira task
2. Tester Agent E2E sign-off comment exists on the Jira task
3. Human approval received (PM Agent asks user via `question` tool)

### 5b.2 Merge Feature PRs
- For each feature PR:
  - **GitHub mode** (`GITHUB_OWNER`, `GITHUB_REPO` from `mcp_settings.json` `env`):
    ```
    github_merge_pull_request(
      owner="<GITHUB_OWNER>",
      repo="<GITHUB_REPO>",
      pullNumber=<PR_NUMBER>
    )
    ```
  - **Azure DevOps mode:** Use `azure-devops-cli` skill
    (`references/repos-and-prs.md`) to complete (merge) PR `<PR_ID>`
- Verify all feature branches are merged into the integration branch
- Comment on task:
  - **Jira mode:** Comment on Jira task: `@agent:pm All feature PRs merged into <branch> - ready for CI/CD`
  - **Azure DevOps mode:** Add discussion comment to work item `<ID>`: `@agent:pm All feature PRs merged into <branch> - ready for CI/CD`

---

## STEP 7: Release Merge - `dev` -> `main` (Shared)

> **PR routing:** Executed by the primary developer agent. PM Agent authorizes
> (sign-offs + human approval). Developer agent executes PR creation and merge.

### 7.1 Create Release PR
- Create a PR from `dev` -> `main`:
  - **GitHub mode** (`GITHUB_OWNER`, `GITHUB_REPO` from `mcp_settings.json` `env`):
    ```
    github_create_pull_request(
      owner="<GITHUB_OWNER>",
      repo="<GITHUB_REPO>",
      title="Release: merge dev into main",
      head="dev",
      base="main"
    )
    ```
  - **Azure DevOps mode:** Use `azure-devops-cli` skill
    (`references/repos-and-prs.md`) to create a PR from `dev` → `main` with
    title `"Release: merge dev into main"`

### 7.2 Merge Release PR
- Merge the PR:
  - **GitHub mode:** `github_merge_pull_request` (respects branch protection rules on `main`)
  - **Azure DevOps mode:** Use `azure-devops-cli` skill (`references/repos-and-prs.md`) to complete (merge) PR `<PR_ID>`
- After merge: `main` now contains all released code for deployment
- Report success to PM Agent: `@agent:pm Release merge dev -> main complete`

### 7.3 Merge Conflict Resolution (Simplified)

If the `dev` -> `main` merge encounters conflicts:

1. **Create resolution branch**: `git checkout -b fix/<agent>/resolve-release-conflict dev`
2. **Merge main into resolution branch**: `git merge main` (conflicts appear)
3. **Resolve each conflict by domain ownership** (do NOT blanket-accept dev
   — main may contain production hotfixes not in dev):
   - `backend/**` -> Backend Agent resolves
   - `frontend/**` -> Frontend Agent resolves
   - `docker-compose.yml`, `**/Dockerfile`, `.github/workflows/**` -> DevOps Agent via Jira comment
   - `**/*.test.*`, `tests/**` -> Tester Agent via Jira comment
4. **Resolve own domain conflicts** using domain knowledge
5. **Commit resolution** and push
6. **Run CI/CD on resolution branch** (delegate to DevOps Agent for trigger)
7. **Verify SonarCloud QG passes** on resolution branch
8. If CI/CD + QG pass -> create PR to `main` and merge
9. Sync `dev` with resolved `main`: `git checkout dev; git merge main; git push origin dev`
10. Report success: `@agent:pm Merge conflict resolved. dev -> main complete.`
11. If 3 attempts fail -> escalate to PM Agent for manual intervention

> **IMPORTANT:** Code conflicts MUST be resolved by the domain owner agent.
> Never blindly accept one side. Always read both versions and understand
> WHY the conflict exists before choosing a strategy.

---

## STEP 9: Push HTML Report to GitHub (Shared)

> **PR routing:** Executed by the primary developer agent. PM Agent generates
> the HTML report (see `references/report-spec.md`).

### 9.1 Push Report
1. Create a `docs/sdlc-reports` branch from `dev`:
   ```bash
   git checkout dev
   git checkout -b docs/sdlc-reports
   ```
2. Copy `reports/sdlc-report.html` into the repo
3. Commit and push:
   ```bash
   git add reports/sdlc-report.html
   git commit -m "docs: add SDLC process report"
   git push origin docs/sdlc-reports
   ```
 4. Create PR to `dev` and merge it:
  - **GitHub mode** (`GITHUB_OWNER`, `GITHUB_REPO` from `mcp_settings.json` `env`):
    ```
    github_create_pull_request(
      owner="<GITHUB_OWNER>",
      repo="<GITHUB_REPO>",
      title="docs: SDLC process report",
      head="docs/sdlc-reports",
      base="dev"
    )
    ```
    Then merge: `github_merge_pull_request`
   - **Azure DevOps mode:** Use `azure-devops-cli` skill
     (`references/repos-and-prs.md`) to:
     1. Create a PR from `docs/sdlc-reports` → `dev` with title `"docs: SDLC process report"`
     2. Complete (merge) PR `<PR_ID>`
 5. Report commit URL and merged PR link to PM Agent:
   `@agent:pm Report published and merged: <PR_URL>`

---

## Error Throwback Handling (Shared)

If Code Reviewer or Tester reports issues:
1. Receive error via task comment:
   - **Jira mode:** Jira comment (e.g., `@agent:<this-agent> Code review found <issue>`)
   - **Azure DevOps mode:** Work item discussion (same `@agent:` prefix convention)
2. Transition task BACK to "In Progress":
   - **Jira mode:** `atlassian-rovo-mcp_transitionJiraIssue`
   - **Azure DevOps mode:** `az boards work-item update --id <ID> --state Active`
3. Fix the reported issue
4. Re-run local Semgrep scan (§3.5) to verify fix
  5. Push fix to remote and comment:
     ```bash
     git add -A
     git commit -m "fix: <issue> - re-review"
     git push origin feature/<agent>/<short-description>
     ```
     `@agent:code-reviewer Fix applied for <issue> - Semgrep re-scan passed - please re-review`
6. Transition task back to "In Review":
   - **Jira mode:** `atlassian-rovo-mcp_transitionJiraIssue`
   - **Azure DevOps mode:** `az boards work-item update --id <ID> --state Active` (`@agent:code-reviewer` comment marks review phase)


---

## Conditional Step Behavior (Multi-Tool Selection)

> At the start of the first step, read `.codeartsdoer/tool-selections.json`
> to determine which tools are active. Use `isSelected(toolId)` to check.
> If the file is missing, treat all tools as selected (backward-compatible
> default).

### Dynamic vs Static Permissions

- **Built-in utility skills** (`ide-tool`, `[OVERRIDE: agent-specific]`)
  are **always present** in this agent's frontmatter — never modified by
  tool selection.
- **Methodology skills** (`creating-sdd-directory`, `managing-spec-document`,
  `managing-design-document`, `managing-tasks-document` for SDD) are
  **dynamically granted/revoked** at onboarding time by the
  `apply-tool-selections` script based on `tool-selections.json`. If SDD
  Toolkit was not selected, these permissions are absent from the
  frontmatter.

### Per-Step Conditional Logic

| Step | Conditional Behavior |
|------|---------------------|
| **1b** (Review) | If `jira` NOT selected -> skip review (no Jira comments). If `github` NOT selected -> review via local file diff instead of PR review. If `azure-devops` selected -> use `azure-devops-cli` skill (`references/boards-and-iterations.md`) for work item comments instead of Jira MCP; use `azure-devops-cli` skill (`references/repos-and-prs.md`) for PR review instead of GitHub MCP. |
| **2** (SDD Setup) | If `sdd` NOT selected AND `openspec` NOT selected -> skip SDD directory creation; proceed with plain task list. If `azure-devops` selected -> push SDD docs to Azure Repos via `git push` + `azure-devops-cli` skill (`references/repos-and-prs.md`) for PR creation instead of GitHub MCP. |
| **3** (Dev) | If `github` NOT selected AND `azure-devops` NOT selected -> no feature branches, no PRs; commit directly to local working directory. If `azure-devops` selected -> use `azure-devops-cli` skill (`references/repos-and-prs.md`) for branch/PR operations instead of GitHub MCP; use `azure-devops-cli` skill (`references/boards-and-iterations.md`) for status transitions instead of Jira MCP. If `semgrep` NOT selected -> skip local Semgrep pre-scan. `[OVERRIDE: agent-specific built-in skills]` always available. |

> **Azure DevOps applies to all PR/task operations** in Steps 5, 7, and 9
> as well — use `azure-devops-cli` skill (`references/repos-and-prs.md`)
> for PR create/merge and (`references/boards-and-iterations.md`)
> for status transitions/discussions. See each step's inline **Azure DevOps
> mode** sections for details.