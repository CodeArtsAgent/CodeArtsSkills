---
name: sdlc-agentic-pipeline
description: >-
  Orchestrate a complete multi-agent Software Development Life Cycle (SDLC) pipeline
  powered by Huawei Cloud CodeArts Agent. Coordinates 6 specialized agents (PM, Backend,
  Frontend, Code Reviewer, Tester, DevOps) across 10 steps from requirement breakdown
  through deployment and sprint retrospective. Integrates GitHub, Jira, SonarCloud,
  Semgrep, JFrog Artifactory, Playwright, and Huawei Cloud ECS. Trigger when the user
  asks to start an agentic flow, SDLC pipeline, agentic DevOps pipeline, multi-agent
  development workflow, or any prompt related to initiating the end-to-end agentic
  software delivery lifecycle.
---

# SDLC Agentic Pipeline

A multi-agent SDLC orchestration skill that drives an entire software delivery
lifecycle — from requirements to deployment — using **Huawei Cloud CodeArts Agent**.
Six agents collaborate asynchronously through Jira comments as a message bus,
enforcing quality gates, error throwback, and human-in-the-loop checkpoints.

## Architecture at a Glance

```
+---------------------------------------------------------------------------+
|                    SDLC AGENTIC PIPELINE - 6 AGENTS                       |
+---------------------------------------------------------------------------+
|                                                                           |
|  +-------------+   +--------------+   +---------------+                   |
|  | PM Agent    |   | Backend Agent|   | Frontend Agent|                   |
|  | (orchestr.) |   | (server code)|   | (UI code)     |                   |
|  | READ-ONLY   |   | GIT WRITE    |   | GIT WRITE     |                   |
|  | repo access |   | owns clone,  |   | owns clone,   |                   |
|  | (minimal    |   | commit,push, |   | commit,push,  |                   |
|  |  GitHub MCP)|   | branch, PR,  |   | branch, PR    |                   |
|  | NEVER git   |   | create_repo, |   |               |                   |
|  |             |   | PR MERGE     |   | PR MERGE      |                   |
|  |             |   | (primary     |   | (when sole    |                   |
|  |             |   |  when both)  |   |  developer)   |                   |
|  +------+------+   +------+-------+   +-------+-------+                   |
|         |                 |                   |                           |
|         |   Jira comments = inter-agent message bus                        |
|         |                 |                   |                           |
|  +------v------+   +------v-------+   +-------v-------+                   |
|  | Code        |   | Tester Agent |   | DevOps Agent  |                   |
|  | Reviewer    |   | (Playwright) |   | (CI/CD+JFrog) |                   |
|  | (PR Review) |   +--------------+   | GIT WRITE     |                   |
|  +-------------+                      | (infra only)  |                   |
|                                       | NO PR create  |                   |
|                                       | NO PR merge   |                   |
|                                       | Read-only GH: |                   |
|                                       | branch list,  |                   |
|                                       | code search,  |                   |
|                                       | PR read       |                   |
|                                       | Steps 6,7,9:  |                   |
|                                       | CI/CD, JFrog, |                   |
|                                       | deployment    |                   |
|                                       +---------------+                   |
|                                                                           |
+---------------------------------------------------------------------------+
```

### PR Operation Routing

The DevOps Agent does NOT create or merge PRs. PR operations are routed to
developer agents based on which developer(s) are active:

| Scenario | PR Operations Owner | PR Ops |
|----------|-------------------|--------|
| Only Frontend Agent active | Frontend Agent | `create_pull_request`, `merge_pull_request` |
| Only Backend Agent active | Backend Agent | `create_pull_request`, `merge_pull_request` |
| Both Frontend + Backend active | Backend Agent (primary) | `create_pull_request`, `merge_pull_request` |

This applies to ALL PR operations across the pipeline:
- Step 5 (merged): Auto-merge feature PRs into `dev` after E2E sign-off
- Step 8: Creating and merging `dev` -> `main` release PR
- Step 9: Pushing report to GitHub (direct push)
- Option A Step 3: Creating PRs for DevOps infrastructure changes

## Trigger

Activate this skill when the user asks to start an agentic flow, SDLC pipeline,
agentic DevOps pipeline, multi-agent development workflow, or any prompt related
to initiating the end-to-end agentic software delivery lifecycle.

## Prerequisites

