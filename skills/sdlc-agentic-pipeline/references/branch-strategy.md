# Branch Strategy & PR Merge Gate

> This file is the **single source of truth** for branch naming, branch
> protection rules, and PR merge gate requirements. Referenced by
> `SKILL.md`, `pipeline.md`, and all agent files.

---

## Branch Strategy (GitFlow)

```
main  (production-ready - only released code, deploy from here)
  |
  +-- dev  (integration branch - all PRs merge here first)
        |-- feature/<agent>/<short-description>
        |-- fix/<agent>/<short-description>
        |-- bug/<agent>/<short-description>
        +-- docs/sdd-<feature_name>
```

- **`main`**: Production branch. Only updated via `dev` -> `main` merge at
  release time (Step 7). Branch protection rules MUST be enabled (no direct
  pushes).
- **`dev`**: Integration branch. All feature, fix, and docs PRs target `dev`
  as base. Multiple feature branches merge here for integration testing
  before release.
- **Feature/fix/bug/docs branches**: Created from `dev`, merged back to
  `dev` via PR.

> **Option A (Existing Repo):** The user's existing branch strategy takes
> precedence. During onboarding (Step 0.A.6), the PM Agent asks the user
> which branch strategy to use (existing `develop`, GitFlow `dev`,
> trunk-based, or custom). The selected branch is persisted and passed to
> all downstream agents for CI/CD triggers, feature merges, and release
> PRs. Branches are only created by developer agents, never by the PM Agent.

---

## Branch Naming Convention

```
feature/<agent>/<short-description>   e.g. feature/backend/projects-tasks-api
fix/<agent>/<short-description>       e.g. fix/backend/sql-injection
bug/<agent>/<short-description>       e.g. bug/frontend/login-redirect
docs/sdd-<feature_name>                e.g. docs/sdd-sprint-1
```

All branches are created from `dev` (or user-chosen integration branch) and
merged back to `dev` via PR.

---

## Release Merge: `dev` -> `main`

At Step 7 (Release Review), after all feature PRs are merged into `dev` and
all gates pass, the PM Agent authorizes and the developer agent (Backend if
both active, otherwise sole developer) creates and merges `dev` into `main`
via GitHub MCP. This is the only way code reaches `main`. Deployment
(Step 8) always pulls from `main`.

---

## PR Merge Gate (Enforced by PM Agent)

### Feature PR -> `dev` (after Step 5 E2E sign-off)

A feature/fix/bug PR may only be merged into `dev` when ALL of the following
are satisfied:

1. Code Reviewer Agent sign-off comment exists on the Task (Sub-task)
2. Tester Agent E2E sign-off comment exists on the Task (Sub-task)
3. Human approval (via PM Agent question tool)

> **NOTE:** CI green and SonarCloud QG are **NOT** required at this stage.
> CI/CD runs on `dev` AFTER the feature PR is merged (Step 6).
> SonarCloud QG is checked in Step 7. Both are gates for the
> Release Merge (`dev` -> `main`) in Step 7, not for the feature PR merge.

### SDD Docs PR -> `dev`

Lightweight merge — developer agent merges immediately after user review.
No Code Reviewer/Tester/CI sign-off required (documentation only).

### Release Merge: `dev` -> `main` (Step 7)

The `dev` -> `main` merge may only happen when ALL of the following are
satisfied:

1. All feature PRs have been merged into `dev`
2. Integration CI/CD passed on `dev` branch
3. SonarCloud Quality Gate passes on `dev`
4. All Task-level work items have Code Reviewer + Tester sign-off
5. Human approval (via PM Agent question tool)

---

## Status Lifecycle (Task-level items only)

Only Tasks transition through the SDLC lifecycle. Issues and the Epic stay in their initial status and are closed at sprint close.

### State Mapping

> Azure DevOps Tasks have no "Resolved" state — keep "Active"/"Doing" for In Review/In Testing, use `@agent:` comments to mark phase.

| SDLC State | Jira | Azure DevOps Agile (Task) | Azure DevOps Basic (Task) |
|------------|------|---------------------------|---------------------------|
| To Do | To Do | New | To Do |
| In Progress | In Progress | Active | Doing |
| In Review | In Review | Active (comment marks review) | Doing (comment marks review) |
| In Testing | In Testing | Active (comment marks testing) | Doing (comment marks testing) |
| Done | Done | Closed | Done |

### Lifecycle Diagram

```
  To Do ---> In Progress ---> In Review ---> In Testing ---> Done
  (created)   (dev starts)    (PR ready)     (E2E testing)  (PM release)

  Error throwback transitions:
  +-------------------+-------------------+-----------------------------------+
  | From              | To                | Reason                            |
  +-------------------+-------------------+-----------------------------------+
  | In Review         | In Progress       | Code review found issues          |
  | In Testing        | In Progress       | E2E test found bugs               |
  | In Testing        | In Review         | Test environment issue (not code) |
  | Release Review    | In Progress       | Release gate failed               |
  | In Testing        | In Progress       | SonarCloud QG failed              |
  +-------------------+-------------------+-----------------------------------+
```

---

## Agent Routing Labels

Routing labels apply at **Task level only** (Jira Sub-tasks, Azure DevOps Tasks). Issues and Epics do NOT carry routing labels.

| Label/Tag | Routes To |
|-----------|-----------|
| `agent:frontend` | Frontend Agent |
| `agent:backend` | Backend Agent |
| `agent:code-reviewer` | Code Reviewer Agent |
| `agent:devops` | DevOps Agent |
| `agent:tester` | Tester Agent |
| `agent:pm` | PM Agent |

