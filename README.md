# CodeArts Skills

Custom skills for the [CodeArts](https://www.huaweicloud.com/intl/en-us/product/codearts.html) coding assistant.

## Installation

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill <skill-name>
```

Then restart CodeArts. The skill will be available in your next session.

---

## Skills

### superpowers-installer

Install, update, or uninstall the [Superpowers](https://github.com/obra/superpowers) skills framework for CodeArts.

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill superpowers-installer -a codearts-agent
```

**Usage — three commands:**

```bash
node skills/superpowers-installer/scripts/installer.js init    [--project|--user]
node skills/superpowers-installer/scripts/installer.js update  [--project|--user]
node skills/superpowers-installer/scripts/installer.js delete  [--project|--user]
```

| Command | Description |
|---------|-------------|
| `init` | Clone Superpowers and install all 14 skill directories |
| `update` | Pull latest Superpowers and overwrite existing skills |
| `delete` | Cleanly remove all installed Superpowers files |

**Target selection:**

| Flag | Scope | Skills Path |
|------|-------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` |
| `--user` | All projects | `~/.codeartsdoer/skills/` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user |

**ALSO, YOU CAN USE NATURAL LANGUAGE TO LET THIS SKILL TO INSTALL/UPDATE/DELATE Superpowers for you.**

**Requirements:** Node.js and git (both already required by CodeArts). Works on Windows, Linux, and macOS.

After installation, restart CodeArts and verify by asking: "Tell me about your superpowers".

---

### office-mcp-installer

One-click installer for the [office-mcp](https://github.com/claude-office-skills/skills/tree/main/mcp-servers/office-mcp) MCP server — 39 tools for Word, Excel, PowerPoint, PDF, and OCR operations. Installs to the **current project only** (project-scope); no user-level/global option.

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill office-mcp-installer -a codearts-agent
```

**Usage — four commands** (run from the skill's `scripts/` dir):

```bash
node skills/office-mcp-installer/scripts/installer.js init     # Install office-mcp into this project
node skills/office-mcp-installer/scripts/installer.js update   # Rebuild from latest source
node skills/office-mcp-installer/scripts/installer.js delete   # Completely uninstall office-mcp
node skills/office-mcp-installer/scripts/installer.js status   # Show current install state
```

| Command | Description |
|---------|-------------|
| `init` | Clone + build the MCP server, install to `.codeartsdoer/mcp/office-mcp/`, register skill + MCP config |
| `update` | Re-clone + rebuild from latest source, overwrite installed files, refresh SKILL.md |
| `delete` | Remove server dir, skill dir, MCP config entry, and status entry — 100% clean uninstall |
| `status` | Report install health (server present, version, MCP config registered, skill enabled) |

**Project-scope only** — the installer locates the project root by walking up for a `.codeartsdoer/` folder; it errors if none is found. There is no `--user` fallback.

| Artifact | Project Path |
|----------|--------------|
| MCP server | `<project>/.codeartsdoer/mcp/office-mcp/` |
| MCP config | `<project>/.codeartsdoer/mcp/mcp_settings.json` |
| Skill definition | `<project>/.codeartsdoer/skills/office-mcp/SKILL.md` |
| Skill status | `<project>/.codeartsdoer/skills/ProjectSkillStatus.txt` |

**ALSO, YOU CAN USE NATURAL LANGUAGE TO LET THIS SKILL TO INSTALL/UPDATE/DELETE office-mcp for you.**

**Requirements:** Node.js, git, and npm (all already required by CodeArts). Works on Windows, Linux, and macOS.

After installation, restart CodeArts. Verify by asking: "Read the Excel file at ./data.xlsx" or "Create a PowerPoint with 5 slides".

---

### playwright-cli-installer

One-click installer for the [playwright-cli](https://github.com/microsoft/playwright-cli) browser automation skill — 40+ CLI commands for navigation, interaction, form filling, and web testing. Installs the skill files, the `@playwright/cli` npm package, and the chromium browser, then runs a dry-run verification.

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill playwright-cli-installer -a codearts-agent
```

**Usage — four commands:**

```bash
node skills/playwright-cli-installer/scripts/installer.js init     [--project|--user]
node skills/playwright-cli-installer/scripts/installer.js update   [--project|--user]
node skills/playwright-cli-installer/scripts/installer.js delete   [--project|--user]
node skills/playwright-cli-installer/scripts/installer.js status   [--project|--user]
```

| Command | Description |
|---------|-------------|
| `init` | Install skill files (npx skills add) + CLI (npm install -g) + chromium browser + dry-run check |
| `update` | Re-install skill files, upgrade CLI, reinstall browser, re-run dry-run check |
| `delete` | Remove skill files via npx skills remove (CLI and browser are global, not removed) |
| `status` | Report install health (skill files, CLI version, chromium browser) |

**Target selection:**

| Flag | Scope | Skills Path |
|------|-------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` |
| `--user` | All projects | `~/.codeartsdoer/skills/` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user |

**ALSO, YOU CAN USE NATURAL LANGUAGE TO LET THIS SKILL TO INSTALL/UPDATE/DELETE playwright-cli for you.**

**Requirements:** Node.js, npm, and git (all already required by CodeArts). Works on Windows, Linux, and macOS.

After installation, restart CodeArts. Verify by asking: "Open https://example.com with playwright-cli and take a snapshot".

---

### openspec-installer

One-click installer for [OpenSpec](https://github.com/Fission-AI/OpenSpec) — the spec-driven development (SDD) framework for AI coding assistants. OpenSpec's official installer does not support CodeArts; this skill bridges the gap by generating the self-contained OpenSpec skills (via the `trae` donor tool, which has no command adapter) and placing them where CodeArts reads skills. Installs **skills only** — run `openspec init` in each project to create its `openspec/` spec directory.

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill openspec-installer -a codearts-agent
```

**Usage — four commands:**

```bash
node skills/openspec-installer/scripts/installer.js init     [--project|--user]
node skills/openspec-installer/scripts/installer.js update   [--project|--user]
node skills/openspec-installer/scripts/installer.js delete   [--project|--user]
node skills/openspec-installer/scripts/installer.js status   [--project|--user]
```

| Command | Description |
|---------|-------------|
| `init` | Generate OpenSpec skills via `openspec init --tools trae --profile core`, copy `openspec-*` into the skills dir, register in status file |
| `update` | Regenerate skills from the installed `openspec` CLI's latest content, overwrite installed skills, refresh manifest |
| `delete` | Remove tracked `openspec-*` skills, clear status entries, remove manifest (leaves `openspec/` spec data intact) |
| `status` | Report openspec CLI version, installed skills, status entries, manifest; exit 0 if healthy, 1 otherwise |

**Target selection:**

| Flag | Scope | Skills Path | Status File |
|------|-------|-------------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` | `ProjectSkillStatus.txt` |
| `--user` | All projects | `~/.codeartsdoer/skills/` | `UserSkillStatus.txt` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user | — |

**ALSO, YOU CAN USE NATURAL LANGUAGE TO LET THIS SKILL TO INSTALL/UPDATE/DELETE OpenSpec for you.**

**Requirements:** Node.js ≥ 20.19.0 (OpenSpec requirement) and npm. If the `openspec` CLI is missing, `init`/`update` auto-install it globally (`npm i -g @fission-ai/openspec@latest`). Works on Windows, Linux, and macOS.

After installation, restart CodeArts. Create the project spec dir with `openspec init`, then verify by asking: "Propose a new feature using OpenSpec".

---

### codearena-cn

评测/对比基于同一需求的多个Agent代码实现并打分。按两套独立 rubric（通用 Basic /100 + 本轮需求 Round /100，各加最高 +10 动态加分）评测，产出中英双语报告，覆盖 API / 视觉 / SAST / 架构 / 治理 / 覆盖率评测。

请将需要评测的多个项目放在同一个工作空间下，并使用任意Code Agent打开

> **当前仅支持基于 Node.js 技术栈的评测。**

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill codearena-cn
```

**Usage — 在 CodeArts 中输入以下指令即可触发：**

```
开始一轮评测
评估项目 <name1>的<branch1>,<name1>的<branch2>,<name2>的<branch2>,<name3>的<branch3>
原始需求为 <raw prompt>
```

**评测工具：**

Skill 会自动检测评测所需工具是否已安装，如缺失会自动安装，无需手动配置。覆盖工具包括：semgrep、dependency-cruiser、eslint、jscpd、license-checker、cloc、Playwright+Chromium、playwright-cli skill。

---

### codearena-en

Evaluate, score, and compare multiple implementations of the same requirement — different builds of multi code agents. Uses two independent rubrics (Basic /100 + Round /100, each up to +10 dynamic bonus), produces bilingual (EN + CN) reports, covering API / visual / SAST / architecture / governance / coverage checks.

Please put multi projects in the same workspace and open with one code agent tool(e.g. Claude Code, Codex, Trae, Qoder, Cursor, CodeArts, etc.)

> **Currently only supports Node.js tech stack evaluation.**

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill codearena-en
```

**Usage — trigger in CodeArts with:**

```
Start an evaluation round
Evaluate project <name1>的<branch1>,<name1>的<branch2>,<name2>的<branch2>,<name3>的<branch3>
Raw Requirement <raw prompt>
```

**Evaluation tools:**

The skill auto-detects whether required evaluation tools are installed and installs missing ones automatically — no manual setup needed. Covers: semgrep, dependency-cruiser, eslint, jscpd, license-checker, cloc, Playwright+Chromium, playwright-cli skill.

---

## License

MIT
