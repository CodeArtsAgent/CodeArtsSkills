# Step 0 - Service Onboarding Guide

Walk the user through platform setup. Ask questions, collect answers, fill templates.

> Keep ALL user-facing messages short. Do NOT expose internal agent roles or pipeline details.

---

## 0.0 - Auto-Provision Agent Definition Files, skill-installer & Brainstorming

Copy 8 agent files + 1 shared base file from `references/agents/` to `.codeartsdoer/agents/`. Install `skill-installer` from GitHub. Copy bundled `sdlc-brainstorming` skill into `.codeartsdoer/skills/`. Idempotent. No user action needed.

**Agent files**: `pm-agent.md`, `backend-agent.md`, `frontend-agent.md`, `code-reviewer-agent.md`, `tester-agent.md`, `devops-agent.md`, `architect-agent.md`, `figma-design-agent.md`
**Shared base**: `shared/developer-agent-base.md` (inherited by backend & frontend agents via `[OVERRIDE]`)

```bash
mkdir -p .codeartsdoer/agents/shared
cp .codeartsdoer/skills/sdlc-agentic-pipeline/references/agents/*.md .codeartsdoer/agents/
cp .codeartsdoer/skills/sdlc-agentic-pipeline/references/agents/shared/*.md .codeartsdoer/agents/shared/
```

**skill-installer** (built-in utility skill — installs Playwright, OpenSpec, etc.):

```bash
npx -y skills add https://github.com/CodeArtsAgent/CodeArtsSkills --skill skill-installer -a codearts-agent --copy -y
```

**Brainstorming** (bundled hard copy — visual companion for interactive spec/requirement brainstorming):

```bash
cp -r .codeartsdoer/skills/sdlc-agentic-pipeline/skills/sdlc-brainstorming .codeartsdoer/skills/sdlc-brainstorming
```

Verify all 8 agent files, `.codeartsdoer/agents/shared/developer-agent-base.md`, `.codeartsdoer/skills/skill-installer/SKILL.md`, and `.codeartsdoer/skills/sdlc-brainstorming/sdlc-SKILL.md` exist before proceeding.

---

## 0.0.5 - Multi-Tool Selection

PM Agent presents 4 grouped multiselect questions via `question` tool. See `multi-tool-selection-plan.md` for full details: question text, options, selection rules, post-selection summary, dependency warnings, and config generation logic.

Selections persisted to `.codeartsdoer/tool-selections.json`. Drives all downstream behavior.

---

## 0.1 - GitHub Onboarding (if `github` selected)

> **IMPORTANT:** The repository must already exist before onboarding. Repo creation is manual — the pipeline never creates repos.

1. Ask via `question` tool: repo owner, repo name, PAT
2. Verify access via `github_get_file_contents`
3. Inventory existing artifacts (Dockerfiles, docker-compose.yml, ci-cd.yml)
4. Ask via `question` tool: development intent (new features, bug fixes, etc.)
5. Ask via `question` tool: branch strategy (existing develop, GitFlow dev, trunk-based, custom)
6. Persist selected integration branch for all downstream agents

### Config Output
- `mcp_settings.json` -> `github` entry (headers + `env`: `GITHUB_OWNER`, `GITHUB_REPO`)

---

## 0.2 - Jira Onboarding (if `jira` selected)

1. Ask via `question` tool: Jira site URL, email, API token, project key
2. Verify via `atlassian-rovo-mcp_getVisibleJiraProjects`
3. Discover cloud ID via: `https://<my-site-name>.atlassian.net/_edge/tenant_info` (returns `{"cloudId":"<your_cloud_id>"}`)

### Config Output
- `mcp_settings.json` -> `atlassian-rovo-mcp` entry (headers + `env`: `JIRA_CLOUD_ID`, `JIRA_PROJECT_KEY`)

> **WARNING:** See `critical-warnings.md#WARN-JIRA-401` — direct site URL returns 401. Use API gateway.

---

## 0.3 - SonarCloud Onboarding (if `sonarcloud` selected)

