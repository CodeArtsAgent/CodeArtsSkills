# Step 0 - Service Onboarding Guide

Walk the user through platform setup. Ask questions, collect answers, fill templates.

> Keep ALL user-facing messages short. Do NOT expose internal agent roles or pipeline details.

---

## 0.0 - Auto-Provision Agent Definition Files & skill-installer

Copy 7 agent files from `references/agents/` to `.codeartsdoer/agents/`. Install `skill-installer` from GitHub. Idempotent. No user action needed.

**Agent files**: `pm-agent.md`, `backend-agent.md`, `frontend-agent.md`, `code-reviewer-agent.md`, `tester-agent.md`, `devops-agent.md`, `architect-agent.md`

```bash
mkdir -p .codeartsdoer/agents
cp .codeartsdoer/skills/sdlc-agentic-pipeline/references/agents/*.md .codeartsdoer/agents/
```

**skill-installer** (built-in utility skill — installs Playwright, OpenSpec, etc.):

```bash
npx -y skills add https://github.com/CodeArtsAgent/CodeArtsSkills --skill skill-installer -a codearts-agent --copy -y
```

Verify all 7 agent files + `.codeartsdoer/skills/skill-installer/SKILL.md` exist before proceeding.

---

## 0.0.5 - Multi-Tool Selection

PM Agent presents 4 grouped multiselect questions via `question` tool. See `multi-tool-selection-plan.md` for full details: question text, options, selection rules, post-selection summary, dependency warnings, and config generation logic.

Selections persisted to `.codeartsdoer/tool-selections.json`. Drives all downstream behavior.

---

## 0.1 - GitHub Onboarding (if `github` selected)

> **IMPORTANT:** The repository must already exist before onboarding. Repo creation is manual — the pipeline never creates repos.

1. Ask: repo owner, repo name, PAT
2. Verify access via `github_get_file_contents`
3. Inventory existing artifacts (Dockerfiles, docker-compose.yml, ci-cd.yml)
4. Ask: development intent (new features, bug fixes, etc.)
5. Ask: branch strategy (existing develop, GitFlow dev, trunk-based, custom)
6. Persist selected integration branch for all downstream agents

### Config Output
- `mcp_settings.json` -> `github` entry (headers + `env`: `GITHUB_OWNER`, `GITHUB_REPO`)

---

## 0.2 - Jira Onboarding (if `jira` selected)

1. Ask: Jira site URL, email, API token, project key
2. Verify via `atlassian-rovo-mcp_getVisibleJiraProjects`
3. Discover cloud ID via: `https://<my-site-name>.atlassian.net/_edge/tenant_info` (returns `{"cloudId":"<your_cloud_id>"}`)

### Config Output
- `mcp_settings.json` -> `atlassian-rovo-mcp` entry (headers + `env`: `JIRA_CLOUD_ID`, `JIRA_PROJECT_KEY`)

> **WARNING:** See `critical-warnings.md#WARN-JIRA-401` — direct site URL returns 401. Use API gateway.

---

## 0.3 - SonarCloud Onboarding (if `sonarcloud` selected)

1. Ask: SonarCloud organization key, project key, token
2. Verify via `sonarqube_get_project_quality_gate_status`
3. **MUST disable Automatic Analysis** (see `critical-warnings.md#WARN-SONAR-AUTO`)

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

1. Ask: JFrog platform URL, username, password/access token, project key, Docker repo key
2. Verify: `GET /artifactory/api/repositories` with Bearer token

### Config Output
- `.env` -> `JFROG_PLATFORM_URL`, `JFROG_USERNAME`, `JFROG_PASSWORD`, `JFROG_PROJECT`, `JFROG_DOCKER_REGISTRY`, `JFROG_REPO_KEY` (no MCP server for JFrog)
- GitHub secrets: `JFROG_PASSWORD`
- GitHub variables: `JFROG_PLATFORM_URL`, `JFROG_DOCKER_REGISTRY`, `JFROG_USERNAME`, `JFROG_PROJECT`

> **WARNING:** See `critical-warnings.md#WARN-JFROG-REPO-NAME` — no underscores in repo names.

---

## 0.6 - Huawei Cloud ECS Onboarding (if `huawei-ecs` selected)

1. Ask: ECS host, ECS user, SSH key path
2. Option A: existing instance — verify SSH access
3. Option B: new instance with Terraform — see `devops-agent.md` §"Terraform MCP Server"
4. Run `add_ssh_key.py` to configure SSH key-based auth
5. Verify Docker installed and running on ECS
6. Configure Docker login to JFrog registry on ECS

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

## 0.8 - Methodology Tool Setup (if any methodology skills selected)

For each selected methodology tool, verify/install/connect/smoke-test:

| Tool | Verify | Install | Smoke Test |
|------|--------|---------|------------|
| SDD Toolkit | N/A (built-in) | N/A | N/A |
| OpenSpec | `openspec --version` | `npm install -g @fission-ai/openspec@latest` | `openspec list` |
| Postman | N/A (MCP) | N/A | `postman MCP list workspaces` |
| Newman | `newman --version` | `npm install -g newman` | `newman run --version` |
| Jest | `npx jest --version` | `npm i -D jest` | `npx jest --listTests` |
| Pytest | `pytest --version` | `pip install pytest` | `pytest --collect-only` |
| JUnit | N/A | Add to pom.xml/build.gradle | `mvn test` / `gradle test` |
| Vitest | `npx vitest --version` | `npm i -D vitest` | `npx vitest list` |
| Context Mapper | N/A | N/A | N/A |
| EventStorming | N/A | N/A | N/A |
| Structurizr | N/A | N/A | N/A |

**Failure rule:** If a tool fails its smoke test, report to user, skip that tool, and continue with remaining tools.

After install, run `apply-tool-selections.ps1` (Windows) or `apply-tool-selections.sh` (macOS/Linux) to update agent frontmatter permissions based on `tool-selections.json` + `skill-registry.json`.

---

## Config File Generation

After all selected services are onboarded, generate config files from templates in `references/templates/`:

| Template | Conditional |
|----------|-------------|
| `mcp-settings.json` | Only selected MCP entries |
| `ci-cd.yml` | Only selected stages; skip if GitHub not selected |
| `sonar-project.properties` | Only if SonarCloud selected |
| `env-template.env` | Only selected service blocks |
| `set-secrets.js` | Run to set GitHub Actions secrets/variables |

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