Before the pipeline can run, **Step 0 (Service Onboarding)** must be completed.
Step 0 auto-provisions the 6 agent definition files (from `references/agents/`
to `.codeartsdoer/agents/`) and then walks the user through setting up all 7
services and generating config files.
See `references/setup/service-onboarding.md` for the full onboarding guide.

The 6 agent files bundled in the skill at `references/agents/`:
- `pm-agent.md`, `backend-agent.md`, `frontend-agent.md`,
  `code-reviewer-agent.md`, `tester-agent.md`, `devops-agent.md`
- Auto-copied to `.codeartsdoer/agents/` during Step 0.0 (before any service onboarding)
- Idempotent: re-running overwrites with the latest version from the skill bundle

Step 0 involves multi-agent delegation for project bootstrap (Option B only):
- **PM Agent** orchestrates: parses prompt, splits scope, generates service configs (NO repo creation, NO git operations)
- **Backend Agent** creates repo, clones repo, builds backend code, creates `dev` branch, returns CI/CD build info
- **Frontend Agent** builds frontend code, returns CI/CD build info
- **DevOps Agent** (runs last): writes `docker-compose.yml`, shared docs (README, .gitignore), generates `ci-cd.yml` from
  template with build section filled from Backend/Frontend build info, commits shared docs
- All agents push to `dev` branch (not `main`)

Step 0 with an **existing repository (Option A)** is fundamentally different:
- **PM Agent** is READ-ONLY with the repo: inventories existing artifacts, asks user
  about development intent and branch strategy. PM Agent NEVER clones, commits, or pushes.
- **No code building** - backend/frontend code already exists in the repo
- **No branch creation** - branches are only created by developer agents when the user approves
- **Existing artifacts are sacred** - Dockerfiles, docker-compose.yml, ci-cd.yml are NEVER
  modified without explicit user approval
- **No DevOps Agent invocation** during onboarding - if the user needs CI/CD or Docker changes,
  the DevOps Agent handles this during Step 3 via a feature branch (git operations only).
  The developer agent creates and merges the PR on DevOps's behalf.
- All git write operations are delegated to developer agents (Backend, Frontend).
  The DevOps Agent owns git write for infrastructure files only but does NOT create
  or merge PRs - all PR operations are routed to developer agents.

The `playwright-cli` skill (used by the Tester Agent in Step 5) is **auto-provisioned**
during Step 0 onboarding - no manual installation is required.

> **WARNING:**
> **Critical setup conflict:** Before any CI/CD pipeline runs, the user MUST
> disable **SonarCloud Automatic Analysis** (Project Dashboard > Administration >
> Analysis Method > OFF). If both Automatic Analysis and the GitHub Actions
> SonarCloud scan are enabled, the CI/CD workflow crashes with:
> `"You are running CI analysis while Automatic Analysis is enabled"`.
> Surface this warning proactively to the user before collecting SonarCloud
> credentials.

## MCP Servers Required

The pipeline depends on the following MCP servers configured in
`.codeartsdoer/mcp/mcp_settings.json`:

| MCP Server | Purpose | Auth |
|------------|---------|------|
| `atlassian-rovo-mcp` | Jira tasks, sprints, comments, transitions | Basic (Base64 `email:token`) |
| `github` | Repos, branches, PRs, reviews, workflow dispatch | Bearer PAT |
| `sonarqube` | Quality gate, issues, coverage, hotspots | Bearer token |
| `semgrep` | Local static analysis, security scanning | App token env |
| `jfrog` | Artifactory build/artifact verification | Bearer access token |

See `references/templates/mcp-settings.json` for the template.

## The Pipeline (9 Steps)

