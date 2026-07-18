# Evaluated-Product Execution Protocol

## Roles and boundary

The evaluated desktop product supplies the run-level main coordinator, case-level coordinator subagents, and fresh worker subagents. This workflow measures that product. It produces raw evidence only.

- Main coordinator: owns intake, plan/TODO, environment sealing, the initial-project baseline, strictly serial case selection, case-coordinator creation, run termination, and final aggregation. It never reads case prompts, solves cases, captures results, or judges.
- Case coordinator: one fresh non-inherited subagent per case. It owns that case's prepare, worker creation and assignment, attempt timeout, completed-state snapshot, result capture, project rollback, external cleanup, retry control, and protocol validation. It never reads or solves the public case prompt and does not contribute candidate answer content.
- Worker subagent: one further fresh non-inherited subagent per `case × attempt`. It receives one case and works directly in the live evaluated project. It produces the evaluated answer and changes.
- Node Runner: deterministically materializes one-case envelopes, inventories the live project and preserved completed state, validates rollback and raw results, and aggregates evidence. It is not an agent and does not solve, score, snapshot, or roll back.
- Judge: runs later in a separate context with sealed private material. It is absent from evaluated execution.

## Shared execution contract

- Generate freezes these values in the released track's immutable `execution-contract.json`; Execute verifies its relative path, release ID, and SHA-256 and cannot override it;
- fix every evaluated-worker prompt locale to `en`, regardless of the language used to start Execute; preserve `zh-CN` only as a human-review counterpart and never materialize it into a worker envelope;
- use one fresh case coordinator with no inherited turns for each case and one fresh worker with no inherited turns for every `case × attempt`, operating directly in the evaluated project;
- execute cases and attempts strictly serially; maximum active case concurrency is one, maximum active case-coordinator concurrency is one, and maximum active worker concurrency beneath that coordinator is one; total nested child concurrency may therefore be two while a worker is running;
- after each worker returns, its case coordinator freezes the completed project state and then restores the live project to the exact recorded initial baseline before any retry or next case;
- per-case timeout: 3,600,000 ms;
- fix the evaluation root to `.codebase-eval`, collect and confirm only the round ID as a shared-layout directory-selection input, then automatically derive the run root as `.codebase-eval/<round-id>/<system-id>/<execution-run-id>` according to [output-layout.md](output-layout.md);
- dependency discovery, approval, installation/restoration, and verification finish before the first child;
- dependency mutation during execution is forbidden.

After preflight proves a required service can complete its real lifecycle, copy its candidate-safe startup contract into `execution-state.json.todo.serviceReadiness`. Each record contains only an opaque service ID, verified timestamp, relative working directory, optional build command, start command, bounded application-level readiness probe, process-tree stop strategy, requirement IDs, cleanup-control IDs, and English operational notes projected from the bilingual contract. It contains no credential value, secret-bearing argument, private evidence path, result check, answer hint, score, or unrelated service.

## Intake and runtime enforcement

Begin with structured intake. Ask only for evaluated-system identity, the round ID, ambiguous track selection, required application-credential remediation, token/activity evidence sources when they cannot be discovered, and unresolved dependency decisions. Use only `.codebase-eval`; never ask for, search for, or infer an evaluation root or latest evalset. Discover the public package and generate all remaining paths. Read all shared run limits and policies from the contract. Never ask about competitors, cross-product token comparability, scoring, run IDs, product-result paths, report paths, or a shared-policy override.

Do not preflight whether the product supports case-coordinator creation, fresh worker creation, completed-state snapshot, or rollback; the contract assumes those capabilities. Enforce them while running. Any observed inherited context in either subagent layer, duplicate/missing coordinator or worker identity, more-than-one-case disclosure, worker evaluation-root visibility, concurrent case execution, a worker not spawned by its assigned case coordinator, writes outside the evaluated project or declared scopes, main/coordinator case solving or repair, failure to freeze completed state before rollback, or failure to restore the exact initial project state is a non-retryable protocol error: terminate the active worker and coordinator, retain evidence, and stop the entire run. Environment, credential, service-lifecycle, activity-evidence, and deterministic cleanup readiness still require execution preflight.

## State machine

Use only:

```text
pending -> coordinating -> prepared -> running -> captured -> rollback-verified -> cleanup-verified -> completed
                                        |             |                  |                 |
                                        v             v                  v                 v
                                  raw failure   rollback-error      cleanup-error      retry review
```

Only a captured `infra-error` whose rollback and cleanup gates passed may receive a new attempt. The same case coordinator owns the retry, but each retry requires a new worker on the restored live project. A coordinator/worker/disclosure `protocol-error` terminates the whole run and is never retried. A wrong, incomplete, or low-quality candidate result is terminal raw evidence and is not retried. `rollback-error` or `cleanup-error` blocks the entire run; no new attempt or case may start.