1. Ask via `question` tool: SonarCloud organization key, project key, token
2. Verify via `sonarqube_get_project_quality_gate_status`
3. **MUST disable Automatic Analysis** (see `critical-warnings.md#WARN-SONAR-AUTO`)
4. **Azure DevOps mode — manual step:** Configure SonarCloud service connection in Azure DevOps (only if Azure Pipelines is used externally):
   Getting started guide: https://docs.sonarsource.com/sonarqube-cloud/getting-started/azure-devops
   Project integration: https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/azure-pipelines/setting-up-project-integration
   This creates the "SonarCloud Service Connection" required by `SonarCloudPrepare@4` task. NOTE: The pipeline does NOT create `azure-pipelines.yml` — this step is only needed if the user has a pre-existing Azure Pipelines setup.

### Config Output
- `mcp_settings.json` -> `sonarqube` entry (headers + `env`: `SONAR_PROJECT_KEY`)
- `sonar-project.properties`
- GitHub secret: `SONAR_TOKEN`

---

## 0.4 - Semgrep Onboarding (if `semgrep` selected)

1. Install Semgrep CLI:
   - macOS/Linux: `pip install semgrep` (or `brew install semgrep`)
   - Windows: `pip install semgrep`
2. Discover executable path:
   - macOS/Linux: `which semgrep`
   - Windows: `where semgrep`
3. Verify: `semgrep --version`
4. Verify MCP connection

### Config Output
- `mcp_settings.json` -> `semgrep` entry (command: executable path)

---

## 0.5 - JFrog Artifactory Onboarding (if `jfrog` selected)

1. Ask via `question` tool: JFrog platform URL, username, password/access token, project key, Docker repo key
2. Verify: `GET /artifactory/api/repositories` with Bearer token

### Config Output
- `.env` -> `JFROG_PLATFORM_URL`, `JFROG_USERNAME`, `JFROG_PASSWORD`, `JFROG_PROJECT`, `JFROG_DOCKER_REGISTRY`, `JFROG_REPO_KEY` (no MCP server for JFrog)
- GitHub secrets: `JFROG_PASSWORD`
- GitHub variables: `JFROG_PLATFORM_URL`, `JFROG_DOCKER_REGISTRY`, `JFROG_USERNAME`, `JFROG_PROJECT`

> **WARNING:** See `critical-warnings.md#WARN-JFROG-REPO-NAME` — no underscores in repo names.

---

## 0.6 - Huawei Cloud ECS Onboarding (if `huawei-ecs` selected)

1. Ask via `question` tool: ECS host, ECS user, SSH key path
2. Option A: existing instance — verify SSH access
3. Option B: new instance with Terraform — see `devops-agent.md` §"Terraform MCP Server"
4. Run `add_ssh_key.py` to configure SSH key-based auth
5. Verify Docker installed and running on ECS
6. Configure Docker login to registry on ECS:
   - **JFrog mode:** `docker login <JFROG_DOCKER_REGISTRY> -u <JFROG_USERNAME> -p <JFROG_PASSWORD>`
   - **Azure DevOps mode (no JFrog):** `docker login <ACR_NAME>.azurecr.io -u <ACR_NAME> -p $(az acr credential show -n <ACR_NAME> --query passwords[0].value -o tsv)`

### Config Output
- `.env` -> `HUAWEI_ECS_HOST`, `HUAWEI_ECS_USER`, `HUAWEI_ECS_SSH_KEY_PATH`

---

## 0.7 - Playwright Install (if `playwright` selected)

Invoke `skill-installer` to install playwright-cli (skill files + CLI + browser + dry-run check):

```bash
node .codeartsdoer/skills/skill-installer/scripts/installer.js init --target playwright-cli
```

This single command replaces manual npm install + browser download + skill file provisioning. Verify: `node .codeartsdoer/skills/skill-installer/scripts/installer.js status --target playwright-cli`.

---

## 0.9 - Azure DevOps CLI (if `azure-devops` selected)

> **IMPORTANT:** The Azure DevOps project and repository must already exist before onboarding. Project and repo creation is manual — the pipeline never creates them.

> All steps below are **executed automatically by the PM Agent via the Bash tool**.
> The user only provides answers (org URL, project, repo name, PAT) via the `question` tool.

