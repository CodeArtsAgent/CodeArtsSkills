# SDLC Agentic Pipeline — Huawei Cloud CodeArts Agent Skill

A multi-agent SDLC orchestration skill that drives an entire software delivery
lifecycle — from requirements to deployment — using **Huawei Cloud CodeArts Agent**.
Six agents collaborate asynchronously through Jira comments as a message bus,
enforcing quality gates, error throwback, and human-in-the-loop checkpoints.

> Trigger this skill when the user asks to start an agentic flow, SDLC pipeline,
> agentic DevOps pipeline, multi-agent development workflow, or any prompt related
> to initiating the end-to-end agentic software delivery lifecycle.

---

## Architecture

```
+---------------------------------------------------------------------------+
|                    SDLC AGENTIC PIPELINE - 6 AGENTS                       |
+---------------------------------------------------------------------------+
|                                                                           |
|  +-------------+   +--------------+   +---------------+                   |
|  | PM Agent    |   | Backend Agent|   | Frontend Agent|                   |
|  | (orchestr.) |   | (server code)|   | (UI code)     |                   |
|  +------+------+   +------+-------+   +-------+-------+                   |
|         |                 |                   |                           |
|         |   Jira comments = inter-agent message bus                        |
|         |                 |                   |                           |
|  +------v------+   +------v-------+   +-------v-------+                   |
|  | Code        |   | Tester Agent |   | DevOps Agent  |                   |
|  | Reviewer    |   | (Playwright) |   | (CI/CD+JFrog) |                   |
|  | (Semgrep)   |   +--------------+   +---------------+                   |
|  +-------------+                                                           |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## The 10-Step Pipeline

```
+---------------------------------------------------------------------------+
|  STEP  AGENT(S)            ACTION                                         |
+---------------------------------------------------------------------------+
|   0    PM (onboarding)     Gather all service info, generate configs      |
|   1    PM                  Requirement breakdown, PRD, Jira task creation |
|   2    PM                  Sprint start (Jira Agile API) + SDD setup      |
|   3    Frontend/Backend    Code dev, branching, PR, unit tests            |
|   4    Code Reviewer       Semgrep scan, security, GitHub PR review       |
|   5    Tester              Playwright E2E testing, bug reporting          |
|   6    DevOps              CI/CD pipeline via GitHub Actions (manual)     |
|   7    DevOps              JFrog Artifactory verify + SonarCloud QG       |
|   8    PM                  Release review (all sign-offs checked)         |
|   9    PM                  Deploy to Huawei Cloud ECS                     |
|  10    PM                  Sprint close, retrospective, next planning     |
+---------------------------------------------------------------------------+
```

---

## Agents

| Agent | File | Steps | Key Responsibility |
|-------|------|-------|--------------------|
| PM | `references/agents/pm-agent.md` | 0, 1, 2, 8, 9, 10 | Orchestration, PRD, sprint mgmt, release, deploy, retro |
| Backend | `references/agents/backend-agent.md` | 1, 2, 3 | Server code, APIs, DB, API tests |
| Frontend | `references/agents/frontend-agent.md` | 1, 2, 3 | UI code, components, unit tests |
| Code Reviewer | `references/agents/code-reviewer-agent.md` | 4 | Semgrep scan, security, PR review |
| Tester | `references/agents/tester-agent.md` | 5 | Playwright E2E, bug reporting, coverage |
| DevOps | `references/agents/devops-agent.md` | 6, 7 | CI/CD, JFrog verify, SonarCloud QG |

The PM Agent is the orchestrator (`mode: all`); all others run as subagents
(`mode: subagent`).

---

## Directory Structure

```
sdlc-agentic-pipeline/
├── SKILL.md                          # Skill entry point + pipeline overview
└── references/
    ├── setup/
    │   └── service-onboarding.md     # Step 0: 7-service onboarding guide
    ├── agents/
    │   ├── pm-agent.md
    │   ├── backend-agent.md
    │   ├── frontend-agent.md
    │   ├── code-reviewer-agent.md
    │   ├── tester-agent.md
    │   └── devops-agent.md
    └── templates/
        ├── mcp-settings.json         # MCP server config (5 services)
        ├── ci-cd.yml                 # GitHub Actions workflow template
        ├── sonar-project.properties  # SonarCloud project config
        └── env-template.env          # Environment variables template
