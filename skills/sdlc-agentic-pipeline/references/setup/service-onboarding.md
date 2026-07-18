# Step 0 - Service Onboarding Guide

Before any agentic flow begins, walk the user through each platform setup one by one.
Ask the questions below, collect answers, and fill the templates at the end.

> **Communication style:** Keep ALL user-facing messages, questions, and option
> descriptions short and concise. Do NOT expose internal agent roles, pipeline
> implementation details, or lengthy explanations to the user. The user only
> needs to understand what they're choosing, not how the pipeline works internally.

---

## 0.0 - Auto-Provision Agent Definition Files (Runs First)

The 6 agent definition files are bundled inside the skill at
`references/agents/`. They must be copied to `.codeartsdoer/agents/` so the
CodeArts Agent platform can discover and invoke them. This step runs
automatically before any service onboarding - **no user action needed**.

### Agent Files

| File | Agent | Steps |
|------|-------|-------|
| `pm-agent.md` | PM Agent (orchestrator) | 0, 1, 2, 8, 9, 10 |
| `backend-agent.md` | Backend Agent | 0, 1, 2, 3 |
| `frontend-agent.md` | Frontend Agent | 0, 1, 2, 3 |
| `code-reviewer-agent.md` | Code Reviewer Agent | 4 |
| `tester-agent.md` | Tester Agent | 5 |
| `devops-agent.md` | DevOps Agent | 0, 6, 7, 8, 9 |

### Auto-Copy Procedure (run via bash)

1. **Create target directory** if it doesn't exist:

   **Windows (PowerShell):**
   ```powershell
   $targetDir = ".codeartsdoer/agents"
   if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force }
   ```

   **macOS/Linux (Bash):**
   ```bash
   mkdir -p .codeartsdoer/agents
   ```

2. **Copy all 6 agent files** from the skill bundle to `.codeartsdoer/agents/`:

   **Windows (PowerShell):**
   ```powershell
   $sourceDir = ".codeartsdoer/skills/sdlc-agentic-pipeline/references/agents"
   $agentFiles = @("pm-agent.md", "backend-agent.md", "frontend-agent.md", "code-reviewer-agent.md", "tester-agent.md", "devops-agent.md")
   foreach ($file in $agentFiles) {
       $src = Join-Path $sourceDir $file
       $dst = Join-Path $targetDir $file
       if (Test-Path $src) {
           Copy-Item $src $dst -Force
           Write-Output "Copied: $file"
       } else {
           Write-Warning "MISSING: $file not found in skill bundle"
       }
   }
   ```

   **macOS/Linux (Bash):**
   ```bash
   sourceDir=".codeartsdoer/skills/sdlc-agentic-pipeline/references/agents"
   targetDir=".codeartsdoer/agents"
   for file in pm-agent.md backend-agent.md frontend-agent.md code-reviewer-agent.md tester-agent.md devops-agent.md; do
       if [ -f "$sourceDir/$file" ]; then
           cp "$sourceDir/$file" "$targetDir/$file"
           echo "Copied: $file"
       else
           echo "WARNING: MISSING $file not found in skill bundle"
       fi
   done
   ```

3. **Verify** all 6 files exist in `.codeartsdoer/agents/`:

   **Windows (PowerShell):**
   ```powershell
   $expected = @("pm-agent.md", "backend-agent.md", "frontend-agent.md", "code-reviewer-agent.md", "tester-agent.md", "devops-agent.md")
   $missing = $expected | Where-Object { -not (Test-Path ".codeartsdoer/agents/$_") }
   if ($missing.Count -eq 0) { Write-Output "All 6 agent files verified" }
   else { Write-Error "MISSING agent files: $($missing -join ', ')" }
   ```

   **macOS/Linux (Bash):**
   ```bash
   missing=""
   for file in pm-agent.md backend-agent.md frontend-agent.md code-reviewer-agent.md tester-agent.md devops-agent.md; do
       [ ! -f ".codeartsdoer/agents/$file" ] && missing="$missing $file"
   done
   if [ -z "$missing" ]; then echo "All 6 agent files verified"; else echo "ERROR: MISSING agent files:$missing"; fi
   ```

4. If any files are missing, report the error to the user and do not proceed
   to service onboarding until resolved.

> This step is idempotent - running it multiple times overwrites the files with
> the latest version from the skill bundle. No user interaction required.

---

> **Q0: Is the `sdlc-agentic-pipeline` skill installed at the user level or project level?**
>
> - **User level** — available across all projects (stored in `~/.codeartsdoer/skills/`)
> - **Project level** — available only in this project (stored in `.codeartsdoer/skills/`) *(current default)*
>
> This determines where generated config files and skill references are stored.
> All subsequent skill, config, and reference source/target paths are derived from
> this selection (user-level: `~/.codeartsdoer/...`, project-level: `.codeartsdoer/...`).

Ask the user via the `question` tool which option they want. **Keep the question and option descriptions short** - do NOT include long explanations of agent roles or internal pipeline details. The user only needs to understand the choice, not the implementation. Store the selection for use in all subsequent path derivations.

- **Question**: "Start with an existing GitHub repo or create a new one?"- **Option A**: "Existing repo" — description: "Use a repo you already have"
- **Option B**: "New repo" — description: "Create a new repo from a prompt"

---

## 0.1 - GitHub

### Setup Instructions

1. Create a GitHub account at https://github.com/ (or sign in with Gmail)
2. Create a Personal Access Token:
   - Go to **Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate new token (classic)**
   - Select scopes: `repo`, `workflow`, `admin:org` (as needed)
   - Copy the token - you won't see it again

### Option A: Existing Repository

> **IMPORTANT:**
> **PM Agent is READ-ONLY with the repository.** The PM Agent uses GitHub MCP
> tools (`github_get_file_contents`, `github_list_branches`, etc.) for read-only
> analysis. The PM Agent NEVER runs `git clone`, `git commit`, `git push`, or
> `git checkout`. All git write operations are delegated to developer agents
> (Backend, Frontend) who create branches, commit, push, and create/merge PRs.
> The DevOps Agent owns git write for infrastructure files only but does NOT
> create or merge PRs - all PR operations are routed to developer agents
> (Backend if both active, otherwise sole developer).
>
> **Existing artifacts are sacred.** If the repo already contains Dockerfiles,
> `docker-compose.yml`, `.github/workflows/ci-cd.yml`, or `sonar-project.properties`,
> the pipeline MUST NOT modify or overwrite them unless the user explicitly
> requests changes.
>
> **Branches are user-controlled.** The pipeline MUST NOT create, delete, or
> rename branches unless the user explicitly approves. The user's existing
> branch strategy is respected.

#### A.1 - Collect Existing Repo Info (PM Agent)

Ask the user:

1. **GitHub Owner** - e.g., `agentman3334`
2. **GitHub Repo** - e.g., `my-project`
3. **Default Branch** - e.g., `main`
4. **GitHub PAT** - the personal access token from step 2

#### A.2 - Configure GitHub MCP Server (PM Agent)

Write the GitHub MCP configuration into `.codeartsdoer/mcp/mcp_settings.json`
using the user's PAT. This must happen FIRST so the GitHub MCP tools become
available for subsequent read-only analysis steps.

```json
"github": {
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": {
    "Authorization": "Bearer <GITHUB_PAT>"
  }
}
```

If `mcp_settings.json` already exists, merge this block into the existing
`mcpServers` object rather than overwriting.

