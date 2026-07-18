---
name: skill-installer
description: "Single entry point to install, update, delete, or check the status of any supported CodeArts skill/tool installer. Consolidates four installers behind one skill: superpowers, office-mcp, playwright-cli, and openspec. OpenSpec and other tools don't natively support CodeArts; this meta-installer bridges them. Specify the target via --target <name> (or positionally). Use whenever the user wants to install/update/delete any of these targets, or to list what's supported. Triggers on: install superpowers, install office-mcp, install playwright-cli, install openspec, 一键安装技能, 安装技能, skill installer, update skills, uninstall skills, 安装openspec, 安装office文档工具, 安装浏览器自动化工具."
---

# Skill Installer

One entry point for all CodeArts skill/tool installers. Pass the target name via `--target <name>` (or positionally) and the command (`init`/`update`/`delete`/`status`). The dispatcher validates each target's supported scopes and commands before running, then delegates to the target's adapter.

This is the **only** installer skill exposed to CodeArts. The four individual installers (`superpowers-installer`, `office-mcp-installer`, `playwright-cli-installer`, `openspec-installer`) are consolidated as internal adapter modules under `scripts/targets/`.

## Quick Start

```bash
node scripts/installer.js list                              # list supported targets
node scripts/installer.js init   --target openspec         # install a target (auto-detect scope)
node scripts/installer.js status --target openspec         # status of one target
node scripts/installer.js status                           # status of all targets
node scripts/installer.js delete --target openspec         # uninstall a target
```

Positional shorthand: `init openspec` ≡ `init --target openspec`.

## Commands

| Command | Description |
|---------|-------------|
| `list` | List supported targets with their scopes, commands, and descriptions |
| `init --target <name>` | Install the target into the resolved scope |
| `update --target <name>` | Regenerate/refresh the target from latest source |
| `delete --target <name>` | Uninstall the target (clean; tracked via manifest where applicable) |
| `status [--target <name>]` | Health of one target, or all targets if `--target` omitted |

## Supported Targets

| Target | Scopes | Commands | Installs |
|--------|--------|----------|----------|
| `superpowers` | project, user | init, update, delete | 14 Superpowers skills (brainstorming, TDD, debugging, …) + bootstrap |
| `office-mcp` | project | init, update, delete, status | MCP server (39 Word/Excel/PPT/PDF/OCR tools) + skill + MCP config |
| `playwright-cli` | project, user | init, update, delete, status | playwright-cli skill + `@playwright/cli` + chromium browser |
| `openspec` | project, user | init, update, delete, status | OpenSpec SDD skills (propose/explore/apply/sync/archive) |

Capability gating rejects unsupported combos up front — e.g. `init --target office-mcp --user` errors ("office-mcp supports project scope only"); `status --target superpowers` errors ("superpowers has no status command").

## Scope

| Flag | Scope | Skills Path | Status File |
|------|-------|-------------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` | `ProjectSkillStatus.txt` |
| `--user` | All projects | `~/.codeartsdoer/skills/` | `UserSkillStatus.txt` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user | — |

**ALSO, YOU CAN USE NATURAL LANGUAGE TO LET THIS SKILL INSTALL/UPDATE/DELETE any supported target for you** — just name the target (e.g. "install openspec", "更新 office-mcp", "uninstall superpowers").

## Requirements

Node.js (≥ 20.19.0 for openspec; ≥ 18 otherwise), npm, and git — all already required by CodeArts. Individual targets may install global packages (openspec CLI, @playwright/cli) or download browsers automatically. Works on Windows, Linux, and macOS.

## Layout

```
skill-installer/
├── SKILL.md
├── scripts/
│   ├── installer.js          # dispatcher: parse, validate capabilities, delegate
│   ├── lib/                  # shared helpers (exec, paths, status-file, manifest)
│   └── targets/              # one adapter per target
│       ├── index.js
│       ├── superpowers.js
│       ├── office-mcp.js
│       ├── playwright-cli.js
│       └── openspec.js
└── assets/manifests/         # runtime manifests (gitignored)
```