### 0.9.1 Collect User Input
Ask via `question` tool:
1. Azure DevOps organization URL (e.g., `https://dev.azure.com/<org>`)
2. Azure DevOps project name
3. PAT token (Azure DevOps -> User Settings -> Personal Access Tokens)
   - Required scopes: Code (read+write), Work Items (read+write), Build (read+execute)
4. Repository name (must already exist — repo creation is manual, same as GitHub)
5. Azure DevOps user email for work item assignment (e.g., `user@email.com`) — used as `--assigned-to` when creating Azure DevOps work items ONLY. Do NOT use this email for GitHub operations — GitHub uses `GITHUB_OWNER` from the GitHub onboarding (§0.1).

### 0.9.2 Auto-Install via skill-installer (PM Agent MUST run this via Bash)

> **CRITICAL:** This step is MANDATORY when `azure-devops` is selected. The PM Agent
> MUST execute this command — do NOT skip it. If the `apply-tool-selections` script
> already triggered the install, verify with `status` instead.

Invoke `skill-installer` to install azure-devops-cli (skill files + Azure CLI + extension + status check):

```bash
node .codeartsdoer/skills/skill-installer/scripts/installer.js init --target azure-devops-cli
```

This single command automatically:
1. Installs the `azure-devops-cli` skill files from `github/awesome-copilot`
2. Checks for Azure CLI (`az --version`) — installs if missing
3. Installs the `azure-devops` CLI extension
4. Registers the skill in `ProjectSkillStatus.txt`
5. Writes a manifest for clean uninstall

Verify: `node .codeartsdoer/skills/skill-installer/scripts/installer.js status --target azure-devops-cli`

### 0.9.3 Configure & Authenticate (PM Agent runs these via Bash)

**Configure defaults:**
> agents use Bash to run `az` commands. See the `azure-devops-cli` skill's reference files for full CLI command syntax.
```bash
az devops configure --defaults organization=<AZURE_DEVOPS_ORG_URL> project="<AZURE_DEVOPS_PROJECT>"
```

**Authenticate non-interactively (persistent, user-level env var):**
> Set `AZURE_DEVOPS_EXT_PAT` as a **user-level** environment variable so it
> persists across all sessions, processes, and agent invocations. The Azure
> DevOps CLI extension reads it automatically — no interactive `az devops login`
> prompt needed. Every agent's Bash tool shell inherits it.

**Windows (PowerShell — persists to registry, survives reboot):**
```powershell
[System.Environment]::SetEnvironmentVariable("AZURE_DEVOPS_EXT_PAT", "<PAT>", "User")
```
> After setting a User-level env var, **existing** shells do NOT see it
> automatically — restart CodeArts (or open a new shell) for it to take effect.

**Linux / macOS (append to shell rc file):**
```bash
echo 'export AZURE_DEVOPS_EXT_PAT="<PAT>"' >> ~/.bashrc   # bash
echo 'export AZURE_DEVOPS_EXT_PAT="<PAT>"' >> ~/.zshrc    # zsh
```
> Then `source ~/.bashrc` (or restart the shell) so the current session picks it up.

The PAT is stored in the OS user profile (Windows registry / Unix shell rc),
**never** in the repo or `.env`. It is readable by all agents across sessions.

**Verify the env var is visible to the current shell before proceeding:**
```bash
# Linux / macOS / Git Bash:
test -n "$AZURE_DEVOPS_EXT_PAT" && echo "PAT is set" || echo "PAT is NOT set"
```
```powershell
# Windows PowerShell:
if ($env:AZURE_DEVOPS_EXT_PAT) { "PAT is set" } else { "PAT is NOT set" }
```

**Smoke test:**
```bash
az devops project show
```
If this succeeds, Azure DevOps is fully configured and ready.

### Config Output
- `.env` -> `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_REPO`
- PAT is set via `AZURE_DEVOPS_EXT_PAT` **user-level** env var (persists across sessions; stored in OS user profile, not in any repo file)

> **Coexistence:** Azure DevOps can coexist with GitHub and Jira. When both are selected, agents route by platform — Azure DevOps CLI for Azure Repos/Boards/Pipelines, GitHub MCP for GitHub repos/issues, Jira MCP for Jira boards. No deselection is required.