#### A.3 - Verify Repo Access (PM Agent, READ-ONLY)

Confirm the repo exists and is accessible using a lightweight read-only MCP call:

```
github_get_file_contents(owner="<GITHUB_OWNER>", repo="<GITHUB_REPO>", path="/")
```

- If the call **succeeds**, the repo is verified and accessible. Proceed to A.4.
- If the call **fails** with 404, the repo does not exist. Ask the user to verify
  the owner and repo name.
- If the call **fails** with 401/403, the PAT is invalid or lacks `repo` scope.
  Ask the user to regenerate the token with `repo`, `workflow` scopes.

> **Do NOT proceed to A.4 until repo access is verified.**

#### A.4 - Inventory Existing Artifacts (PM Agent, READ-ONLY)

The PM Agent scans the repo via GitHub MCP to build a complete inventory of
what already exists. This inventory determines what the pipeline can reuse
vs. what needs to be generated (only with user approval).

Check the following via `github_get_file_contents` and `github_list_branches`:

| Artifact | Check Path | Action |
|----------|-----------|--------|
| Backend Dockerfile | `backend/Dockerfile` or `Dockerfile` | Record: exists/missing |
| Frontend Dockerfile | `frontend/Dockerfile` | Record: exists/missing |
| docker-compose.yml | `docker-compose.yml` | Record: exists/missing |
| CI/CD workflow | `.github/workflows/ci-cd.yml` | Record: exists/missing |
| SonarCloud config | `sonar-project.properties` | Record: exists/missing |
| Backend deps | `requirements.txt` / `package.json` / `go.mod` | Parse: detect tech stack |
| Frontend deps | `frontend/package.json` / `index.html` | Parse: detect tech stack |
| Backend dir | `backend/` or `app/` | Record: exists/missing |
| Frontend dir | `frontend/` or `src/` | Record: exists/missing |
| Branches | `github_list_branches` | Record: all branch names |

> **Why inventory?** The PM needs to know what exists so it can (a) avoid
> touching existing files, (b) tell the user what's missing, and (c) scope
> Jira tasks accurately at Step 1.

#### A.5 - Ask User About Intent (PM Agent -> question tool)

The PM Agent presents the inventory to the user and asks what they want to
work on. This bridges onboarding (Step 0) and requirement breakdown (Step 1).

Present a summary like:

```
"I analyzed your repo 'my-project'. Here's what I found:

 EXISTING:
 - Backend: Python/FastAPI (requirements.txt detected)
 - Frontend: Vanilla HTML/CSS/JS (index.html detected)
 - Docker: backend/Dockerfile, frontend/Dockerfile
 - CI/CD: .github/workflows/ci-cd.yml (existing)
 - Docker Compose: docker-compose.yml (existing)
 - Branches: main, develop

 MISSING (pipeline may need):
 - sonar-project.properties (for SonarCloud integration)

 What would you like to work on?"
```

Offer options via the `question` tool (multiple selection allowed):

- New feature development
- Bug fix
- Refactoring
- Add CI/CD pipeline (if missing or needs update)
- Add Docker setup (if missing or needs update)
- Security audit
- Performance optimization
- Other (type your own)

> **Why ask?** This is the user's repo. The PM should not assume what work is
> needed. The user's answer directly shapes Step 1 (Jira task creation).

#### A.6 - Ask About Branch Strategy (PM Agent -> question tool)

The PM Agent asks the user what branch strategy the pipeline should follow:

```
"Your repo has these branches: main, develop
 What branch strategy would you like the pipeline to use?"
```

Offer options via the `question` tool:

- Use existing `develop` branch as integration branch
- Create a `dev` branch (GitFlow)
- Trunk-based (PRs target main directly)
- Custom (type your own)

> **Why ask?** Not all teams use GitFlow. Some use trunk-based development,
> some use GitHub Flow. The pipeline must adapt to the user's existing workflow,
> not impose its own. Branches are only created by developer agents, never by PM.

#### A.7 - Proceed to Service Onboarding (0.2 - 0.7)

From here, the flow is **identical to Option B**. Continue with:

- Step 0.2 - Jira
- Step 0.3 - SonarCloud
- Step 0.4 - Semgrep
- Step 0.5 - JFrog
- Step 0.6 - Huawei ECS
- Step 0.7 - Playwright (auto-provisioned)

> **No code building, no repo creation, no branch creation** happens during
> Option A onboarding. The code and branches already exist. The pipeline only
> generates local config files (`mcp_settings.json`, `.env`,
> `sonar-project.properties` if missing) - none of which are pushed to the repo
> by the PM Agent.

### Option B: New Repository from Prompt

Ask the user:

1. **GitHub Owner** - e.g., `agentman3334`
2. **New Repo Name** - e.g., `my-new-project`
3. **Visibility** - public or private
4. **Project Prompt** - description of what to build
5. **GitHub PAT** - the personal access token from step 2

> **IMPORTANT:**
> **BLOCKING:** After collecting the answers above, you MUST execute the
> four steps below (B.1 Configure MCP, B.2 Verify MCP Health, B.3 Build &
> Push Initial Code, B.4 Verify) BEFORE proceeding to
> Step 0.2 (Jira). Do NOT ask any Step 0.2 questions until the repository is
> created, code is pushed, and verification passes. If any step fails, resolve
> the error before continuing.

#### B.1 - Configure the GitHub MCP Server

Write the GitHub MCP configuration into `.codeartsdoer/mcp/mcp_settings.json`
using the user's PAT. This must happen FIRST so the GitHub MCP tools become
available for subsequent steps.

```json
"github": {
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": {
    "Authorization": "Bearer <GITHUB_PAT>"
  }
}
```

Replace `<GITHUB_PAT>` with the token collected above. If
`mcp_settings.json` already exists (e.g., from a prior partial onboarding),
merge this block into the existing `mcpServers` object rather than overwriting.

#### B.2 - Verify GitHub MCP Health

Before using the MCP to create the repo, confirm the GitHub MCP server is
healthy and the PAT is valid. Call a lightweight read-only MCP tool:

```
github_search_repositories(query="<GITHUB_OWNER>/<NEW_REPO_NAME>")
```

- If the call **succeeds** (returns a result, even an empty list), the MCP is
  healthy and the PAT is valid. Proceed to B.3.
- If the call **fails** with a 401/403 authentication error, the PAT is
  invalid or lacks the `repo` scope. Ask the user to regenerate the token
  with the correct scopes and update `mcp_settings.json`, then re-verify.
- If the call **fails** with a connection/timeout error, the MCP server may
  not be loaded yet. Wait a moment and retry. If it persists, check that
  `mcp_settings.json` was written to the correct path
  (`.codeartsdoer/mcp/mcp_settings.json`).

> **Do NOT proceed to B.3 until the MCP health check passes.**

#### B.3 - Build Project from Prompt & Push to GitHub

The PM Agent orchestrates this step but **delegates ALL repo creation, git operations,
and code building to developer agents.** The PM Agent NEVER creates repos, clones,
commits, or pushes. The Backend Agent creates the repo, clones it, and creates the
`dev` branch first. All agents push to the `dev` branch (not `main`).
DevOps Agent runs **last** so it can see both backend and frontend Dockerfiles
before writing `docker-compose.yml`:
- **PM Agent**: parses prompt, splits into backend/frontend scope (orchestration only, NO repo creation, NO git)
- **Backend Agent**: creates repo via GitHub MCP, clones repo, builds backend code, creates `dev` branch, commits & pushes to `dev`
- **Frontend Agent**: builds frontend code, commits & pushes to `dev`
- **DevOps Agent**: writes `docker-compose.yml` + shared docs (README, .gitignore), commits & pushes to `dev`