```
+---------------------------------------------------------------------------+
|  STEP  AGENT(S)            ACTION                                         |
+---------------------------------------------------------------------------+
|   0    PM + Frontend/Backend/DevOps  Onboarding: auto-provision agents, Opt A (existing repo, PM read-only) or Opt B (new repo, parallel Backend+Frontend build, DevOps configs) |
|   1    PM                  Requirement breakdown, PRD, batch Jira task creation (hyperlinks to user) |
|  1b    Frontend/Backend    Requirement review (PARALLEL via Jira async dispatch) |
|   2    PM + Developer         Sprint start (Jira Agile API) + SDD setup (developer agent: docs branch + PR to dev) |
|   3    Frontend/Backend    Code dev (PARALLEL via Jira async), Semgrep pre-scan, branching, PR, tests |
|   4    Code Reviewer       PR review (batch), secret scanning (batch), GitHub approval |
|   5    Tester + PM + Dev   E2E testing + auto-merge feature PRs (5b merged into 5) + CI/CD auto-triggers |
|   6    DevOps              CI/CD (auto-triggered, cached) + JFrog verify + SonarCloud QG (combined) |
|   7    PM+Developer        Release review (PM: sign-offs+approval) + merge (Developer: PR create+merge, simplified conflict resolution) |
|   8    PM+DevOps            Deploy auth (PM: human approval) + execution (DevOps: SSH+docker pull+run) |
|   9    PM+Developer        Sprint close, retro, HTML report, docs branch + PR to GitHub |
+---------------------------------------------------------------------------+
```

### Key Performance Optimizations

1. **Parallel dispatch via Jira async**: Backend + Frontend agents work simultaneously
   (Steps 0, 1b, 3). PM dispatches via Jira comments, both agents pick up independently.
2. **Batch Jira operations**: Bulk create API for tasks (Step 1), batch transitions.
3. **Direct push for docs/reports**: `.opencode/**`, `docs/**`, `reports/**` paths
   use a docs branch + PR targeting `dev` (GitHub branch protection applies to the whole
   branch, not individual paths, so a PR is required even for documentation changes).
4. **Auto-trigger CI/CD**: `on: push` to `dev` branch. No manual DevOps trigger (Step 5->6).
5. **Cached builds**: pip, node_modules, Docker layers cached in GitHub Actions (Step 6).
6. **Combined CI/CD + verification**: JFrog artifact check + SonarCloud QG
   are CI/CD pipeline stages, not separate DevOps API calls (Step 6).
7. **Simplified conflict resolution**: Default "prefer dev" strategy (4 steps, not 18).
   Full domain-owner resolution only if CI/CD fails on resolution branch (Step 7).
8. **Node.js 22 LTS**: Upgraded from Node.js 18 to 22 across all pipeline jobs.
9. **FORCE_JAVASCRIPT_ACTIONS_TO_NODE24**: Suppresses Node.js 20 deprecation warnings.
10. **sonarcloud-github-action@master**: Uses old SonarSource action (sonarqube-scan-action has Docker/Node.js compat issue).

### Detailed End-to-End Flow