```

---

## MCP Servers Required

| MCP Server | Purpose | Auth |
|------------|---------|------|
| `atlassian-rovo-mcp` | Jira tasks, sprints, comments, transitions | Basic (Base64 `email:token`) |
| `github` | Repos, branches, PRs, reviews, workflow dispatch | Bearer PAT |
| `sonarqube` | Quality gate, issues, coverage, hotspots | Bearer token |
| `semgrep` | Local static analysis, security scanning | App token env |
| `jfrog` | Artifactory build/artifact verification | Bearer access token |

---

## Quick Start

1. **Install the skill** — copy `sdlc-agentic-pipeline/` into your project's
   `.codeartsdoer/skills/` directory.
2. **Enable it** — append `sdlc-agentic-pipeline=true` to
   `.codeartsdoer/skills/ProjectSkillStatus.txt`.
3. **Run Step 0 (Service Onboarding)** — the PM Agent walks you through setting
   up GitHub, Jira, SonarCloud, Semgrep, JFrog Artifactory, Huawei Cloud ECS,
   and Playwright. Configs are generated from the templates in
   `references/templates/`.
4. **Start the pipeline** — say "start agentic flow" and the 10-step pipeline
   runs end-to-end.

---

## Branch Naming

```
feature/<agent>/<short-description>   e.g. feature/backend/projects-tasks-api
fix/<agent>/<short-description>       e.g. fix/backend/sql-injection
```

---

## Jira Status Lifecycle

```
To Do ---> In Progress ---> In Review ---> In Testing ---> Done
(created)   (dev starts)    (PR ready)     (E2E testing)  (PM release)
```

Tasks are routed to agents via **Jira labels** (not assignee):
`agent:frontend`, `agent:backend`, `agent:code-reviewer`,
`agent:devops`, `agent:tester`, `agent:pm`.

All inter-agent communication happens via Jira comments:
`@agent:<target-agent> <message>`.

---

## PR Merge Gate

A PR may only be merged when ALL of the following are satisfied:

1. All GitHub Check Runs pass (CI green)
2. SonarCloud Quality Gate passes
3. Code Reviewer Agent sign-off comment exists on Jira task
4. Tester Agent E2E sign-off comment exists on Jira task
5. Human approval (via PM Agent question tool)

---

## Critical Setup Warnings

> [!WARNING]
> 1. **SonarCloud Automatic Analysis conflict** — MUST be disabled before any
>    CI/CD run. If left enabled alongside the GitHub Actions scan, the pipeline
>    crashes with `"You are running CI analysis while Automatic Analysis is
>    enabled"`. Requires Project Administrator permissions.
> 2. **Jira direct REST API 401** — Direct calls to `{site}.atlassian.net` with
>    Basic auth return 401. Use the Atlassian API gateway
>    (`api.atlassian.com/ex/jira/{cloudUuid}/rest/...`). Discover the cloud UUID
>    via `atlassian-rovo-mcp_getVisibleJiraProjects`.
> 3. **Jira sprint name length** — must be shorter than 30 characters or the API
>    returns 400.
> 4. **Sprint field value type** — `customfield_10020` must be a number, NOT an
>    array.
> 5. **Manual integrations required** — GitHub<->Jira, GitHub<->SonarCloud, and
>    GitHub<->Semgrep links must be configured manually in each platform's UI.

---

## Execution Notes

- The PM Agent is the only agent that can authorize deployment and close sprints.
- Tester Agent exclusively owns E2E/Playwright tests; Frontend/Backend own unit
  and component tests.
- SonarCloud MCP only reads remote analysis results — use Semgrep MCP for local
  scanning.
- CI/CD is manually triggered (not on every push) so only reviewed, tested code
  enters the pipeline.
- All SDD documents (`spec.md`, `design.md`, `tasks.md`) are pushed to GitHub so
  all agents can access them.