1. **Parse the Project Prompt** (PM Agent - orchestration only, NO repo creation, NO git):
   - Analyze the user's Project Prompt (collected in question 4)
   - Split the requirements into **backend scope** and **frontend scope**:
     - Backend: APIs, database models, server logic, auth, integrations
     - Frontend: UI components, pages, routing, state management, styling
   - Identify the tech stack for each (e.g., Python/FastAPI for backend,
     vanilla HTML/CSS/JS for frontend)

2. **Invoke Backend Agent** to create repo, clone, build, create `dev` branch & push (PM Agent -> Task tool):
   - Pass the backend scope, tech stack, project prompt, repo name, owner, visibility to the Backend Agent (do NOT pass the GitHub PAT — the Backend Agent uses its preconfigured GitHub MCP capability for repository creation)
   - The Backend Agent creates the repo via GitHub MCP (this is the ONLY agent that creates repos):
     ```
     github_create_repository(
       name="<NEW_REPO_NAME>",
       owner="<GITHUB_OWNER>",
       private=<true if VISIBILITY is "private", false otherwise>,
       auto_init=true
     )
     ```
     - If the MCP returns a **422** or "already exists" error, the Backend Agent
       reports back to the PM Agent, who asks the user for a different name and retries.
   - The Backend Agent clones the repo (this is the ONLY agent that clones):
     ```bash
     git clone "https://<GITHUB_PAT>@github.com/<GITHUB_OWNER>/<NEW_REPO_NAME>.git"
     ```
   - The Backend Agent generates:
     - Complete directory structure (`backend/app/`, `backend/tests/`)
     - Actual implementation code for all backend features
     - Configuration files (`requirements.txt`, backend `Dockerfile`)
     - Unit tests for API endpoints and business logic
   - The Backend Agent writes files into the cloned repo's `backend/` directory
   - The Backend Agent creates the `dev` branch from `main` (required by GitFlow
     strategy) and commits & pushes to `dev`:
     ```bash
     cd <NEW_REPO_NAME>
     git checkout -b dev
     git add backend/
     git commit -m "feat: initial backend build from prompt"
     git push origin dev
     ```

 3. **Frontend Agent builds concurrently with Backend** (PM dispatches via Jira async):
    - The Backend Agent has already created the repo, cloned it, and created the `dev` branch
    - Pass the frontend scope, tech stack, project prompt, AND the repository URL to the Frontend Agent
    - The Frontend Agent clones the repository from the URL provided by the Backend Agent
    - The Frontend Agent works on an isolated feature branch (not directly on `dev`):
      ```bash
      git clone "https://github.com/<GITHUB_OWNER>/<NEW_REPO_NAME>.git"
      cd <NEW_REPO_NAME>
      git checkout -b feature/frontend/initial-build dev
      ```
    - The Frontend Agent generates:
     - Complete directory structure (`frontend/src/`, `frontend/public/`)
     - Actual implementation code for all UI features
     - Configuration files (`package.json`, frontend `Dockerfile`)
     - Component-level tests
    - The Frontend Agent writes files into the cloned repo's `frontend/` directory
    - The Frontend Agent commits frontend code and pushes to its feature branch:
      ```bash
      git add frontend/
      git commit -m "feat: initial frontend build from prompt"
      git push origin feature/frontend/initial-build
      ```
    - After Backend Agent completes, the Frontend Agent (or Backend Agent if both active)
      creates a PR from `feature/frontend/initial-build` to `dev` and merges it

4. **Invoke DevOps Agent** (after BOTH Backend + Frontend complete) to write `docker-compose.yml`, shared docs, generate `ci-cd.yml` & push to `dev` (PM Agent -> Task tool):
   - Pass the project structure, tech stack, container requirements, AND the
     build info returned by Backend and Frontend agents (setup actions, install/build/test commands)
   - The DevOps Agent can now see both `backend/Dockerfile` and `frontend/Dockerfile`
   - The DevOps Agent generates:
     - `docker-compose.yml` (orchestrates backend + frontend containers)
     - `ci-cd.yml` (from `references/templates/ci-cd.yml`) with the **build section
       filled in** based on the backend and frontend build info:
       - sonar-scan job: test + coverage steps for both backend and frontend
       - build job: setup + install + build steps for both backend and frontend
     - Service-specific placeholders (`<JFROG_REPO_KEY>`, etc.) are left for the
       PM Agent to fill after all services are onboarded
    - The DevOps Agent commits `docker-compose.yml` + `ci-cd.yml` + shared docs
      (`README.md`, `.gitignore`, `.env.example` - written by DevOps Agent) and pushes to `dev`:
     ```bash
     cd <NEW_REPO_NAME>
     git add docker-compose.yml .github/workflows/ci-cd.yml README.md .gitignore .env.example
     git commit -m "infra: add docker-compose, ci-cd.yml + shared project files"
     git push origin dev
     ```

#### B.4 - Verify Repository Creation via GitHub MCP (PM Agent, READ-ONLY)

Confirm the repo exists and is accessible using `github_get_file_contents`
(PM Agent may use this for basic verification):

```
github_get_file_contents(owner="<GITHUB_OWNER>", repo="<NEW_REPO_NAME>", path="README.md")
```

- If the call **succeeds**, the repo is verified with initial code pushed.
- If the call **fails** with 404, the repo was not created or the push failed.
  Go back to B.3 and resolve the issue.

> **IMPORTANT:**
> **Only after B.1 through B.4 all succeed**, proceed to Step 0.2 (Jira).
> The GitHub repo must exist with initial code pushed before any subsequent
> service onboarding steps, because Jira, SonarCloud, Semgrep, and JFrog all
> require linking to an existing GitHub repository.

### Fills into `mcp_settings.json`

> **Note:** For Option B, the GitHub MCP config was already written in step B.1.
> For Option A, the GitHub MCP config was already written in step A.2.
> In both cases, this block is already in `mcp_settings.json` by this point.

```json
"github": {
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": {
    "Authorization": "Bearer <GITHUB_PAT>"
  }
}
```

---

## 0.2 - Jira (Atlassian)

### Setup Instructions

1. Create a Jira account at https://www.atlassian.com/software/jira - sign in with Gmail
2. Create a site name - e.g., `codeartstest.atlassian.net`
3. Create a space - e.g., `CodeArts Agent Space`
4. Find the **Jira Space Key** from **Space Settings**
5. **Connect GitHub to Jira**:
   - Go to **Space Settings > Toolchain > Source Code Management > GitHub for Atlassian**
   - Click **Configure > Continue > Next**
   - Sign in to GitHub -> Authorize -> Select organization -> Select repositories -> Connected
6. **Enable Rovo MCP Server**:
   - Go to https://admin.atlassian.com/ -> Click **Rovo > Rovo MCP server > Authentication**
   - Enable **Allow API token authentication**
7. **Create API Token**:
   - Visit https://id.atlassian.com/manage-profile/security/api-tokens
   - Create API token with scopes - choose **Teamwork Graph app** for token scope (47 actions)
   - Copy the token - you won't see it again
