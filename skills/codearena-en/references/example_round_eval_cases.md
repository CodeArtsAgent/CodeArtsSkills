# RMS Round 1 — 0→1 Implementation Evaluation (requirement-specific)

Cases derived from **Round 1's raw prompt** (a from-scratch 0→1 reimbursement management system). This rubric produces its own **/100** score measuring how completely and correctly the implementation satisfies the prompt, plus up to **+10** bonus.

This is scored **separately** from the static `EvalSets/basic_eval_cases.md` baseline (which gives its own /100 for generic engineering quality). Each implementation receives both scores; the report presents them side by side.

| Domain | Points |
|---|---:|
| R1. Functional Correctness | 60 |
| R2. Architecture / Stack Compliance | 14 |
| R3. Frontend UX — Behavioral | 14 |
| R4. Testing Requirements | 7 |
| R5. Data Cleanup & README | 5 |
| **Total** | **100** |
| Bonus (dynamic) | up to +10 |

**Round targets:** `<Project-A>`, `<Project-B>` (the round's chosen `RMS*` dirs)
**Scope, tools, grading legend, execution standards:** see `basic_eval_cases.md` (uncommitted-code-only scope applies here too).
**Grading legend:** Pass = full; Partial = 50%; Fail = 0.

### Raw prompt (source of these cases)

> Reimbursement management system. **Functional:** login/logout; account management with Administrator + Employee roles, admin manages employee accounts, default admin `admin/123456`; reimbursement management — employees create/view/cancel forms, admins view/approve/reject; each form has invoice title, invoice amount, submitter, bank account number, reimbursement invoice image; security must be considered. **Architecture:** front/back separation. Frontend `./frontend` — Vue3 + Vite + Element Plus + Pinia + Vue Router; features: form validation, image upload preview, list pagination, time formatting. Backend `./backend` — Node.js + Express, RESTful API; data in local JSON under `./db` (no database); images on local filesystem under `./files`; configure CORS. **Testing:** E2E after development; generate frontend + backend test scripts; backend API testing; use skill `playwright-cli` to verify frontend UI. **Data cleanup:** clean all test data in db + filesystem after implementation. **README:** include startup commands for frontend and backend.

---

# R1. Functional Correctness (60 pts)

## R1.1 Login / Logout (11 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R1.1-1 | Default admin `admin/123456` can log in | API + UI | 3 |
| R1.1-2 | Wrong password rejected (401, no stack trace / user enumeration) | API | 2 |
| R1.1-3 | Logout works; token unusable or frontend state cleared + redirect to login | API + UI | 3 |
| R1.1-4 | Newly created employee account can log in | API | 3 |

## R1.2 Account Management (19 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R1.2-1 | Two roles exist (Administrator / Employee) and behave differently | API + code | 2 |
| R1.2-2 | Admin can create employee account | API + UI | 5 |
| R1.2-3 | Admin can edit and delete employee account | API + UI | 5 |
| R1.2-4 | Default admin account exists out-of-the-box (seed / auto-init) | code + API | 3 |
| R1.2-5 | Employee cannot access account management (API 403; UI hides entry) | API + UI | 4 |

## R1.3 Reimbursement Management (30 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R1.3-1 | Employee creates form with all 5 required fields: invoice title, invoice amount, submitter, bank account number, invoice image | API + UI | 7 |
| R1.3-2 | Employee can view own forms (list + detail) | API + UI | 3 |
| R1.3-3 | Employee can cancel own pending form; status updates | API + UI | 4.5 |
| R1.3-4 | Admin can view all forms | API + UI | 3 |
| R1.3-5 | Admin can approve a form; status visible to employee | API + UI | 4.5 |
| R1.3-6 | Admin can reject a form (with comment if supported); status visible | API + UI | 4.5 |
| R1.3-7 | Required-field validation: missing any required field → 400 | API | 3.5 |

### Penalty Rules (R1)

| Issue | Penalty |
|---|---|
| Backend fails to start with README instructions | -10 |
| Frontend fails to start with README instructions | -10 |
| Server crash (process exit) triggered by any test request | -5 per distinct crash |

---

# R2. Architecture / Stack Compliance (14 pts)

Checks the **mandated stack and layout** from the prompt (distinct from general architecture *quality*, scored in basic B3b).

## R2.1 Frontend Stack (5.5 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R2.1-1 | Code at `./frontend`, Vue 3 + Vite | code | 2.5 |
| R2.1-2 | Element Plus used for UI | code | 1 |
| R2.1-3 | Pinia used for state management | code | 1 |
| R2.1-4 | Vue Router used for routing | code | 1 |

## R2.2 Backend Stack & Storage (6.5 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R2.2-1 | Code at `./backend`, Node.js + Express, RESTful API | code | 2.5 |
| R2.2-2 | Business data in local JSON under `./db`, no database | code | 3 |
| R2.2-3 | Invoice images on local filesystem under `./files` | code + API | 1 |

## R2.3 CORS (2 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R2.3-1 | CORS configured (frontend-origin cross-origin requests work) | code + API | 2 |

### Penalty Rules (R2)

| Issue | Penalty |
|---|---|
| Uses an actual database (SQLite/Mongo/etc.) against the requirement | -8 |
| CORS wide open with credentials (`origin:*` + credentials) | -2 |

---

# R3. Frontend UX — Behavioral (14 pts)

The prompt explicitly lists these frontend features — verified via Playwright DOM assertions. (Visual *quality* of these screens is scored in basic B2.)

| ID | Item | Score |
|---|---|---|
| R3-1 | Login page renders; failed login shows a visible, friendly error message | 2.5 |
| R3-2 | Form validation: required fields + amount format validated with inline messages before submit | 3.5 |
| R3-3 | Image upload preview shown before submission | 3.5 |
| R3-4 | List pagination present and functional on the reimbursement list | 2.5 |
| R3-5 | Time formatting: timestamps rendered human-readable (not raw ISO/epoch) | 2 |

### Penalty Rules (R3)

| Issue | Penalty |
|---|---|
| Unhandled frontend error (blank page / uncaught exception) during a normal flow | -4 per distinct occurrence |

---

# R4. Testing Requirements (7 pts)

The prompt mandates backend API tests + frontend UI verification via `playwright-cli`.

| ID | Item | Method | Score |
|---|---|---|---|
| R4-1 | Backend API test scripts exist in the repo | code | 2.5 |
| R4-2 | Backend API tests are runnable and pass | execute | 2 |
| R4-3 | Frontend UI test scripts (playwright-cli or equivalent) exist in the repo | code | 2 |
| R4-4 | Test usage documented (how to run) | code | 0.5 |

---

# R5. Data Cleanup & README (5 pts)

| ID | Item | Method | Score |
|---|---|---|---|
| R5-1 | `./db` contains no leftover test data (only seed admin / empty structures) | inspection | 1.5 |
| R5-2 | `./files` contains no leftover test images | inspection | 1 |
| R5-3 | README exists with frontend startup command | code | 1.25 |
| R5-4 | README has backend startup command | code | 1.25 |

---

# Bonus — Round 1 (up to +10, dynamic)

Same dynamic rules as the baseline: the seed below is rebuilt after reviewing each implementation (add discovered add-ons, delete irrelevant ones) and applied **identically to all targets** for fairness, with evidence per awarded item. Award +1 to +2 each, capped at +10. Items here are scoped to **requirement-relevant** extras (engineering-generic add-ons live in the basic file's bonus).

### Static seed list

Only add-ons beyond every scored item. **Not bonus** (already scored, would double-count): list pagination & time formatting (R3), status tags (B2-5), pagination/filter query params (B3d-1).

| Seed Add-on | Typical Award |
|---|---|
| Admin approval/rejection with structured comment history | +1 |
| Bank-account / amount input masking or validation beyond required | +1 |
| Image thumbnail/lightbox viewing of invoices | +1 |
| Analytics dashboard / summary view beyond required screens | +1 |
| Extra in-scope documentation (API reference / architecture doc) | +1 |

---

## Core Scenarios (round-specific, reported separately)

| # | Scenario | Expectation |
|---|---|---|
| S1 | Employee journey: login → submit form with image → view status → cancel | All steps succeed end-to-end via UI |
| S2 | Admin journey: login → create employee → review form → approve/reject | All steps succeed end-to-end via UI |
| S3 | Privilege boundary: employee attempts admin APIs + other users' data via direct API calls | All rejected server-side |
| S4 | Restart persistence: data survives backend restart (JSON files actually persisted) | Forms/accounts still present after restart |
