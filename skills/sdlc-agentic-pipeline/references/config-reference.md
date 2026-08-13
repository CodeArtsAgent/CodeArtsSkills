# Config Templates & Runtime Files Reference

> This file is the **single source of truth** for template and config file
> descriptions. Referenced by `SKILL.md` and `pipeline.md`.

---

## Template Files (`references/templates/`)

Ready-to-fill templates are in `references/templates/`:

| Template | Description |
|----------|-------------|
| `mcp-settings.json` | MCP server configuration with `env` blocks for non-secret identifiers (conditional: only selected MCP entries included) |
| `ci-cd.yml` | GitHub Actions workflow template — NOT generated during onboarding; DevOps agent generates it at Step 6 if `github` selected |
| `azure-pipelines.yml` | Azure Pipelines workflow template — NOT generated during onboarding; DevOps agent generates it at Step 6 if `azure-devops` selected. Artifact backend: JFrog (if selected) or Azure Artifacts/ACR (if JFrog NOT selected) |
| `sonar-project.properties` | SonarCloud project configuration (only if SonarCloud selected) |
| `env-template.env` | Environment variables — JFrog + ECS + Azure DevOps + ACR config (MCP service config lives in mcp_settings.json) |
| `set-secrets.js` | GitHub Actions secrets/variables setup script (conditional: only selected service secrets/vars) |
| `add_ssh_key.py` | Python script to add SSH public key to Huawei Cloud ECS for key-based authentication |
| `apply-tool-selections.ps1` | Windows: updates agent `permission.skill` blocks based on `tool-selections.json` + `skill-registry.json` (methodology skills only, never touches built-in) |
| `apply-tool-selections.sh` | macOS/Linux: same as above |
| `postman-skill.md` | Postman MCP skill definition (TDD: API layer) |
| `sprint-scripts/` | Cross-platform sprint management scripts (see below) |

### Sprint Scripts (`references/templates/sprint-scripts/`)

| Script | Platform | Usage |
|--------|----------|-------|
| `sprint-start.ps1` | Windows | `powershell -NoProfile -ExecutionPolicy Bypass -File "sprint-start.ps1"` |
| `sprint-start.sh` | macOS/Linux | `chmod +x sprint-start.sh && ./sprint-start.sh` |
| `sprint-close.ps1` | Windows | `powershell -NoProfile -ExecutionPolicy Bypass -File "sprint-close.ps1"` |
| `sprint-close.sh` | macOS/Linux | `chmod +x sprint-close.sh && ./sprint-close.sh` |

> **Security:** Delete script files after execution — they contain auth tokens.

---

## Runtime Config Files (generated during onboarding, not templates)

| File | Description |
|------|-------------|
| `.codeartsdoer/tool-selections.json` | User's tool selections (written in Step 0.0.5, read by all agents). Local only — add to `.gitignore`. |
| `references/skill-registry.json` | Methodology skill registry (v2) — single source of truth for selectable skills, grouped by methodology (SDD/TDD/DDD). Drives selection UI, config generation, agent permission logic, and methodology tool setup (Step 0.8). |

---

## MCP Servers Required

> **Conditional:** MCP servers are configured **only for selected tools**.
> If a tool is not selected, its MCP entry is omitted from
> `mcp_settings.json`. If no MCP servers are selected, the pipeline runs
> in local-only mode.

| MCP Server | Purpose | Auth | `env` Fields |
|------------|---------|------|------------------|
| `atlassian-rovo-mcp` | Jira tasks, sprints, comments, transitions | Basic (Base64 `email:token`) | `JIRA_CLOUD_ID`, `JIRA_PROJECT_KEY` |
| `github` | Repos, branches, PRs, reviews, workflow dispatch | Bearer PAT | `GITHUB_OWNER`, `GITHUB_REPO` |
| `sonarqube` | Quality gate, issues, coverage, hotspots | Bearer token | `SONAR_PROJECT_KEY` |
| `semgrep` | Local static analysis, security scanning | App token env | — |
| `terraform` | Infrastructure as Code (ECS provisioning, Option B) | — | — |
| `postman` | API testing, collection runs | Bearer API key (HTTP) | — |
| `figma` | Design-to-code (Figma MCP) | Personal access token (CLI arg `--figma-api-key`) | — |

