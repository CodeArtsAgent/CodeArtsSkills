---
name: sdlc-agentic-pipeline
description: >-
  Orchestrate a complete multi-agent SDLC pipeline powered by Huawei Cloud CodeArts Agent.
  7 agents (PM, Backend, Frontend, Code Reviewer, Tester, DevOps, Architect)
  across 10 steps from requirements through deployment. Integrates GitHub, Jira,
  SonarCloud, Semgrep, JFrog, Playwright, Huawei Cloud ECS.
  Trigger: "start agentic flow", "SDLC pipeline", "agentic DevOps pipeline",
  "multi-agent development workflow".
---

# SDLC Agentic Pipeline

7 agents collaborate asynchronously through Jira comments as a message bus.

## Pipeline Steps

| Step | Agent(s) | Action |
|------|----------|--------|
| 0 | PM + Frontend/Backend/DevOps | Onboarding: auto-provision agents, tool selection |
| 0.DA | Architect | Design phase: classify task, DDD/SDD/TDD |
| 1 | PM | Requirement breakdown, PRD, batch Jira tasks |
| 1b | Frontend/Backend | Requirement review (parallel via Jira async) |
| 2 | PM + Developer | Sprint start + SDD setup |
| 3 | Frontend/Backend | Code dev (parallel), Semgrep pre-scan, PR |
| 4 | Code Reviewer | PR review, secret scanning, approval |
| 5 | Tester + PM + Dev | E2E testing + auto-merge feature PRs |
| 6 | DevOps | CI/CD (auto-triggered) + JFrog + SonarCloud |
| 7 | PM + Developer | Release review + merge (dev -> main) |
| 8 | PM + DevOps | Deploy auth + execution (Huawei Cloud ECS) |
| 9 | PM + Developer | Sprint close, retro, HTML report |

## PR Operation Routing

| Scenario | PR Operations Owner |
|----------|---------------------|
| Only Frontend active | Frontend Agent |
| Only Backend active | Backend Agent |
| Both active | Backend Agent (primary) |

## Agents

| Agent | File | Steps |
|-------|------|-------|
| PM | `references/agents/pm-agent.md` | 0, 1, 1b, 2, 5, 7, 8, 9 |
| Backend | `references/agents/backend-agent.md` | 0, 1b, 2, 3, 5, 7, 9 |
| Frontend | `references/agents/frontend-agent.md` | 0, 1b, 2, 3, 5, 7, 9 |
| Code Reviewer | `references/agents/code-reviewer-agent.md` | 4 |
| Tester | `references/agents/tester-agent.md` | 5 |
| DevOps | `references/agents/devops-agent.md` | 0, 6, 8 |
| Architect | `references/agents/architect-agent.md` | 0.DA |

PM Agent = orchestrator (`mode: all`); all others = subagents (`mode: subagent`).

## Prerequisites

Step 0 (Service Onboarding) must complete first. See `references/setup/service-onboarding.md`.

### Step 0.0.5 - Multi-Tool Selection

PM Agent presents 4 multiselect questions (MCP servers, SDD, TDD, DDD).
Selection persisted to `.codeartsdoer/tool-selections.json`. See `references/setup/multi-tool-selection-plan.md`.

## Methodology Skills

| Methodology | Tools | Primary/Supplementary Rule |
|-------------|-------|---------------------------|
| SDD | SDD Toolkit, OpenSpec | First selected = PRIMARY; others = SUPPLEMENTARY |
| TDD | Playwright (E2E), Postman/Newman (API), Jest/Vitest/Pytest/JUnit (Unit) | Each tool owns its own test layer; all must pass |
| DDD | Context Mapper, EventStorming, Structurizr | First selected = PRIMARY; others = SUPPLEMENTARY |

Built-in utility skills (always on, not selectable): `ide-tool`, `doc-expert`, `pptx`, `data-analysis`, `prd`, `frontend-design`, `i18n-integration`, `skill-installer`