8. **Convert token to Base64**:

   **Windows (PowerShell):**
   ```powershell
   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("<JIRA_EMAIL>:<JIRA_API_TOKEN>"))
   ```

   **macOS/Linux (Bash):**
   ```bash
   echo -n "<JIRA_EMAIL>:<JIRA_API_TOKEN>" | base64
   ```

   Use the result as the `Authorization: Basic <result>` in MCP config

### Ask the user

1. **Jira Cloud ID** - e.g., `demo-account.atlassian.net`
> **Jira 'In Testing' status**: Must be manually added to the project workflow.
> The pipeline uses 'In Testing' during Step 5 (E2E testing). This status does NOT exist by default.
> Add via: Settings -> Work items -> Workflows -> Edit -> Add status ->
> Create 'In Testing' (category: In Progress) -> Enable 'Allow all statuses to transition to this one'.
> 2. **Jira Email** - e.g., `user@example.com`
3. **Jira API Token** - from step 7
4. **Jira Project Key** - from step 4 (e.g., `SCRUM`)
5. **Jira MCP Auth (Base64)** - the result from step 8

> **NOTE - Manual Auth Required:** The user must manually link GitHub <-> Jira integration (step 5).
> This enables Jira issue keys in PR titles/commits to auto-link to Jira issues.

### Fills into `mcp_settings.json`

```json
"atlassian-rovo-mcp": {
  "url": "https://mcp.atlassian.com/v1/mcp",
  "headers": {
    "Authorization": "Basic <JIRA_MCP_AUTH_BASE64>"
  }
}
```

---

## 0.3 - SonarCloud

### Setup Instructions

1. Go to https://sonarcloud.io/login - **Login with GitHub**
   - Enter the verification code sent to your Gmail
2. **Create Organization**:
   - Choose **Import an organization from GitHub** - the system automatically sets organization name & key
   - Choose **Free** plan
3. **Generate Access Token**:
   - Go to https://sonarcloud.io/account/access-tokens?tab=personal_tokens
   - Generate a token - copy it now, you won't see it again
4. **Link GitHub <-> SonarCloud** (manual):
   - Go to **SonarCloud > Administration > Organization Settings** and bind the GitHub organization
   - Go to **Administration > Pull Requests** and select GitHub as the ALM integration
   - This enables Quality Gate status checks on PRs and PR decoration
5. **Disable Automatic Analysis** (CRITICAL - must be done before any CI/CD pipeline run):
   - Go to **SonarCloud > Project Dashboard > Administration > Analysis Method**
   - Turn OFF the **SonarCloud Automatic Analysis** toggle
   - Requires **Project Administrator** permissions (org-level alone is insufficient)
   - If both Automatic Analysis and GitHub Actions scan are enabled, the CI/CD workflow crashes with: `"You are running CI analysis while Automatic Analysis is enabled"`

> **WARNING:**
> **CRITICAL WARNING:** Before collecting SonarCloud credentials below, the user
> MUST confirm they have disabled Automatic Analysis in SonarCloud. If this is
> not done, the GitHub Actions CI/CD pipeline will crash during the SonarCloud
> scan stage. Surface this warning proactively to the user.

### Ask the user

1. **Sonar Project Key** - e.g., `agentman3334-key` (auto-generated from org import)
2. **Sonar Organization** - e.g., `agentman3334`
3. **Sonar Token** - from step 3

> **NOTE - Manual Auth Required:** The user must manually link GitHub <-> SonarCloud (step 4).

### Fills into `mcp_settings.json`

```json
"sonarqube": {
  "url": "https://api.sonarcloud.io/mcp",
  "headers": {
    "Authorization": "Bearer <SONAR_TOKEN>",
    "SONARQUBE_ORG": "<SONAR_ORGANIZATION_KEY>"
  }
}
```

### Fills into `sonar-project.properties`

```properties
sonar.projectKey=<GITHUB_OWNER>_<GITHUB_REPO>
sonar.organization=<SONAR_ORGANIZATION>
sonar.sources=backend/app,frontend/src
sonar.python.version=3.11
sonar.sourceEncoding=UTF-8
sonar.exclusions=**/node_modules/**,**/__pycache__/**,**/migrations/**
```

### Set GitHub Secrets and Variables (Automated)

Instead of manually clicking through the GitHub UI, use the `set-secrets.js`
template script to automatically set all required secrets and variables via
the GitHub REST API.