## One-case disclosure

The main reads the public manifest and case index only, selects one case ID, and spawns its fresh case coordinator without case content. The case coordinator invokes the Runner, which creates `worker-envelope.json` containing exactly one English case and English case-scoped service notes. Before worker creation, use product access controls or reversible coordinator visibility controls to make the following unavailable from the live project:

- every other public case and case index with prompt content;
- the main TODO, other envelopes, and prior results;
- all sealed/private/Judge material;
- future Git history and unauthorized `.git` access;
- the entire evaluation root, including every round, public package, report, and product result;
- unapproved caches or track-specific removals.

Give the worker only the live project working directory and envelope path. Use `fork_turns: "none"` or the product equivalent for both the case coordinator and every worker. The coordinator receives only its task ID, run-root-relative control path, and lifecycle instructions; it must not receive case prompt content. Do not pass the main conversation, coordinator conversation, other case IDs with contents, private criteria, solution hints, or parent analysis to the worker. Observed access to protected evaluation material is a protocol violation even though the worker works in the same project directory.

The main coordinator and active case coordinator may read the authoritative shared TODO, including its verified service startup contracts. A worker must never receive or locate the full TODO. When the current public case declares service IDs, the Runner projects only those matching records into `worker-envelope.json.serviceContext`; cases without services receive an empty array. The worker may use that case-scoped context for service-dependent verification or development and remains responsible for observable command/test logging. Attempt cleanup still terminates the full process tree and applies the declared cleanup controls.

## Evidence-to-report coverage

Capture evidence without scoring or revealing private tags:

| Later Judge need | Executor evidence |
|---|---|
| Core accuracy and completeness | final response, deliverables, frozen workspace, snapshot diff |
| Retrieval and evidence accuracy | bounded retrieval summary, key search/read events, cited paths/symbols |
| Retrieval, architecture, workflows, impact, diagnosis | final response, inspected locations, edits, activity trace |
| Verification and integration | command/test logs, exit status, timestamps |
| Token and speed | product-local token evidence, start/end/duration |
| Fairness and reproducibility | child/session identity, baseline ID, retry history, protocol violations |

Do not collect hidden chain-of-thought. Keep only material activity events and bounded representative retrieval evidence; do not retain a complete native tool transcript solely to classify retrieval. Classify activity by primary purpose: shell-backed repository lookup is `search`, a test runner is `test`, and a state-changing command such as Git checkout is `command`. Every `command` or `test` event also records `status` and integer-or-null `exitCode` inline; retain a separate output log only when material output is needed.

## Raw result

The worker/main capture contract is `worker-result.json`. It records identity, timestamps, terminal status, response paths, an evidence manifest, a bounded key-activity journal, representative retrieval evidence, optional command/test output logs, inspected or cited repository locations when observable, snapshot diff, token evidence, duration, unfinished flag, child/session identity, environment baseline, evidence gaps, and protocol violations. It contains no private result-check outcome, scoring criterion, score limit, score, quality label, or report prose.

The worker supplies only `retrievalEvidence`: source, gaps, and at most eight representative actions containing normalized tool, discovery-or-verification role, target, and observable outcome. The Runner derives the durable `retrievalSummary`: unique tools, lexical/index/unknown discovery counts, observed mode, and confidence. Normalize tools only to `grep`, `glob`, `read`, `codebase-index`, `symbol-search`, `reference-search`, or `unknown`. Count `grep`, `glob`, and discovery-role `read` as lexical; count discovery-role index/symbol/reference searches as index; verification-role reads do not change the mode. Derive `grep-glob-read` from lexical-only discovery, `codebase-index` from index-only discovery, `hybrid` from both, and `unknown` when neither is observed. This summary is observable evidence, not a score or proof that the sealed expected method was required.

The worker also records its own `startedAt` immediately before core case work and `completedAt` immediately after it, using exact second-precision UTC `YYYY-MM-DDTHH:mm:ssZ`. The coordinator must not synthesize or rewrite either field. Every repository location presented as evidence in `final-response.md` uses its complete repository-root-relative path, optionally followed by a line range or symbol. The worker repeats those displayed locations in `evidence.citedRepositoryLocations` and keeps merely inspected but undisclosed locations only in `evidence.inspectedRepositoryLocations`. Runner capture verifies that every cited entry resolves to a repository file in the initial or completed state and that its complete path appears verbatim in the final response. Runner capture preserves both timestamps verbatim in `execution-result.json`, derives the timestamp interval, compares it with worker/product-reported `durationMs`, and stores the shorter value as durable `durationMs`. Retain both source duration values and the `shorter` selection policy for audit.