```
  User: "start agentic flow"
            |
            v
+-------------------------+     references/setup/
| STEP 0: Service         | --> service-onboarding.md
| Onboarding              |     (7 services, config generation)
|                         |
| Option A (Existing Repo)|     Option B (New Repo)
|  PM (READ-ONLY):        |      PM orchestrates:
|  - Verify repo access   |      - Parse prompt, split scope
|  - Inventory artifacts  |      - Dispatch Backend + Frontend
|  - Ask user intent      |        IN PARALLEL via Jira async:
|  - Ask branch strategy  |        Backend: create repo, clone,
|  - NO code building     |          build, create dev, push
|  - NO branch creation   |        Frontend: build, push to dev
|  - NO git ops by PM     |          (runs concurrently with Backend)
|  - NO repo creation     |      - DevOps Agent runs LAST:
|  (see B.1-B.5 in        |        docker-compose + ci-cd.yml
|   service-onboarding)   |        (with auto-trigger + cache +
|                         |         combined verification stages) +
|  PM generates configs:  |        shared docs, push to dev
|  GitHub, Jira, Sonar,   |      - PM generates configs
|  Semgrep, JFrog, ECS,   |
|  Playwright             |
+-----------+-------------+
            |  configs saved: mcp_settings.json, ci-cd.yml (build section
            |                 pre-filled by DevOps, service placeholders filled
            |                 by PM), sonar-project.properties, .env
            |  initial codebase pushed to dev branch
            v
+-------------------------+
| STEP 1: PM Agent        |
| Requirement Breakdown   |
| - Repo analysis (GitHub)|
| - PRD creation          |
| - BATCH Jira task create|
|   (bulk API, 1 call)    |
| - Hyperlinks to user    |
| - Dispatch review to    |
|   B+F IN PARALLEL       |
+-----------+-------------+
            |  all tasks approved by Frontend + Backend (parallel review)
            v
+-------------------------+
| STEP 1b: Frontend +     |
| Backend (PARALLEL)      |
| Requirement Review      |
| - Both review PRD       |
|   simultaneously        |
| - Both comment @agent:pm|
+-----------+-------------+
            |  all tasks approved
            v
+-------------------------+
| STEP 2: PM Agent        |
| Sprint Start + SDD      |
| - Jira Agile REST API   |
| - Create/start sprint   |
| - SDD: spec/design/tasks|
| - DIRECT PUSH to dev    |
|   (no PR, path-based    |
|    branch protection)   |
+-----------+-------------+
            |  sprint active, SDD docs on dev
            v
+-------------------------+
| STEP 3: Frontend +      |
| Backend (PARALLEL)      |
| Code Development        |
| - Both dispatched via   |
|   Jira async            |
| - Branch: feature/...   |
| - Write code + unit test|
| - Local Semgrep pre-scan|
| - Fix CRITICAL findings |
| - PR created (each)     |
| - Jira -> In Review     |
+-----------+-------------+
            |  PRs ready (pre-scanned)
            v
+-------------------------+
| STEP 4: Code Reviewer   |
| PR Review (BATCH)       |
| - Read ALL PR diffs     |
| - Batch secret scanning |
| - Submit ALL reviews    |
+-----------+-------------+
            |  APPROVE or REQUEST_CHANGES (throwback)
            v
+-------------------------+
| STEP 5: Tester + PM +   |
| Developer               |
| E2E + Auto-Merge        |
| - Tester: E2E via       |
|   Playwright            |
| - Tester: sign-off      |
| - PM: verify gates      |
| - PM: human approval    |
| - Developer: merge PRs  |
|   into dev              |
| - CI/CD AUTO-TRIGGERS   |
|   on dev push           |
+-----------+-------------+
            |  all feature code in dev, CI/CD running
            v
+-------------------------+
| STEP 6: DevOps Agent    |
| CI/CD + Verify (Combined)|
| - AUTO-TRIGGERED (no    |
|   auto-trigger)       |
| - CACHED builds (pip,   |
|   node_modules, Docker)  |
| - Pipeline stages:      |
|   1. Build (install)    |
|   2. Sonar scan (tests) |
|   3. SonarCloud QG check|
|   4. Deploy to JFrog    |
|   5. Verify JFrog       |
| - QG blocks deploy if   |
| - DevOps reads final    |
|   status (1 API call)   |
+-----------+-------------+
            |  CI green + QG passes
            v
+-------------------------+
| STEP 7: PM + Developer  |
| Release Review + Merge  |
| PM: sign-offs, approval |
| Developer: PR create    |
|   +merge dev -> main    |
| (simplified conflict    |
|  resolution: prefer dev)|
+-----------+-------------+
            |  release approved
            v
+-------------------------+
| STEP 8: PM + DevOps     |
| Deploy Authorization +   |
| Execution                |
| PM: human approval       |
| DevOps: SSH + docker     |
| run  + |
| health check +           |
| rollback on failure      |
+-----------+-------------+
            |  deployment live
            v
+-------------------------+
| STEP 9: PM + Developer  |
| Sprint Close + Retro    |
| - Close sprint (API)    |
| - Velocity metrics      |
| - Retrospective comment |
| - Generate HTML report  |
| - DIRECT PUSH to dev    |
|   (no PR, path-based    |
|    branch protection)   |

+-------------------------+
```

## Step 9: Report Generation Details

At the end of the SDLC flow (Step 9), the PM Agent generates an HTML report
summarizing the entire process, operations, and actions taken during the flow.

### HTML Report (`reports/sdlc-report.html`)

- Self-contained vanilla HTML/CSS (no frameworks) - inline CSS, no external dependencies
- Save in the repository directory
- All hyperlinks must open in the user's **external system browser** (use `target="_blank"`)
- All hyperlinks must be **real working URLs** (not `#` placeholders) constructed from `.env` values:
  - Jira: `https://{JIRA_CLOUD_ID}/browse/{ISSUE-KEY}`
  - GitHub: `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}`
  - PRs: `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/pull/{PR_NUMBER}`
  - SonarCloud: `https://sonarcloud.io/project/overview?id={SONAR_PROJECT_KEY}`
   - JFrog: `{JFROG_PLATFORM_URL}/ui/repos/tree/General/{JFROG_REPO_KEY}`
  - GitHub Actions: `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/actions`
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
      - Coverage % (actual number, not ">80%")
      - Duplication % (actual number, not "<3%")
      - Security rating (A/B/C/D/E)
      - Reliability rating (A/B/C/D/E)
      - Maintainability rating (A/B/C/D/E)
      - Bugs count
      - Vulnerabilities count
      - Code smells count
    - Step 8: Deployment details (Docker pull, container start, health check HTTP code, deployment URL)
    - Sprint velocity chart (CSS-based bar chart)
  - Retrospective section: what went well, what didn't, action items

