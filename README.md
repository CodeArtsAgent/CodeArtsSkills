# CodeArts Skills

Custom skills for the [CodeArts](https://www.huaweicloud.com/intl/en-us/product/codearts.html) coding assistant.

## Installation

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill <skill-name>
```

Then restart CodeArts. The skill will be available in your next session.

---

## Skills

### superpowers-codearts-installer

Install, update, or uninstall the [Superpowers](https://github.com/obra/superpowers) skills framework for CodeArts.

**Installation:**

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill superpowers-codearts-installer -a codearts-agent
```

**Usage — three commands:**

```bash
node skills/superpowers-codearts-installer/scripts/installer.js init    [--project|--user]
node skills/superpowers-codearts-installer/scripts/installer.js update  [--project|--user]
node skills/superpowers-codearts-installer/scripts/installer.js delete  [--project|--user]
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
