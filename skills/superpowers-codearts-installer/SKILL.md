---
name: superpowers-codearts-installer
description: Install, update, or uninstall Superpowers skills for CodeArts. Use when User wants to install Superpowers for CodeArts, update existing Superpowers skills, remove Superpowers, or set up the Superpowers workflow system on CodeArts. Triggers on: install superpowers, update superpowers, delete superpowers, remove superpowers, uninstall superpowers, setup superpowers, superpowers for CodeArts, 安装superpowers, 更新superpowers, 卸载superpowers.
---

# Superpowers CodeArts Installer

Manage the [Superpowers](https://github.com/obra/superpowers) skills framework for CodeArts with three commands: `init`, `update`, `delete`.

## Quick Start

```bash
node scripts/installer.js init    [--project|--user]
node scripts/installer.js update  [--project|--user]
node scripts/installer.js delete  [--project|--user]
```

The script requires only Node.js and git — both already needed by CodeArts. Works on Windows, Linux, and macOS.

## Commands

### `init` — Install Superpowers

Clones the Superpowers repository and copies all 14 skill directories into the target skills folder. Creates the status file, manifest, and bootstrap configuration.

```bash
node scripts/installer.js init --project
node scripts/installer.js init --user
node scripts/installer.js init            # auto-detect
```

### `update` — Update to Latest

Clones the latest Superpowers, overwrites existing skill directories, updates the manifest, and checks if the bootstrap needs syncing.

```bash
node scripts/installer.js update --project
node scripts/installer.js update --user
node scripts/installer.js update           # auto-detect
```

### `delete` — Uninstall Superpowers

Reads the manifest file to know exactly which files were installed, then removes them all. Also cleans up empty directories, removes Superpowers entries from the status file, and deletes the manifest.

```bash
node scripts/installer.js delete --project
node scripts/installer.js delete --user
node scripts/installer.js delete           # auto-detect
```

## Target Selection

| Flag | Target | Skills Path | Status File |
|------|--------|-------------|-------------|
| `--project` | Project-level | `<project>/.codeartsdoer/skills/` | `ProjectSkillStatus.txt` |
| `--user` | User-level | `~/.codeartsdoer/skills/` | `UserSkillStatus.txt` |
| (omitted) | Auto-detect | If `.codeartsdoer/` exists in cwd → project, else user | |

## Manifest

Every `init` and `update` writes a manifest file into `assets/manifests/` inside the installer skill directory. The manifest tracks every installed file by absolute path, keyed by a hash of the target skills directory. This enables `delete` to perform a 100% clean removal without leaving orphaned files, and keeps the manifest separate from the Superpowers skills themselves.

## Installation Modes

### Project-Level (`--project`)

Skills go into `<project>/.codeartsdoer/skills/`. Bootstrap is `CODEARTS.md` at the project root, which embeds the `using-superpowers` content for session startup.

- Skills are scoped to one project
- Each project can have different Superpowers versions

### User-Level (`--user`)

Skills go into `~/.codeartsdoer/skills/`. Bootstrap is `~/.codeartsdoer/rule/superpowers-bootstrap.md`, which references the skill path for dynamic loading.

- Skills available across all projects
- No per-project CODEARTS.md sync needed

## After Installation

Restart CodeArts. The `using-superpowers` skill will activate at session start, and all Superpowers skills will be available via the `skill` tool.

Verify by asking: "Tell me about your superpowers"