### 0.9.4 Azure Container Registry Setup (only if `jfrog` NOT selected)

> Skip this section entirely if `jfrog` was selected — JFrog Artifactory handles Docker images and build artifacts instead.

When `azure-devops` is selected but `jfrog` is NOT, ask the user via `question` tool which artifact repository to use:

> **Question:** Which artifact repository will you use?
> - Azure Artifacts (build output only — Pipeline Artifacts)
> - Azure Container Registry (Docker images only)
> - JFrog Artifactory (both — redirects to §0.5, sets `jfrog` to true)
> - None (skip artifact publishing — e.g., library project with no deployable artifacts)

Based on the selection, the artifact repository choice is recorded in `tool-selections.json` for the DevOps agent to use when generating the pipeline yml during Step 6 (CI/CD). The pipeline file is NOT created during onboarding — the DevOps agent generates it at Step 6 based on tool selections (`github` → `ci-cd.yml`, `azure-devops` → `azure-pipelines.yml`, both → ask user via `question` tool which one to generate).
- **Azure Artifacts**: `DeployToAzureArtifacts` (PublishPipelineArtifact only) + `VerifyAzureArtifacts` stages
- **ACR**: `DeployToAzureArtifacts` (Docker build + push to ACR only) + `VerifyAzureArtifacts` stages
- **JFrog**: `DeployToJFrog` + `VerifyJFrog` stages only (skip §0.9.4 entirely)
- **None**: No deploy/verify stages — pipeline has Build stage only. Skip steps 1-6 below.

1. Ask via `question` tool: ACR name (must be globally unique, alphanumeric only, 5-50 chars)
2. Ask via `question` tool: Azure resource group name (must already exist)
3. Ask via `question` tool: Create new ACR or use existing?
   - **New:** Create ACR (PM Agent runs this via Bash):
     ```bash
     az acr create -n <ACR_NAME> -g <RESOURCE_GROUP> --sku Basic
     ```
   - **Existing:** Skip creation — verify only (step 4)
4. Verify ACR exists:
   ```bash
   az acr show -n <ACR_NAME> --query loginServer -o tsv
   ```
   Expected output: `<ACR_NAME>.azurecr.io`
5. Create two Azure DevOps service connections if not already configured (manual — via Azure DevOps UI: Project Settings → Service connections → New service connection):
   - **"Azure Container Registry"** — type: Docker Registry → Azure Container Registry. Used by `Docker@2` task to build/push images.
   - **"Azure Service Connection"** — type: Azure Resource Manager. Used by `AzureCLI@2` task to verify images in ACR via `az acr repository show`.
6. Add `ACR_NAME` to the Azure DevOps variable group:
   ```bash
   az pipelines variable-group create --name "sdlc-vars" --variables ACR_NAME=<ACR_NAME> --project <AZURE_DEVOPS_PROJECT>
   ```

### Config Output (ACR)
- `.env` -> `ACR_NAME`
- Azure DevOps Service Connection: "Azure Container Registry" (Docker Registry type, for `Docker@2`)
- Azure DevOps Service Connection: "Azure Service Connection" (Azure RM type, for `AzureCLI@2`)

---

## 0.10 - Azure Deployment Target Onboarding (if any Azure deploy target selected)

> **Optional:** This section runs only if a deployment target was selected during
> onboarding (Q1). If no target was selected, the user will be asked at Step 8
> (deploy time) and this section runs inline then.

> **Prerequisite:** `azure-devops` must be selected. ACR must be configured (§0.9.4) if `jfrog` NOT selected.
> All steps executed by PM Agent via Bash using `az` CLI.

### 0.10.0 Common Config
1. Ask via `question` tool: Azure resource group name (must already exist)
2. Ask via `question` tool: Azure location (e.g., `eastus`, `westeurope`)

