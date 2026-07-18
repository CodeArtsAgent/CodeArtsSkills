# Artifact Catalog

Use this catalog to identify every standard output produced by Generate, Execute, and Judge. For directory ownership and path validation, use [output-layout.md](output-layout.md). For field-level JSON contracts, use [case-schema.md](case-schema.md). For cleanup and retention rules, use [data-lifecycle.md](data-lifecycle.md).

## Contents

- [Location and visibility classes](#location-and-visibility-classes)
- [Generate outputs: public evalset](#generate-outputs-public-evalset)
- [Generate outputs: sealed authoring/Judge package](#generate-outputs-sealed-authoringjudge-package)
- [Execute outputs: product run root](#execute-outputs-product-run-root)
- [Judge outputs: report root](#judge-outputs-report-root)
- [Temporary or non-output state](#temporary-or-non-output-state)
- [Source-of-truth precedence](#source-of-truth-precedence)

## Location and visibility classes

| Class | Location | Readers | Rule |
|---|---|---|---|
| Public evalset | `.codebase-eval/<round-id>/evalset/<track>` | Evaluated main coordinator, active case coordinator, and deterministic Runner, subject to one-case disclosure | Candidate-visible; contain no private checks, answers, scores, provenance, or sealed paths |
| Sealed authoring/Judge package | A confirmed root outside the repository and entire evaluation root | Generate and independent Judge only | Never expose to an evaluated product, snapshot, prompt, or session |
| Product raw run | `.codebase-eval/<round-id>/<system-id>/<execution-run-id>` | That product's main coordinator, active case coordinator, Runner, and later Judge | Raw measured evidence only; contain no score or Judge conclusion |
| Judge report | `.codebase-eval/<round-id>/report/<judge-run-id>` | Independent Judge and human reviewers | Contains verification findings, scores, comparison, and cleanup audit |
| Completed-state snapshot | Product run `workspaces/<task-id>/attempt-<n>` | Assigned case coordinator creates it after the fresh worker returns; later Judge reads it | Measured candidate output; retain after capture |
| Judge workspace | Temporary path outside product evidence | Judge only | Disposable copy; remove after each private result check |

Human-readable artifacts use semantically equivalent `.zh-CN.md` and `.en.md` pairs unless this catalog marks them optional. Their titles, paragraphs, lists, and tables correspond in order, but each language is written independently; Chinese must read naturally without consulting English.

## Generate outputs: public evalset

| Artifact | Purpose | Visibility and lifecycle |
|---|---|---|
| `manifest.json` | Identifies round, evalset, release, repository revision, track, locales, approval status, and ordered case digest | Public; retained as the package identity |
| `execution-contract.json` | Immutable cross-product execution policy, evidence requirements, candidate-safe environment/service contract, cleanup controls, and release identity | Public; generated before H4, hashed in release evidence, and never overridden by Execute |
| `case-index.json` | Prompt-free ordered case-ID list used by the main coordinator for scheduling | Public; contains only `schemaVersion` and `caseIds` |
| `cases/public/<case-id>.json` | Bilingual candidate task, deliverables, allowed/forbidden operations, and candidate-safe environment/side-effect declarations | Runner discloses only the English side of exactly one case to one worker; Chinese is for human comparison |
| `sanitization-manifest.json` | For `code-only`, lists audited repository material removed from each worker snapshot | Public only for `code-only`; retained with the release |

Generate must not place repository profiles, blueprint reviews, approvals, private cases, hidden tests, provenance, or release-audit narratives in the public package.

## Generate outputs: sealed authoring/Judge package

| Artifact | Purpose | Visibility and lifecycle |
|---|---|---|
| `manifest.json` | Sealed identity matching the public manifest and case digest | Judge-only; retained |
| `generation-intake.json` | Confirmed H0 scope, repository/revision, track, round paths, constraints, feasibility, and governance decisions | Sealed process record; retained |
| `intake-summary.zh-CN.md`, `intake-summary.en.md` | Human-readable equivalent of the confirmed generation intake | Sealed; retained |
| `repository-facts.json` | Optional machine inventory from repository fact collection, used as H1 evidence | Sealed; retain when produced |
| `environment-preflight.json` | Machine record of runtime, dependency, credential, browser, and required-service readiness and cleanup | Sealed; never store secret values |
| `environment-preflight.zh-CN.md`, `environment-preflight.en.md` | Human review of environment feasibility, verified lifecycle, exclusions, and residual risks | Sealed H1 review evidence; retained |
| `repository-profile.json` | Machine repository identity, architecture, workflows, domains, tests, leakage risks, and candidate-visible source assessment | Sealed H1 evidence; retained |
| `repository-profile.zh-CN.md`, `repository-profile.en.md` | Human-readable H1 repository profile | Sealed; retained |
| `evaluation-blueprint.json` | H2 contract for exactly 15 prompts: five-capability coverage, generation load, retrieval class, expected tool calls, assessment rationale, and authoring feasibility | Sealed design contract; retained; retrieval/tool annotations are excluded from candidate-visible projections |
| `blueprint-review.zh-CN.md`, `blueprint-review.en.md` | H2 15-row prompt review showing each localized full prompt, primary/secondary capabilities, expected tool calls, retrieval class, and assessment rationale | Sealed approval evidence; retained |
| `cases/private/<case-id>.json` | Sealed scoring and result-check record with expected behavior, evidence, impact, verification, criteria, provenance, difficulty, and generation load for one public task | Judge-only; retained; it is not another candidate task and does not duplicate `retrievalTool` |
| `evaluator-assets/<case-id>/...` | Hidden tests, fixtures, reference material, or other private files injected only into Judge copies | Judge-only; retained, but injected copies are deleted |
| `approvals.json` | Machine record of explicit H1, H2, and H4 decisions | Sealed source of truth for gates; retained |
| `release-audit.json` | Machine H4 parity, leakage, identity, schema, feasibility, and packaging audit | Sealed release evidence; retained |
| `release-audit.zh-CN.md`, `release-audit.en.md` | Human-readable H4 release audit | Sealed; retained |

## Execute outputs: product run root

| Artifact | Purpose | Visibility and lifecycle |
|---|---|---|
| `execution-state.json` | Confirmed request, immutable task plan, case-coordinator identity per case, mutable worker attempts/assignments/blockers, and shared credential-free service startup contracts | Single readable run-control record; main coordinator and active case coordinator may read it; never give the full file to a worker |
| `protocol-violation.json` | Observable child/subtask/isolation violation that terminates the complete run without retry | Created only on violation; requires active-child termination and cleanup evidence |
| `<project>/.codebase-eval-worker/worker-envelope.json` | English side of one public task, result/activity contracts, and only that case's projected English `serviceContext` | One fresh worker only; temporary and removed by its case coordinator during that attempt's rollback before another attempt or case starts |
| `<project>/.codebase-eval-worker/worker-result.json` | Terminal result, artifact paths, bounded representative retrieval evidence, observable evidence references, worker identity, worker-recorded second-precision UTC start/end timestamps, tokens, and gaps | Worker/coordinator capture record; Runner derives the normalized retrieval summary; coordinator may construct metadata but never rewrite immutable worker evidence or timestamps |
| `<project>/.codebase-eval-worker/activity-log.jsonl` | Bounded journal of material search/read/edit/command/test/deliverable events | Key raw evidence only; collapse repetition, retain no chain-of-thought or full retrieval transcript |
| Worker response, session, command, test, and deliverable files | Actual candidate answer and supporting observable artifacts named by `worker-result.json` | Measured output; copied to attempt artifacts and retained |
| `project-baseline-snapshot/` | Main-agent-created restorable copy of tracked files, non-ignored untracked files, and a private `.git` restoration copy; excludes evaluation evidence and Git-ignored content | Deterministic restoration source used by case coordinators for the managed project surface; retained and never exposed to workers |
| `project-baseline-manifest.json` | Worktree file hash, size, mode, directory, symbolic-link, and whole-inventory digest plus semantic HEAD, refs, and staged-index summary; `.git` files are not compared byte for byte | Runner's mandatory restoration comparison baseline; retained |
| `artifacts/<task-id>/attempt-<n>/final-response.md` | Frozen Markdown copy of the worker's final response | Primary Judge evidence; retained |
| `artifacts/<task-id>/attempt-<n>/activity-log.jsonl` and `evidence-*` | Frozen copies of bounded key activity, session, command, test, and deliverable evidence with hashes | Judge evidence; retained; do not add a full product-native trace solely for retrieval analysis |
| `artifacts/<task-id>/attempt-<n>/execution-result.json` | Independent minimal machine index for identity, status, time/tokens, bounded retrieval summary, evidence paths, project diff, and completed-state workspace | Raw result used by aggregation; retained; contains no capture/restoration/cleanup result section |
| `workspaces/<task-id>/attempt-<n>/...` | Frozen repository state after the worker finishes | Measured output; never treat it as disposable dirty data |
| `execution-results.json` | Run-level aggregation of every case's final status, all-attempt time/tokens, evidence, retained workspace, compact integrity booleans, gaps, violations, and embedded validation result | Judge input; contains no score or detailed capture/restoration/cleanup result |
| Optional completion receipt pair | Lists paths, evidence gaps, cleanup state, and incomplete infrastructure state | May be bilingual; must contain no quality judgment, score, or comparison |

## Judge outputs: report root

| Artifact | Purpose | Visibility and lifecycle |
|---|---|---|
| `judge-intake.json` | Confirmed round, discovered run cohort, sealed package input, audience, incomplete-run policy, and unresolved decisions | Judge process record; retained |
| `judge-config.json` | Resolved public/sealed packages, raw run roots, token comparability, cleanup-error policy, locales, and report paths | Judge-only operational configuration; retain when produced |
| `verification-results/<system-id>/<case-id>.json` | Private result-check outcome and `cleanupAudit` for one frozen candidate workspace | Judge evidence referenced by the judgment; retained |
| `verification-results/.../*.stdout.log`, `*.stderr.log` | Setup, verification, and cleanup command output generated by private result checks | Judge evidence; retained without copied private injected files |
| `judgments.json` | Exactly one validated 0–10 score per `system × case`, criterion evidence, caps, verification reference, metadata, tokens, immutable duration, and deterministic duration adjustment | Primary machine judgment record; retained |
| `scoreboard.json` | Aggregated accuracy-first ranking, pass/failure counts, per-case durations and adjustments, token/time comparisons, and diagnostic slices | Machine comparison result; retained |
| Audit-trail `.zh-CN.md` and `.en.md` pair | Explains inputs, validation, evidence gaps, retries, infrastructure/cleanup issues, and scoring trace | Human-review evidence; retained; use the run's declared audit filename consistently |
| `final-report.zh-CN.md`, `final-report.en.md` | Semantically equivalent final findings and comparison for the confirmed audience, including every system × case's actual duration and duration score adjustment | Final human deliverable; retained |
| `cleanup-manifest.json` | Machine record of removed Judge-only resources, retained initial/completed snapshots and evidence roots, failures, and all three product/snapshot deletion flags set to false | Final cleanup gate record; retained |
| `cleanup-summary.zh-CN.md`, `cleanup-summary.en.md` | Human-readable Judge cleanup result | Retained with the report |

## Temporary or non-output state

Do not classify these as retained benchmark outputs:

- Judge-only workspace copies and injected hidden files;
- temporary credential sessions or secret-bearing environment values;
- attempt-owned service processes, browser profiles, caches, sockets, locks, and disposable external data;
- temporary files used for atomic JSON writes;
- transient `execution-request.json`, capture inventories, `project-restore-evidence.json`, `rollback-result.json`, `cleanup-result.json`, and gate-only logs after the Runner has validated them and recorded compact state;
- generated test state not declared as measured candidate output.

Remove this state through the applicable gate while preserving only evaluated execution evidence. Never delete public releases, execution results, final responses, evaluated activity/command/test/deliverable evidence, frozen workspaces, judgments, scoreboards, audits, or reports automatically.

## Source-of-truth precedence

When descriptions overlap, apply this order:

1. `output-layout.md` for location, ownership, and access boundaries;
2. `case-schema.md` and templates for field-level shape;
3. workflow document for creation timing and human gates;
4. `data-lifecycle.md` for retention and cleanup;
5. this catalog for discovery and artifact purpose.
