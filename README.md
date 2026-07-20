# CodeArts Skills

Custom skills for the [CodeArts](https://www.huaweicloud.com/intl/en-us/product/codearts.html) coding assistant.

## Installation

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill <skill-name>
```

Then restart CodeArts. The skill will be available in your next session.

---

## Skills

### skill-installer

Single entry point to install, update, delete, or check the status of any supported CodeArts skill/tool. Consolidates five installers behind one skill — **superpowers**, **office-mcp**, **playwright-cli**, **openspec**, and **spec-kit** — as internal adapter modules. Specify the target via `--target <name>` (or positionally). 

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill skill-installer -a codearts-agent
```

**Usage:**

```bash
node skills/skill-installer/scripts/installer.js list
node skills/skill-installer/scripts/installer.js init   --target <name> [--project|--user]
node skills/skill-installer/scripts/installer.js update --target <name> [--project|--user]
node skills/skill-installer/scripts/installer.js delete --target <name> [--project|--user]
node skills/skill-installer/scripts/installer.js status [--target <name>] [--project|--user]
```

Positional shorthand: `init openspec` ≡ `init --target openspec`.

**Example — install openspec globally (CLI or natural language):**

```bash
node skills/skill-installer/scripts/installer.js init --target openspec --user
```
Or just tell CodeArts: *"install openspec globally"* / *"安装 openspec 到用户级别"*.

| Command | Description |
|---------|-------------|
| `list` | List supported targets with scopes, commands, and descriptions |
| `init --target <name>` | Install the target into the resolved scope |
| `update --target <name>` | Regenerate/refresh the target from latest source |
| `delete --target <name>` | Uninstall the target (clean; manifest-tracked where applicable) |
| `status [--target <name>]` | Health of one target, or all targets if `--target` omitted |

**Supported targets:**

| Target | Scopes | Commands | Source | Installs |
|--------|--------|----------|--------|----------|
| `superpowers` | project, user | init, update, delete | [obra/superpowers](https://github.com/obra/superpowers) | 14 Superpowers skills + bootstrap |
| `office-mcp` | project | init, update, delete, status | [claude-office-skills/skills](https://github.com/claude-office-skills/skills/tree/main/mcp-servers/office-mcp) | MCP server (39 Word/Excel/PPT/PDF/OCR tools) + skill + MCP config |
| `playwright-cli` | project, user | init, update, delete, status | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | playwright-cli skill + `@playwright/cli` + chromium |
| `openspec` | project, user | init, update, delete, status | [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | OpenSpec SDD skills (propose/explore/apply/sync/archive) |
| `spec-kit` | project, user | init, update, delete, status | [github/spec-kit](https://github.com/github/spec-kit) | GitHub Spec Kit SDD skills (/speckit.constitution/specify/plan/tasks/implement) |

Capability gating rejects unsupported combos up front — e.g. `init --target office-mcp --user` errors (project scope only); `status --target superpowers` errors (no status command).

**Scope:**

| Flag | Scope | Skills Path | Status File |
|------|-------|-------------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` | `ProjectSkillStatus.txt` |
| `--user` | All projects | `~/.codeartsdoer/skills/` | `UserSkillStatus.txt` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user | — |

**ALSO, YOU CAN USE NATURAL LANGUAGE TO LET THIS SKILL INSTALL/UPDATE/DELETE any supported target for you** — just name the target (e.g. "install openspec", "更新 office-mcp", "uninstall superpowers").

**Requirements:** Node.js (≥ 20.19.0 for openspec; ≥ 18 otherwise), npm, and git — all already required by CodeArts. Individual targets may install global packages (openspec CLI, `@playwright/cli`) or download browsers automatically. `spec-kit` additionally requires [uv](https://docs.astral.sh/uv/) (auto-installed if missing) and provisions Python 3.12 via uv. Works on Windows, Linux, and macOS.

**Verify:** after install + restart, ask CodeArts something target-specific — e.g. "Propose a new feature using OpenSpec", "Read the Excel file at ./data.xlsx", "Tell me about your superpowers", or "Open https://example.com with playwright-cli".

**Testing:** the skill ships with a zero-dependency test suite:

```bash
node skills/skill-installer/scripts/test/run.js            # fast: dispatcher + lib + openspec E2E
node skills/skill-installer/scripts/test/run.js --e2e      # + superpowers
node skills/skill-installer/scripts/test/run.js --all      # + office-mcp, playwright-cli (heavy)
```

---

### code-arena-cn

评测/对比基于同一需求的多个Agent代码实现并打分。按两套独立 rubric（通用 Basic /100 + 本轮需求 Round /100，各加最高 +10 动态加分）评测，产出中英双语报告，覆盖 API / 视觉 / SAST / 架构 / 治理 / 覆盖率评测。

请将需要评测的多个项目放在同一个工作空间下，并使用任意Code Agent打开

> **当前仅支持基于 Node.js 技术栈的评测。**

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill code-arena-cn
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

### code-arena-en

Evaluate, score, and compare multiple implementations of the same requirement — different builds of multi code agents. Uses two independent rubrics (Basic /100 + Round /100, each up to +10 dynamic bonus), produces bilingual (EN + CN) reports, covering API / visual / SAST / architecture / governance / coverage checks.

Please put multi projects in the same workspace and open with one code agent tool(e.g. Claude Code, Codex, Trae, Qoder, Cursor, CodeArts, etc.)

> **Currently only supports Node.js tech stack evaluation.**

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill code-arena-en
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
