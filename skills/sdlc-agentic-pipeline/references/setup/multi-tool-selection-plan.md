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
    "context-mapper": false, "eventstorming": false, "structurizr": false
  }
}
```

`methodologies` is derived: SDD active if `sdd`/`openspec` true; TDD active if any TDD tool true; DDD active if any DDD tool true.

**Reading**: All agents read at start of first step. `isSelected(toolId)` returns true/false. If file missing, treat all tools as selected (backward-compatible default). Local only — add to `.gitignore`.

---

## Questions to Present

4 grouped multiselect questions via `question` tool. All `multiple: true`, `custom: false`.

**Q1 — MCP Servers & Services**: GitHub, Jira, SonarCloud, Semgrep, JFrog Artifactory, Huawei Cloud ECS, None
**Q2 — SDD**: SDD Toolkit (Huawei Built-in), OpenSpec (coming soon), None
**Q3 — TDD**: Playwright CLI (E2E), Postman (API), Newman (API), Jest (Unit JS/TS), Pytest (Unit Python), JUnit (Unit Java), Vitest (Unit JS/TS Vite), None
**Q4 — DDD**: Context Mapper, EventStorming, Structurizr, None

### Selection Rules
1. No defaults/pre-selection
2. No mandatory items — even GitHub is optional
3. Non-contiguous selection valid
4. "None" takes precedence if selected alongside other items
5. Built-in utility skills never mentioned

### Post-Selection Summary
Print selected/skipped items, pipeline impact, and dependency warnings. Ask: "Proceed with these selections?" (Yes/No).

---

## Dependency Warnings (Soft, Non-Blocking)

| Selected | But NOT | Warning |
|----------|---------|---------|
| SonarCloud | GitHub | SonarCloud CI/CD stage needs GitHub Actions |
| JFrog | GitHub | JFrog upload happens in GitHub Actions |
| JFrog | Huawei ECS | Deployment has no image source |
| Huawei ECS | JFrog | No Docker image to deploy |
| Playwright | GitHub | E2E tests run against local working directory only |
| Postman | Newman | Postman monitors can't reach localhost APIs |
| DDD tools | SDD | Domain model used directly without formal spec |
| Any TDD tool | GitHub | Tests not version-controlled via PRs |

---

## Conditional Config Generation

After onboarding, generate config files including only selected tools.

### mcp_settings.json
Include only selected MCP entries. If none selected: `{"mcpServers": {}}`.
Each MCP entry includes `headers` (auth) and `env` (tokens + non-secret identifiers like GITHUB_OWNER, JIRA_CLOUD_ID, SONAR_PROJECT_KEY).

### .env
Include only JFrog + ECS blocks for selected services (no MCP server for JFrog).
MCP service config (Jira, GitHub, SonarCloud, Semgrep) is NOT in .env — it lives in mcp_settings.json.

### ci-cd.yml
Only if GitHub selected. Stages: build (always), Sonar scan (if SonarCloud), JFrog deploy+verify (if JFrog). If GitHub not selected, do not generate.

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

---

## Conditional Pipeline Execution

| Step | Conditional Logic |
|------|-------------------|
| 0.DA | If NO methodology tools -> skip. SDD -> spec creation. TDD -> test layer mapping. DDD -> domain model. |
| 1 | If `jira` NOT selected -> skip Jira tasks. If `github` NOT selected -> analyze local dir. `prd` always available. |
| 1b | If `jira` NOT selected -> skip review. If `github` NOT selected -> local diff review. |
| 2 | If `jira` NOT selected -> skip sprint. If `sdd`/`openspec` NOT selected -> skip SDD. |
| 3 | If `github` NOT selected -> no branches/PRs, commit locally. If `semgrep` NOT selected -> skip pre-scan. |
| 4 | If `github` NOT selected -> skip entirely. If `semgrep` NOT selected -> skip cross-referencing. |
| 5 | If `playwright` NOT selected -> skip E2E. If `github` NOT selected -> test local dir. |
| 6 | If `github` NOT selected -> skip. If `sonarcloud` NOT selected -> remove Sonar stages. If `jfrog` NOT selected -> remove JFrog stages. |
| 7 | If `github` NOT selected -> skip merge. |
| 8 | If `huawei-ecs` NOT selected -> skip. If `jfrog` NOT selected but `huawei-ecs` IS -> warn. |
| 9 | If `jira` NOT selected -> skip sprint close. Report always runs. |