Jira: applied as labels. Azure DevOps: applied as tags via `az boards work-item update --id <id> --fields "System.Tags=agent:frontend"`.

**Domain labels:** `frontend` `backend` `bug` `test` `security` `devops`
`release` `documentation` `feature` `refactor`

---

## Inter-Agent Messaging

All inter-agent communication happens via **work item comments on Task-level items**. There are two types of comments:

### 1. Routing/Status Comments (short, one-line)
Used to trigger the next agent or signal a status change:
```
@agent:<target-agent> <message>
```

Examples:
- `@agent:backend Please review requirements - confirm feasibility, flag gaps`
- `@agent:code-reviewer PR #42 ready for review - backend implementation complete`
- `@agent:devops E2E sign-off complete - all tests passing, ready for CI/CD`

### 2. Report Content Comments (full, multi-line)
After completing work, agents MUST post their full report content to the work item comment field. This is separate from the routing comment above. The report comment provides the evidence trail inline on the work item.

Format:
```
@agent:pm <Report Type> — <Task-ID> <Task Name>

Verdict/Status: <DONE | APPROVED | PASS | FAIL | ...>

## <Report sections: implementation, test results, findings, etc.>

Report file: <local file path>
```

Each agent posts:
- **Backend/Frontend**: Implementation report (what was built, test results, TDD evidence, files changed, self-review) — see `developer-agent-base.md` §3.8
- **Code Reviewer**: Review report (verdict, CRITICAL/WARNING findings, file/line refs, recommendations) — see `code-reviewer-agent.md` Hands-off
- **Tester**: Test report (pass/fail counts, trace evidence, failure details, environment) — see `tester-agent.md` Hand-off
- **DevOps**: CI/CD report (build status, quality gate, artifacts, deployment status) — see `devops-agent.md` §7.9

---

## Task Discovery

Only **Task-level items** carry routing labels and are queried by agents.

### Jira (JQL)

| Agent | JQL |
|-------|-----|
| Frontend | `labels = agent:frontend AND status = "To Do" AND issuetype = Sub-task` |
| Backend | `labels = agent:backend AND status = "To Do" AND issuetype = Sub-task` |
| Code Reviewer | `labels = agent:code-reviewer AND status = "In Review" AND issuetype = Sub-task` |
| Tester | `labels = agent:tester AND status = "In Review" AND issuetype = Sub-task` |
| DevOps | `labels = agent:devops AND status = "In Review" AND issuetype = Sub-task` |
| PM | `labels = agent:pm AND status = "To Do" AND issuetype = Sub-task` |

### Azure DevOps (WIQL)

Pattern: `SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'agent:<name>' AND [System.State] = '<state>' AND [System.WorkItemType] = 'Task'`

| Agent | Azure DevOps State |
|-------|-------------------|
| Frontend | New |
| Backend | New |
| Code Reviewer | Active (Agile) or Doing (Basic — check comments for review phase) |
| Tester | Active (Agile) or Doing (Basic — check comments for testing phase) |
| DevOps | Active (Agile) or Doing (Basic — check comments for CI/CD phase) |
| PM | New |

---

## Error Throwback Protocol

When any downstream step reports a failure, the PM Agent routes the task back:

```
+---------------------------------------------------------------------------+
|  FAILURE DETECTED                                                         |
|       |                                                                   |
|       v                                                                   |
|  PM Agent receives error via Jira comment                                 |
|  (e.g. @agent:pm E2E test failed on BUG-123)                             |
|       |                                                                   |
|       v                                                                   |
|  Identify failing step + owning agent                                     |
|       |                                                                   |
|       +--> Code issue        -> "In Progress", @agent:frontend/backend    |
|       +--> Code review issue -> "In Review",  @agent:code-reviewer        |
|       +--> CI/CD issue       -> "In Progress", @agent:devops              |
|       +--> Test issue        -> "In Review",  @agent:tester               |
|       |                                                                   |
|       v                                                                   |
|  PM Agent tracks re-work until resolved                                   |
|       |                                                                   |
|       v                                                                   |
|  Normal flow resumes from the fixed step onward                           |
+---------------------------------------------------------------------------+
```

---

## Human-in-the-Loop Checkpoints

| Checkpoint | Step | Tool |
|------------|------|------|
| Domain model approval (DDD) | 0.DA | `continue` reply |
| Spec approval (SDD) | 0.DA | `continue` reply |
| SDD document review before pushing to GitHub | 2 | `question` tool |
| Release approval before deployment | 7 | `question` tool |
| Deployment authorization to Huawei ECS | 8 | `question` tool |

> **If user rejects any checkpoint:** The pipeline pauses. PM Agent asks
> the user for feedback via `question` tool and routes tasks back to the
> appropriate step (Step 3 for code changes, Step 5 for PR merge, Step 7
> for release, Step 8 for deployment).

---

## Test Ownership

| Test Type | Owner | Tool |
|-----------|-------|------|
| Unit tests | Frontend/Backend Agent | Jest, Vitest, Pytest, JUnit (selected via TDD tool selection) |
| Component integration tests | Frontend Agent | Jest, Vitest |
| API tests (happy path, errors, auth, validation, edge cases) | Backend Agent | pytest, Jest+Supertest, newman — see `backend-agent.md` §3.6 |
| E2E tests | Tester Agent (exclusive) | Playwright (playwright-cli skill) |