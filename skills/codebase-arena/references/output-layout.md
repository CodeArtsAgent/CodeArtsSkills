# Shared Round and Output Layout

This is the single directory contract owned by the parent `codebase-arena` skill. Generate, Execute, and Judge must reference this file and must not redefine the layout independently.

For a file-by-file explanation of output purpose, readers, visibility, and lifecycle, see [artifact-catalog.md](artifact-catalog.md).

## Canonical layout

Use the fixed evaluation root `.codebase-eval` directly under the evaluated repository root and collect one round ID:

```text
.codebase-eval/
└── <round-id>/
    ├── evalset/
    │   ├── native-repository/
    │   │   ├── manifest.json
    │   │   ├── case-index.json
    │   │   ├── execution-contract.json
    │   │   └── cases/public/<case-id>.json
    │   └── code-only/
    │       └── ...
    ├── report/
    │   └── <judge-run-id>/
    │       ├── judge-intake.json
    │       ├── judgments.json
    │       ├── scoreboard.json
    │       ├── final-report.zh-CN.md
    │       ├── final-report.en.md
    │       ├── cleanup-manifest.json
    │       ├── cleanup-summary.zh-CN.md
    │       └── cleanup-summary.en.md
    ├── <system-id>/
    │   └── <execution-run-id>/
    │       ├── execution-state.json
    │       ├── project-baseline-snapshot/
    │       ├── project-baseline-manifest.json
    │       ├── artifacts/
    │       ├── workspaces/
    │       └── execution-results.json
    └── <other-system-id>/
        └── <execution-run-id>/
            └── ...
```

`evalset`, `report`, and every `<system-id>` are direct children of a round. Do not add a shared `products` or `results` wrapper. Multiple evaluation rounds, product runs, and Judge runs are separated by their IDs.

Only the candidate-visible public package belongs under `round/evalset/<track>`. Keep every sealed private case, scoring criterion, result-verification rule, hidden test, authoring artifact, and approval package in a separately confirmed sealed root outside the evaluated repository and outside the entire evaluation root. The sealed package records the matching `roundId` but is never copied into this layout.

## Naming and path rules

- Use only relative paths in every workflow input, command, manifest, machine record, prompt, report, and receipt. Resolve them against the workflow's declared, unchanged working directory. Absolute paths are forbidden in serialized or user-visible material; helpers may canonicalize only transiently in memory for containment checks.
- Use the evaluated repository as the Generate and Execute path base. Use the explicitly confirmed Judge workspace as the Judge path base. Within attempt artifacts, use the attempt root as the base. Record the applicable base as an identifier such as `repository-root`, `judge-workspace`, `run-root`, or `attempt-root`, never as an absolute path.
- Restrict round, system, execution-run, and Judge-run IDs to letters, digits, `.`, `_`, and `-`.
- Reject `.`, `..`, trailing dots, and Windows device names such as `CON`, `PRN`, `AUX`, `NUL`, `CLOCK$`, `COM1` through `COM9`, and `LPT1` through `LPT9`. Keep each ID at most 100 characters.
- Reserve the exact round child names `evalset` and `report`; reject either as a system ID.
- Fix the evaluation root to the exact repository-root-relative path `.codebase-eval`. Do not collect, override, discover, or infer it. Do not search for a "latest" evalset or choose a directory by name, timestamps, file contents, or existing artifacts.
- Ignore evalset-like files outside `.codebase-eval`, especially files under evaluated-product configuration, cache, index, plugin, skill, or state directories such as `.codeartsdoer`. Their presence never makes those directories evaluation roots.
- Derive each public package as `.codebase-eval/<round-id>/evalset/<track>`.
- Derive each product run root as `.codebase-eval/<round-id>/<system-id>/<execution-run-id>`.
- Derive each Judge report root as `.codebase-eval/<round-id>/report/<judge-run-id>`.
- Never place a sealed private package under the repository, evaluation root, round root, public package, product result directory, or report directory.

## Workflow ownership

- Generate collects and confirms the round ID, uses fixed `.codebase-eval`, derives public package paths per track, and separately collects sealed private package locations outside the project. It remains product-neutral.
- Execute collects only `roundId` as a directory-selection input. It uses fixed `.codebase-eval`, discovers the released public package under `evalset/<track>`, generates an execution run ID, derives its own product directory and run root, creates only that product subtree, and records the request, resolved layout, plan, and mutable TODO in `execution-state.json`; terminal results and validation share `execution-results.json`.
- Judge collects only `roundId` as a shared-layout selection input. It uses fixed `.codebase-eval`, discovers validated product run roots by scanning direct non-reserved round children, generates a Judge run ID, and writes only under the derived `report/<judge-run-id>` directory. A separately supplied sealed-package path is a protected Judge input, not part of the shared directory selection.

## Executor visibility

- The evaluated main Agent and the active case coordinator may read only the chosen public manifest and prompt-free case index for scheduling, plus their own `<system-id>/<execution-run-id>` subtree. Neither may inspect public case prompts, `report/`, another round, or sibling product directories.
- The deterministic Runner may read exactly one selected public case to materialize a worker envelope. This does not authorize the main Agent to read that prompt.
- Before a worker starts, its case coordinator must use product access controls or reversible coordinator visibility controls so the worker cannot read the fixed `.codebase-eval` root, including any round, public package, report, or product result. Expose only the English side of one case in `worker-envelope.json` through a case-scoped protocol path; keep Chinese only for human comparison.
- A worker operates directly in the evaluated project and may read only its envelope plus allowed repository source. After it returns, its case coordinator freezes the completed project state under the run evidence and restores the live project to the main coordinator's recorded initial baseline. The worker cannot access the public package directory, other cases, prior results, reports, or sibling product data.
- The independent Judge may read confirmed product run directories from one round and write its report subtree. It must not modify product evidence.

## Retention and cleanup

- Preserve public evalsets, product run evidence, initial-project snapshots, completed-state workspaces, cleanup records, judgments, scoreboards, audits, and reports until the human explicitly archives or deletes them.
- Cleanup after each attempt applies to evaluated-system state outside the measured snapshot: processes, containers, services, databases, queues, object storage, indexes, accounts, browser profiles, caches, temp paths, sockets, locks, credentials, and environment drift.
- Judge cleanup removes only Judge-created workspace copies, injected private files, temporary credentials, processes, and services. It never deletes initial-project snapshots, completed-state snapshots, or other product evidence.
- Cross-machine copying and path translation are out of scope; all round participants use the same filesystem.

## Machine records

Record resolved relative paths and identifiers in workflow artifacts. Although only `evaluationRoot` and `roundId` are collected as directory inputs, Execute records the automatically derived relative `roundRoot`, `productDirectoryName`, `executionRunId`, and `runRoot`; Judge records the automatically derived relative `roundRoot`, discovered run roots, `judgeRunId`, and `reportRoot`. Preserve only relative path text in bilingual receipts, and never copy private paths into candidate-visible envelopes.