### 0.10.1 Azure App Service (if `azure-app-service` selected)
> PaaS — Web Apps for Containers. Simplest Azure deployment. No SSH/VM management.
1. Ask via `question` tool: App Service name (globally unique)
2. Ask via `question` tool: App Service plan name
3. Ask via `question` tool: Create new or use existing?
   - **New:** Ask via `question` tool: SKU (e.g., `B1` basic, `S1` standard, `P1` premium), then create (PM Agent runs via Bash):
     ```bash
     az appservice plan create --name <PLAN_NAME> --resource-group <RESOURCE_GROUP> --sku <SKU> --is-linux
     az webapp create --name <APP_NAME> --resource-group <RESOURCE_GROUP> --plan <PLAN_NAME> --deployment-container-image-name <ACR_NAME>.azurecr.io/<REPO_NAME>:latest
     ```
   - **Existing:** Skip creation — verify with `az webapp show --name <APP_NAME> --resource-group <RESOURCE_GROUP>`

### Config Output
- `.env` -> `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_APP_SERVICE_NAME`, `AZURE_APP_SERVICE_PLAN`

### 0.10.2 Azure Container Apps (if `azure-container-apps` selected)
> Serverless containers — auto-scaling, KEDA-based. Good for microservices.
1. Ask via `question` tool: Container Apps environment name
2. Ask via `question` tool: Container app name
3. Ask via `question` tool: Target port (e.g., `80`, `8080`)
4. Ask via `question` tool: Create new or use existing?
   - **New:** Create managed environment + container app (PM Agent runs via Bash):
     ```bash
     az containerapp env create --name <ENV_NAME> --resource-group <RESOURCE_GROUP> --location <LOCATION>
     az containerapp create --name <APP_NAME> --resource-group <RESOURCE_GROUP> --environment <ENV_NAME> --image <ACR_NAME>.azurecr.io/<REPO_NAME>:latest --ingress external --target-port <PORT>
     ```
   - **Existing:** Skip creation — verify with `az containerapp show --name <APP_NAME> --resource-group <RESOURCE_GROUP>`
   ```

### Config Output
- `.env` -> `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_CONTAINER_APP_NAME`, `AZURE_CONTAINER_APP_ENV`

### 0.10.3 Azure Kubernetes Service (if `azure-aks` selected)
> Full Kubernetes cluster — for complex multi-service deployments. AKS cluster must already exist.
1. Ask via `question` tool: AKS cluster name (must already exist)
2. Ask via `question` tool: Kubernetes namespace (e.g., `default`, `production`)
3. Ask via `question` tool: Kubernetes deployment name
4. Ask via `question` tool: Container name in deployment
5. Get AKS credentials (PM Agent runs via Bash):
   ```bash
   az aks get-credentials --name <AKS_CLUSTER> --resource-group <RESOURCE_GROUP>
   ```
6. Verify cluster access:
   ```bash
   kubectl get nodes
   ```

### Config Output
- `.env` -> `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_AKS_CLUSTER`, `AZURE_AKS_NAMESPACE`, `AZURE_AKS_DEPLOYMENT`, `AZURE_AKS_CONTAINER`

### 0.10.4 Azure VM (if `azure-vm` selected)
> IaaS — closest to Huawei ECS pattern (SSH + Docker pull + run). VM must already exist.
1. Ask via `question` tool: VM name (must already exist)
2. Ask via `question` tool: SSH username
3. Ask via `question` tool: SSH key path (local path to private key)
4. Get VM public IP (PM Agent runs via Bash):
   ```bash
   az vm show --name <VM_NAME> --resource-group <RESOURCE_GROUP> --show-details --query publicIps -o tsv
   ```
5. Verify SSH access:
   ```bash
   ssh -i <SSH_KEY_PATH> <USER>@<VM_IP> "echo connected"
   ```
6. Verify Docker installed on VM:
   ```bash
   ssh -i <SSH_KEY_PATH> <USER>@<VM_IP> "docker --version"
   ```
7. Configure Docker login to ACR on VM:
   ```bash
   ACR_PASSWORD=$(az acr credential show -n <ACR_NAME> --query passwords[0].value -o tsv)
   ssh -i <SSH_KEY_PATH> <USER>@<VM_IP> "docker login <ACR_NAME>.azurecr.io -u <ACR_NAME> -p $ACR_PASSWORD"
   ```

### Config Output
- `.env` -> `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_VM_NAME`, `AZURE_VM_USER`, `AZURE_VM_SSH_KEY_PATH`

---

## 0.8 - Methodology Tool Setup (if any methodology skills selected)

For each selected methodology tool, verify/install/connect/smoke-test:

| Tool | Verify | Install | Smoke Test |
|------|--------|---------|------------|
| SDD Toolkit | N/A (built-in) | N/A | N/A |
| OpenSpec | `openspec --version` | `npm install -g @fission-ai/openspec@latest` | `openspec list` |
| Postman | N/A (MCP) | Copy `references/templates/postman-skill.md` to `.codeartsdoer/skills/postman/SKILL.md` | `postman MCP list workspaces` |
| Newman | `newman --version` | `npm install -g newman` | `newman run --version` |
| Jest | `npx jest --version` | `npm i -D jest` | `npx jest --listTests` |
| Pytest | `pytest --version` | `pip install pytest` | `pytest --collect-only` |
| JUnit | N/A | Add to pom.xml/build.gradle | `mvn test` / `gradle test` |
| Vitest | `npx vitest --version` | `npm i -D vitest` | `npx vitest list` |
| Context Mapper | N/A | N/A | N/A |
| EventStorming | N/A | N/A | N/A |
| Structurizr | N/A | N/A | N/A |

**Postman MCP config** (`mcp_settings.json`): HTTP type, URL `https://mcp.postman.com/mcp`, headers `Authorization: Bearer <POSTMAN_API_KEY>` (PMAK from Settings -> API Keys).