### Push Report to GitHub

- Delegate to developer agent (Backend if both active, otherwise sole developer) to create a `docs/sdlc-reports` branch from `dev`
- Commit `reports/sdlc-report.html`
- DIRECT PUSH to `dev` (no PR needed - `reports/**` exempt via path-based branch protection)
- Report PR link (if created) or commit URL to user

### Present Report to User

- Show file path to `reports/sdlc-report.html`
- Show GitHub PR link where report was pushed


## Agent Reference

Each agent has a dedicated role definition bundled in `references/agents/` and
auto-copied to `.codeartsdoer/agents/` during Step 0.0. The PM Agent
is the orchestrator (`mode: all`); all others run as subagents (`mode: subagent`).

| Agent | File | Steps | Key Responsibility |
|-------|------|-------|--------------------|
| PM | `pm-agent.md` | 0, 1, 1b, 2, 5, 7, 8, 9 | Orchestration, PRD, batch Jira ops, sprint mgmt, release authorization, sprint retro |
| Backend | `backend-agent.md` | 0, 1b, 2, 3, 5, 7, 9 | Server code, APIs, DB, API tests, repo creation, build info, PR operations (primary when both active), parallel dispatch |
| Frontend | `frontend-agent.md` | 0, 1b, 2, 3, 5, 7, 9 | UI code, components, unit tests, build info, PR operations (when sole developer), parallel dispatch |
| Code Reviewer | `code-reviewer-agent.md` | 4 | Batch PR review, batch secret scanning, approval sign-off |
| Tester | `tester-agent.md` | 5 | Playwright E2E, bug reporting, coverage |
| DevOps | `devops-agent.md` | 0, 6, 8 | docker-compose, ci-cd.yml (auto-trigger + cache + combined), CI/CD monitoring, deployment (NO PR operations) |

## Jira Status Lifecycle

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
  | In Testing        | In Progress       | SonarCloud QG failed (coverage, security)  |
  +-------------------+-------------------+-----------------------------------+
```

## Agent Routing Labels

Jira labels (NOT assignee) route tasks to the correct agent:

| Label | Routes To |
|-------|-----------|
| `agent:frontend` | Frontend Agent |
| `agent:backend` | Backend Agent |
| `agent:code-reviewer` | Code Reviewer Agent |
| `agent:devops` | DevOps Agent |
| `agent:tester` | Tester Agent |
| `agent:pm` | PM Agent |

**Domain labels:** `frontend` `backend` `bug` `test` `security` `devops`
`release` `documentation` `feature` `refactor`

## Inter-Agent Messaging

All inter-agent communication happens via **Jira comments** using this format:

```
@agent:<target-agent> <message>
```

Examples:
- `@agent:backend Please review requirements - confirm feasibility, flag gaps`
- `@agent:code-reviewer PR #42 ready for review - backend implementation complete`
- `@agent:devops E2E sign-off complete - all tests passing, ready for CI/CD`

## Task Discovery (JQL)

| Agent | JQL |
|-------|-----|
| Frontend | `labels = agent:frontend AND status = "To Do"` |
| Backend | `labels = agent:backend AND status = "To Do"` |
| Code Reviewer | `labels = agent:code-reviewer AND status = "In Review"` |
| Tester | `labels = agent:tester AND status = "In Review"` |
| DevOps | `labels = agent:devops AND status = "In Review"` |
| PM | `labels = agent:pm AND status = "To Do"` |

## Branch Strategy (GitFlow)

```
main  (production-ready - only released code, deploy from here)
 │
 └── dev  (integration branch - all PRs merge here first)
       ├── feature/<agent>/<short-description>
       ├── fix/<agent>/<short-description>
       ├── bug/<agent>/<short-description>
       └── docs/sdd-<feature_name>
```

