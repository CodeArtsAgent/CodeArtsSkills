# AGENTS.md

## 1. Project Overview

A collection of custom skills for the Huawei Cloud CodeArts Agent coding assistant. Skills are consumed at runtime by the CodeArts plugin — there is no build, test, or lint pipeline at the repo level. Skills fall into two categories:

- **Installer skill** — `skill-installer` is the single meta-installer that bootstraps third-party frameworks/MCP servers into a CodeArts project/user scope. It consolidates four targets behind one entry point: `superpowers`, `office-mcp`, `playwright-cli`, `openspec` (each an adapter module under `scripts/targets/`).
- **Evaluation skills** — score and compare code-agent implementations (`code-arena-cn`, `code-arena-en`).

Per-skill usage, commands, and installation instructions live in `README.md`. This file describes repo-level conventions and contributor process only.

## 2. Goals

1. **Reusable, self-contained skills** — each skill carries its own `scripts/`, `references/`, and `assets/` with no cross-skill runtime dependencies.
2. **Cross-platform by default** — every skill must work on Windows, Linux, and macOS.
3. **Every installer target supports install, update, and delete** — `init`, `update`, `delete` are mandatory; clean uninstall must leave no residue.
4. **Zero-dependency installers** — installer scripts use only Node.js built-ins (`fs`, `path`, `os`, `child_process`, `crypto`); no npm dependencies.

## 3. Architecture

Each skill lives under `skills/<skill-name>/` and follows this convention:

```
skills/<skill-name>/
├── SKILL.md          # YAML frontmatter + Markdown instructions (required entrypoint)
├── scripts/          # Executable logic (Node.js .js/.mjs, shell .sh)
├── references/       # Reference docs consumed by the skill at runtime
└── assets/           # Static assets (manifests, templates)
```

- SKILL.md is the runtime entrypoint — its YAML frontmatter must include `name` and `description`.
- The installer skill (`skill-installer`) exposes `scripts/installer.js` — a dispatcher with a `list|init|update|delete|status` interface and a `--target <name>` selector; each target is an adapter module in `scripts/targets/` implementing `init`/`update`/`delete`/`status`. Shared helpers live in `scripts/lib/`.
- Installers track installed files via a manifest (`assets/manifests/`, gitignored) so `delete` can cleanly reverse `init`.
- Skills are self-contained: a skill's scripts/references/assets must not import from another skill.

## 4. Repository Layout

```
CodeArtsSkills/
├── AGENTS.md              # This file — repo conventions & contributor process
├── README.md              # User-facing skill docs (per-skill usage/commands)
├── skills-lock.json       # Lock file for externally-sourced skills
├── LICENSE                # MIT
├── skills/                # All skill sources (self-contained)
│   ├── skill-installer/   # Single meta-installer (targets: superpowers, office-mcp, playwright-cli, openspec)
│   ├── code-arena-cn/
│   └── code-arena-en/
└── .codeartsdoer/         # CodeArts runtime config (gitignored; do not restructure)
    ├── rule/metadata.properties
    ├── skills/ProjectSkillStatus.txt
    ├── mcp/mcp_settings.json
    └── package.json
```

`.codeartsdoer/` is CodeArts runtime config — never restructure it. Its `.gitignore` ignores all contents (`*`), so it appears empty in git by design.

## 5. Development Workflow

- **Branch per change** — create a feature branch, open a PR to merge.
- **code-arena-cn / code-arena-en are localized mirrors** — they share file layout but differ in localized text (UI selectors, button regexes, all `references/*.md`, `SKILL.md`). Mirror *structural/mechanic* changes across both; never overwrite localized text.
- **Manually test installer targets on all three platforms** (Windows, Linux, macOS) before merge.
- **Update `README.md`** for any user-facing change (new skill, new target, new command, changed flags).
- **Keep skills self-contained** — do not introduce imports between skills.

## 6. Coding Rules

