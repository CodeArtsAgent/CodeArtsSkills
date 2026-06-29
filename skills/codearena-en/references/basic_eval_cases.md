# Basic Evaluation Baseline (static, all projects)

Prompt-independent evaluation cases that apply to **any** web-application implementation under review. This rubric is static: it does not reference any specific requirement, feature set, or project. It produces its own **/100** score measuring generic engineering quality (runtime security, visual UX quality, code quality, open-source governance), plus up to **+10** bonus.

Each implementation receives this Basic score (/100) **and** a separate requirement-specific score (/100) from that project's own eval file; the report presents both.

| Domain | Points |
|---|---:|
| B1. Security — Runtime | 30 |
| B2. Frontend UX — Visual Quality | 18 |
| B3. Code Quality (SAST + architecture + readability) | 30 |
| B4. Open-Source Governance | 10 |
| B5. Test Coverage | 12 |
| **Total** | **100** |
| Bonus (dynamic) | up to +10 |

*(Rubric note, 2026-06-26: added B5 Test Coverage (12) and rebalanced — Open-Source Governance right-sized 16 → 10 (it's two largely-binary checks), Code Quality 36 → 30; B1/B2 unchanged. Rounds scored before this date used B3 = 36, B4 = 16, and no B5.)*

---

## 1. Scope: resolved per target (repo + branch)

A target is a *(repo, branch)* pair. Resolve the in-scope file set, then evaluate **only that set** in all code-review, SAST, metrics, architecture, governance, and coverage scoring:

- **Default current branch** (no branch named): if the working tree is **dirty**, scope = the **uncommitted delta vs `HEAD`** (untracked + modified — the historical default); if **clean**, scope = the **last commit's content** (files changed by the tip, or the full tree if the tip is a root/`init` commit).
- **Explicitly named branch** (one or several): scope = that branch's **tip (last commit)** content; uncommitted working-tree changes are ignored. Multiple branches of one repo are each evaluated in their **own temp checkout** (`git worktree add` / `git archive`).

**Resolve the project first.** If the target is given by name, locate it under the working root (names are unique): `REPO=$(find <working-root> -type d -name '<name>' -not -path '*/node_modules/*' | head -1)`. Use `$REPO` (the resolved path) as `<repo>` below.

**Scope gate (run first, every target):**

```
git -C <repo> rev-parse --abbrev-ref HEAD        # current branch (default target)
git -C <repo> status --porcelain                 # empty = clean
# default current branch, dirty → uncommitted delta:
git -C <repo> ls-files --others --exclude-standard   # untracked
git -C <repo> diff --name-only HEAD                  # modified vs HEAD
# clean current branch, or an explicitly named <ref> → last commit content:
git -C <repo> diff --name-only <ref>~1 <ref>         # files changed by the tip
git -C <repo> rev-list --count <ref>                 # 1 ⇒ root commit ⇒ full tree at <ref>
```

Record the resulting in-scope file set in the report. All static analysis below is restricted to it.

---

## 2. Methods & standard tools (fixed, so every project is judged identically)

| Method | Standard tool | Usage |
|---|---|---|
| Runtime security probing | Evaluator-authored HTTP probe harness | Backend started on a dedicated port; requests/responses logged as JSON. Independent of the project's own tests. |
| UI visual capture | Playwright (headless Chromium) full-page screenshots at desktop 1280×900, tablet 768×1024, mobile 390×844 + multimodal review against the rubric | Each screenshot viewed and scored; defects cited by screenshot file. |
| SAST (static security) | **Semgrep** (official `semgrep-rules`, `javascript/` + `security/` sets) + `npm audit` | Run over the in-scope source; findings bucketed by severity with rule ID + `file:line`. |
| Architecture quality | **dependency-cruiser** | App-level circular deps + "upward" (lower→higher layer) imports from the JSON output; grep for direct persistence access outside the store layer. |
| Readability / complexity | **ESLint** (+ `eslint-plugin-complexity`) + **jscpd** (duplication) | Cyclomatic complexity, function length, LOC, duplication % — reported side by side. |
| RESTful API design & compatibility | **evaluator API probe + manual route/controller review** + **`git diff`** | Verb/status/resource-path conventions; compatibility via uncommitted-vs-`HEAD` (or `HEAD` vs `HEAD~1`) diff — no snapshot files. |
| Open-source governance | **license-checker** + `npm audit --omit=dev` | Dependency license compatibility (OSI-permissive only) + no High/Critical dependency CVEs. |
| Test coverage | **`c8`** (V8 coverage, wraps any runner) + **`vitest --coverage`** for the frontend | Run the project's own suite under coverage (`c8 <test-cmd>`); report branch/line/function % for backend & frontend over in-scope code; map tests to endpoints / roles / error-paths / core scenarios; check committed E2E (Playwright/`playwright-cli`) write-flow coverage. Output `lcov` + summary to `evidence/coverage/`. |
| Code review | manual inspection (grep / file reading) | Evidence cited as `file:line`. Restricted to the uncommitted file set. |

**Independence note:** all runtime/behavioral/visual *correctness* scores come from evaluator-authored probes against the running app — a project's own bundled test suite is never used to grade the app's own correctness. **B5 Test Coverage is the one place the project's own suite is examined**, and only to grade the *thoroughness of the tests themselves* (how much code/behavior they exercise), never to grade whether the app is correct. This is compatible with the independence rule.

**Grading legend:** Pass = full item score; Partial = 50%; Fail = 0.

---

# B1. Security (30 pts)

Runtime/behavioral security probes against the running backend. Static security findings (SAST) are scored separately in B3a.

| ID | Item | Method | Score |
|---|---|---|---|
| B1-1 | Credentials hashed at rest (no plaintext secrets in storage) | code + storage inspection | 4 |
| B1-2 | Protected APIs require authentication (anonymous requests → 401) | API | 4 |
| B1-3 | Authorization enforced server-side (lower-privilege role calling privileged APIs → 403) | API | 4 |
| B1-4 | Ownership/tenancy checks: user A cannot read or modify user B's resources | API | 4 |
| B1-5 | Upload validation: type/size whitelist; disallowed or oversized upload rejected (content, not just declared MIME) | API | 3 |
| B1-6 | Path traversal protection on file serving (`../` probes rejected) | API | 3 |
| B1-7 | Token/session integrity: tampered token, `alg=none`, or forged session rejected (401) | API | 3 |
| B1-8 | No hard-coded weak secrets; sensitive config not leaked to the client bundle | code | 5 |

### Penalty Rules (B1)

| Issue | Penalty |
|---|---|
| Any API returns another user's credential hash or plaintext secret | -6 |
| Anonymous user can read private/uploaded files | -4 |

---

# B2. Frontend UX — Visual Quality (18 pts)

Screenshot review at desktop (1280×900), tablet (768×1024), and mobile (390×844) for the application's key screens. Each screenshot is viewed and scored; every awarded/deducted point cites the screenshot file in `evidence/`.

| ID | Item | What "Pass" looks like | Score |
|---|---|---|---|
| B2-1 | Layout integrity | No element overflow, overlap, clipping, or unintended horizontal scrollbars on any viewport | 4 |
| B2-2 | Responsive behavior | Layout adapts at tablet/mobile (navigation collapses or reflows; tables/forms stay usable) | 3.5 |
| B2-3 | Visual consistency & hierarchy | Consistent spacing, alignment, typography scale; coherent color/theme; clear primary action; not a default-unstyled look | 3.5 |
| B2-4 | Loading & empty states | Spinner/skeleton while loading; proper "no data" placeholder when empty (not blank or raw `[]`) | 2.5 |
| B2-5 | Interaction feedback | Buttons show hover/disabled/loading states; submit disabled or shows progress during request; statuses as styled tags/badges, not raw text | 2.5 |
| B2-6 | Toast & dialog styling/position | Toasts and confirm dialogs are styled, correctly positioned, not overlapping or cut off | 2 |

**Visual scoring:** Pass = full (no notable defects across viewports); Partial = 50% (minor defect on one viewport); Fail = 0 (broken/absent on desktop, or severe on multiple). Each Partial/Fail names the viewport + screenshot.

### Penalty Rules (B2)

| Issue | Penalty |
|---|---|
| A key screen completely unusable on mobile (content unreachable / off-screen, no scroll) | -2 |

---

# B3. Code Quality (30 pts)

Runs the standard quality toolchain over the in-scope code, then applies reviewer judgment. Sub-areas: B3a SAST (10), B3b Architecture (10), B3c Readability (6), B3d RESTful API Design & Compatibility (4). *(Test coverage, formerly implicit, is now its own domain B5.)*

## B3a. Static Security Analysis — SAST (10 pts)

Tool: **Semgrep** (official `semgrep-rules`, `javascript/` + `security/` sets) + `npm audit`.

| ID | Item | Score |
|---|---|---|
| B3a-1 | No High/Critical Semgrep findings in application code | 6 |
| B3a-2 | No High/Critical dependency vulnerabilities (`npm audit`) reachable from application code | 2 |
| B3a-3 | Few/no Medium Semgrep findings; any present are justified or low-impact | 2 |

Scoring: start full; **−3 per distinct High/Critical** application finding (floor 0 for the sub-item), **−1 per Medium** (capped). List each finding with rule ID + `file:line`. Cross-check against B1 so the same issue isn't double-penalized — SAST credits *static detectability*, B1 credits *runtime exploitability*.

## B3b. Architecture & Structure — high cohesion / low coupling / high scalability (10 pts)

Tool: **dependency-cruiser** (layer/circular/coupling graph) + manual review of the recorded signals. The new (uncommitted) code is judged on the three classic structural qualities.

| ID | Item | What "good" looks like | Score |
|---|---|---|---|
| B3b-1 | High cohesion + separation of concerns | Clear layering (e.g. routes → controllers → services/repositories; client views/stores/api separated); each module has a single focused responsibility; no business logic in route handlers; no god-files | 3 |
| B3b-2 | Low coupling | Modules depend on abstractions, not concrete internals; persistence isolated behind a repository/store layer (swapping the storage backend touches few files); config/secrets injected; no circular dependencies; client uses one API client, not scattered fetches | 4 |
| B3b-3 | High scalability / extensibility | Adding a new entity, role, route, or rule follows an obvious existing pattern; pagination/filtering structured for larger datasets; no hard-coded assumptions blocking scale; stateless request handling | 2 |
| B3b-4 | Consistency & conventions | Consistent naming, error-handling pattern, response envelope | 1 |

**Reproducible signals (recorded for every project):** dependency direction between layers (any "upward" imports?), whether persistence is reachable only via the store layer (grep for direct filesystem/DB access outside it), import fan-in/fan-out per module, circular-import presence, and how many files a representative change (adding a field / adding a role) would touch.

## B3c. Readability, Conciseness & Maintainability (6 pts)

Tools: **ESLint** (+ `eslint-plugin-complexity`) + **jscpd**. Metrics: file LOC, avg/max function length, cyclomatic complexity, duplication %.

| ID | Item | What "good" looks like | Score |
|---|---|---|---|
| B3c-1 | Conciseness vs verbosity | No needless boilerplate or copy-paste; DRY; concise but not cryptic; no dead code / over-engineering | 2 |
| B3c-2 | Readability / understandability | Clear names, small functions, low nesting; reads top-to-bottom; comments explain "why" not noise | 3 |
| B3c-3 | Lint, complexity & duplication budget | ESLint passes (or trivial warnings only); no function exceeds a reasonable budget (cyclomatic ≤ ~10, function ≤ ~60 lines); **code duplication ≤ 3%** (jscpd) | 1 |

**Scoring guidance:** B3b and B3c are Pass/Partial/Fail per item, anchored by the recorded metrics (LOC, max function length, max complexity, ESLint warnings, duplication %, Semgrep counts) reported side by side. The **duplication threshold is ≤ 3%** (jscpd): ≤3% passes the duplication part of B3c-3; >3% makes B3c-3 at most Partial, and a markedly higher figure makes it Fail. Conciseness is judged relative to the *task*: a larger codebase that earns its size with genuine robustness is not penalized; a small but cryptic/duplicative one gets no free pass.

## B3d. RESTful API Design & Compatibility (4 pts)

Tool: **evaluator API probe + manual review** of routes/controllers, plus **`git diff`** for the compatibility check. Judged on the observed HTTP surface (verbs, status codes, resource paths, request/response shapes).

| ID | Item | What "good" looks like | Score |
|---|---|---|---|
| B3d-1 | RESTful design compliance | Resource-oriented, plural-noun paths (`/api/reimbursements/:id`); correct verb semantics (GET read / POST create / PUT-PATCH update / DELETE remove); meaningful status codes (200/201/204/400/401/403/404/409, no 200-for-everything); stateless; consistent JSON request/response envelope; collection endpoints support pagination/filter query params | 2 |
| B3d-2 | API forward/backward compatibility | API is designed to evolve without breaking clients: versioning or a stable contract (e.g. `/api/v1` or an explicit versioning strategy), additive/optional new fields, tolerant reading (ignores unknown fields), stable field names & response envelope, no breaking removals/renames of existing fields or status codes | 2 |

### Compatibility check method (no snapshots)

Assess B3d-2 on two axes:

1. **Design-level capability (always):** review the code for the compatibility-friendly traits above (versioning scheme, additive/optional fields, tolerant reading, stable envelope).
2. **Historical diff (when git history allows, no snapshot files):** detect breaking API changes via `git diff` over routes/controllers/DTOs —
   - if the working tree has uncommitted changes over a meaningful prior commit: **uncommitted working tree vs the latest commit (`HEAD`)**;
   - else: **latest commit vs the previous commit (`HEAD` vs `HEAD~1`)**.
   A breaking change = removed/renamed endpoint, removed/renamed request or response field, changed verb/status semantics, or a tightened required-field/validation that rejects previously-valid requests.
   If there is no prior version to diff against (e.g. `HEAD` is an empty/`init` commit and the whole implementation is uncommitted), score B3d-2 on the design-level axis only and record "no prior interface to diff".

> **Round-isolation exception (scoped):** B3d-2 may compare the current interface to a prior **git** revision of the *same* repository to detect breaking changes. This is a within-item technical diff, not a cross-round score/narrative comparison — report it as a standalone compatibility finding (do not write "regressed vs round X").

---

# B4. Open-Source Governance (10 pts)

Checks the open-source dependencies the project pulls in. Two checks only. Tools: **license-checker** (license inventory) + **`npm audit --omit=dev`** (dependency CVEs).

| ID | Item | What "good" looks like | Score |
|---|---|---|---|
| B4-1 | Dependency license compatibility | **All** production dependencies carry OSI-approved **permissive** licenses (MIT / BSD / Apache-2.0 / ISC, and similar). No strong copyleft (GPL / AGPL / LGPL / SSPL / MPL), and no `UNKNOWN`/`UNLICENSED` dependency. | 5 |
| B4-2 | No High/Critical dependency CVEs | `npm audit --omit=dev` reports **zero High and zero Critical** advisories in production dependencies. | 5 |

**Scoring:**
- B4-1: full 5 if every prod dependency is OSI-permissive. **−2.5 per distinct copyleft or unknown-licensed dependency** (floor 0). The project's own `package.json` `license` field is **not** evaluated — only the licenses of consumed open-source components.
- B4-2: full 5 if no High/Critical CVEs. **−2.5 per distinct High/Critical advisory** (floor 0). Moderate/Low advisories are recorded but not scored.

> B4-2 and B3a-2 both use `npm audit`. To avoid double-counting: B3a-2 (SAST) scores *application-code-reachable* dependency risk; B4-2 scores the *overall dependency CVE posture*. The report cross-references both and does not penalize the same advisory twice within a single domain.

---

# B5. Test Coverage (12 pts)

How thoroughly the project's **own** committed test suite exercises its code and required behaviors. This grades the *tests' thoroughness*, not the app's correctness (functional correctness is scored only from evaluator probes — see the Independence note). Measured on **in-scope code only**.

Tools: **`c8`** (V8 coverage; wraps any runner — `c8 <test-cmd>`, e.g. `c8 npm test` over `jest` / `node:test` / `vitest` / `mocha`), **`vitest --coverage`** for the frontend, plus a requirement-mapped review of what the tests touch. Save `lcov` + a summary to `evidence/coverage/`.

The 12 points are **balanced** between raw code-coverage % (B5-1/-2 = 5.5) and requirement/E2E coverage (B5-3/-4/-5 = 6.5).

| ID | Item | What "good" looks like | Score |
|---|---|---|---|
| B5-1 | Backend code coverage | `c8` over the backend suite: **branch ≥ 70% and line ≥ 80%** (in-scope code) | 3.5 |
| B5-2 | Frontend logic coverage | `vitest --coverage`/`c8` over frontend **logic** (stores / api / utils — not `.vue` templates): **line ≥ 60%**, or equivalent behavior covered by committed E2E | 2 |
| B5-3 | Error / negative-path coverage | Tests assert failure paths, not just happy paths: representative **400 / 401 / 403 / 404 / 409** cases are covered | 2 |
| B5-4 | Core-scenario & role coverage | Happy-path tests exist for the core flows (login, account CRUD, submit, approve/reject, cancel) and exercise **both admin and employee** roles | 1.5 |
| B5-5 | Committed E2E UI write-flow coverage | Committed E2E tests (Playwright / `playwright-cli` or equivalent) drive the **write flows** end-to-end through the UI: create employee, submit, approve, reject, cancel | 3 |

### Scoring (B5)

- **Moderate thresholds.** B5-1: full at branch ≥ 70% & line ≥ 80%; **Partial (50%)** at branch ≥ 50% **or** line ≥ 65%; **Fail (0)** below that. B5-2: full at line ≥ 60% on logic modules (or equivalent committed E2E); Partial at ≥ 40%; else Fail.
- **B5-3 / B5-4 / B5-5** are Pass / Partial(50%) / Fail per the fraction of the listed cases/flows that committed tests actually cover (e.g. E2E for 5 write flows: all = full, some = Partial, none committed = Fail).
- **No runnable suite → B5 = 0** (coverage genuinely unmeasurable). Record the reason (e.g. missing `package.json`/test script). The suite must run from the documented command; a suite that errors out scores as its measurable coverage (often 0).
- **Report** branch/line/function % for backend and frontend side by side in the static-analysis summary, with the per-item B5 verdicts.

### No-double-count (B5)

- **B5 vs the round Testing domain (R4).** R4 (in the round file) scores that tests **exist, run, and pass** + are documented; **B5 scores how much they cover** (depth) and which **write flows** committed E2E reaches (breadth). Existence/pass ≠ coverage — distinct facets. The Basic and Round scores are independent /100s by design, so a weak suite may legitimately lose in both; do not, however, deduct the *same* gap twice *within* one rubric.
- **B5-5 vs R4-3.** R4-3 credits that an FE/E2E test script *exists*; B5-5 credits **how many required write-flows** the committed E2E actually covers. Cross-reference; don't penalize the same missing script twice within Basic.
- **B5 vs B3c.** B3c scores readability/complexity/duplication of source; B5 scores the test suite's reach. Separate.

---

# Bonus — Add-ons Beyond Baseline Engineering (up to +10, dynamic)

**The bonus list is dynamic.** A small static seed is below. During evaluation, after reviewing each implementation, the evaluator must:

1. **Add** newly discovered valuable engineering add-ons not already credited above (with proposed award).
2. **Delete** seed items that are irrelevant or trivially framework-provided.
3. Record the final applied list (evidence per item), checked **identically across all evaluated projects** for fairness — a bonus found in one project is also checked in the others.

Award +1 to +2 per item, capped at +10 total.

### Static seed list

Only genuine add-ons beyond every scored item qualify. **Do not award bonus for anything already scored in a domain** (e.g. magic-byte upload validation = B1-5; fail-fast secret = B1-8; status tags = B2-5; consistent error-handling = B3b-4) — that would double-count.

| Add-on | Typical Award |
|---|---|
| Brute-force / rate limiting on authentication | +2 |
| Security headers (e.g. helmet) | +1 |
| Audit logging of sensitive operations | +2 |
| Refresh-token / session rotation | +2 |
| Analytics dashboard / summary view beyond the required screens | +1 |
| CI / automated quality gates committed with the code | +1 |

---

## Execution Standards (shared)

- Scope gate first (§1); record the in-scope file set per project.
- Each backend runs on a dedicated port in a temporary copy; original repos are not modified.
- Runtime/security/UX probes use evaluator-authored scripts.
- Every API probe logs request + response status/body as JSON evidence.
- Visual UX captures full-page screenshots at desktop/tablet/mobile for the application's key screens; each is reviewed and the file cited.
- SAST: `semgrep --config <path-to>/semgrep-rules/javascript --config <path-to>/semgrep-rules/<lang>/security` over in-scope source (official `semgrep-rules`, cloned), plus `npm audit --omit=dev`.
- Code metrics: ESLint + a metrics pass (file LOC, max/avg function length, max cyclomatic complexity, duplication) + coupling signals (cross-layer imports, direct persistence access outside the store layer, circular deps, files-touched for a representative change) — side by side.
- **Effective code LOC:** cloc `code` lines (excludes blank + comments) across **all in-scope source** — JS/TS, Vue (`<template>`+`<script>`), CSS/SCSS, HTML. **Report product code and test code separately** (two numbers). Two passes:
  - Product code: `cloc <in-scope> --exclude-dir=node_modules,dist,build,coverage --not-match-f='(package(-lock)?\.json|.*\.config\.[jt]s|tsconfig.*json|\.?eslintrc.*|.*\.lock|db\.json|.*(seed|fixture|mock).*|.*\.(test|spec)\.[jt]sx?)$' --json` → take the `code` total.
  - Test code: `cloc <test files: *.test.*, *.spec.*, and test/ tests/ __tests__/ dirs> --json` → report its `code` total separately.
  Never count blanks, comments, config files, data/seed/lock files, generated output, or `node_modules`.
- RESTful API design & compatibility: enumerate the HTTP surface (verbs, paths, status codes) from routes + probe evidence; for compatibility run `git diff` (uncommitted vs `HEAD`, else `HEAD` vs `HEAD~1`) over routes/controllers/DTOs to spot breaking changes — no snapshot files. If no prior version exists, score design-level compatibility only.
- Governance: `license-checker --production --summary` (flag any non-OSI-permissive / UNKNOWN / UNLICENSED dependency) + `npm audit --omit=dev` (read `.metadata.vulnerabilities` for High/Critical).
- **Test coverage (B5):** run the project's own suite under coverage — `c8 --reporter=lcov --reporter=text <test-cmd>` (e.g. `c8 npm test`) for the backend, `vitest run --coverage` (or `c8`) for the frontend — over in-scope code; record branch/line/function % to `evidence/coverage/`. Then map committed tests to endpoints / roles / error-paths (4xx) / core scenarios, and check which UI write-flows the committed E2E (`playwright-cli`/Playwright) covers. If the suite can't run from the documented command, B5 = 0 (record why). Coverage grades the *tests' thoroughness*, never the app's correctness.
- This domain set yields one **/100 Basic score** + bonus, reported alongside the requirement-specific score.