- **`main`**: Production branch. Only updated via `dev` → `main` merge at release time (Step 7).
  Branch protection rules MUST be enabled (no direct pushes).
- **`dev`**: Integration branch. All feature, fix, and docs PRs target `dev` as base.
  Multiple feature branches merge here for integration testing before release.
- **Feature/fix/bug/docs branches**: Created from `dev`, merged back to `dev` via PR.

> **Option A (Existing Repo):** The user's existing branch strategy takes precedence.
> During onboarding (Step 0.A.6), the PM Agent asks the user which branch strategy to
> use (existing `develop`, GitFlow `dev`, trunk-based, or custom). The selected branch
> is persisted and passed to all downstream agents (Backend, Frontend, DevOps) for
> CI/CD triggers, feature merges, and release PRs. Branches are only created by
> developer agents, never by the PM Agent.

### Release Merge: `dev` → `main`

At Step 7 (Release Review), after all feature PRs are merged into `dev` and all
gates pass, the PM Agent authorizes and the developer agent (Backend if both active,
otherwise sole developer) creates and merges `dev` into `main` via GitHub MCP.
This is the only way code reaches `main`. Deployment (Step 8) always pulls from `main`.

## Branch Naming Convention

```
feature/<agent>/<short-description>   e.g. feature/backend/projects-tasks-api
fix/<agent>/<short-description>       e.g. fix/backend/sql-injection
bug/<agent>/<short-description>       e.g. bug/frontend/login-redirect
docs/sdd-<feature_name>               e.g. docs/sdd-sprint-1
```

All branches are created from `dev` and merged back to `dev` via PR.

## PR Merge Gate (Enforced by PM Agent)

### Feature PR -> `dev` (after Step 5 E2E sign-off)

A feature/fix/bug PR may only be merged into `dev` when ALL of the following are satisfied:

1. Code Reviewer Agent sign-off comment exists on Jira task
2. Tester Agent E2E sign-off comment exists on Jira task
3. Human approval (via PM Agent question tool)

> **NOTE:** CI green and SonarCloud QG are NOT required at this stage.
> CI/CD runs on `dev` AFTER the feature PR is merged (Step 6).
> SonarCloud QG is checked in Step 7. Both are gates for the
> Release Merge (`dev` -> `main`) in Step 7, not for the feature PR merge.

### SDD Docs PR → `dev`

Lightweight merge — developer agent merges immediately after user review.
No Code Reviewer/Tester/CI sign-off required (documentation only).

### Release Merge: `dev` → `main` (Step 8)

The `dev` → `main` merge may only happen when ALL of the following are satisfied:

1. All feature PRs have been merged into `dev`
2. Integration CI/CD passed on `dev` branch
3. SonarCloud Quality Gate passes on `dev`
4. All Jira tasks have Code Reviewer + Tester sign-off
5. Human approval (via PM Agent question tool)

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

## Human-in-the-Loop Checkpoints

The pipeline requires explicit human approval at these points:

| Checkpoint | Step | Tool |
|------------|------|------|
| SDD document review before pushing to GitHub | 2 | `question` tool |
| Release approval before deployment | 7 | `question` tool |
| Deployment authorization to Huawei ECS | 8 | `question` tool |

> **If user rejects any checkpoint:** The pipeline pauses. PM Agent asks the user
> for feedback via `question` tool and routes tasks back to the appropriate step
> (Step 3 for code changes, Step 5 for PR merge, Step 7 for release, Step 8 for deployment).


## Critical Setup Warnings (Surface Proactively)