The case coordinator may reject an invalid artifact shape and construct metadata from immutable worker/host evidence, but may not edit the answer, project output, activity journal, or observed action semantics. The worker must create or replace `final-response.md` exactly once with only the active case's answer; append mode, transcript replay, host/chat-output concatenation, and reuse of any earlier case response are forbidden. After the worker returns, the coordinator freezes the unmodified completed live-project state. Runner capture validates every input first, compares the candidate response against already retained responses, and treats a complete prior-case response appended as a suffix as a non-retryable cross-case protocol violation. It then copies valid inputs into a private staging directory and publishes `final-response.md`, activity/evidence files, transient inventories, and `execution-result.json` only as one commit; on failure it removes the entire staging/commit set. The coordinator then restores the Git-managed and non-ignored project surface plus the private Git copy to the initial baseline, removes `.codebase-eval-worker`, and supplies transient `rollback-result.json`. Verify ordinary worktree files byte for byte, but verify Git through HEAD, symbolic HEAD, refs, and staged index entries instead of `.git` file bytes; IDE rewrites of an equivalent `.git/index` are not failures. Git-ignored content is outside the snapshot and must be reset through declared cleanup controls when an attempt can change it. Only after the Runner verifies both the preserved completed-state inventory and the restored baseline may the coordinator terminate attempt-owned process trees and apply pre-approved external cleanup controls through transient `cleanup-result.json`; a clean gate requires no remaining external dirty data. The Runner deletes capture inventories, restoration/cleanup declarations, helper evidence, staging state, and gate-only logs after validation. Aggregate only execution results, retained workspaces, and compact integrity status into `execution-results.json`.

## Commands

```bash
node <skill-dir>/scripts/resolve-round-layout.mjs --mode execute --round <round-id> --system <system-id> [--track <track>]
node <skill-dir>/scripts/run-evalset.mjs plan --evalset <public-package> --request <execution-request.json> --out <run-root>
node <skill-dir>/scripts/project-state.mjs snapshot --project . --snapshot <run-root>/project-baseline-snapshot --manifest <run-root>/project-baseline-manifest.json
node <skill-dir>/scripts/run-evalset.mjs coordinate --run-root <run-root> --task-id <id> --agent <case-coordinator-id> --session <case-coordinator-session-id> --context-inherited false
node <skill-dir>/scripts/run-evalset.mjs prepare --run-root <run-root> --task-id <id>
node <skill-dir>/scripts/run-evalset.mjs assign --run-root <run-root> --task-id <id> --agent <child-id> --session <session-id>
node <skill-dir>/scripts/project-state.mjs freeze --project . --snapshot <completed-state-workspace>
node <skill-dir>/scripts/run-evalset.mjs capture --run-root <run-root> --task-id <id> --attempt <n> --worker-result <worker-result.json>
node <skill-dir>/scripts/project-state.mjs restore --project . --snapshot <run-root>/project-baseline-snapshot --manifest <run-root>/project-baseline-manifest.json --evidence <attempt-artifact-dir>/project-restore-evidence.json
node <skill-dir>/scripts/run-evalset.mjs rollback --run-root <run-root> --task-id <id> --attempt <n> --rollback-result <attempt-artifact-dir>/rollback-result.json
node <skill-dir>/scripts/run-evalset.mjs protocol-violation --run-root <run-root> [--task-id <id>] --reason <observable-violation>
node <skill-dir>/scripts/run-evalset.mjs cleanup --run-root <run-root> --task-id <id> --attempt <n> --cleanup-result <attempt-artifact-dir>/cleanup-result.json
node <skill-dir>/scripts/run-evalset.mjs sync --run-root <run-root>
node <skill-dir>/scripts/run-evalset.mjs aggregate --run-root <run-root> --out <run-root>/execution-results.json
node <skill-dir>/scripts/run-evalset.mjs validate-run --run-root <run-root>
```

No execution command accepts a private-package path. No execution command runs a private result check or scoring process.
`--out` must be the derived product run root recorded in the confirmed execution request. The Runner verifies the referenced contract digest, rejects shared-policy override fields, writes one consolidated `execution-state.json`, and rejects any other output path. Planning also rejects a public case whose `environment.services` names a service without a candidate-safe contract record and a matching execution-time re-verification record.

Rollback and cleanup files are validation inputs, not durable benchmark outputs. The Runner validates that the initial snapshot was performed by the evaluated product's main coordinator and that completed-state freeze, rollback, and cleanup were performed by the assigned case coordinator, compares project inventories, verifies declared cleanup, records only compact gate status in `execution-state.json` and aggregate integrity booleans in `execution-results.json`, then deletes the inputs and gate-only evidence. It refuses progress when the initial project baseline or any declared process, external resource, outside-project path, cache/temp path, or environment baseline remains dirty. Run validation is embedded in `execution-results.json.validation` rather than emitted as a separate file.
