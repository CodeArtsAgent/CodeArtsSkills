# CodeArena Round <N> — <Round Title> Evaluation Report

Date: <YYYY-MM-DD> · Targets: `<repo-or-repo@branch-A>`, `<…-B>`, … *(a target is a repo + branch; multiple branches of one repo are separate columns named `<repo>@<branch>`)*
Rubrics: `basic_eval_cases.md` (/100) + `<round>_eval_cases.md` (/100) · Standards: `EVAL_STANDARDS.md`
Scope per target (state each): default current branch → uncommitted delta vs `HEAD` if dirty, else last-commit content; an explicitly named branch → its tip (last commit). Note the resolved scope + `HEAD`/branch per target.
Toolchain (official sources): Semgrep + official `semgrep-rules`, dependency-cruiser, ESLint+complexity, jscpd, cloc, license-checker, npm audit, c8/vitest coverage, Playwright (visual + end-to-end UI flow), evaluator API harness.

> All reports are written in **English** and follow this three-section structure: (1) Summary, (2) Detailed Score Tables, (3) Test Execution. No "recommended fixes" section — fold any fix into the half-line weakness note. Score-reason cells are half-sentences, not paragraphs.
> **Round isolation:** evaluate and describe only the current round. Do NOT compare to or reference prior rounds — no "fixed", "regressed", "added since", "unchanged", "vs round X". The report must read as fully standalone.

---

## 1. Summary

<One- or two-sentence verdict: who wins which rubric and why, plus that all targets pass core probes if true.>

| Project | Basic (/100, +bonus) | Round (/100, +bonus) |
|---|---:|---:|
| **<Project-A>** | <base> → **<base+bonus>** | <base> → **<base+bonus>** |
| **<Project-B>** | <base> → **<base+bonus>** | <base> → **<base+bonus>** |

Strengths/weaknesses are presented **by differential comparison**: traits shared by all targets are listed once under "Common"; each project then lists only what **distinguishes** it from the others. Tag every item that maps to a bonus-scored add-on with **[bonus]**; everything else is a scored-domain item.

### Common strengths (all targets)
- <shared strength + evidence> <[bonus] if applicable>
- …

### Common weaknesses (all targets)
- <shared weakness + evidence> <[bonus] if applicable>
- …

### Differentiators (by dimension)

One row per dimension where the targets differ; each cell states that project's behaviour (with evidence pointer / `[bonus]` where applicable). Group rows by domain (Security, Visual UX, Code Quality, Testing, Cleanup, …). Omit dimensions where all targets behave the same (those belong under "Common").

| Domain | Dimension | <Project-A> | <Project-B> |
|---|---|---|---|
| Security | <e.g. secret handling> | <A behaviour + evidence> | <B behaviour + evidence> |
| Visual UX | <e.g. mobile responsiveness> | … | … |
| Code Quality | <…> | … | … |
| … | … | … | … |

<Do not repeat any "Common" item here. Every differentiator must be a dimension where targets genuinely differ. Tag bonus-scored items [bonus]. Keep cells to a short phrase + evidence pointer (probe ID, file:line, or screenshot).>

---

## 2. Detailed Score Tables

### Basic domains (/100)

| Domain | Max | <Project-A> | Reason | <Project-B> | Reason |
|---|---:|---:|---|---:|---|
| B1 Security — Runtime | 30 | | <half-line reason or —> | | |
| B2 Visual UX | 18 | | | | |
| B3 Code Quality | 30 | | | | |
| B4 OSS Governance | 10 | | | | |
| B5 Test Coverage | 12 | | | | |
| **Subtotal** | **100** | | | | |

### Round domains (/100)

| Domain | Max | <Project-A> | Reason | <Project-B> | Reason |
|---|---:|---:|---|---:|---|
| R1 <name> | | | | | |
| R2 <name> | | | | | |
| … | | | | | |
| **Subtotal** | **100** | | | | |

### Bonus detail

| Bonus item | <Project-A> | <Project-B> |
|---|---:|---:|
| Basic: <item> | +<x> | +<x> |
| Round: <item> | +<x> | +<x> |
| **Basic bonus / Round bonus** | **+<x> / +<x>** | **+<x> / +<x>** |

---

## 3. Test Execution

### 3.1 Runtime API probes (<N> assertions)

<Pass tally per project, e.g. "A 28/28; B 26/28">. Only deviations listed; all others Pass.

| ID | Test case | Expected | <Project-A> | <Project-B> |
|---|---|---|---|---|
| <id> | <case> | <expected> | <result> | <result> |

Coverage: <one-line list of what the harness exercised>. Own test suites: <pass counts, R<n> evidence only>.

### 3.2 Visual UX (Playwright, 3 viewports)

| Viewport | <Project-A> | <Project-B> |
|---|---|---|
| Desktop 1280×900 | | |
| Tablet 768×1024 | | |
| Mobile 390×844 | | |

Evidence: `evidence/screens/<files>`.

### 3.3 Static analysis summary

| Metric | <Project-A> | <Project-B> |
|---|---:|---:|
| **Effective code LOC** — product · tests (cloc, all source excl. blank/comments; config & data excluded) | | |
| Semgrep official rules | | |
| — secret/JWT findings | | |
| Architecture: circular / upward imports | | |
| Functions over complexity 10 (peak) | | |
| Code duplication (jscpd) | | |
| npm audit prod High/Critical | | |
| Licensing | | |
| **Test coverage** (c8/vitest): backend branch/line % · frontend logic % | | |

> **Effective code LOC** = cloc `code` lines (blank + comment lines excluded) across **all in-scope source** — JS/TS, Vue (`<template>`+`<script>`), CSS/SCSS, HTML. **Product code and test code are reported as two separate numbers.** Config (`package.json`, `*.config.*`, `tsconfig*`, eslintrc), data/seed/fixtures, lock files, and generated/vendored (`node_modules`, `dist`, `build`, `coverage`) are excluded. This sizes the delivered implementation so complexity/duplication/coverage read in context. (Exact two-pass `cloc` command in the standard.)

### 3.3b Test coverage (Basic B5)

Project's OWN suite run under coverage (`c8 npm test` backend, `vitest run --coverage` frontend), over in-scope code. Report % and the requirement-mapped checks.

| Coverage dimension | <Project-A> | <Project-B> |
|---|---|---|
| Backend branch / line / function % (B5-1) | | |
| Frontend logic line % (B5-2) | | |
| Error/negative-path cases covered — 400/401/403/404/409 (B5-3) | | |
| Core-scenario + role coverage (B5-4) | | |
| Committed E2E write-flow coverage — create/submit/approve/reject/cancel (B5-5) | | |

Evidence: `evidence/coverage/`. No runnable suite → B5 = 0 (record why). Coverage grades the tests' thoroughness, not the app's correctness.

### 3.4 Core scenarios

| Scenario | <Project-A> | <Project-B> |
|---|---|---|
| S1 <…> | Pass/Fail | |
| S2 <…> | | |
| … | | |

---

*Evidence: `EvalSets/<round>/evidence/`. Security probing was performed only against local temporary copies.*
