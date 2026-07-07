---
name: openspec-installer
description: "One-click installer for OpenSpec — the spec-driven development (SDD) framework for AI coding assistants — into CodeArts. Generates the OpenSpec skills (openspec-propose, openspec-explore, openspec-apply-change, openspec-sync-specs, openspec-archive-change) via the openspec CLI and installs them into the project or user skills directory. OpenSpec's official installer does not support CodeArts; this skill bridges that gap. Installs skills only — run `openspec init` in each project to create its openspec/ spec directory. Use when the user wants to install, update, or uninstall OpenSpec for CodeArts. Triggers on: install openspec, setup openspec, add openspec, 一键安装openspec, 安装openspec, openspec spec-driven development, SDD framework."
---

# OpenSpec Installer

One-click installer for [OpenSpec](https://github.com/Fission-AI/OpenSpec) — spec-driven development (SDD) for AI coding assistants. Installs the OpenSpec **skills** into CodeArts so the agent can drive the `openspec` CLI through the generated skills: `openspec-propose`, `openspec-explore`, `openspec-apply-change`, `openspec-sync-specs`, `openspec-archive-change`.

OpenSpec's official `openspec init --tools ...` does not support CodeArts (no `codearts` tool ID). This installer bridges the gap by generating the self-contained skills via the `trae` donor tool (which has no command adapter, so its `SKILL.md` files are full workflow instructions) and placing them where CodeArts reads skills: `.codeartsdoer/skills/`.

**Installs skills only.** To create a project's `openspec/` spec directory (specs/changes/config), run `openspec init` in that project yourself.

## Quick Start

```bash
node scripts/installer.js init     [--project|--user]   # Install OpenSpec skills
node scripts/installer.js update   [--project|--user]   # Regenerate skills from latest openspec CLI
node scripts/installer.js delete   [--project|--user]   # Uninstall OpenSpec skills
node scripts/installer.js status   [--project|--user]   # Show install state
```

Requires Node.js ≥ 20.19.0 (OpenSpec requirement) and npm. If the `openspec` CLI is missing, `init`/`update` auto-install it globally (`npm i -g @fission-ai/openspec@latest`). Works on Windows, Linux, and macOS.

## Commands

### `init` — Install

1. Verifies Node.js ≥ 20.19.0; ensures the `openspec` CLI is installed (auto-installs globally if missing).
2. Generates the OpenSpec skills in a temp dir via `openspec init --tools trae --profile core`.
3. Copies each `openspec-*` skill folder into the target skills directory.
4. Registers each skill in `ProjectSkillStatus.txt` / `UserSkillStatus.txt`.
5. Writes a manifest (for clean uninstall) and cleans up the temp dir.

```bash
node scripts/installer.js init
```

### `update` — Regenerate

Re-runs generation in a fresh temp dir (picks up the installed `openspec` CLI's latest skill content), overwrites the installed skills, and refreshes the manifest. Run this after upgrading the `openspec` CLI.

```bash
node scripts/installer.js update
```

### `delete` — Uninstall

Removes the tracked `openspec-*` skill folders, clears their status-file entries, and deletes the manifest. Leaves the project's `openspec/` spec data untouched.

```bash
node scripts/installer.js delete
```

### `status` — Show State

Reports the `openspec` CLI version, target skills dir, installed `openspec-*` skills, status-file entries, and manifest. Exits `0` if healthy, `1` otherwise.

```bash
node scripts/installer.js status
```

## Scope

| Flag | Scope | Skills Path | Status File |
|------|-------|-------------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` | `ProjectSkillStatus.txt` |
| `--user` | All projects | `~/.codeartsdoer/skills/` | `UserSkillStatus.txt` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user | — |

## What Gets Installed

Five skills (core profile) are generated into the target skills dir:

- `openspec-propose` — propose a new change (proposal + design + specs + tasks)
- `openspec-explore` — explore mode, a thinking partner before/during a change
- `openspec-apply-change` — implement the tasks of a proposed change
- `openspec-sync-specs` — sync delta specs into main specs
- `openspec-archive-change` — archive a completed change

Each `SKILL.md` is self-contained and drives the `openspec` CLI via bash commands.

## After Installation

Restart CodeArts. Then:

1. Create the project spec dir (once per project):
   ```bash
   openspec init
   ```
2. Verify by asking CodeArts: *"Propose a new feature using OpenSpec"* — the `openspec-propose` skill triggers by description.