**Newman cloud collections**: `newman run "https://api.getpostman.com/collections/<id>?apikey=$POSTMAN_API_KEY"` (API key via env var only).

**Failure rule:** If a tool fails its smoke test, report to user, skip that tool, and continue with remaining tools.

After install, run `apply-tool-selections.ps1` (Windows) or `apply-tool-selections.sh` (macOS/Linux) to update agent frontmatter permissions based on `tool-selections.json` + `skill-registry.json`.

---

## 0.11 - Figma Onboarding (if `figma` selected)

> **EXCLUSIVE CONSUMER RULE:** Figma MCP (`figma.get_figma_data`,
> `figma.download_figma_images`) is consumed **EXCLUSIVELY** by
> `figma-design-agent` (`references/agents/figma-design-agent.md`). No other
> agent (Architect, Backend, Frontend, Tester, Code Reviewer, DevOps) calls
> Figma MCP directly — they read `figma-extract.md` and the SDD docs that
> `pm-agent` produces after user confirmation.

### 0.11.1 Collect User Input
Ask via `question` tool:
1. Figma personal access token (Figma -> Settings -> Personal Access Tokens)
   - Required scope: `File content: read` (and optionally `Dev resources: read`
     for Code Connect mappings)
2. (Optional) Default Figma file URL — used as the starting point for
   `figma-design-agent` invocations. Can be changed per-run.

> **Security:** The token is held by the Figma MCP at runtime (via
> `--figma-api-key=...`). It is NOT written to `mcp_settings.json` headers
> nor to `.env` — Figma MCP injects it via its own CLI args.

### 0.11.2 Configure `mcp_settings.json`
Append the `figma` entry (see `references/templates/mcp-settings.json` and
`references/config-reference.md` "MCP Servers Required"):

```json
"figma": {
  "command": "npx",
  "args": ["-y", "figma-developer-mcp", "--stdio", "--figma-api-key=<FIGMA_PERSONAL_ACCESS_TOKEN>"],
  "disabled": false,
  "timeout": 30000
}
```

> **Note:** Placeholder `<FIGMA_PERSONAL_ACCESS_TOKEN>` is replaced by the
> PM Agent after the user provides the token during onboarding. The MCP
> server reads it from the `--figma-api-key` arg at startup.

### 0.11.3 Auto-Provision `figma-design-agent`
Step 0.0 already copies all `*-agent.md` files (including
`figma-design-agent.md`) into `.codeartsdoer/agents/`. Verify:

```bash
ls .codeartsdoer/agents/figma-design-agent.md
```

