# Multi-Tool Selection Plan (Step 0.0.5)

After agent files are auto-provisioned (Step 0.0), PM Agent presents 4 grouped multiselect questions. Selections drive all downstream behavior.

---

## Selection Persistence

File: `.codeartsdoer/tool-selections.json`

```json
{
  "selectedAt": "2026-07-21T10:30:00Z",
  "version": 2,
  "methodologies": { "sdd": true, "tdd": true, "ddd": false },
  "tools": {
    "github": false, "jira": false, "sonarcloud": false,
    "semgrep": true, "jfrog": false, "huawei-ecs": false,
    "playwright": true, "sdd": true, "openspec": false,
    "postman": false, "newman": false, "jest": false,
    "pytest": true, "junit": false, "vitest": false,
    "context-mapper": false, "eventstorming": false, "structurizr": false,
    "azure-devops": false,
    "azure-app-service": false,
    "azure-container-apps": false,
    "azure-aks": false,
    "azure-vm": false,
    "figma": false
  }
}
```

`methodologies` is derived: SDD active if `sdd`/`openspec` true; TDD active if any TDD tool true; DDD active if any DDD tool true.

**Reading**: All agents read at start of first step. `isSelected(toolId)` returns true/false. If file missing, treat all tools as selected (backward-compatible default). Local only — add to `.gitignore`.

---

## Questions to Present

4 grouped multiselect questions via `question` tool. All `multiple: true`, `custom: false`.

**Q1 — MCP Servers & Services**: GitHub, Jira, SonarCloud, Semgrep, JFrog Artifactory, Huawei Cloud ECS, Azure DevOps CLI (alternative to GitHub + Jira), Azure App Service (PaaS), Azure Container Apps (Serverless), Azure Kubernetes Service (AKS), Azure VM (IaaS), Figma (design-to-code via figma-design-agent), None

> **Note:** Deployment targets (Huawei ECS, Azure App Service, Container Apps, AKS, VM) are optional here — if not selected, the user will be asked at Step 8 (deploy time).
**Q2 — SDD**: SDD Toolkit (Huawei Built-in), OpenSpec (coming soon), None
**Q3 — TDD**: Playwright CLI (E2E browser testing), Postman (Interactive API testing via MCP), Newman (CLI collection runner for CI/CD — auto-selected with Postman), Jest (Unit testing JS/TS), Pytest (Unit testing Python), JUnit (Unit testing Java), Vitest (Unit testing JS/TS Vite), None (Skip TDD)
**Q4 — DDD**: Context Mapper, EventStorming, Structurizr, None

### Selection Rules
1. No defaults/pre-selection
2. No mandatory items — even GitHub is optional
3. Non-contiguous selection valid
4. "None" takes precedence if selected alongside other items
5. Built-in utility skills never mentioned
6. **Auto-select (post-processing)**: After Q3 returns, if Postman is selected but Newman is NOT, the PM Agent automatically adds Newman to the selections before writing `tool-selections.json`. Newman's option label is "(auto-selected with Postman)" so users know it will be included. The user sees Newman in the post-selection summary as "(auto-selected via Postman)" and can confirm or reject.
7. **Mutual exclusion**: If Azure DevOps is selected alongside GitHub or Jira, warn the user — Azure DevOps has its own repos and boards. Ask: "Azure DevOps replaces GitHub and/or Jira. Deselect GitHub and/or Jira?" (Yes/No)

### Post-Selection Summary
Print selected/skipped items (including auto-selected Newman if Postman chosen), pipeline impact, and dependency warnings. Ask: "Proceed with these selections?" (Yes/No).

---

## Dependency Warnings (Soft, Non-Blocking)

| Selected | But NOT | Warning |
|----------|---------|---------|
| SonarCloud | GitHub | SonarCloud CI/CD stage needs GitHub Actions |
| JFrog | GitHub | JFrog upload happens in GitHub Actions |
| JFrog | Huawei ECS | Deployment has no image source |
| Huawei ECS | JFrog | No Docker image to deploy (use ACR if Azure DevOps selected) |
| Playwright | GitHub | E2E tests run against local working directory only |
| Azure DevOps + GitHub | — | Azure DevOps has its own repos; GitHub MCP redundant |
| Azure DevOps + Jira | — | Azure DevOps has its own boards; Jira MCP redundant |
| Azure DevOps | JFrog | Azure Artifacts/ACR used instead of JFrog (no warning — both work) |
| Azure deploy target | Azure DevOps | Deployment target needs ACR image source (select Azure DevOps without JFrog) |
| Azure deploy target | JFrog | Deployment uses JFrog image source instead of ACR (both work) |
| Azure deploy target (AKS/AppService/ContainerApps/VM) | ACR + JFrog | No Docker image source — select ACR or JFrog as artifact repo |
| Azure deploy target | Azure DevOps | Azure DevOps required for ACR access — select azure-devops in Q1 |
| DDD tools | SDD | Domain model used directly without formal spec |
| Any TDD tool | GitHub | Tests not version-controlled via PRs |
| Figma | SDD (`sdd` or `openspec`) | Figma diff has no spec to compare against — disable Step 0.F |
| Figma | GitHub and Azure DevOps | figma-extract.md has no PR/pipeline destination — push SDD docs only via `git push` |
| Figma | Frontend agent | Figma-driven UI cannot be implemented — backend-only diff still useful |

---

## Conditional Config Generation

After onboarding, generate config files including only selected tools.

### mcp_settings.json
Include only selected MCP entries. If none selected: `{"mcpServers": {}}`.
Each MCP entry includes `headers` (auth) and `env` (tokens + non-secret identifiers like GITHUB_OWNER, JIRA_CLOUD_ID, SONAR_PROJECT_KEY).
The Figma entry uses `command`/`args` pattern (not URL/headers) and holds the
Figma personal access token via `--figma-api-key=...`; no env or headers block.

