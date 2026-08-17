# Test# SDLC Agentic Pipeline — End-to-End Diagram

Complete E2E flow: service onboarding through sprint close, with MCP servers, skills, methodologies, agents, and config outputs.

> **Note:** This is a visual reference only. For authoritative per-step orchestration, see `pipeline.md`. For onboarding details, see `setup/service-onboarding.md`.

```text
+============================================================================================+
|                      SDLC AGENTIC PIPELINE — END-TO-END FLOW                               |
+============================================================================================+

  Branch Strategy:  main (production)  <--  dev (integration)  <--  feature/fix/bug/docs

+--------------------------------------------------------------------------------------------+
| STEP 0: SERVICE ONBOARDING  (PM Agent orchestrates; user answers via `question` tool)      |
+--------------------------------------------------------------------------------------------+
| 0.0     Auto-provision 8 agent files -> .codeartsdoer/agents/ + install skill-installer    |
|         + copy bundled brainstorming skill -> .codeartsdoer/skills/sdlc-brainstorming            |
|         Agents: PM, Backend, Frontend, Code Reviewer, Tester, DevOps, Architect, Figma    |
|                                                                                            |
| 0.0.5   Multi-Tool Selection — 4 multiselect questions                                     |
|         Q1 MCP & Services   Q2 SDD   Q3 TDD   Q4 DDD                                       |
|         Persisted to .codeartsdoer/tool-selections.json (drives all downstream behavior)   |
|                                                                                            |
| 0.1   GitHub onboarding ........... if `github` selected       -> mcp_settings.json        |
| 0.2   Jira onboarding ............. if `jira` selected         -> mcp_settings.json        |
| 0.3   SonarCloud onboarding ....... if `sonarcloud` selected   -> mcp_settings.json        |
| 0.4   Semgrep onboarding .......... if `semgrep` selected      -> mcp_settings.json        |
| 0.5   JFrog Artifactory onboarding  if `jfrog` selected        -> .env (REST API, no MCP)   |
| 0.6   Huawei Cloud ECS onboarding . if `huawei-ecs` selected   -> .env                     |
| 0.7   Playwright install .......... if `playwright` selected   -> skill-installer          |
| 0.8   Methodology tool setup ...... if any methodology skill   -> verify/install/smoke     |
| 0.9   Azure DevOps CLI ............ if `azure-devops` selected -> skill-installer + .env   |
| 0.10  Azure deploy target setup ... if any Azure deploy target -> .env (az CLI via Bash)  |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| PIPELINE STEPS  (conditional — degrade gracefully when tools unselected)                  |
+--------------------------------------------------------------------------------------------+
|                                                                                            |
| 0.F   PM→Figma Design ... Figma-to-Code (optional): pm-agent (entry) receives raw      |
|       req + Figma URL + node-id → brainstorm → creates requirement.md → hands off to             |
|       figma-design-agent (extract + diff vs requirement.md) → user confirms → pm-agent          |
|       updates requirement.md + creates tasks.md → figma-design hands off to pm-agent →           |
|       pm-agent breaks down tasks per tasks.md → pushes Epic→Issue→Task to Azure DevOps     |

|  |                                                                                         |
|  v                                                                                         |
| 0.DA  Architect Agent ......... Design phase: classify task, DDD/SDD/TDD                   |
|  |                                                                                         |
|  v                                                                                         |
| 1     PM Agent .............. Requirement breakdown: PRD, Epic→Issue→Task hierarchy, routing labels |
|  |                                                                                         |
|  v                                                                                         |
| 1b    Frontend/Backend ..... Requirement review (parallel via Jira async comments)         |
|  |     [GATE: both agents must approve]                                                    |
|  v                                                                                         |
| 2     PM + Developer ....... Sprint start (Jira) + SDD setup (creating-sdd-directory)      |
|  |                                                                                         |
|  v                                                                                         |
| 3     Frontend/Backend ..... Code dev (parallel), Semgrep pre-scan, push + create PR       |
|  |     [QG: dupl < 3%, security A, coverage > 80%]                                         |
|  v                                                                                         |
| 4     Code Reviewer ........ PR review, secret scanning, APPROVE / REQUEST_CHANGES        |
|  |                                                                                         |
|  v                                                                                         |
| 5     Tester Agent ......... E2E testing (Playwright) + PM auto-merges feature PRs -> dev  |
|  |     [CI/CD auto-triggers on push to dev]                                                |
|  v                                                                                         |
| 6     DevOps Agent ......... CI/CD (auto-triggered) + JFrog push + SonarCloud quality gate |
|  |     [GATE: coverage > 80%, dupl < 3%, security A]                                       |
|  v                                                                                         |
| 7     PM + Developer ....... Release review + merge dev -> main (human approval required) |
|  |                                                                                         |
|  v                                                                                         |
| 8     PM + DevOps .......... Deploy auth + execution (Huawei ECS / Azure targets)          |
|  |                                                                                         |
|  v                                                                                         |
| 9     PM + Developer ....... Sprint close, retrospective, HTML report (pushed to repo)    |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| AGENTS  (8 total — PM = orchestrator mode:all; others = subagents mode:subagent)          |
+--------------------------------------------------------------------------------------------+
| Agent          | Steps                  | Responsibility                                  |
|----------------|------------------------|--------------------------------------------------|
| PM             | 0,0.F,1,1b,2,5,7,8,9   | Orchestrator, Figma-to-Code entry, requirement.md+tasks.md |
| Backend        | 0,1b,2,3,5,7,9         | Server-side code, API tests                      |
| Frontend       | 0,1b,2,3,5,7,9         | Client-side code, UI                             |
| Code Reviewer  | 4                      | PR review, secret scanning, approval             |
| Tester         | 5                      | E2E / Playwright tests                            |
| DevOps         | 0,6,8                  | CI/CD, artifact verify, deployment               |
| Architect      | 0.DA                   | design.md ONLY (**SKIPPED if 0.F ran**; reads figma-extract.md if 0.F didn't run) |
| Figma Design   | 0.F                    | Figma extract+diff, EXCLUSIVE Figma MCP consumer |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| MCP SERVERS  (conditional — only configured for selected tools)                            |
+--------------------------------------------------------------------------------------------+
| MCP Server          | Purpose                                  | Auth              | Config   |
|---------------------|------------------------------------------|-------------------|----------|
| atlassian-rovo-mcp  | Jira tasks, sprints, comments, transit.  | Basic (B64)       | mcp.json |
| github              | Repos, branches, PRs, reviews, workflow    | Bearer PAT        | mcp.json |
| sonarqube           | Quality gate, issues, coverage, hotspots  | Bearer token      | mcp.json |
| semgrep             | Local static analysis, security scanning  | App token env     | mcp.json |
| terraform           | Infrastructure as Code (ECS provisioning)  | —                 | mcp.json |
| postman             | API testing, collection runs               | Bearer API key    | mcp.json |
|---------------------|------------------------------------------|-------------------|----------|
| JFrog       = REST API in .env (NOT an MCP server)                                         |
| Azure DevOps = az CLI skill (NOT an MCP server) — can coexist with GitHub + Jira            |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| METHODOLOGY SKILLS  (selectable in Step 0.0.5; permission gated per agent)                |
+--------------------------------------------------------------------------------------------+
|                                                                                            |
| SDD (Spec-Driven Development)                                                               |
| +-- SDD Toolkit (Huawei built-in) ...... PM (requirement.md + tasks.md), Architect (design.md only) |
|     If Step 0.F ran: PM creates requirement.md + tasks.md from figma-extract.md; design.md SKIPPED |

| +-- OpenSpec ........................... PM, Backend, Frontend, Architect                 |
|     Rule: first selected = PRIMARY; others = SUPPLEMENTARY                                 |
|                                                                                            |
| TDD (Test-Driven Development)                                                               |
| +-- Playwright CLI (E2E) ............... Tester            [onboard 0.7, skill-installer] |
| +-- Postman (API, MCP) .................. Backend, Architect [onboard 0.8]                 |
| +-- Newman (API, CI/CD) ................. Backend           [auto-selected with Postman]   |
| +-- Jest (Unit, JS/TS) .................. Backend, Frontend [onboard 0.8]                  |
| +-- Pytest (Unit, Python) ................ Backend          [onboard 0.8]                  |
| +-- JUnit (Unit, Java) .................. Backend          [onboard 0.8]                  |
| +-- Vitest (Unit, JS/TS Vite) ........... Backend, Frontend [onboard 0.8]                  |
|     Rule: each tool owns its own test layer; all must pass                                 |
|                                                                                            |
| DDD (Domain-Driven Design)                                                                 |
| +-- Context Mapper ...................... Architect          [onboard 0.8]                 |
| +-- EventStorming ...................... Architect          [onboard 0.8]                 |
| +-- Structurizr ........................ Architect          [onboard 0.8]                 |
|     Rule: first selected = PRIMARY; others = SUPPLEMENTARY                                 |
|                                                                                            |
| DevOps                                                                                     |
| +-- Azure DevOps CLI .................... PM, Backend, Frontend, DevOps, Code Reviewer     |
| +-- Azure App Service (PaaS) ............ DevOps            [requires azure-devops + ACR]   |
| +-- Azure Container Apps (Serverless) ... DevOps            [requires azure-devops + ACR]   |
| +-- Azure AKS (K8s) ..................... DevOps            [requires azure-devops + ACR]   |
| +-- Azure VM (IaaS) ..................... DevOps            [requires azure-devops + ACR]   |
|     Rule: can coexist with GitHub + Jira; agents route by platform                          |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| BUILT-IN UTILITY SKILLS  (always on, not selectable, never touched by permission script)   |
+--------------------------------------------------------------------------------------------+
| ide-tool | doc-expert | pptx | data-analysis | prd | frontend-design | i18n-integration     |
| skill-installer | brainstorming (bundled — visual companion for interactive spec brainstorming)     |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| CONFIG OUTPUTS  (generated during onboarding; conditional on selections)                  |
+--------------------------------------------------------------------------------------------+
| .codeartsdoer/tool-selections.json ... user selections (local, gitignored)                |
| .codeartsdoer/mcp/mcp_settings.json .. MCP servers (only selected entries)                |
| <project>/.env ........................ JFrog, ECS, Azure DevOps, Azure deploy, ACR        |
| .github/workflows/ci-cd.yml ........... GitHub Actions — generated at Step 6 by DevOps (if github selected; if both, ask user) |
| azure-pipelines.yml .................... Azure Pipelines — generated at Step 6 by DevOps (if azure-devops selected; if both, ask user) |
| sonar-project.properties .............. SonarCloud (if sonarcloud selected)               |
| .codeartsdoer/agents/*.md ............. 8 agent definition files                          |
| .codeartsdoer/skills/sdlc-brainstorming ... bundled visual companion skill                     |
+--------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| DEVELOPMENT PLAN  (notes for future enhancements)                                         |
+--------------------------------------------------------------------------------------------+
| * [DONE] Figma-to-Code (Step 0.F): pm-agent is the entry point — user provides raw     |
|   requirement + Figma URL + node-id. pm-agent creates requirement.md, then hands off to        |
|   figma-design-agent (extract + diff vs requirement.md). After user confirmation, pm-agent       |
|   updates requirement.md + creates tasks.md. figma-design-agent hands off to pm-agent,          |
|   which breaks down tasks per tasks.md and pushes to Azure DevOps.                       |

|   SDD ownership: pm-agent = requirement.md + tasks.md; architect-agent = design.md only.          |
| * [DONE] Brainstorming skill: bundled hard copy in skills/sdlc-brainstorming/ — installed        |
|   during onboarding (Step 0.0) alongside agent files and skill-installer.                  |
| * Replace GitHub MCP with `gh-cli` skill: swap all github_* MCP calls across agents        |
|   and steps; update capability gating, Tools: lines, and config references.                |
+--------------------------------------------------------------------------------------------+
```