> **WARNING:**
> 1. **SonarCloud Automatic Analysis conflict**: MUST be disabled before any
>    CI/CD run. If left enabled alongside the GitHub Actions scan, the pipeline
>    crashes. Requires Project Administrator permissions.
> 2. **Jira direct REST API 401**: Direct calls to `{site}.atlassian.net` with
>    Basic auth return 401. Must use the Atlassian API gateway
>    (`api.atlassian.com/ex/jira/{cloudUuid}/rest/...`) with the `Authorization`
>    header from `.codeartsdoer/mcp/mcp_settings.json`
>    (`mcpServers["atlassian-rovo-mcp"].headers.Authorization`). Any other auth
>    token will fail. Discover the cloud UUID by calling
>    `atlassian-rovo-mcp_getVisibleJiraProjects` and extracting it from the `self`
>    URL in the response. On Windows, the CodeArts Bash tool strips `$` from
>    inline PowerShell — always write a `.ps1` script file first, then execute
>    with `powershell -NoProfile -ExecutionPolicy Bypass -File`.
> 3. **Jira sprint name length**: Must be shorter than 30 characters or the API
>    returns 400.
> 4. **Sprint field value type**: `customfield_10020` (Sprint) must be a number,
>    NOT an array - e.g. `{ "customfield_10020": 34 }`.
> 5. **Manual integrations required**: GitHub<->Jira, GitHub<->SonarCloud, and
>    GitHub<->Semgrep links must be configured manually in each platform's UI.
> 6. **Sprint close requires full object**: `PUT /rest/agile/1.0/sprint/{id}` does
>    NOT support partial updates. Sending only `{"state": "closed"}` returns 400.
>    Must `GET /sprint/{id}` first to fetch existing `name` and `startDate`, then
>    `PUT` with complete body: `{state, name, startDate, endDate, goal}`.
> 6b. **Sprint close must use gateway URL + MCP auth**: Direct site URL
>    (`{site}.atlassian.net`) always returns 401. Must use the Atlassian API gateway
>    (`https://api.atlassian.com/ex/jira/{cloudUuid}/rest/agile/1.0`) with the
>    `Authorization` header from `.codeartsdoer/mcp/mcp_settings.json`
>    (`mcpServers["atlassian-rovo-mcp"].headers.Authorization`). On Windows, the
>    CodeArts Bash tool strips `$` from inline PowerShell — always write a `.ps1`
>    script file first, then execute with `powershell -File`.
> 7. **JFrog Docker repository naming**: Do NOT use underscores in repository names
>    (DNS limitation). Use hyphens (e.g., `docker-dev-local` not `docker_dev_local`).
> 8. **JFrog build API requires project param**: `GET /artifactory/api/build/{name}`
>    returns 404 without `?project={project-key}` query parameter.
> 9. **Jira 'In Testing' status required**: The pipeline uses 'In Testing' during Step 5.
>    This status does NOT exist by default. Must be manually added:
>    Settings -> Work items -> Workflows -> Edit -> Add status -> Create 'In Testing'
>    (category: In Progress) -> Enable 'Allow all statuses to transition to this one'.
> 10. **Never push directly to main**: All changes — including SDD documentation —
>    must go through a feature/docs branch and PR targeting `dev`. Enable GitHub branch
>    protection rules on both `main` and `dev` (Settings > Branches > Branch protection
>    rules) to enforce this. `main` is only updated via `dev` → `main` merge at release
>    time (Step 7). SDD docs use direct push (no PR needed, path-based branch protection
>    gates); code changes require the full PR Merge Gate (5 sign-offs).

## Config Templates

Ready-to-fill templates are in `references/templates/`:

| Template | Description |
|----------|-------------|
| `mcp-settings.json` | MCP server configuration for all 5 services |
| `ci-cd.yml` | GitHub Actions workflow template (build -> sonar-scan -> sonar-qg-check -> deploy-to-jfrog -> verify-jfrog). Build section is filled by DevOps Agent based on Backend/Frontend build info during Step 0; service placeholders filled by PM Agent after all services onboarded |
| `sonar-project.properties` | SonarCloud project configuration |
| `env-template.env` | Environment variables for all services |
| `set-secrets.js` | GitHub Actions secrets/variables setup script (sets SONAR_TOKEN, JFROG_PASSWORD as secrets; JFROG_PLATFORM_URL, JFROG_DOCKER_REGISTRY, JFROG_USERNAME, JFROG_PROJECT as variables) |
| `add_ssh_key.py` | Python script to add SSH public key to Huawei Cloud ECS for key-based authentication |

## Execution Notes

> **Re-running the pipeline:** If the pipeline is re-run for the same sprint,
> the PM Agent checks existing state (sprint, tasks, PRs, CI runs, artifacts,
> deployment) and skips already-completed steps. See `references/pipeline.md`
> Step Details section for full idempotency checklist.

- The PM Agent is the only agent that can authorize deployment and close sprints.
- **PM Agent is READ-ONLY with the repository** (minimal GitHub MCP access: `get_file_contents`,
  `get_commit`, `list_commits` only). All other GitHub operations (`list_branches`,
  `search_code`, `pull_request_read`, `create_pull_request`, `merge_pull_request`)
  are delegated to **developer agents** (Backend or Frontend). The PM Agent NEVER runs
  `git clone`, `git commit`, `git push`, `git checkout`, or `github_create_repository`.
