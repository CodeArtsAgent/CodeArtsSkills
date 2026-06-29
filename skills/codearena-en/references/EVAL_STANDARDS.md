# CodeArena Evaluation Standards

Standing rules for evaluating and comparing project implementations. Applies to every round unless the user overrides.

## Workflow (every round MUST follow these steps, in order)

This standard governs the whole process. Do not skip, reorder, or improvise steps. All paths below are **relative to the working root** (where both the projects under review and `EvalSets/` live). `<round>` is the short round id the user chooses (e.g. `auth`, `0to1`).

**Step 0 — Tool readiness (mandatory, before anything else).**
- Run the preflight `bash scripts/check-tools.sh`. **Verify every tool the skill uses is installed and usable BEFORE using it**; do not assume presence.
- Install any missing tool first — `bash scripts/check-tools.sh --install` (or the per-tool commands in the baselined-tool table / `scripts/tools-README.md`). Re-run until all report OK. Semgrep *rules* are still fetched per round via `git clone` (not part of this check).

**Step 1 — Choose targets & names.**
- A **target** is a *(repository, branch)* pair. Targets can be **different repos** (e.g. `proj-A` vs `proj-B`) **and/or multiple branches of the same repo** (e.g. `proj-A@main` vs `proj-A@feature-x`). The user must pick **at least two** targets total.
- **If the user has not said which projects/branches to compare, ASK them first** — list the discovered candidate projects to help them choose. Do **not** proceed with fewer than two targets, and do not guess the targets.
- **Discover projects recursively under the working root** — candidate repos may live in **subdirectories**, not just the top level. A candidate is a directory that looks like a project root (has `package.json`, a `.git`, or a `backend`+`frontend` pair).
- **A project may be specified by NAME alone.** Names are assumed **unique** under the working root (same-name dirs in different locations are out of scope). Resolve name → path by recursive search and use that path as `<repo>` everywhere below:

  ```
  REPO=$(find <working-root> -type d -name '<name>' -not -path '*/node_modules/*' | head -1)
  ```
  An explicit relative/absolute path is also accepted instead of a name. If a name resolves to zero or to multiple directories, stop and ask the user.