## Permission Setup

Deny-by-default. Only explicitly allowed skills can be invoked.

| Agent | Additional Allowed Skills (beyond `ide-tool`) |
|-------|-----------------------------------------------|
| PM | `creating-sdd-directory`, `data-analysis`, `doc-expert`, `managing-design-document`, `managing-spec-document`, `managing-tasks-document`, `openspec`, `pptx`, `prd`, `skill-installer` |
| Backend | `creating-sdd-directory`, `managing-spec-document`, `managing-design-document`, `managing-tasks-document`, `openspec`, `skill-installer` |
| Frontend | `creating-sdd-directory`, `frontend-design`, `i18n-integration`, `managing-spec-document`, `managing-design-document`, `managing-tasks-document`, `openspec`, `skill-installer` |
| Code Reviewer | _(none)_ |
| Tester | `playwright-cli`, `skill-installer` |
| DevOps | _(none)_ |
| Architect | `creating-sdd-directory`, `managing-spec-document`, `managing-design-document`, `managing-tasks-document`, `skill-installer` + TDD/DDD tool permissions (dynamic) |

## Directory Structure

```
sdlc-agentic-pipeline/
|-- SKILL.md
`-- references/
    |-- setup/
    |   |-- service-onboarding.md
    |   |-- multi-tool-selection-plan.md
    |   `-- critical-warnings.md
    |-- agents/
    |   |-- pm-agent.md
    |   |-- backend-agent.md
    |   |-- frontend-agent.md
    |   |-- code-reviewer-agent.md
    |   |-- tester-agent.md
    |   |-- devops-agent.md
    |   |-- architect-agent.md
    |   `-- shared/
    |       `-- developer-agent-base.md

    |-- pipeline.md
    |-- branch-strategy.md
    |-- report-spec.md
    |-- config-reference.md
    |-- skill-registry.json
    `-- templates/
        |-- mcp-settings.json
        |-- ci-cd.yml
        |-- sonar-project.properties
        |-- env-template.env
        |-- set-secrets.js
        |-- add_ssh_key.py
        |-- SKILL.md
        |-- apply-tool-selections.ps1
        |-- apply-tool-selections.sh
        `-- sprint-scripts/
            |-- README.md
            |-- sprint-start.ps1
            |-- sprint-start.sh
            |-- sprint-close.ps1
            `-- sprint-close.sh
```

## Quick Start

1. **Create a GitHub repository manually** — the pipeline never creates repos
2. Copy `sdlc-agentic-pipeline/` into `.codeartsdoer/skills/`
3. Append `sdlc-agentic-pipeline=true` to `.codeartsdoer/skills/ProjectSkillStatus.txt`
4. Run Step 0 (Service Onboarding)
5. Say "start agentic flow"

## Reference Index

| Topic | File |
|-------|------|
| Per-step orchestration | `references/pipeline.md` |
| Branch strategy & PR merge gate | `references/branch-strategy.md` |
| HTML report specification | `references/report-spec.md` |
| Config templates & runtime files | `references/config-reference.md` |
| Critical warnings | `references/setup/critical-warnings.md` |
| Service onboarding | `references/setup/service-onboarding.md` |
| Multi-tool selection plan | `references/setup/multi-tool-selection-plan.md` |
| Skill registry | `references/skill-registry.json` |

## Execution Notes

- Repo creation is manual, human-only — no agent ever calls `github_create_repository`
- PM Agent is the only agent that can authorize deployment and close sprints
- PM Agent is READ-ONLY with the repository; all git writes delegated to developer agents
- DevOps Agent does NOT create or merge PRs
- Existing artifacts are sacred (Option A) — never modified without explicit user approval
- Tester Agent exclusively owns E2E/Playwright tests; Frontend/Backend own unit/component tests
- CI/CD is auto-triggered on push to `dev`
- Pipeline degrades gracefully — steps that depend on unselected tools are skipped