- **DevOps Agent does NOT create or merge PRs.** The DevOps Agent owns git write operations
  for infrastructure files only (clone, branch, commit, push). PR operations
  (`create_pull_request`, `merge_pull_request`) are routed to developer agents:
  Backend Agent (if both active or only backend), Frontend Agent (if only frontend).
  The DevOps Agent retains read-only GitHub access (`list_branches`, `search_code`,
  `pull_request_read`) for CI/CD monitoring.
- **Existing artifacts are sacred (Option A).** If the repo already contains
  Dockerfiles, `docker-compose.yml`, `ci-cd.yml`, or `sonar-project.properties`,
  the pipeline MUST NOT modify or overwrite them without explicit user approval.
- **Branches are user-controlled (Option A).** The pipeline MUST NOT create, delete,
  or rename branches unless the user explicitly approves. The user's existing branch
  strategy is respected.
- During Step 0 onboarding with Option B (new repo), the PM Agent delegates code
  building to Backend, Frontend, and DevOps agents via the Task tool. The Backend Agent
  creates the repo via `github_create_repository`, clones it, and creates `dev` from `main`;
  all agents push to `dev` branch. DevOps Agent runs last to see both Dockerfiles before
  writing `docker-compose.yml`, `ci-cd.yml`, and shared docs (README, .gitignore).
  The PM Agent does NOT create the repo or clone it.
- During Step 0 onboarding with Option A (existing repo), the PM Agent performs
  read-only inventory and asks the user about their intent and branch strategy.
  No code is built, no branches are created, no files are pushed by the PM Agent.
- Backend and Frontend agents return CI/CD build info (setup action, install/build/test
  commands) to the PM Agent, who passes it to the DevOps Agent for `ci-cd.yml` configuration.
- Tester Agent exclusively owns E2E/Playwright tests; Frontend/Backend own unit
  and component tests. Do NOT cross this boundary.
- SonarCloud MCP only reads remote analysis results - it cannot perform local
  analysis. Use Semgrep MCP for local scanning.
- CI/CD is **auto-triggered** on push to `dev` (not manual). This ensures
  only reviewed, tested code enters the pipeline immediately after merge.
- All SDD documents (`spec.md`, `design.md`, `tasks.md`) are pushed to GitHub
  via a developer agent on a docs branch + PR targeting `dev` (GitHub branch protection
  applies to the whole branch, so a PR is required).
- **Step 5 (E2E + Auto-Merge):** Tester runs E2E, then PM verifies gates +
  asks human approval, developer agent merges feature PRs into `dev`. CI/CD
  auto-triggers on dev push (no separate Step 5b or manual CI/CD trigger).
- **Step 6 (CI/CD + Verification Combined):** CI/CD auto-triggered on dev push.
  Pipeline includes: SonarCloud scan, cached build, Docker push to JFrog, JFrog
  artifact verification, SonarCloud QG check. DevOps
  reads final pipeline status (1 API call instead of 8+ separate verification calls).
- **Step 7 (Release Merge):** PM Agent authorizes (sign-offs + human approval),
  developer agent (Backend if both active, otherwise sole developer) creates and merges
  the `dev` -> `main` PR via GitHub MCP. Simplified conflict resolution: default
  "prefer dev" strategy (4 steps), full domain-owner resolution only if CI/CD fails.
- **Step 8 (Deployment):** PM Agent authorizes (human approval), DevOps Agent
  executes (SSH into Huawei Cloud ECS, docker pull, docker run, health check,
  rollback on failure).
- **Step 9 (Report Push):** PM Agent generates HTML report, developer agent
  (Backend if both active, otherwise sole developer) creates a docs branch + PR
  targeting `dev` and merges it (GitHub branch protection applies to the whole branch).

## Sharing This Skill

To share this skill with others:

1. Copy the entire `sdlc-agentic-pipeline/` directory into the recipient's
   project `.codeartsdoer/skills/` directory.
2. Append `sdlc-agentic-pipeline=true` to their
   `.codeartsdoer/skills/ProjectSkillStatus.txt`.
3. The recipient should then run Step 0 (Service Onboarding) to configure their
   own service credentials before starting a pipeline run.