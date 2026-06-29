---
name: codearena-en
description: "Evaluate, score, and compare multiple implementations of the same requirement — different builds, or multiple branches of one repo. Use when the user asks to start/run an evaluation round, compare several implementations, compare branches of a repo, score projects against the basic + round rubrics, or run API / visual / SAST / architecture / governance / coverage checks and produce a bilingual (English + Chinese) report."
---

# CodeArena evaluation skill

Evaluate each project implementation against **two independent rubrics** — a generic **Basic /100** and a per-round, requirement-specific **Round /100** (each plus up to +10 dynamic bonus) — and produce a **bilingual (EN + CN)** report. This skill bundles the full standard, rubrics, report template, and probe scripts.

## 0. Required resources (all inside this skill)
- `references/EVAL_STANDARDS.md` — the authoritative standard (workflow, hard rules, baselined-tool table). **Read before evaluating.**
- `references/basic_eval_cases.md` — static Basic rubric (B1 Security 30 / B2 Visual 18 / B3 Code Quality 30 / B4 Governance 10 / B5 Test Coverage 12). Reused verbatim every round.
- `references/report_template.md` — report template (three sections).
- `references/scoring_overview.md` — scoring breakdown.
- `references/example_round_eval_cases.md` — a sample round rubric (0→1 requirement) to model new round cases on.
- `scripts/` — generic libs `lib/` (http/ui/port-detect), per-round `templates/` (api/ui/visual skeletons), screenshot tool `cap.mjs`, readiness check `check-tools.sh`, installer `setup-tools.sh` (see §4, §5).

## 1. Workflow (every round MUST follow these steps, in order)
Paths are relative to the working root (where the projects under review and `EvalSets/` live); `<round>` is the short round id chosen by the user.

0. **Tool-readiness check (mandatory before each round)** — run `bash scripts/check-tools.sh`; **verify every tool is installed and usable BEFORE using it**, install any missing ones with `bash scripts/check-tools.sh --install` (per-tool install methods in §4 and `scripts/tools-README.md`), then proceed.
1. **Choose targets & names** — a **target = (repo, branch)**; targets may span different repos **and/or multiple branches of one repo** (at least two targets). Projects are **discovered recursively** under the working root (they may sit in subdirectories) and may be given by **name alone** — names are assumed unique, resolved via `find <root> -type d -name <name>` to a path. Per repo, record **resolved path + branch(es) + display name(s)**. **Branch rule**: no branch → current branch; one/several branches → each is its own target, evaluated at its **last commit** (report column `<repo>@<branch>`). Record the mapping to `EvalSets/<round>/<round>_targets.md` (EN + CN, incl. branch + resolved scope).
2. **Capture the raw prompt** — record it verbatim to `EvalSets/<round>/<round>_raw_prompt.md` (EN + CN). **If the user gave no projects/targets or no raw prompt, ASK for them first — never guess targets or invent the requirements.**
3. **Run** (only after the user approves 3.1):
   - 3.1 From the prompt, generate `EvalSets/<round>/<round>_eval_cases.md` (EN + CN, /100 + bonus) → user reviews/updates until approved.
   - 3.2 Run the scope gate, set up isolated temp copies, start probing; **write and retain all evidence** under `EvalSets/<round>/evidence/`.
   - 3.3 Run Basic cases first (`basic_eval_cases.md`).
   - 3.4 Run Round cases next.
4. **Write the report** — per `report_template.md`, produce `EvalSets/<round>/<round>_test_report.md` and `_cn.md`.