- **kebab-case** for skill names and filenames (e.g., `skill-installer`, `office-mcp`).
- **Node.js first** for installer logic — pure Node.js (CommonJS or ESM) using only built-ins; never shell-only installers.
- **Shell scripts (`.sh`)** are permitted for tooling helpers but must use `#!/usr/bin/env bash` and stay POSIX-portable; note any platform limitations in the skill.
- **Cross-platform paths** — always use `path.join()`, `os.homedir()`, `os.tmpdir()`; normalize `\r\n` and convert to POSIX paths when writing config files (e.g., `mcp_settings.json`).
- **No comments** unless explaining a non-obvious decision.
- **No secrets** in source — installed config may contain machine-specific absolute paths but never credentials.

## 7. Technology Constraints

- **No repo-level build/test/lint pipeline** — there is no root `package.json`, no CI config, no eslint/jest config.
- **Node.js ≥ 18** required (CodeArts already requires Node.js and git). The `openspec` target requires Node.js ≥ 20.19.0.
- **Installer scripts**: zero npm dependencies; Node built-ins only.
- **Installed artifacts** (e.g., the office-mcp MCP server) may carry their own runtime dependencies under `.codeartsdoer/` — those belong to the upstream package, not this repo.
- If scripts depend on externally-installed tools (semgrep, dependency-cruiser, eslint, jscpd, license-checker, cloc, Playwright) that should be auto-installed at runtime.

## 8. Testing Strategy

The `skill-installer` skill ships with a **zero-dependency automated test suite** (Node built-ins only) at `skills/skill-installer/scripts/test/`. All other skills rely on the end-to-end install verification below.

### Automated tests (skill-installer)

```bash
node skills/skill-installer/scripts/test/run.js                  # fast: dispatcher + lib + openspec E2E
node skills/skill-installer/scripts/test/run.js --e2e            # + superpowers (network: git clone)
node skills/skill-installer/scripts/test/run.js --all            # + office-mcp (build) + playwright-cli (global + chromium)
node skills/skill-installer/scripts/test/run.js --filter openspec
```

- **Fast suite** (default): dispatcher routing/capability-gating, `lib/` unit tests, and openspec E2E (real CLI, temp project + temp `HOME`). Runs in seconds; no heavy side effects.
- **Opt-in E2E** (`--e2e`/`--all`): superpowers, office-mcp, playwright-cli — real installs in throwaway temp projects. `--all` pollutes the global environment (npm globals / chromium); run deliberately.
- Per-test stdout is captured and shown only on failure. E2E tests use fresh temp dirs (project scope via `cwd`, user scope via `HOME`) and clean up after themselves; the runner sweeps `assets/manifests/` before/after.

### End-to-end install verification (all installer targets)

1. Install the skill via `npx skills add https://github.com/codeartsagent/codeartsskills --skill skill-installer`.
2. Run `node installer.js init --target <name>`, then `update`, then `delete` and verify each succeeds.
3. Confirm `delete` leaves no residue — no orphan files, no stale entries in `ProjectSkillStatus.txt` / `mcp_settings.json`.
4. Repeat on Windows, Linux, and macOS.

For targets that expose a `status` command (e.g., `office-mcp`, `openspec`), verify `node installer.js status --target <name>` exits `0` after `init` and reports incomplete after `delete`.

The `code-arena` `scripts/templates/` are per-round harness skeletons generated at evaluation runtime — they are not standalone tests.

## 9. Build & Commands

There is no build step. End users install skills with:

```bash
npx skills add https://github.com/codeartsagent/codeartsskills --skill <skill-name> [-a codearts-agent]
```

Restart CodeArts after installation.

The installer skill exposes (run from `skills/skill-installer/scripts/`):

```bash
node installer.js list                              # list targets
node installer.js init   --target <name> [--project|--user]
node installer.js update --target <name> [--project|--user]
node installer.js delete --target <name> [--project|--user]
node installer.js status [--target <name>] [--project|--user]
```