- For each target, record (a) the **resolved path**, (b) the **branch(es)** to evaluate (see branch rule below), and (c) the **display name(s)** for the report.
- **Branch rule (per repo):**
  - **No branch given → the repo's CURRENT branch** (`git -C <repo> rev-parse --abbrev-ref HEAD`).
  - **One or more branches given → each branch is its own target**, evaluated at its **tip (last commit)**. A repo with N chosen branches yields N report columns, named `<repo>@<branch>` (or the user's display name).
- Record the mapping to `EvalSets/<round>/<round>_targets.md` (a small table: report name ↔ relative path ↔ branch ↔ resolved scope).

**Step 2 — Capture the raw prompt.**
- The user provides the round's **original requirement prompt**. Record it **verbatim** to `EvalSets/<round>/<round>_raw_prompt.md`.
- **If the user has not provided the raw prompt, ASK for it before generating any cases.** The Round rubric is derived entirely from this prompt — do **not** invent, infer, or paraphrase the requirements, and do not fall back to a previous round's prompt without the user confirming it applies.

**Step 3 — Run the round (only after the user approves Step 3.1).**
- **3.1 Generate round cases.** From `EvalSets/<round>/<round>_raw_prompt.md`, write `EvalSets/<round>/<round>_eval_cases.md` (/100 + dynamic bonus). Give it to the user to **review and update**; iterate until approved.
- **3.1b Generate this round's test harness.** Test scripts are **generated per round, not pre-written.** From the approved `<round>_eval_cases.md` + `<round>_raw_prompt.md` + each target's actual backend routes and frontend (views/stores), generate `EvalSets/<round>/evidence/harness/{api_test,ui_test,visual_test}.mjs` by filling the `scripts/templates/` skeletons — one assertion/flow per eval-case, calibrated to the target's real contract/selectors. Copy `scripts/lib/` to `evidence/harness/lib/` so the harness is self-contained. Only the generic mechanics (`scripts/lib/`, `detect-ports.mjs`, `cap.mjs`, `sast-rules.yaml`, installers) are reused as-is. **Get user confirmation on the generated harness before running.**
- **3.2 Execute (after approval).** Set up the scope gate and isolated temp copies per target; run the generated harness. **All evidence MUST be written to and retained under `EvalSets/<round>/evidence/`** — API/Semgrep/metrics JSON, Playwright screenshots (`evidence/screens/`), UI results (`evidence/ui/`), and the generated harness (`evidence/harness/`). Evidence is a permanent round artifact; do not delete it after the report is written.
- **3.3 Run Basic cases first.** Score each target against `EvalSets/basic_eval_cases.md` → its own /100 + bonus.
- **3.4 Run Round cases next.** Score each target against `EvalSets/<round>/<round>_eval_cases.md` → its own /100 + bonus.

**Step 4 — Write the report.**
- Using `EvalSets/report_template.md`, write `EvalSets/<round>/<round>_test_report.md` (English, the three-section format below). Use the Step-1 display names for projects throughout. Cite evidence files in `EvalSets/<round>/evidence/` from the report.

- All eval cases, prompts, targets, and reports are **Markdown files**.
- **Retained per-round artifacts (never deleted):** `<round>_targets.md`, `<round>_raw_prompt.md`, `<round>_eval_cases.md`, `<round>_test_report.md`, and the full `evidence/` folder.

## EvalSets directory layout (multi-round, archivable)

```
EvalSets/
├── EVAL_STANDARDS.md            # this standard — shared by all rounds
├── basic_eval_cases.md          # static Basic rubric (/100) — reused verbatim every round
├── report_template.md           # English report template — reused every round
├── tools/                       # toolchain installer
│   ├── setup-tools.sh
│   └── README.md
└── <round>/                     # one folder per round (e.g. auth/, 0to1/)
    ├── <round>_targets.md        # report name ↔ project relative path (Step 1)
    ├── <round>_raw_prompt.md     # verbatim original prompt (Step 2)
    ├── <round>_eval_cases.md     # round-specific rubric (/100) (Step 3.1)
    ├── <round>_test_report.md# final report (Step 4)
    └── evidence/                 # per-round evidence
        ├── harness/              # GENERATED-per-round test scripts (api_test/ui_test/visual_test) + lib/
        ├── screens/              # Playwright screenshots
        ├── ui/                   # UI-flow results JSON + screenshots
        ├── coverage/             # c8/vitest coverage lcov + summary (Basic B5)
        └── *.json                # API/Semgrep/metrics outputs
```

Each round is self-contained under `EvalSets/<round>/`; `basic_eval_cases.md`, `report_template.md`, and this standard are shared and never duplicated per round.

## Bilingual outputs (fixed for ALL rounds)
- **Every deliverable is produced in BOTH English and Chinese** — two files: `<name>.md` (English) and `<name>_cn.md` (Chinese). This applies to standards, eval cases, raw-prompt records, targets, report template, scoring overview, and reports.
- **Exception: `evidence/`** (API/Semgrep/metrics JSON, screenshots, harness scripts) is not translated — single copy only.
- The two language files must stay in sync: when one is edited, update the other in the same change.

## Report format (fixed for ALL rounds)
- **Language: English + Chinese.** Each report ships as `<round>_test_report.md` (EN) and `<round>_test_report_cn.md` (CN).
- **Template:** follow `EvalSets/report_template.md` exactly. Three sections only:
  1. **Summary** — verdict + total-score table + strengths/weaknesses **by differential comparison**: list traits shared by all targets once under "Common strengths"/"Common weaknesses", then present the differentiators **as one table, with rows grouped by domain** (one row per dimension where targets differ, a column per project). Tag bonus-scored items with **[bonus]**; each cell a short phrase + evidence pointer; never repeat a Common item in the differentiators table.
  2. **Detailed Score Tables** — Basic domains, Round domains, Bonus detail; each scored row carries a **half-sentence** reason (not a paragraph).
  3. **Test Execution** — runtime API probes (deviations only), visual UX (3 viewports), static-analysis summary, core scenarios.
- **No "recommended fixes" section** — fold any fix into the half-line weakness note.

## Two-file rubric structure
- **`EvalSets/basic_eval_cases.md`** — the **baseline**: static, app-agnostic, reused verbatim every round. Must contain **no** round/requirement/project-specific info. Scores its own **/100** + up to **+10** bonus. Covers generic engineering quality: B1 Security–Runtime, B2 Visual UX, B3 Code Quality (SAST + architecture + readability), B4 Open-Source Governance.
- **`EvalSets/<round>/<round>_eval_cases.md`** — dynamic, derived from that round's raw prompt. Scores its own **/100** + up to **+10** bonus.
- Each implementation gets **both** scores, presented side by side in the report. The two files are scored independently (do not merge into one 100).

## Hard rules
- **Scope = the resolved in-scope set per target** (run the git scope gate first; record the file set). Resolution depends on how the target's branch was chosen:
  - **Default current branch** (no branch named by the user):
    - **working tree dirty** (`git -C <repo> status --porcelain` non-empty) → evaluate the **uncommitted delta vs `HEAD`** (untracked + modified). *(the historical default)*
    - **working tree clean** → evaluate the **last commit's content** — files changed by the tip (`git -C <repo> diff --name-only HEAD~1 HEAD`); if the tip has **no parent** (root/`init` commit holding the whole implementation), evaluate the **full tree** at `HEAD`.
  - **Explicitly named branch** (single or multiple) → evaluate that branch's **tip (last commit)** content: `git -C <repo> diff --name-only <branch>~1 <branch>` (full tree at the tip if it's a root commit). Uncommitted working-tree changes are **ignored** for an explicitly-named branch — only what's committed on that branch counts.
  - **Isolation for multiple branches of one repo:** evaluate each branch in its **own temp checkout** — `git -C <repo> worktree add <tmp-i> <branch>` (or `git -C <repo> archive <branch> | tar -x -C <tmp-i>`) — so branches don't disturb each other or the working tree. Start each target's servers/harness against its own checkout.
  - **Stagger ports across concurrent targets.** Two targets cannot share a port. Prefer **serial** evaluation (one target at a time on the detected base ports, with full teardown between). If running targets **concurrently**, assign target index `i` (0-based) an offset: backend `PORT = <detected_backend>+i` (e.g. 3000, 3001, …), frontend port `<detected_frontend>+i` (e.g. 5173, 5174, …), and **point each frontend at its own backend** — pass the staggered values to the harness via env (`PORT`, `BASE`, `FE_BASE`, and the project's API-base override such as `VITE_API_BASE`, or override the Vite proxy target). Only run concurrently when the frontend's backend URL is configurable; otherwise stay serial.
  - **Teardown (mandatory after each target / at round end):** stop all started servers (`pkill -9 node`), restore any mutated data dir, then **remove every temp checkout** — `git -C <repo> worktree remove <tmp-i> --force` for each, then `git -C <repo> worktree prune`. Leave no leftover worktrees, processes, or staggered-port servers behind. (Evidence under `EvalSets/<round>/evidence/` is retained; the temp checkouts are not.)
  - Whatever the resolution, the same scope set then drives **all** code-review, SAST, metrics, architecture, governance, and coverage scoring for that target.
- **Both rubric files total exactly 100**, each with its **own dynamic bonus section** (up to +10).
- **Bonus is dynamic:** start from a static seed, then after full review add discovered add-ons / delete irrelevant ones, and apply the final list **identically to all targets** for fairness, with evidence per item.
- **No double-counting.** The same issue or the same capability is scored **once**. (a) A defect that surfaces in multiple domains (e.g. a hardcoded secret detectable both at runtime B1 and statically in SAST B3a) is penalized in **one** domain only — prefer the most specific dedicated item (hardcoded secret → B1-8). (b) A capability that is already a **scored requirement** is **not** also a bonus: required frontend features (form validation, image-upload preview, list pagination, time formatting), status tags / styled status (B2-5), and pagination/filter query params (B3d-1) are scored in their domains and must NOT be awarded as bonus. Bonus is reserved for genuine add-ons beyond every scored item (e.g. rate limiting, helmet headers, audit logging, an analytics dashboard, committed API reference docs).
- **Architecture quality** is judged as **high cohesion / low coupling / high scalability** (in basic B3b), with reproducible signals recorded.
- **Independence:** functional/security/UX/visual scores come from evaluator-authored probes against the running app. A project's own test suite counts **only** toward the round Testing domain — never self-grading correctness.
- **Complete UI testing is mandatory.** Functional correctness MUST be verified through the actual frontend UI, not only the backend API. Using the `playwright-cli` skill (+ the bundled `ui_test.mjs` harness), drive **every** screen the user can reach and **every** state-mutating action end-to-end (login/logout, record create/edit/delete, submit/cancel, approve/reject — whatever the app’s write actions are), asserting on the resulting toast/notification, table/list state, and persistence, and capturing console/page errors. An item whose backend API passes but whose UI path is broken is scored **Partial at most** for any "API + UI" case, and its core scenario is **Fail**. Record UI evidence (results JSON + screenshots) under `evidence/ui/`.
- **Round isolation:** each round is evaluated **completely independently**. Score and describe only what is observed in the current round; do **not** compare against, reference, or carry over findings from any prior round (no "fixed", "regressed", "added since", "unchanged", "vs round X"). Reports and cases must read as standalone, even when the prompt or targets are reused. **Scoped exception:** the API forward/backward-compatibility check (basic B3d-2) may diff the current interface against a prior **git** revision of the same repo (uncommitted vs `HEAD`, or `HEAD` vs `HEAD~1`) to detect breaking changes — this is a within-item technical diff using git history (no snapshot files, no cross-round score comparison).

## Baselined evaluation domains and tools per eval section (fixed for ALL rounds)
Every eval section has exactly one baselined primary tool, used identically in every round so results are comparable across rounds. Do not swap tools between rounds without updating this table.

| Section | Baselined tool (primary) | How to use (copy-paste starting point) |
|---|---|---|
| Functional Correctness | Backend: **NodeJS `fetch` API harness**; Frontend: **complete end-to-end UI testing** via the **`playwright-cli` skill** + a UI harness. **Both harnesses are GENERATED per round** (from `scripts/templates/` + the generic `scripts/lib/`), not pre-written. | The harness CASES/FLOWS are generated each round from `<round>_eval_cases.md` + `<round>_raw_prompt.md` + the target's actual routes/frontend; only the mechanics in `scripts/lib/{http,ui}.mjs` are generic. Generate into `evidence/harness/`, user-confirm, then run: backend `node evidence/harness/api_test.mjs <project>` → `evidence/<project>-api-results.json`; frontend — install the skill (`npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli`), drive **every** state-mutating flow through the real UI, run `node evidence/harness/ui_test.mjs <project>` → `evidence/ui/<project>-ui-results.json` + screenshots. The API harness alone is NOT sufficient: frontend-only defects (broken stores, mis-wired API clients, dialogs that never submit) are invisible to it and MUST be caught via the UI. |
| Visual UX beauty | **Playwright** full-page screenshots @ 3 viewports + multimodal review | Start backend+frontend, then `node scripts/cap.mjs <project>` (generic single-login capture) at desktop 1280×900, tablet 768×1024, mobile 390×844 (`fullPage:true`); for more screens than the default, generate `evidence/harness/visual_test.mjs` from the template with the target's screen list. Save PNGs to `evidence/screens/`, then view each and score against B2 rubric. |
| Code quality | **Semgrep** (official `semgrep-rules`, cloned) | One-time: `git clone --depth 1 https://github.com/semgrep/semgrep-rules`. Scan: `semgrep --config semgrep-rules/javascript --metrics off --json -o evidence/<project>-semgrep.json --exclude node_modules <project>/backend/src <project>/frontend/src`. Triage findings (drop false positives), bucket by `extra.severity`. |
| Architecture quality | **dependency-cruiser** | `depcruise <project>/backend/src --no-config --output-type json > evidence/<project>-dc.json`. From the JSON: count app-level circular deps and "upward" imports (lower→higher layer), and grep for direct `fs`/persistence access outside the store layer. `depcruise ... --output-type err` gives a human-readable violations list. |
| Readability | **ESLint** + **eslint-plugin-complexity** + **jscpd** | Complexity/length: `eslint --no-eslintrc -c metrics.eslintrc.json --ext .js -f json -o evidence/<project>-eslint.json <project>/backend/src` with rules `complexity:["warn",10]`, `max-lines-per-function:["warn",60]`. Duplication: `jscpd <project>/backend/src <project>/frontend/src --reporters json --output evidence/<project>-jscpd` — **duplication must be ≤ 3%**. |
| Effective code LOC | **cloc** (code-only; product + tests separately) | cloc `code` lines (excl. blank + comments) over ALL in-scope source — JS/TS, Vue (`<template>`+`<script>`), CSS/SCSS, HTML. **Report product code and test code as two numbers.** Exclude config (`package.json`, `*.config.*`, `tsconfig*`, eslintrc), data/seed/fixtures (`db.json`, `*seed*`), lock files, and generated (`node_modules`, `dist`, `build`, `coverage`). Exact two-pass `cloc` command in `basic_eval_cases.md` Execution Standards. |
| RESTful API design & compatibility | **API probe + manual route review** + **`git diff`** | Enumerate verbs/paths/status codes from routes + probe evidence; check REST conventions. Compatibility (no snapshots): `git -C <project> diff HEAD -- <routes/controllers>` (uncommitted vs latest commit), else `git -C <project> diff HEAD~1 HEAD -- <routes/controllers>` (latest vs previous commit), flag breaking changes; if `HEAD` is empty/`init`, score design-level compatibility only. |
| Security | **Semgrep** (SAST, official rules) + **NodeJS `fetch` API probe** (`api_test.mjs`) | SAST: same Semgrep command as Code quality, focus on auth/secret/injection/XSS rules. Behavioral: the API probe runs auth-bypass, RBAC, ownership, path-traversal and JWT-tamper cases. Cross-reference Semgrep (static) with probe results (runtime) — don't double-penalize. Inspect evidence with `jq '.results[] | {sev:.extra.severity, id:.check_id, path:.path}' evidence/<project>-semgrep.json`. |
| Open-Source Governance | **license-checker** + **`npm audit --omit=dev`** | Two checks only. Licenses: `cd <project>/<sub> && license-checker --production --summary` (and `--json` to flag any non-OSI-permissive / copyleft / UNKNOWN / UNLICENSED **dependency** — the project's own license field is not scored). CVEs: `npm audit --omit=dev --json` → read `.metadata.vulnerabilities` for High/Critical. |
| Test Coverage (Basic B5) | **`c8`** (V8 coverage, wraps any runner) + **`vitest --coverage`** (frontend) | Run the project's OWN suite under coverage: `c8 --reporter=lcov --reporter=text <test-cmd>` (e.g. `c8 npm test`) backend, `vitest run --coverage` frontend → `evidence/coverage/`. Report branch/line/function % over in-scope code; map committed tests to endpoints/roles/error-paths(4xx)/core scenarios; check which UI write-flows the committed E2E (`playwright-cli`/Playwright) covers. No runnable suite → B5 = 0. Grades the tests' thoroughness, never the app's correctness. |
| Round-specific domains | Reuse an existing tool above; add a new one only if none fits | Document the chosen tool + exact command in the round's eval-cases file before running. |

## Evidence
- Every API case logs request + response as JSON; every visual case cites a screenshot file. Store under `EvalSets/<round>/evidence/`.
- Report cites code findings as `file:line`.
