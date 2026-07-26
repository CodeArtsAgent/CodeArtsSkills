# Config Templates & Runtime Files Reference

> This file is the **single source of truth** for template and config file
> descriptions. Referenced by `SKILL.md` and `pipeline.md`.

---

## Template Files (`references/templates/`)

Ready-to-fill templates are in `references/templates/`:

| Template | Description |
|----------|-------------|
| `mcp-settings.json` | MCP server configuration (conditional: only selected MCP entries included) |
| `ci-cd.yml` | GitHub Actions workflow template (conditional: only selected stages included; not generated if GitHub not selected) |
| `sonar-project.properties` | SonarCloud project configuration (only if SonarCloud selected) |
| `env-template.env` | Environment variables (conditional: only selected service blocks included) |
| `set-secrets.js` | GitHub Actions secrets/variables setup script (conditional: only selected service secrets/vars) |
| `add_ssh_key.py` | Python script to add SSH public key to Huawei Cloud ECS for key-based authentication |
| `apply-tool-selections.ps1` | Windows: updates agent `permission.skill` blocks based on `tool-selections.json` + `skill-registry.json` (methodology skills only, never touches built-in) |
| `apply-tool-selections.sh` | macOS/Linux: same as above |
| `SKILL.md` | Postman MCP skill definition (TDD: API layer) |
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

| MCP Server | Purpose | Auth |
|------------|---------|------|
| `atlassian-rovo-mcp` | Jira tasks, sprints, comments, transitions | Basic (Base64 `email:token`) |
| `github` | Repos, branches, PRs, reviews, workflow dispatch | Bearer PAT |
| `sonarqube` | Quality gate, issues, coverage, hotspots | Bearer token |
| `semgrep` | Local static analysis, security scanning | App token env |

JFrog is configured as a service (REST API) in `.env` + GitHub secrets,
not as an MCP server.