JFrog is configured as a service (REST API) in `<project-root>/.env` + GitHub Actions secrets/variables,
not as an MCP server. ECS config is also in `<project-root>/.env`.

**Figma MCP entry** (command/args pattern, NOT URL/headers):

```json
"figma": {
  "command": "npx",
  "args": ["-y", "figma-developer-mcp", "--stdio", "--figma-api-key=<FIGMA_PERSONAL_ACCESS_TOKEN>"],
  "disabled": false,
  "timeout": 30000
}
```

The Figma personal access token is held by the MCP server via CLI args
(never written to headers, env, or `.env`). Scope: `File content: read`
(optional: `Dev resources: read` for Code Connect). Figma MCP is consumed
EXCLUSIVELY by `figma-design-agent`; all other agents read
`specs/<YYYY-MM-DD-...>/figma-extract.md` and the SDD docs that
`figma-design-agent` updates.

Azure DevOps is configured as a CLI tool (not MCP) — org URL, project, repo name, and assigned-to user email in `<project-root>/.env`,
PAT via `AZURE_DEVOPS_EXT_PAT` **user-level** env var (persisted during onboarding, shared across all agents/sessions; the CLI auto-reads it — non-interactive, stored in OS user profile not in any repo file). Can coexist with GitHub + Jira. The `azure-devops-cli`
skill (installed from `github/awesome-copilot`) provides reference files
for Azure Repos, Boards, and Pipelines CLI command patterns for agents.
Work items are assigned to the Azure DevOps user via `--assigned-to "$AZURE_DEVOPS_ASSIGNED_TO"` at creation time. This email is Azure DevOps ONLY — do NOT use it for GitHub operations (GitHub uses `GITHUB_OWNER` from §0.1).

**Azure Artifacts/ACR** (conditional: only when `jfrog` NOT selected and `azure-devops` selected):
- Azure Container Registry (ACR) replaces JFrog Docker registry — `ACR_NAME` in `<project-root>/.env`, login server is `<ACR_NAME>.azurecr.io`
- Azure Pipeline Artifacts replace JFrog build artifacts — managed via `PublishPipelineArtifact@1` / `DownloadPipelineArtifact@2` tasks in `azure-pipelines.yml`
- ACR is created via `az acr create -n <ACR_NAME> -g <RESOURCE_GROUP> --sku Basic` (see `service-onboarding.md` §0.9.4)
- Docker images pushed to ACR via `Docker@2` task with `containerRegistry: $(ACR_NAME).azurecr.io`

**Azure Deployment Targets** (conditional: only selected targets, requires `azure-devops`):
- **Azure App Service** (`azure-app-service`): PaaS Web Apps for Containers. Deploy via `az webapp config container set`. Config: `AZURE_APP_SERVICE_NAME`, `AZURE_APP_SERVICE_PLAN` in `.env`.
- **Azure Container Apps** (`azure-container-apps`): Serverless containers. Deploy via `az containerapp update`. Config: `AZURE_CONTAINER_APP_NAME`, `AZURE_CONTAINER_APP_ENV` in `.env`.
- **Azure Kubernetes Service** (`azure-aks`): Full K8s. Deploy via `kubectl set image`. Config: `AZURE_AKS_CLUSTER`, `AZURE_AKS_NAMESPACE`, `AZURE_AKS_DEPLOYMENT`, `AZURE_AKS_CONTAINER` in `.env`.
- **Azure VM** (`azure-vm`): IaaS (SSH + Docker, same as Huawei ECS pattern). Deploy via SSH + `docker pull` + `docker run`. Config: `AZURE_VM_NAME`, `AZURE_VM_USER`, `AZURE_VM_SSH_KEY_PATH` in `.env`.
- Common config for all targets: `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION` in `.env`. Onboarding: `service-onboarding.md` §0.10.