The agent's `mcp_tools.figma: true` grants it access to the Figma MCP; all
other agents have `mcp_tools.figma` absent or false (do not add it).

### 0.11.4 Verify Figma MCP Connection
1. Run a probe call from `figma-design-agent` (preferred) or via MCP
   inspector:
   ```bash
   figma.get_figma_data(fileKey="<probe-file-key>")
   ```
   If the call returns Figma node tree data, onboarding is complete.
2. If the call fails with `401 Unauthorized`:
   - Re-check the personal access token (Settings -> Personal Access Tokens)
   - Verify the token has `File content: read` scope
   - Confirm `--figma-api-key` is set in `mcp_settings.json` args

### 0.11.5 Smoke Test (Optional)
User provides any Figma file URL (read access) for a sanity check.
`figma-design-agent` runs `figma.get_figma_data` on it, confirms the
extraction, and discards the probe result. If smoke test fails, abort
onboarding and ask the user to fix the token before continuing.

### Config Output
- `mcp_settings.json` -> `figma` entry (command/args pattern, NOT headers)
- `.codeartsdoer/agents/figma-design-agent.md` (auto-provisioned by Step 0.0)
- No `.env` entry needed (token held by MCP server via CLI args)
- No GitHub/Azure DevOps secret needed (token is local-MCP only)

### Dependency Warnings
| Selected | But NOT | Warning |
|----------|---------|---------|
| Figma | SDD (`sdd` or `openspec`) | Figma diff has no requirement.md to compare against — disable Step 0.F |
| Figma | GitHub and Azure DevOps | figma-extract.md has no PR/pipeline destination — push SDD docs only via `git push` |
| Figma | Frontend agent | Figma-driven UI cannot be implemented — backend-only diff still useful |

### Post-Onboarding
After Step 0.11 succeeds, the pipeline is Figma-ready. The user provides a
raw requirement + Figma URL + node-id to `pm-agent` (the entry point) when:
- A new Figma file is shared alongside a new requirement
- A design change needs to be validated against an approved `requirement.md`
- Onboarding flow hands off a Figma file + SDD package for diff review

`figma-design-agent` produces `figma-extract.md` only. After user confirmation,
`pm-agent` updates `requirement.md` + creates `tasks.md`. `figma-design-agent`
hands off to `pm-agent`, which breaks down tasks per `tasks.md`, creates the
Epic → Issue → Task hierarchy, pushes work items to Azure DevOps, and then
proceeds to Step 0.DA and the standard pipeline. Steps
0.DA (Architect), 3 (Frontend/Backend), and 5 (Tester) all read Figma data
from these files — none call Figma MCP.

---

## Config File Generation

After all selected services are onboarded, generate config files from templates in `references/templates/`:

| Template | Conditional |
|----------|-------------|
| `mcp-settings.json` | Only selected MCP entries |

| `sonar-project.properties` | Only if SonarCloud selected |
| `env-template.env` | Only selected service blocks |
| `set-secrets.js` | Run to set GitHub Actions secrets/variables |

> **NOTE:** `ci-cd.yml` (GitHub Actions) and `azure-pipelines.yml` (Azure Pipelines) are NOT generated during onboarding. The DevOps agent generates them during Step 6 (CI/CD) based on tool selections: `github` selected → `.github/workflows/ci-cd.yml`; `azure-devops` selected → `azure-pipelines.yml`; both → ask user via `question` tool which one to generate.

Write to `.codeartsdoer/mcp/mcp_settings.json` and project root `.env`.

---

## Manual Integrations Required

These cross-platform links must be configured manually (not automatable):
1. GitHub <-> Jira
2. GitHub <-> SonarCloud
3. GitHub <-> Semgrep

---

## Post-Onboarding Verification

1. Verify all selected MCP servers are connected in IDE
2. Verify `.env` has all required variables
3. Verify `mcp_settings.json` has all selected MCP entries
4. Verify agent files in `.codeartsdoer/agents/` have updated permissions
5. Run `apply-tool-selections` script to finalize permissions
6. Proceed to Step 0.DA (if methodology tools selected) or Step 1
