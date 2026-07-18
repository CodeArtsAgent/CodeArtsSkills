# Evaluation Data Lifecycle and Cleanup

Apply this shared policy to Generate, Execute, and Judge. Never confuse evaluated output with disposable dirty data.

## Data classes

### Persistent evaluation evidence

Retain until the human explicitly archives or deletes the round:

- public evalset packages;
- execution intake, configuration, TODO, responses, logs, diffs, hashes, metrics, and cleanup evidence;
- each initial-project snapshot and restoration manifest needed to reproduce and audit exact baseline restoration;
- each frozen candidate workspace needed for independent judging or reproduction;
- result-verification evidence, judgments, scoreboards, audits, and bilingual reports.

Execute and Judge must never automatically delete these artifacts. Repository changes made by the worker in the live project are measured output until the assigned case coordinator freezes the completed state; the subsequent baseline restoration is protocol mechanics, not candidate output.

### Evaluated-system dirty data

Clean after every case attempt, before retrying or starting another case:

- database rows, schemas, queues, object-storage objects, search indexes, service state, and test accounts created or changed by the evaluated system;
- background processes, listeners, containers, and jobs owned by the attempt;
- files written outside the evaluated project or declared external scopes;
- attempt-owned caches, browser profiles, temporary directories, sockets, lock files, and generated credentials;
- environment state that differs from the sealed pre-run baseline.

Prefer prevention over cleanup: use a unique per-attempt namespace, disposable service instance, redirected cache/temp paths, and a sandbox that blocks undeclared writes. A case that can modify shared external state without deterministic reset and verification is not releasable.

### Judge-only temporary sensitive data

Delete immediately after each result check:

- Judge workspace copies;
- injected hidden tests and private check files;
- temporary credentials or configuration generated for the check;
- temporary processes and services created by the check.

Keep command outputs and the machine cleanup audit, but never keep injected private files in a report or product directory.

## Execute cleanup gate

Define all side-effect scopes, reset actions, process termination, and clean-state checks during preflight. Obtain any required authorization before the first case. Cleanup actions must not install, restore, upgrade, or change dependencies.

For every attempt:

1. stop the child at completion or timeout and terminate attempt-owned process trees;
2. have the assigned case coordinator freeze the unmodified completed live-project state;
3. capture the candidate result and verify that the preserved snapshot matches the completed-state inventory;
4. have the assigned case coordinator restore the managed live-project surface from the main coordinator's verified initial-project snapshot, including tracked files, non-ignored authorized changes, and the private Git restoration copy, then verify the worktree byte for byte and Git state semantically before supplying transient `project-restore-evidence.json` and `rollback-result.json`; never compare `.git/index` bytes because IDE refreshes may rewrite equivalent index storage, and cover Git-ignored content with explicit cache/generated-data cleanup when a case can change it;
5. continue only after the Runner verifies the restored baseline and removal of case-scoped protocol files;
6. run the pre-approved external reset actions outside the evaluated child;
7. remove declared outside-project files, caches, profiles, and temporary data;
8. verify databases, services, processes, paths, and environment state against the attempt baseline;
9. supply transient `cleanup-result.json` to the Runner;
10. continue only when status is `clean` and `dirtyDataRemaining` is empty; after each gate, delete its declaration, helper evidence, temporary inventories, and gate-only logs, retaining only compact status in the shared state/result.

The case coordinator performs cleanup coordination; the worker must not be rewarded or penalized for cleanup mechanics. Cleanup logs are transient protocol inputs, not scoring evidence unless the case itself explicitly required lifecycle behavior—in that case the worker-declared command/test evidence is part of the evaluated execution result and remains retained.

If project rollback fails, mark `rollback-error`; if external cleanup fails or undeclared dirty data remains, mark `cleanup-error`. Either state stops the entire run, permits no other case, and requires human remediation. After remediation, discard the contaminated run and restart every case from a newly sealed baseline. Never silently continue with a mixed environment.

## Judge cleanup gate

Run each private result check in a new Judge-only copy. Always remove injected files and the whole Judge copy in a `finally` path, including timeout and command failure. On Windows, terminate the complete process tree before retrying file deletion. Record `cleanupAudit` in the result-check output.

At final report completion, write `cleanup-manifest.json` plus paired `cleanup-summary.zh-CN.md` and `cleanup-summary.en.md`. Record temporary resources removed, failures, remaining dirty data, and retained evidence roots. Do not delete product run evidence automatically.

Report removes only Judge-created snapshot copies. It never automatically removes Execute's initial-project snapshots or completed-state snapshots; list both classes in the cleanup manifest with their deletion flags set to false.

## Platform rules

- Use Node.js filesystem APIs and argument-array process execution; do not depend on Bash or PowerShell syntax.
- Use Windows-safe names and reject device names such as `CON`, `NUL`, `COM1`, and `LPT1`.
- On Windows, preserve `SystemRoot`, `ComSpec`, `PATHEXT`, user-profile, and application-data variables for child commands; use `taskkill /T /F` for process trees; retry recursive deletion for transient file locks; and require a short enough evaluation root for the attempt workspace path budget.
- Cross-machine result transport is out of scope. All products in a round and the Judge use the same machine and filesystem.