### .env
Include only JFrog + ECS blocks for selected services (no MCP server for JFrog).
MCP service config (Jira, GitHub, SonarCloud, Semgrep) is NOT in .env — it lives in mcp_settings.json.
Azure DevOps config (`AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_REPO`) is in .env; PAT is set via `AZURE_DEVOPS_EXT_PAT` env var at runtime.
Azure deployment config (`AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, target-specific vars) is in .env. See `service-onboarding.md` §0.10.

### ci-cd.yml
Only if GitHub selected. Stages: build (always), Sonar scan (if SonarCloud), artifact deploy+verify. If GitHub not selected, do not generate. Generate `.github/workflows/ci-cd.yml` from `references/templates/ci-cd.yml`. Artifact backend: JFrog (if selected) or GitHub Packages (if JFrog NOT selected).

### azure-pipelines.yml (deferred to Step 6)
NOT generated during onboarding. The DevOps agent creates `azure-pipelines.yml` from `references/templates/azure-pipelines.yml` during Step 6 (CI/CD) based on the actual project structure and the artifact repository selection recorded in `tool-selections.json`. Artifact backend: JFrog (if selected) or Azure Artifacts/ACR (if JFrog NOT selected).

### azure-devops-cli skill
If `azure-devops` selected, install via `skill-installer` (done in onboarding §0.9):
```bash
node .codeartsdoer/skills/skill-installer/scripts/installer.js init --target azure-devops-cli
```
This automatically installs skill files + Azure CLI + extension. NOT an MCP server — agents use the `azure-devops-cli` skill's reference files for CLI command syntax via Bash.

### sonar-project.properties
Only if SonarCloud selected.

### set-secrets.js
Only include secrets/variables for selected services.

---

## Agent Permission Updates (Methodology Skills Only)

Run `apply-tool-selections.ps1` (Windows) or `apply-tool-selections.sh` (macOS/Linux) after onboarding. Script reads `tool-selections.json` + `skill-registry.json` and updates agent frontmatter `permission.skill` blocks:

- **Adds** methodology skill keys for selected tools (mapped to appropriate agents)
- **Removes** methodology skill keys for unselected tools
- **Never touches** built-in utility skills (`ide-tool`, `doc-expert`, `pptx`, `skill-installer`, etc.)

| Skill ID | Frontmatter Keys | Granted To Agents |
|----------|-----------------|-------------------|
| `playwright` | `playwright-cli` | Tester |
| `sdd` | `creating-sdd-directory`, `managing-spec/design/tasks-document` | PM, Backend, Frontend, Architect |
| `openspec` | `openspec` | PM, Backend, Frontend, Architect |
| `postman` | `postman` | Backend, Architect |
| `newman` | `newman` | Backend |
| `jest` | `jest` | Backend, Frontend |
| `pytest` | `pytest` | Backend |
| `junit` | `junit` | Backend |
| `vitest` | `vitest` | Backend, Frontend |
| `context-mapper` | `context-mapper` | Architect |
| `eventstorming` | `eventstorming` | Architect |
| `structurizr` | `structurizr` | Architect |
| `azure-devops` | `azure-devops-cli` | PM, Backend, Frontend, DevOps |
| `azure-app-service` | `azure-devops-cli` | DevOps |
| `azure-container-apps` | `azure-devops-cli` | DevOps |
| `azure-aks` | `azure-devops-cli` | DevOps |
| `azure-vm` | `azure-devops-cli` | DevOps |
| `figma` | `brainstorming`, `managing-spec-document`, `managing-design-document` | figma-design |

---

## Conditional Pipeline Execution

| Step | Conditional Logic |
|------|-------------------|
| 0.F  | If `figma` NOT selected -> skip (entire Step 0.F is opt-in). If `figma` selected but no SDD directory exists -> skip. Always read figma-extract.md (or skip if absent) in 0.DA / 3 / 5. |
| 0.DA | If NO methodology tools -> skip. SDD -> spec creation. TDD -> test layer mapping. DDD -> domain model. If `figma` selected -> incorporate figma-extract.md tokens into design.md (read-only consumption). |
| 1 | If `jira` NOT selected -> skip Jira tasks. If `github` NOT selected -> analyze local dir. `prd` always available. |
| 1b | If `jira` NOT selected -> skip review. If `github` NOT selected -> local diff review. |
| 2 | If `jira` NOT selected -> skip sprint. If `sdd`/`openspec` NOT selected -> skip SDD. |
| 3 | If `github` NOT selected -> no branches/PRs, commit locally. If `semgrep` NOT selected -> skip pre-scan. If `figma` selected -> Frontend reads figma-extract.md for design tokens, components, and assets. |
| 4 | If `github` NOT selected -> skip entirely. If `semgrep` NOT selected -> skip cross-referencing. |
| 5 | If `playwright` NOT selected -> skip E2E. If `github` NOT selected -> test local dir. If `figma` selected -> Tester runs visual diff (Playwright screenshot vs locally-saved Figma image). |
| 6 | If `github` NOT selected -> skip. If `sonarcloud` NOT selected -> remove SonarCloud tasks from Build stage. If `jfrog` NOT selected -> remove JFrog stages. |
| 7 | If `github` NOT selected -> skip merge. |
| 8 | If `huawei-ecs` NOT selected AND no Azure deploy target selected -> skip. If `jfrog` NOT selected but deployment target IS -> use ACR image source (if `azure-devops` selected) or warn. Azure deploy targets: `azure-app-service` (PaaS), `azure-container-apps` (serverless), `azure-aks` (K8s), `azure-vm` (IaaS). |
| 9 | If `jira` NOT selected -> skip sprint close. Report always runs. |