## 2. Hard rules (must follow)
- **Scope = the resolved set per target** (run the scope gate first): **default current branch** — dirty → uncommitted delta vs `HEAD`; clean → **last commit content** (`git diff --name-only HEAD~1 HEAD`, full tree if a root commit). **Explicitly named branch** — evaluate its **tip (last commit)**, ignoring uncommitted working-tree changes. Multiple branches of one repo each use their own temp checkout (`git worktree add <tmp-i> <branch>` or `git archive`), isolated. **Stagger ports across concurrent targets**: prefer serial; if concurrent, offset by target index `i` — backend `PORT=<base>+i`, frontend `<base>+i`, and point each frontend at its own backend (`BASE`/`FE_BASE`/`VITE_API_BASE` or override the Vite proxy); only go concurrent when the backend URL is configurable. **Mandatory teardown**: `pkill -9 node`, restore data dirs, then `git worktree remove <tmp-i> --force` per checkout + `git worktree prune` — leave nothing behind.
- **Both rubrics total exactly 100**, each with its own dynamic bonus (up to +10).
- **No double-counting**: the same issue/capability is scored once. A cross-domain defect (e.g. a hardcoded secret) is penalized only in the most specific item (→ B1-8), not again in SAST; already-scored capabilities (pagination / time formatting / status tags / filtering / error handling) are **not** also awarded as bonus.
- **Round isolation**: each round is fully independent — score and describe only the current round, never compare to or carry over prior rounds ("fixed / regressed / vs round X" forbidden). Sole exception: the B3d-2 compatibility check may diff against the same repo's previous git revision (uncommitted vs `HEAD`, or `HEAD` vs `HEAD~1`) as a within-item technical diff.
- **Independence**: functional/security/UX scores come from evaluator-authored probes; a project's own tests count only toward the R4 Testing domain.
- **Bilingual deliverables**: every artifact ships as English `<name>.md` + Chinese `<name>_cn.md`; **sole exception `evidence/`** (JSON/screenshots/scripts not translated).
- **Report format**: three sections (Summary / Detailed Score Tables / Test Execution); the Summary uses differential comparison — common strengths/weaknesses listed once, differentiators as a by-domain table, bonus items tagged **[bonus]**; no "recommended fixes" section.

## 3. Baselined tools (fixed per domain, consistent across rounds)
| Domain | Tool |
|---|---|
| Functional correctness | backend: Node `fetch` probe (**generated per round**, see §5); frontend: **complete end-to-end UI testing via the `playwright-cli` skill** + a **per-round-generated** UI harness. Both use the generic libs `scripts/lib/{http,ui}.mjs`; skeletons in `scripts/templates/` |
| Visual UX | Playwright full-page screenshots @ 3 viewports (generic engine `scripts/cap.mjs`; screen list calibrated per target) + multimodal review |
| Code quality / SAST | Semgrep + **official `semgrep-rules` (fetched fresh each round via `git clone`; never bundled/frozen)** + `scripts/sast-rules.yaml` (secret/JWT supplement only) + `npm audit` |
| Architecture quality | dependency-cruiser |
| Readability | ESLint + eslint-plugin-complexity + jscpd (duplication must be ≤3%) |
| RESTful + compatibility | API probe + manual route review + `git diff` |
| Open-source governance | license-checker (dependencies only, OSI-permissive) + `npm audit --omit=dev` (no High/Critical) |
| Test coverage (Basic B5) | **c8** (V8 coverage, wraps any runner) + `vitest --coverage` (frontend); map endpoints/roles/error-paths/E2E write-flows |

## 4. Tool readiness & install (do this first)
**Run the readiness check, then install what's missing** — confirm each tool is usable before using it:
```bash
bash scripts/check-tools.sh            # prints OK / MISSING per tool
bash scripts/check-tools.sh --install  # auto-installs the missing ones, then re-checks
```
`check-tools.sh` covers: semgrep, dependency-cruiser, eslint(+complexity), jscpd, license-checker, cloc, Playwright+Chromium, the playwright-cli skill (plus node/npm/git/python/pip). Per-tool install commands are below and in `scripts/tools-README.md`.

Pick one environment (or both):

**A. Host machine, one-shot into `~/tools/`** — see `scripts/setup-tools.sh` (details in `scripts/tools-README.md`):
```bash
chmod +x scripts/setup-tools.sh && ./scripts/setup-tools.sh   # installs Semgrep engine / dependency-cruiser / ESLint / jscpd / license-checker / cloc / Playwright
npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli   # installs the playwright-cli skill (complete UI testing)
```
Note: if a GitHub-release download hits `curl (16) HTTP2`, the script already uses `--http1.1 -C -`; on Apple Silicon the symlink dir is `/opt/homebrew/bin`.

**B. In-sandbox (where evaluation actually runs):**
```bash
# Node tools (local install to avoid polluting global)
npm i dependency-cruiser eslint@8 eslint-plugin-complexity jscpd license-checker
# Semgrep engine: download the wheel then --no-deps install, then backfill deps
pip install semgrep --break-system-packages         # or: pip install ./semgrep-*.whl after downloading the wheel
```
**Semgrep rule files must be fetched fresh from the official source each round (not bundled, not frozen-cached):**
```bash
git clone --depth 1 https://github.com/semgrep/semgrep-rules.git   # pull the latest official rules at eval time
```
Note: the sandbox proxy often returns 403 for GitHub-release binaries, but `git clone` and pip/npm work — so official Semgrep rules are always `git clone`d fresh. This skill does **not** bundle a copy of the official rules; it only bundles `scripts/sast-rules.yaml` as a secret/JWT supplement the official JS set misses. The current rubric has no DAST, so OWASP ZAP / Dependency-Check are not installed; governance = license-checker + npm audit.