The SONAR_TOKEN is one of the values set by this script. See
[GitHub Secrets and Variables Setup](#github-secrets-and-variables-setup)
for full instructions.

> **Note:** The script is run **once** after all services (0.1-0.5) are
> onboarded, not after each individual service.

---

## 0.4 - Semgrep

### Setup Instructions

1. Go to https://semgrep.dev/ - click **Try for free**
2. **Continue with GitHub** -> Authorize
3. **Create new organization**
4. In **Scan your code with Semgrep** section, choose **CLI**
5. **Install Semgrep automatically** (handled by the pipeline, not the user):
   - Run: `pip install semgrep`
   - Discover executable path automatically. The path MUST be correct or the
     Semgrep MCP server will fail to start. Try each method below in order
     until a working `semgrep` executable is found:

   **Windows (PowerShell):**
   ```powershell
   # Method 1: Direct lookup on PATH
   $semgrepPath = (Get-Command semgrep -ErrorAction SilentlyContinue).Source

   # Method 2: Use sysconfig to find the scripts directory (most reliable)
   if (-not $semgrepPath -or -not (Test-Path $semgrepPath)) {
     $pythonExe = "python"
     if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
       $pythonExe = "py -3"
     }
     $scriptsDir = & $pythonExe -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2>$null
     if ($scriptsDir) {
       $candidate = Join-Path $scriptsDir.Trim() "semgrep.exe"
       if (Test-Path $candidate) { $semgrepPath = $candidate }
     }
   }

   # Method 3: Use pip show to find package install location
   if (-not $semgrepPath -or -not (Test-Path $semgrepPath)) {
     $pipOutput = & python -m pip show semgrep 2>$null
     if ($pipOutput -match "Location:\s*(.+)") {
       $sitePkgs = $matches[1].Trim()
       # Scripts dir is typically a sibling of site-packages' parent
       $pythonDir = Split-Path $sitePkgs -Parent
       $candidate = Join-Path $pythonDir "Scripts\semgrep.exe"
       if (Test-Path $candidate) { $semgrepPath = $candidate }
     }
   }

   # Method 4: Search common Python installation paths
   if (-not $semgrepPath -or -not (Test-Path $semgrepPath)) {
     $searchGlobs = @(
       "$env:LOCALAPPDATA\Programs\Python\Python3*\Scripts\semgrep.exe",
       "$env:APPDATA\Python\Python3*\Scripts\semgrep.exe"
     )
     foreach ($glob in $searchGlobs) {
       $found = Get-ChildItem $glob -ErrorAction SilentlyContinue | Select-Object -First 1
       if ($found) { $semgrepPath = $found.FullName; break }
     }
   }

   # Verify the executable actually works
   if ($semgrepPath -and (Test-Path $semgrepPath)) {
     $version = & $semgrepPath --version 2>&1
     Write-Output "Semgrep found at: $semgrepPath"
     Write-Output "Version: $version"
   } else {
     Write-Error "semgrep.exe not found. Run 'pip install semgrep' first."
   }
   ```

   **macOS/Linux (Bash):**
   ```bash
   # Method 1: Direct lookup on PATH
   semgrepPath=$(which semgrep 2>/dev/null)

   # Method 2: Use sysconfig to find scripts directory
   if [ -z "$semgrepPath" ] || [ ! -f "$semgrepPath" ]; then
     scriptsDir=$(python3 -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2>/dev/null)
     if [ -n "$scriptsDir" ]; then
       candidate="$scriptsDir/semgrep"
       if [ -f "$candidate" ]; then semgrepPath="$candidate"; fi
     fi
   fi

   # Method 3: Use pip show to find package install location
   if [ -z "$semgrepPath" ] || [ ! -f "$semgrepPath" ]; then
     sitePkgs=$(pip3 show semgrep 2>/dev/null | grep "^Location:" | cut -d' ' -f2)
     if [ -n "$sitePkgs" ]; then
       pythonDir=$(dirname "$sitePkgs")
       candidate="$pythonDir/bin/semgrep"
       if [ -f "$candidate" ]; then semgrepPath="$candidate"; fi
     fi
   fi

   # Method 4: Search common paths
   if [ -z "$semgrepPath" ] || [ ! -f "$semgrepPath" ]; then
     for candidate in "/usr/local/bin/semgrep" "/usr/bin/semgrep" \
                      "$(python3 -m site --user-base 2>/dev/null)/bin/semgrep"; do
       if [ -f "$candidate" ]; then semgrepPath="$candidate"; break; fi
     done
   fi

   # Verify the executable actually works
   if [ -n "$semgrepPath" ] && [ -f "$semgrepPath" ]; then
     echo "Semgrep found at: $semgrepPath"
     $semgrepPath --version
   else
     echo "ERROR: semgrep not found. Run 'pip install semgrep' first." >&2
   fi
   ```

   - Typical path on Windows: `C:\Users\<user>\AppData\Local\Programs\Python\Python3XX\Scripts\semgrep.exe`
   - Typical path on macOS/Linux: `/usr/local/bin/semgrep` or `~/.local/bin/semgrep`
   - The discovered path MUST be written into `mcp_settings.json` as the
     `command` value for the `semgrep` MCP server entry. Do not leave
     `<SEMGREP_EXECUTABLE_PATH>` as a placeholder.
6. **Create CLI token**:
   - Run: `semgrep login` - this will generate a `SEMGREP_APP_TOKEN`
   - Or generate from Semgrep App > API Tokens > Settings

### Ask the user

1. **Semgrep App Token** — Example: `f52665a65623aa1a7eab6337a80a7234457775f263a49331cf5291bcf2fcdb4f`
   - **Tip:** Run `semgrep login` or go to Semgrep App > API Tokens > Settings to generate.
   - **Semgrep Executable Path is handled automatically** — do not ask the user for this.

> **NOTE - Manual Auth Required:** The user must manually link GitHub <-> Semgrep integration.
> Go to **Semgrep App > Settings > Integrations** and add the GitHub repository.

### Fills into `mcp_settings.json`

```json
"semgrep": {
  "command": "<SEMGREP_EXECUTABLE_PATH>",
  "args": ["mcp"],
  "env": {
    "SEMGREP_APP_TOKEN": "<SEMGREP_APP_TOKEN>",
    "PYTHONIOENCODING": "utf-8"
  },
  "disabled": false,
  "timeout": 120000
}
```

---

## 0.5 - JFrog Artifactory

### Setup Instructions

1. Go to https://jfrog.com/ 
2. **Login with company email** 
3. **Edit Hostname** (optional) - this becomes your `JFROG_PLATFORM_URL`
4. **Create a password** - this is only for platform login
5. **Generate Admin Access Token**:
   - In the **Administration** module, go to **User Management > Access Tokens**
   - In the **Token scope** field, select **Admin**
   - In the **User name** field, enter the name of the Admin user
   - In the **Service** field, select the **All** checkbox (or clear it and
     select specific services from the list)
   - In the **Expiration time** field, set the expiration time (use a preset
     option or set a custom expiration in hours)
   - Click **Generate** to generate the token
   - The Generate Token window displays: username, scope, audience, expiration,
     token ID, and the actual token
   - **Copy the token value** - you won't see it again
6. **Create a project**:
   - In the JFrog Platform UI, select **Administration > All Projects > + Create New**
   - The Create New Project dialog opens
   - In the **Configure Project** tab, configure:
     - **Project Name** - enter a name
     - **Project Key** - enter a unique key used to identify your Project resources
   - Click **Create Project**
7. **Create a repository**:
   - In the **Administration** module, select **Repositories**
   - Click **Create a Repository** and select **Local** from the list
   - Select the **Docker** package type
   - In the **Repository Key** field, type a meaningful name (e.g., `docker-dev-local`)
   - **WARNING:** Do NOT use underscores in the repository name. Due to subdomain/DNS/hostname
     limitations, Docker cannot communicate with registries that have underscores.
     Use hyphens instead (e.g., `docker-dev-local` or `docker.dev.local`, not `docker_dev_local`).
   - In the **Docker Settings** section, set the API version to **V2**
   - Set the **Max Unique Tags** and **Docker Tag Retention** values
   - Do NOT disable XRay
   - Note the Docker URL shown (e.g., `https://codeartsagentjfrog.jfrog.io/artifactory/api/docker/<repo-key>`)
 8. **Set up Docker client**:
   - Generate token -> Write your platform password -> Click **Generate Token & Create Instructions**
   - Note the auth config shown

### Ask the user

When asking for JFrog credentials, show the example values and tips below in the
question descriptions to help the user provide correct values.

1. **JFrog Platform URL** — Example: `https://demoartifacthw.jfrog.io/`
   - **Tip:** Copy the full base URL from your browser address bar when logged into JFrog. The value **includes the scheme** (`https://`).
2. **JFrog Docker Registry** — Example: `demoartifacthw.jfrog.io`
   - **Tip:** In Administration > Repositories, create a Local repository with Docker package type.
   - **WARNING:** No underscores in repository name (DNS limitation). Use hyphens (e.g., `docker-dev-local`).
3. **JFrog Repo Key** — Example: `docker-dev-local-sdlc`
   - The repository key you created in the JFrog UI.
4. **JFrog Username** — Example: `user@email.com` (the email address used to log in to JFrog)
5. **JFrog Password/Access Token** — Example: `access_token_here`
   - **Tip:** Administration > User Management > Access Tokens > Generate Token.
     Use the generated token value as the password.
6. **JFrog Project Key** — Example: `demo-sdlc-jfrog-key`
   - **Tip:** Administration > All Projects > look at the Project Key column.


### Set GitHub Secrets and Variables (Automated)

The JFrog credentials are set by the `set-secrets.js` script along with
SONAR_TOKEN. See
[GitHub Secrets and Variables Setup](#github-secrets-and-variables-setup)
for full instructions.

> **Note:** The script is run **once** after all services (0.1-0.5) are
> onboarded, not after each individual service.

### Fills into `mcp_settings.json`

```json
"jfrog": {
  "url": "<JFROG_PLATFORM_URL>/mcp",
  "headers": {
    "Authorization": "Bearer <JFROG_ACCESS_TOKEN>"
  }
}
```

---

## 0.6 - Huawei Cloud ECS (Deployment)

### Setup Instructions

1. Provision an ECS instance on Huawei Cloud
2. **SSH Key Generation** (handled automatically by the pipeline):
   - Check if SSH key pair already exists:

     **Windows (PowerShell):**
     ```powershell
     $sshKey = "$env:USERPROFILE\.ssh\id_rsa"
     if (-not (Test-Path $sshKey)) {
       ssh-keygen -t rsa -b 4096 -f $sshKey -N '""'
       Write-Output "SSH key pair generated at ~/.ssh/id_rsa"
     }
     ```

     **macOS/Linux (Bash):**
     ```bash
     sshKey="$HOME/.ssh/id_rsa"
     if [ ! -f "$sshKey" ]; then
       ssh-keygen -t rsa -b 4096 -f "$sshKey" -N ""
       echo "SSH key pair generated at ~/.ssh/id_rsa"
     fi
     ```
3. **Add public key to ECS** (handled automatically using `add_ssh_key.py` template):
   - Generate `add_ssh_key.py` from `references/templates/add_ssh_key.py` template
     with the user's ECS host, user, and password
   - Run the script to add the SSH public key to the ECS `~/.ssh/authorized_keys`:
     ```bash
     python add_ssh_key.py
     ```
   - Verify key-based SSH login works:

      **Windows (PowerShell):**
      ```powershell
      ssh -i $sshKey -o BatchMode=yes <ECS_USER>@<ECS_HOST> "echo OK"
      ```

      **macOS/Linux (Bash):**
      ```bash
      ssh -i "$sshKey" -o BatchMode=yes <ECS_USER>@<ECS_HOST> "echo OK"
      ```
4. **Install Docker on ECS** (handled automatically via SSH):

   **Windows (PowerShell):**
   ```powershell
   ssh -i $sshKey <ECS_USER>@<ECS_HOST> "apt-get update && apt-get install -y docker.io && systemctl start docker && systemctl enable docker && docker --version"
   ```

   **macOS/Linux (Bash):**
   ```bash
   ssh -i "$sshKey" <ECS_USER>@<ECS_HOST> "apt-get update && apt-get install -y docker.io && systemctl start docker && systemctl enable docker && docker --version"
   ```
5. **Configure Docker login to JFrog on ECS** (handled automatically via SSH):

   **Windows (PowerShell):**
   ```powershell
   ssh -i $sshKey <ECS_USER>@<ECS_HOST> "echo '<JFROG_PASSWORD>' | docker login <JFROG_DOCKER_REGISTRY> -u '<JFROG_USERNAME>' --password-stdin"
   ```

   **macOS/Linux (Bash):**
   ```bash
   ssh -i "$sshKey" <ECS_USER>@<ECS_HOST> "echo '<JFROG_PASSWORD>' | docker login <JFROG_DOCKER_REGISTRY> -u '<JFROG_USERNAME>' --password-stdin"
   ```
6. **Ensure security group/firewall** allows SSH (port 22) and app port (80) access

### Ask the user

1. **ECS Host IP** — Example: `114.119.182.219`
2. **ECS User** — Example: `root`
3. **ECS Password** — Example: `Admin123.`
   - **Tip:** The root password set during ECS instance creation.
   - Used only once to add SSH public key automatically, then key-based auth takes over.
4. **App Directory** — Default: `/app`
5. **ECS Docker Registry** — Example: `demoartifacthw.jfrog.io`
   - **Tip:** Typically same as `JFROG_DOCKER_REGISTRY`. Copy from JFrog setup.
6. **SSH Key Path** — Default: `~/.ssh/id_rsa` (auto-detected, no need to ask unless custom path)

> **NOTE:** SSH key pair is generated automatically if it doesn't exist.
> The ECS password is used only once to add the public key via `add_ssh_key.py`,
> then all subsequent SSH connections use key-based authentication.
> Docker installation and JFrog Docker login are also automated during onboarding.

> **NOTE - Manual Auth Required:** The user must manually set up ECS access (steps 2-5).

---

## 0.7 - Playwright CLI (E2E Testing Skill) - Auto-Provisioned

The `playwright-cli` skill is required by the Tester Agent (Step 5). The PM Agent
auto-installs it during onboarding - **no manual user action is needed**.

### Auto-Install Procedure (run via bash)

1. **Idempotency check**: if `.codeartsdoer/skills/playwright-cli/SKILL.md` already
   exists AND is not a junction/symlink, skip installation - the skill is already
   available.
   ```powershell
   # Windows (PowerShell)
   $p = ".codeartsdoer/skills/playwright-cli"
   if ((Test-Path "$p/SKILL.md") -and -not (Get-Item $p).LinkType) { Write-Output "Already installed" }
   ```
   ```bash
   # macOS/Linux (Bash)
   [ -f ./.codeartsdoer/skills/playwright-cli/SKILL.md ] && [ ! -L ./.codeartsdoer/skills/playwright-cli ] && echo "Already installed"
   ```
2. **Install** the skill from Microsoft's repository (use `--yes` for non-interactive):
   ```bash
   npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli --yes
   ```
3. **Check if a junction/symlink was created** at `.codeartsdoer/skills/playwright-cli`.
   The `npx skills add --yes` command may create a junction pointing to
   `.agents/skills/playwright-cli` instead of copying the real files. Junctions
   must be replaced with real files to avoid dependency on the `.agents/` directory.

   **Windows (PowerShell):**
   ```powershell
   $p = Get-Item ".codeartsdoer/skills/playwright-cli" -ErrorAction SilentlyContinue
   if ($p -and $p.LinkType) {
       # It's a junction - replace with real files
       $p.Delete()
       Copy-Item -Path ".agents/skills/playwright-cli" -Destination ".codeartsdoer/skills/playwright-cli" -Recurse -Force
       [System.IO.Directory]::Delete("$PWD/.agents", $true)
       Write-Output "Junction replaced with real files, .agents removed"
   } elseif (Test-Path ".agents/skills/playwright-cli") {
       # No junction but files are in .agents - move them
       Move-Item ".agents/skills/playwright-cli" ".codeartsdoer/skills/playwright-cli"
       [System.IO.Directory]::Delete("$PWD/.agents", $true)
       Write-Output "Files moved from .agents to .codeartsdoer/skills"
   }
   ```

   **macOS/Linux (Bash):**
   ```bash
   if [ -L ./.codeartsdoer/skills/playwright-cli ]; then
       rm ./.codeartsdoer/skills/playwright-cli
       mv ./.agents/skills/playwright-cli ./.codeartsdoer/skills/playwright-cli
       rm -rf ./.agents
       echo "Symlink replaced with real files, .agents removed"
   elif [ -d ./.agents/skills/playwright-cli ]; then
       mv ./.agents/skills/playwright-cli ./.codeartsdoer/skills/playwright-cli
       rm -rf ./.agents
       echo "Files moved from .agents to .codeartsdoer/skills"
   fi
   ```
4. **Verify** the skill landed as real files (not a junction):

   **Windows (PowerShell):**
   ```powershell
   $p = Get-Item ".codeartsdoer/skills/playwright-cli"
   Write-Output "Exists: $(Test-Path "$p/SKILL.md") | LinkType: $($p.LinkType)"
   # LinkType should be empty (real files, not junction)
   ```

   **macOS/Linux (Bash):**
   ```bash
   test -f ./.codeartsdoer/skills/playwright-cli/SKILL.md && [ ! -L ./.codeartsdoer/skills/playwright-cli ] && echo "OK" || echo "MISSING"
   ```

   If verification fails, re-run the install and report the error to the user.
5. **Register** the skill as enabled by appending to
   `.codeartsdoer/skills/ProjectSkillStatus.txt`:
   ```
   playwright-cli=true
   ```
6. **Verify `.agents/` directory is removed** (should not exist after step 3):
   ```powershell
   # Windows
   Test-Path .agents  # Should return False
   ```
   ```bash
   # macOS/Linux
   [ ! -d ./.agents ] && echo "OK" || echo ".agents still exists - remove manually"
   ```

> The Tester Agent declares `playwright-cli: allow` in its skill permissions, so once
> installed it is automatically invocable from Step 5.

---

## Collected Values Summary

After all questions are answered, the following values should be collected:

| Variable | Source | Example |
|----------|--------|---------|
| `GITHUB_OWNER` | Step 0.1 | `agentman3334` |
| `GITHUB_REPO` | Step 0.1 | `my-project` |
| `GITHUB_PAT` | Step 0.1 | `ghp_xxxx` |
| `JIRA_CLOUD_ID` | Step 0.2 | `demo-account.atlassian.net` |
| `JIRA_EMAIL` | Step 0.2 | `user@example.com` |
| `JIRA_API_TOKEN` | Step 0.2 | `ATATT3xFfGF0xxxx...` |
| `JIRA_PROJECT_KEY` | Step 0.2 | `SCRUM` |
| `JIRA_MCP_AUTH` | Step 0.2 | Base64 of `email:token` |
| `SONAR_PROJECT_KEY` | Step 0.3 | `agentman3334-key` |
| `SONAR_ORGANIZATION` | Step 0.3 | `agentman3334` |
| `SONAR_TOKEN` | Step 0.3 | `squ_xxxxxxxxxxxx` |
| `SEMGREP_APP_TOKEN` | Step 0.4 | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `SEMGREP_EXECUTABLE_PATH` | Step 0.4 | `C:\...\semgrep.exe` |
| `JFROG_PLATFORM_URL` | Step 0.5 | `https://<your-org>.jfrog.io/` |
| `JFROG_DOCKER_REGISTRY` | Step 0.5 | `<your-org>.jfrog.io` |
| `JFROG_REPO_KEY` | Step 0.5 | `docker-dev-local` |
| `JFROG_USERNAME` | Step 0.5 | `user@example.com` |
| `JFROG_PASSWORD` | Step 0.5 | `eyJ2ZXIi...` (access token) |
| `JFROG_PROJECT` | Step 0.5 | `demo-sdlc-key` |
| `HUAWEI_ECS_HOST` | Step 0.6 | `xxx.xxx.xxx.xxx` |
| `HUAWEI_ECS_USER` | Step 0.6 | `root` |
| `HUAWEI_ECS_SSH_KEY_PATH` | Step 0.6 | `~/.ssh/id_rsa` |
| `HUAWEI_ECS_APP_DIR` | Step 0.6 | `/app` |
| `HUAWEI_ECS_DOCKER_REGISTRY` | Step 0.6 | `<your-org>.jfrog.io` |

---

## GitHub Secrets and Variables Setup

The CI/CD pipeline requires GitHub Actions **secrets** (encrypted) and
**variables** (plain text). Instead of manually clicking through the GitHub UI,
use the `set-secrets.js` template script to set them all at once via the
GitHub REST API.

### What Gets Set

**Secrets** (encrypted - sensitive data):
| Secret | Source |
|--------|--------|
| `SONAR_TOKEN` | From SonarCloud setup (Step 0.3) |
| `JFROG_PASSWORD` | From JFrog setup (Step 0.5, access token) |
| `GITHUB_TOKEN` | Auto-provided by GitHub (no action needed) |

**Variables** (plain text - non-sensitive data):
| Variable | Source |
|----------|--------|
| `JFROG_PLATFORM_URL` | From JFrog setup (Step 0.5) |
| `JFROG_DOCKER_REGISTRY` | From JFrog setup (Step 0.5) |
| `JFROG_USERNAME` | From JFrog setup (Step 0.5) |
| `JFROG_PROJECT` | From JFrog setup (Step 0.5) |

### Automated Setup (Recommended)

Use the `set-secrets.js` template script
(see `references/templates/set-secrets.js`):

**Step 1:** Install the encryption dependency:
```bash
npm install libsodium-wrappers
```

**Step 2:** Copy the template and fill in your values:
```bash
cp .codeartsdoer/skills/sdlc-agentic-pipeline/references/templates/set-secrets.js .
```

**Step 3:** Edit `set-secrets.js` and replace all `<PLACEHOLDER>` values in the
`CONFIG` section with the actual values collected during onboarding
(Steps 0.1-0.5):
```javascript
const CONFIG = {
  GITHUB_OWNER: '<your-github-owner>',               // from Step 0.1
  GITHUB_REPO: '<your-github-repo>',                 // from Step 0.1
  GITHUB_PAT: 'ghp_xxxxxxxxxxxx',                     // from Step 0.1
  SECRETS: {
    SONAR_TOKEN: 'xxxxxxxxxxxxxxxxxxxxxxxx',          // from Step 0.3
    JFROG_PASSWORD: 'eyJ2ZXIi...',                    // from Step 0.5
  },
  VARIABLES: {
    JFROG_PLATFORM_URL: 'https://<your-org>.jfrog.io/',      // from Step 0.5
    JFROG_DOCKER_REGISTRY: '<your-org>.jfrog.io',            // from Step 0.5
    JFROG_USERNAME: '<your-jfrog-email>',                    // from Step 0.5
    JFROG_PROJECT: '<your-jfrog-project-key>',               // from Step 0.5
  },
};
```

**Step 4:** Run the script:
```bash
node set-secrets.js
```

Expected output:
```
Setting GitHub Actions secrets and variables for <your-github-owner>/<your-github-repo>

Variables (plain text):
  VARIABLE JFROG_PLATFORM_URL: OK
  VARIABLE JFROG_DOCKER_REGISTRY: OK
  VARIABLE JFROG_USERNAME: OK
  VARIABLE JFROG_PROJECT: OK

Secrets (encrypted):
  SECRET  SONAR_TOKEN: OK
  SECRET  JFROG_PASSWORD: OK

Done. Verify at: https://github.com/<owner>/<repo>/settings/secrets/actions
```

**Step 5:** Delete the script (it contains secrets in plain text):
```bash
rm set-secrets.js
```

> **IMPORTANT:** Never commit `set-secrets.js` with real values to the
> repository. The template in `references/templates/` uses generic placeholders
> and is safe to commit.

### Manual Setup (Fallback)

If the automated script fails, set them manually in **GitHub Repo > Settings >
Secrets and variables > Actions**:

1. **Secrets** tab > **New repository secret**:
   - `SONAR_TOKEN` = SonarCloud access token
   - `JFROG_PASSWORD` = JFrog access token

2. **Variables** tab > **New repository variable**:
   - `JFROG_PLATFORM_URL` = JFrog platform URL
   - `JFROG_DOCKER_REGISTRY` = JFrog Docker registry hostname
   - `JFROG_USERNAME` = JFrog username/email
   - `JFROG_PROJECT` = JFrog project key

---

## Service Info Usage

| Service | Where Used | Key Fields |
|---------|-----------|------------|
| **GitHub** | MCP, `.env`, CI/CD | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_PAT` |
| **Jira** | MCP, `.env` | `JIRA_CLOUD_ID`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` |
| **SonarCloud** | MCP, `.env`, CI/CD | `SONAR_PROJECT_KEY`, `SONAR_TOKEN`, `SONAR_ORGANIZATION` |
| **Semgrep** | MCP, `.env` | `SEMGREP_APP_TOKEN` |
| **JFrog** | MCP, `.env`, CI/CD | `JFROG_PLATFORM_URL`, `JFROG_DOCKER_REGISTRY`, `JFROG_REPO_KEY` |
| **Huawei ECS** | `.env`, Deploy step | `HUAWEI_ECS_HOST`, `HUAWEI_ECS_USER`, `HUAWEI_ECS_SSH_KEY_PATH` |

---

## Flow After All Info Collected

Once all service info is confirmed and saved:

**For Option A (Existing Repo):**
1. Generate `mcp_settings.json` from template (see `references/templates/mcp-settings.json`)
   - **Local only** - contains secrets, do NOT commit to repo
2. Generate `.env` from template (see `references/templates/env-template.env`)
   - **Local only** - contains secrets, do NOT commit to repo
3. Generate `sonar-project.properties` **ONLY if missing** in the repo (detected during A.4 inventory)
   - **MUST be committed to the repo** - the SonarCloud scanner reads this file from the
     repository root during CI/CD. If it is not in the repo, the scan fails with:
     `ERROR You must define the following mandatory properties for 'Unknown': sonar.projectKey, sonar.organization`
    - Since the PM Agent is read-only, delegate the commit to the Backend Agent
      (or sole developer agent) via a feature branch and PR targeting `dev`:
     ```
     git checkout dev
     git checkout -b docs/sonar-config
     git add sonar-project.properties
     git commit -m "chore: add sonar-project.properties for CI/CD SonarCloud scan"
     git push origin docs/sonar-config
     # Create PR to dev, merge immediately (SDD docs PR - lightweight, no review gates)
     ```
4. **Do NOT generate `ci-cd.yml` or `docker-compose.yml`** - these already exist in the repo.
   If the user requested CI/CD or Docker changes in A.5, the DevOps Agent will handle this
   during Step 3 via a feature branch (git operations only). The developer agent creates
   and merges the PR on DevOps's behalf (NOT during onboarding).
5. Run `set-secrets.js` to set GitHub Secrets and Variables automatically
   (see `references/templates/set-secrets.js` and
   [GitHub Secrets and Variables Setup](#github-secrets-and-variables-setup))
6. Proceed to PM Agent to begin the 10-step agentic SDLC pipeline (see `references/pipeline.md`)

**For Option B (New Repo):**
1. Generate `mcp_settings.json` from template (see `references/templates/mcp-settings.json`)
   - **Local only** - contains secrets, do NOT commit to repo
2. **Fill remaining placeholders in `ci-cd.yml`** (already generated by DevOps Agent in
   Step 0.1.B.4 with build section filled). Replace service-specific placeholders:
   - `<JFROG_REPO_KEY>` with the JFrog repo key from Step 0.5
   - Verify `JFROG_PLATFORM_URL`, `JFROG_DOCKER_REGISTRY`, `JFROG_USERNAME`, `JFROG_PROJECT`
     env vars reference the correct GitHub Action variables
   - Verify `SONAR_TOKEN` secret reference is correct
3. Generate `sonar-project.properties` from template (see `references/templates/sonar-project.properties`)
   - **MUST be committed to the repo** - the SonarCloud scanner reads this file from the
     repository root during CI/CD. Without it, the scan fails.
   - The DevOps Agent should commit this alongside `ci-cd.yml` and `docker-compose.yml`
     when pushing the initial codebase to the `dev` branch in Step 0.1.B.4.
     - If not pushed during Step 0.1.B.4, delegate to the Backend Agent (or sole developer agent) - create a docs branch + PR targeting `dev`:
       ```
       git checkout dev
       git checkout -b docs/sonar-config
       git add sonar-project.properties
       git commit -m "chore: add sonar-project.properties for CI/CD SonarCloud scan"
       git push origin docs/sonar-config
       # Developer Agent creates PR and merges to dev
       ```
4. Generate `.env` from template (see `references/templates/env-template.env`)
   - **Local only** - contains secrets, do NOT commit to repo
5. Run `set-secrets.js` to set GitHub Secrets and Variables automatically
   (see `references/templates/set-secrets.js` and
   [GitHub Secrets and Variables Setup](#github-secrets-and-variables-setup))
6. Proceed to PM Agent to begin the 10-step agentic SDLC pipeline (see `references/pipeline.md`)

---

## Onboarding Flow Diagram

```
  User asks to start agentic flow
              |
              v
  +----------------------------------+
  |  Step 0.1: Ask GitHub            |
  |  Existing repo or new from prompt|
  |                                  |
  |  Option A: Existing repo         |
  |  --> owner, repo, branch, PAT    |
  |  Option B: New repo              |
  |  --> owner, name, vis, prompt,   |
  |      PAT                         |
  +---------------+------------------+
                  |
         +--------+--------+
         |                 |
         v                 v
  Option A             Option B
  +----------+         +----------+
  | A.1 Collect info   | B.1 Configure MCP  |
  | A.2 Configure MCP  | B.2 Verify MCP     |
  | A.3 Verify access  |     health         |
  |     (READ-ONLY)    | B.3 Create repo    |
  | A.4 Inventory      |     via GitHub MCP |
  |     artifacts      | B.4 Build project  |
  |     (READ-ONLY)    |     PM orchestrates|
  | A.5 Ask user about |     Backend+Frontend|
  |     intent         |     PARALLEL build |
  | A.6 Ask branch     |     DevOps writes  |
  |     strategy       |     compose + yml  |
  | A.7 Proceed to 0.2 | B.5 Verify repo    |
  |     (NO code       |     via MCP        |
  |      building,     +----------+---------+
  |      NO branch          |
  |      creation,          |
  |      NO git ops         |
  |      by PM)             |
  +----------+              |
             |               |
             +-------+-------+
                     |
                     v
  +----------------------------------+
  |  Step 0.2: Walk through Jira     |
  |  --> cloud_id, email, token, key |
  |  --> Generate Base64 auth for MCP|
  +---------------+------------------+
                  |
                  v
  +----------------------------------+
  |  Step 0.3: Walk through          |
  |  SonarCloud setup                |
  |  --> project_key, org, token     |
  |  --> DISABLE Automatic Analysis! |
  +---------------+------------------+
                  |
                  v
  +----------------------------------+
  |  Step 0.4: Walk through          |
  |  Semgrep setup                   |
  |  --> app_token, exe_path         |
  +---------------+------------------+
                  |
                  v
  +----------------------------------+
  |  Step 0.5: Walk through          |
  |  JFrog setup                     |
  |  --> url, registry, repo_key,    |
  |    username, password, project   |
  +---------------+------------------+
                  |
                  v
  +----------------------------------+
  |  Step 0.6: Walk through          |
  |  Huawei ECS setup                |
  |  --> host, user, ssh_key, dir    |
  +---------------+------------------+
                  |
                  v
  +----------------------------------+
  |  Step 0.7: Auto-install          |
  |  Playwright CLI skill            |
  +----------------------------------+
  |  Generate configs:               |
  |  Option A: mcp_settings.json,    |
  |    .env, sonar-project.properties|
  |    (ONLY if missing). NO ci-cd   |
  |    or docker-compose generation. |
  |  Option B: mcp_settings.json,    |
  |    ci-cd.yml (fill placeholders, auto-trigger+cache+combined, Node.js 22, FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true, sonarcloud-github-action@master),|
  |    sonar-project.properties, .env|
  |  Run: set-secrets.js              |
  +---------------+------------------+
                  |
                  v
        Proceed to PM Agent
        (10-step agentic flow)
        -> references/pipeline.md
```