- `--target <name>` selects the installer: `superpowers`, `office-mcp`, `playwright-cli`, `openspec` (also accepted positionally: `init openspec`).
- `--project` → `<cwd>/.codeartsdoer/skills/`; `--user` → `~/.codeartsdoer/skills/`; omit → auto-detect (project if `.codeartsdoer/` exists in cwd, else user).
- Capability gating rejects unsupported scope/command combos per target — e.g., `office-mcp` is project-scope only; `superpowers` has no `status`. See `README.md`.

## 10. Definition of Done

A skill change is complete when:

- [ ] Installer runs on Windows, Linux, and macOS.
- [ ] `init`, `update`, and `delete` all work (plus `status` where applicable).
- [ ] `delete` leaves no residue — no orphan files, no stale status/config entries.
- [ ] SKILL.md frontmatter is valid (`name` + `description`).
- [ ] `README.md` is updated for any user-facing change.
- [ ] Each installer target in `README.md` lists its source GitHub URL and a brief install example (CLI command + natural language).
- [ ] code-arena-cn/en pair kept in structural parity (localized text preserved).
- [ ] Verified via the end-to-end install path (`npx skills add` → init/update/delete).

## 11. Safety Rules

- **Never restructure `.codeartsdoer/`** — it is CodeArts runtime config with a self-managed `.gitignore`.
- **Never commit secrets or credentials.** Installed config may hold machine-specific absolute paths but never auth tokens/keys.
- **Never force-push to `main`.**
- **Installer `delete` must be reversible-safe** — only remove files the installer itself tracked (via manifest); never delete user-created files.
- **Do not introduce runtime dependencies between skills** — each skill is self-contained.

## 12. Common Tasks

- **Add a new skill**: create `skills/<name>/` with `SKILL.md` (+ `scripts/`, `references/`, `assets/` as needed); add a section to `README.md`. To add a new installable target, add an adapter to `skills/skill-installer/scripts/targets/<name>.js`, register it in `targets/index.js`, and implement `init`/`update`/`delete`/`status`.
- **Update a target**: edit the adapter at `skills/skill-installer/scripts/targets/<name>.js` (and shared `lib/`); test `init`/`update`/`delete`/`status --target <name>` on all platforms; keep manifest logic in sync.
- **Update code-arena**: make the structural change in both `code-arena-cn` and `code-arena-en`; keep localized text distinct.
- **Document a skill**: edit `README.md`, not `AGENTS.md` (AGENTS.md is repo conventions only).

## 13. Decision Principles

- **Self-contained over shared** — prefer duplicating small helpers across skills over cross-skill imports. (Within `skill-installer`, shared helpers live in `scripts/lib/` and are reused across target adapters.)
- **Cross-platform first** — if a feature can't run on all three OSes, document the limitation explicitly rather than silently breaking.
- **Minimal dependencies** — Node built-ins before npm packages; npm packages only for installed runtime artifacts.
- **Reversibility** — every `init` must be cleanly reversible by `delete` (track via manifest).
- **README for users, AGENTS.md for contributors** — per-skill details live in README; repo conventions live here.

## 14. FAQ / Pitfalls

- **"code-arena-cn and code-arena-en are identical"** — No. They share file layout but differ in 8 files (localized UI selectors, button regexes, `tools-README.md`, all `references/*.md`, `SKILL.md`). Mirror structural changes only, never localized text.
- **`office-mcp` target is project-scope only** — `init --target office-mcp --user` is rejected by capability gating; there is no `--user` fallback.
- **Shell scripts won't run on Windows** — `.sh` files need Git Bash or WSL. Prefer Node.js for cross-platform installer logic.
- **`mcp_settings.json` contains absolute paths** — machine-specific; never copy between machines. The installer regenerates it.
- **`.codeartsdoer/` looks empty in git** — its `.gitignore` ignores `*`; this is intentional, not a mistake.
- **All targets must stay documented in README** — the `skill-installer` section lists every supported target with its source GitHub URL, plus a brief install example covering both CLI command and natural language; keep it in sync when targets are added or changed.