## 5. Scripts: generic (pre-written) vs generated per round

**Core principle: the test scripts (what gets tested — assertions, flows, fields, test data) MUST be generated each round from the round's code + the eval standard + `<round>_eval_cases.md` + `<round>_raw_prompt.md`. Only generic infrastructure is pre-written.**

**Generic, pre-written (use as-is):**
- `scripts/lib/http.mjs` — request/multipart/token-extract/result `Recorder`.
- `scripts/lib/ui.mjs` — Playwright launch (`PW_EXEC`/`--no-sandbox`), login, toast poll, console/page error capture, screenshot, `UIRecorder`.
- `scripts/lib/detect-ports.mjs` / `scripts/detect-ports.mjs` — detect ports from README/config.
- `scripts/cap.mjs` — 3-viewport screenshots (single login to avoid rate limiters).
- `scripts/sast-rules.yaml`, `setup-tools.sh`, `check-tools.sh`, `tools-README.md`.

**Generated per round (from `scripts/templates/` skeletons — never run the template directly):**
- `templates/api_test.template.mjs` → `EvalSets/<round>/evidence/harness/api_test.mjs`: fill the contract block + one assertion per eval-case from the target's real routes.
- `templates/ui_test.template.mjs` → `…/harness/ui_test.mjs`: fill the complete write-path flows from the target's routes/selectors/labels.
- `templates/visual_test.template.mjs` → `…/harness/visual_test.mjs`: fill which screens to capture (use `cap.mjs` for the simple case).

**Generation steps (workflow 3.x):**
1. Read `<round>_eval_cases.md`, `<round>_raw_prompt.md`, and inspect the target's `backend` routes and `frontend` views/stores.
2. Copy the relevant template into `EvalSets/<round>/evidence/harness/`, and copy the whole `scripts/lib/` to `…/harness/lib/` (templates import `./lib/...`, so the harness is self-contained).
3. Fill the GENERATE-PER-ROUND sections: contract, per-case assertions, UI flows, screen list — each traceable to a specific eval-case; no generic placeholders.
4. **Get user confirmation on the generated harness**, then run it.

**Run (after generation):**
```bash
node scripts/detect-ports.mjs <projectDir>                      # detect ports first; never hardcode
PROJECT_DIR=<projectDir> EVID_DIR=EvalSets/<round>/evidence \
  node EvalSets/<round>/evidence/harness/api_test.mjs <project>  # → <project>-api-results.json
# Complete UI (mandatory): record/verify selectors with the playwright-cli skill, then run the generated harness
PW_EXEC=<chromium> EVID_DIR=EvalSets/<round>/evidence/ui FE_BASE=http://localhost:<feport> \
  node EvalSets/<round>/evidence/harness/ui_test.mjs <project>   # → <project>-ui-results.json + screenshots
PROJECT_DIR=<projectDir> EVID_DIR=... node scripts/cap.mjs <project>   # visual
semgrep --config <semgrep-rules>/javascript --config scripts/sast-rules.yaml --json ...   # triage FPs
```
**API-only is not enough**: frontend-only defects (recursive/broken stores, mis-wired API clients, dialogs that never submit) are only visible via complete UI testing; an item whose backend passes but whose UI is broken scores Partial at most for any "API + UI" case, and its core scenario is Fail.

## 6. Memory / gotchas
- A target's API/ports can differ a lot between rounds (multipart vs upload-then-JSON, PUT vs POST actions, accounts keyed by id vs username, whether `/files` requires auth, different ports) — so the harness is **generated per round** (§5): run `detect-ports.mjs`, then read the target's routes to fill the assertions. **Ports are always detected from README/code, never hardcoded** (detect-ports falls back to 3000/5173 only if detection fails).
- Clear the data dir before starting a backend (some projects use a relative `./db` and ignore `DB_DIR`), or you get 409 stale-data errors.
- Repeated logins during visual capture can trip rate limiters → use single-login + viewport-resize capture.
- **API pass != feature works**: always run the full UI write-path suite with `playwright-cli` + the per-round-generated UI harness — a correct backend with a broken frontend store/client is common (e.g. a Pinia local function shadowing its same-named import → infinite recursion / stack overflow), and only UI testing catches it.
- **Multi-branch:** concurrent targets must stagger ports (target i → base+i, each frontend pointed at its own backend); after evaluating, always clean up — `pkill -9 node` + `git worktree remove --force` per checkout + `git worktree prune`; leave no worktrees/processes/ports.
- Always apply §2 "no double-counting" when scoring.
