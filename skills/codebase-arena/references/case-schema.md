# Schemas and Package Layouts

Use JSON and Node.js built-ins only. Use exactly `zh-CN` and `en` for localized prose.

## Authoring and release layouts

Candidate-visible public packages, stored by round under the evaluated repository:

```text
.codebase-eval/<round-id>/evalset/<track>/
├── manifest.json
├── case-index.json
├── cases/public/<id>.json
└── sanitization-manifest.json       # code-only only
```

Sealed Judge package, stored outside every evaluated project:

```text
CodebaseEvalPrivate/
├── manifest.json
├── generation-intake.json
├── intake-summary.zh-CN.md
├── intake-summary.en.md
├── environment-preflight.json
├── environment-preflight.zh-CN.md
├── environment-preflight.en.md
├── repository-profile.json
├── repository-profile.zh-CN.md
├── repository-profile.en.md
├── evaluation-blueprint.json
├── blueprint-review.zh-CN.md
├── blueprint-review.en.md
├── release-audit.json
├── release-audit.zh-CN.md
├── release-audit.en.md
├── approvals.json
├── cases/private/<id>.json
└── evaluator-assets/<id>/...
```

The two manifests share `roundId`, `evalsetId`, `releaseId`, `repository`, `baseRevision`, `track`, `locales`, `releaseStatus`, and a digest of the ordered case IDs. Store `repository` and every other local path relative to the declared workflow base. The public package must contain no profile, blueprint, approval notes, process audit, private case, scoring criteria, result-verification rule, evidence, provenance, hidden test, reference patch, private path, or absolute path. `case-index.json` contains only `schemaVersion` and `caseIds`; it never contains prompts or metadata.

Use separate workflow intake records. `generation-intake.json` belongs in the sealed package, the normalized Execute request belongs inside one product run's consolidated `execution-state.json`, and `judge-intake.json` belongs in the final Judge output root. Never copy one workflow's intake fields into another or ask a later workflow to repeat facts available in validated upstream artifacts.

Use the parent-owned shared output layout:

```text
.codebase-eval/<round-id>/
├── evalset/<track>/
├── report/<judge-run-id>/
├── <system-id>/<execution-run-id>/
└── <other-system-id>/<execution-run-id>/
```

See [output-layout.md](output-layout.md) for ownership, collision, isolation, and path rules. `evalset`, `report`, and product IDs are direct round children; `evalset` and `report` are reserved. Only public packages belong in `evalset`; sealed packages remain outside the repository and the entire evaluation root.

## Public case

```json
{
  "schemaVersion": 2,
  "id": "case-001",
  "locales": ["zh-CN", "en"],
  "title": { "zh-CN": "诊断重复回调", "en": "Diagnose duplicate callbacks" },
  "prompt": {
    "zh-CN": "仅通过静态阅读代码，定位重复回调导致状态错误的根因并解释完整调用链。所有证据必须给出完整仓库根相对路径、精确符号以及行号或行范围。",
    "en": "Using static code reading only, locate the root cause of the state error caused by duplicate callbacks and explain the complete call chain. Every evidence item must include the complete repository-root-relative path, exact symbol, and precise line number or range."
  },
  "baseRevision": "immutable revision",
  "track": "native-repository",
  "taskType": "diagnose",
  "deliverables": {
    "zh-CN": ["诊断结论和排除的竞争假设", "完整调用链", "包含完整仓库根相对路径、精确符号和行号或行范围的代码证据"],
    "en": ["diagnosis and rejected competing hypotheses", "complete call chain", "code evidence with complete repository-root-relative paths, exact symbols, and precise line numbers or ranges"]
  },
  "allowedOperations": {
    "zh-CN": ["只读搜索和阅读代码仓"],
    "en": ["search and read the repository without modifying it"]
  },
  "forbiddenOperations": {
    "zh-CN": ["修改源码或代码仓", "运行项目测试", "构建项目", "启动应用、服务或服务器", "访问网络", "安装依赖", "读取其他评测用例"],
    "en": ["modify the source or repository", "run project tests", "build the project", "start the app, service, or server", "access the network", "install dependencies", "read other evaluation cases"]
  },
  "environment": {
    "services": [],
    "requirementIds": [],
    "notes": { "zh-CN": "无需外部服务。", "en": "No external service is required." },
    "sideEffects": {
      "mode": "snapshot-only",
      "resourceIds": [],
      "outsideSnapshotWrites": [],
      "cleanupControlIds": []
    }
  }
}
```

`sideEffects` is candidate-visible operational metadata, not an answer hint. New schema-v4 Generate cases always use `snapshot-only` with empty resource, outside-write, and cleanup-control arrays because the task is read-only. `isolated-external` remains valid only for already approved legacy packages. Do not put reset commands, expected answers, or private result checks in a public case.

Every string in `environment.services` is an opaque service ID. Before planning, it must resolve to one candidate-safe record in public `execution-contract.json.serviceReadiness` and one matching `execution-request.json.environmentVerification.serviceVerification` record proving Execute repeated the lifecycle. The Runner merges only the live `verifiedAt` status into the immutable service record, copies selected records to `execution-state.json.todo.serviceReadiness`, then projects only the current case's English records into `worker-envelope.json.serviceContext`. A contract service record contains `id`, a safe relative `workingDirectory`, nullable argument-array `buildCommand`, argument-array `startCommand`, an HTTP or command `readiness` contract, `stop.strategy: "terminate-attempt-process-tree"`, `requirementIds`, `cleanupControlIds`, and bilingual `notes`. Commands and URLs must contain no credential values; credentials are supplied only through the separately verified secure mechanism identified by requirement IDs.

Do not expose `generationLoad`, `retrievalTool`, or `expectedToolCalls`; they are sealed metadata that would change candidate behavior. Do not expose evaluator-only keys such as `expectedBehavior`, `evidence`, `requiredImpact`, `verification`, `scoringCriteria`, `provenance`, `solution`, or `hiddenTests`.

## Sealed scoring and result-check record

```json
{
  "schemaVersion": 2,
  "id": "case-001",
  "locales": ["zh-CN", "en"],
  "generationLoad": "none",
  "capabilities": { "primary": "bug_diagnosis", "secondary": ["dependency_impact"] },
  "difficulty": { "overall": "L3", "scope": "S3", "reasoning": "R4", "information": "I3", "validation": "V1" },
  "evidence": [{
    "source": "src/callbacks/dispatcher.js:42-58",
    "claim": { "zh-CN": "相关性说明。", "en": "Why this evidence matters." },
    "confidence": "high"
  }, {
    "source": "src/state/store.js:117-136",
    "claim": { "zh-CN": "第二处独立代码证据。", "en": "A second independent code evidence location." },
    "confidence": "high"
  }],
  "expectedBehavior": { "zh-CN": ["可观察结果"], "en": ["observable outcome"] },
  "edgeCases": { "zh-CN": [], "en": [] },
  "requiredImpact": { "zh-CN": [], "en": [] },
  "verification": {
    "type": "human-review",
    "cwd": ".",
    "timeoutMs": 600000,
    "command": [],
    "setupCommands": [],
    "cleanupCommands": [],
    "injectFiles": [],
    "envAllowlist": [],
    "steps": { "zh-CN": [], "en": [] },
    "cleanup": { "zh-CN": [], "en": [] }
  },
  "scoringCriteria": {
    "criteria": [
      { "id": "core", "description": { "zh-CN": "核心结论或行为正确", "en": "Core conclusion or behavior is correct" }, "max": 4.0 },
      { "id": "localization", "description": { "zh-CN": "完整路径、符号、行号和证据准确", "en": "Complete paths, symbols, line locations, and evidence are accurate" }, "max": 2.5 },
      { "id": "reasoning", "description": { "zh-CN": "关系、流程和约束推理完整", "en": "Relationship, workflow, and invariant reasoning is complete" }, "max": 2.0 },
      { "id": "impact", "description": { "zh-CN": "影响边界覆盖完整", "en": "Impact boundaries are complete" }, "max": 1.0 },
      { "id": "verification", "description": { "zh-CN": "回答内证据清晰且可静态复核", "en": "Answer evidence is clear and statically reviewable" }, "max": 0.5 }
    ],
    "caps": []
  },
  "provenance": [],
  "estimatedCost": { "tokens": null, "durationMinutes": null, "services": [] }
}
```

New schema-v4 Generate cases require `generationLoad: "none"`; `low` and `medium` remain readable only in released legacy packages. This sealed record contains evaluator evidence, expected behavior, static result-review instructions, and scoring criteria for the corresponding public task; it is not another candidate task. Every new private case cites at least two precise source line locations. Retrieval-tool suitability is deliberately not duplicated here. Scoring-criterion maximums total 10. Use 0.5 increments. New cases use `human-review` with empty command, setup, cleanup, and injection arrays.

## Blueprint

`evaluation-blueprint.json` uses schema v4 for every new generation. It requires exactly 15 read-only code-understanding cases, five-capability coverage targets, the fixed task-type and generation-load targets, retrieval-tool targets and policy, the fixed authoring policy, and case concepts carrying reviewer-facing capability/tool annotations. Schema v3 remains valid only for already approved legacy packages; never use it to author a new release.

```json
{
  "schemaVersion": 4,
  "locales": ["zh-CN", "en"],
  "plannedTotal": 15,
  "coverage": [
    { "dimension": "capability", "key": "code_retrieval", "minCount": 3 },
    { "dimension": "capability", "key": "architecture_conventions", "minCount": 3 },
    { "dimension": "capability", "key": "behavior_workflows", "minCount": 3 },
    { "dimension": "capability", "key": "dependency_impact", "minCount": 3 },
    { "dimension": "capability", "key": "bug_diagnosis", "minCount": 3 }
  ],
  "taskTypeTargets": { "retrieve_explain": 6, "impact_analyze": 5, "diagnose": 4 },
  "generationLoadTargets": { "none": 15, "low": 0, "medium": 0 },
  "generationLoadPolicy": {
    "allowed": ["none"],
    "minimumNoneRatio": 1,
    "maximumNoneRatio": 1,
    "maximumMediumRatio": 0
  },
  "authoringPolicy": {
    "mode": "read-only-code-understanding",
    "sourceMutation": "forbidden",
    "projectExecution": "forbidden",
    "requiredCitationForm": "repository-root-relative-path-symbol-line-range",
    "resultSurface": "final-response-and-static-frozen-source"
  },
  "retrievalToolTargets": { "grep-glob-read": 5, "codebase-index": 5, "hybrid": 5 },
  "retrievalToolPolicy": {
    "requiredPerRetrievalTool": 5,
    "allowedExpectedToolCalls": ["grep", "glob", "read", "codebase-index", "symbol-search", "reference-search"],
    "publicProjectionIncludesRetrievalMetadata": false,
    "scoreDependsOnToolChoice": false
  },
  "automaticEvaluationTarget": 15,
  "caseConcepts": [{
    "id": "case-001",
    "capabilities": { "primary": "code_retrieval", "secondary": ["architecture_conventions"] },
    "generationLoad": "none",
    "retrievalTool": "hybrid",
    "expectedToolCalls": ["grep", "read", "reference-search"],
    "assessmentRationale": {
      "zh-CN": "从明确线索进入，再沿引用关系定位完整实现。",
      "en": "Starts from an exact clue and follows references to the complete implementation."
    }
  }],
  "notes": { "zh-CN": [], "en": [] }
}
```

`plannedTotal` must equal 15. The task mix is exactly six `retrieve_explain`, five `impact_analyze`, and four static `diagnose` cases; every case has generation load `none`. `implement`, `refactor`, `test_design`, and `verify` are forbidden for new releases. Every primary capability × `retrievalTool` cell contains exactly one case. Every concept has a non-empty `expectedToolCalls` list and bilingual `assessmentRationale`. Lexical cases include at least one of `grep`, `glob`, or `read`; index cases include at least one of `codebase-index`, `symbol-search`, or `reference-search`; hybrid cases include both groups. These are hidden authoring and diagnostic annotations, not prescribed execution methods. They must never appear in a public case, worker envelope, execution result, or evaluated-agent prompt. At H2, the bilingual review joins every concept to its public case and shows the full Chinese and English prompts plus these sealed annotations.

## Execution request and state

Generate writes one immutable `execution-contract.json` per released public track. It owns release identity, all-case selection, attempts, strict serial case concurrency, one fresh case coordinator per case, one nested fresh worker per attempt, timeout, prompt-locale source, no-inheritance requirements at both subagent layers, direct live-project execution, main-agent-owned initial snapshot, case-coordinator-owned completed-state snapshot and baseline rollback, dependency immutability, cleanup gates, evidence requirements, application credential requirement IDs, candidate-safe service contracts, and cleanup controls. Evidence requirements fix the bounded retrieval summary to at most eight key actions and forbid retaining a full native retrieval trace solely for tool analysis. Its exact SHA-256 is release evidence.

One evaluated product runs at a time. Its minimal `execution-request.json` references the contract by relative path, release ID, and SHA-256 and contains only product identity, public package, product-native token/activity evidence sources, execution-time environment/credential/service verification, run constraints/decisions, relative output layout, and confirmation. Prompt language is not configurable: the contract fixes every evaluated-worker prompt to English. The request contains no shared-policy override, absolute path, competitor, cross-product token-comparability decision, adapter, independent report setting, private-package path, or child-capability preflight result. The Runner rejects extra fields and consolidates the normalized request, immutable plan, and mutable TODO into `execution-state.json`.

## Worker envelope and raw result

`worker-envelope.json` contains the English side of one materialized public task plus task, attempt, English worker instructions, a machine result contract, workspace, timeout, environment identity, and a case-scoped English `serviceContext` array. Chinese is retained only in the public bilingual package for human comparison. The envelope must not contain the full state/TODO, an evalset root, other case index, unrelated service, private path, scoring criteria, result-verification rules, or score. The result contract prevents product-specific agents from having to infer the raw output shape.

`worker-result.json`:

```json
{
  "schemaVersion": 3,
  "taskId": "cursor--case-001--en",
  "attempt": 1,
  "system": "cursor",
  "caseId": "case-001",
  "promptLocale": "en",
  "child": { "agentId": "child-id", "sessionId": "fresh-session-id", "contextInherited": false },
  "startedAt": "2026-07-16T19:42:07Z",
  "completedAt": "2026-07-16T19:45:07Z",
  "status": "completed",
  "finalResponsePath": "final-response.md",
  "logPaths": ["session.log"],
  "evidence": {
    "activityLogPath": ".codebase-eval-worker/activity-log.jsonl",
    "activityLogSource": "host-native",
    "commandLogPaths": [],
    "testLogPaths": [],
    "deliverablePaths": [],
    "inspectedRepositoryLocations": [],
    "citedRepositoryLocations": [],
    "retrievalEvidence": {
      "source": "host-native",
      "actions": [
        {
          "tool": "reference-search",
          "role": "discovery",
          "target": "symbol or concept",
          "outcome": "key references located"
        }
      ],
      "gaps": []
    },
    "gaps": []
  },
  "tokens": 42000,
  "tokenEvidence": { "availability": "available", "source": "product-native", "comparable": false },
  "durationMs": 180000,
  "unfinished": false,
  "environmentBaselineId": "sealed-id",
  "protocolViolations": []
}
```

`finalResponsePath` must be exactly `final-response.md` relative to the live project. The final answer is a Markdown artifact; `.txt` and other extensions are invalid. The Runner preserves it as `artifacts/<task-id>/attempt-<n>/final-response.md`.

The worker itself records `startedAt` immediately before core case work and `completedAt` immediately after it finishes. Both fields must be UTC ISO-8601 timestamps with exact second precision and no fractional seconds: `YYYY-MM-DDTHH:mm:ssZ`. The case coordinator must preserve them unchanged. Runner capture validates their format and chronological order and copies both fields verbatim into `execution-result.json`.

When the evaluated product cannot expose reliable token evidence, set execution `tokenEvidence.availability` to `unavailable`, keep a non-empty source description, set `tokens` to `null`, and set `worker-result.tokenEvidence.comparable` to `false`. An activity journal is not token evidence. Never change an unavailable measurement to zero or claim it is available merely to satisfy planning.

Valid statuses are `completed`, `unfinished`, `infra-error`, and `protocol-error`. After the worker returns, the assigned case coordinator freezes the completed project; capture adds the worker-recorded timestamps, deterministic shorter-duration selection, immutable baseline diff, and artifact hashes to the execution result. No raw execution artifact may contain a score or Judge conclusion.

The Runner stores that evaluated outcome independently as `artifacts/<task-id>/attempt-<n>/execution-result.json`. This minimal machine index contains execution identity/status, time and tokens, evidence paths, observable repository locations, project diff, and the retained completed-state workspace. The human answer remains `final-response.md`; the execution result has no capture, restoration, or cleanup section.

After every captured attempt, the assigned case coordinator supplies transient `rollback-result.json`. It identifies the case coordinator as owner, points to the preserved completed-state snapshot, and declares project-baseline restoration plus case-protocol removal. The Runner independently inventories the restored live project and preserved snapshot; it accepts only `clean` or `rollback-error`, and any error blocks the run. It then deletes the declaration, helper restore evidence, comparison inventories, and gate-only logs.

After rollback verification, the assigned case coordinator supplies transient `cleanup-result.json`. It declares preserved workspace evidence, attempt-owned processes, external resources, outside-project paths, caches/temp state, environment restoration, protocol violations, and remaining dirty data. Resource entries contain `id` and one status: `removed`, `restored`, `terminated`, `verified-clean`, or `not-created` for a clean result. The Runner accepts only `clean` or `cleanup-error`; `clean` requires `environmentRestored: true` and an empty `dirtyDataRemaining`. A cleanup error blocks the entire run. The declaration and cleanup-only evidence are deleted after validation.

`execution-results.json` schema version 5 records the verified execution-contract relative path, release ID, and SHA-256 alongside evalset identity. Every product in one Judge cohort must have the same digest. Per-case `integrity` retains only `projectRestored` and `externalStateClean` booleans, not detailed restoration or cleanup results. It also records `runStatus`; a child/subtask/isolation violation sets `protocol-error` and terminates the full run without retry. `validate-run` writes terminal completeness and integrity counts into `execution-results.json.validation`; no separate validation JSON is produced.

`activityLogPath` is exactly `.codebase-eval-worker/activity-log.jsonl` and points to UTF-8 JSON Lines containing bounded key events rather than a full tool transcript. Collapse repetitive operations and keep at most 20 material events. Classify an event by its primary semantic purpose rather than the host mechanism: a shell `grep` is `search`, a test runner is `test`, and a state-changing Git operation is `command`. Ordinary events use:

```json
{ "at": "ISO-8601", "type": "search|read|edit|command|test|deliverable", "target": "path, symbol, or command", "outcome": "observable concise outcome" }
```

Every `command` or `test` event additionally contains `status` (`succeeded`, `failed`, `timed-out`, or `terminated`) and `exitCode` (an integer, or `null` for timeout/termination). This inline record satisfies the compact command/test evidence requirement; add a path to `commandLogPaths` or `testLogPaths` only when material stdout, stderr, or failure output must be retained. Never relabel an executed command to avoid providing its observable status.

The log must not contain hidden reasoning or chain-of-thought. `activityLogSource` is `host-native` or `worker-journal`. Command/test/deliverable paths are relative artifact files; repository locations are path/symbol identifiers, not evaluator conclusions. Record unavailable host evidence under `gaps` instead of fabricating it.

`retrievalEvidence` is required in `worker-result.json`. It contains only `source` (`host-native`, `worker-journal`, or `unavailable`), a short `gaps` list, and at most eight representative `actions`. Every action contains `tool`, `role`, `target`, and `outcome`; tool is `grep`, `glob`, `read`, `codebase-index`, `symbol-search`, `reference-search`, or `unknown`, and role is `discovery` or `verification`. Use `verification` for contextual reads following an index result. With unavailable evidence, provide no actions and explain the gap without guessing.

The Runner deterministically produces the durable `retrievalSummary` from those actions. It deduplicates known tools, counts discovery-role `grep`/`glob`/`read` as lexical, counts discovery-role codebase-index/symbol/reference operations as index, counts other discovery operations as unknown, derives the observed mode from the lexical/index counts, and derives confidence from the evidence source and gaps. The worker and case coordinator never supply or repair these redundant derived fields. Do not retain the full native retrieval trace solely to produce this summary, expose sealed retrieval expectations, or score tool choice.

## Judgment

The independent Judge emits one record per system and case:

```json
{
  "schemaVersion": 3,
  "system": "cursor",
  "caseId": "case-001",
  "promptLocale": "en",
  "difficulty": "L3",
  "taskType": "diagnose",
  "generationLoad": "none",
  "dimensions": {
    "capabilities": ["bug_diagnosis"],
    "retrievalTool": "codebase-index"
  },
  "score": 8.5,
  "status": "pass",
  "criteria": [
    { "id": "core", "awarded": 3.5, "evidence": { "zh-CN": "", "en": "" } },
    { "id": "localization", "awarded": 2.0, "evidence": { "zh-CN": "", "en": "" } },
    { "id": "reasoning", "awarded": 1.5, "evidence": { "zh-CN": "", "en": "" } },
    { "id": "impact", "awarded": 1.0, "evidence": { "zh-CN": "", "en": "" } },
    { "id": "verification", "awarded": 0.5, "evidence": { "zh-CN": "", "en": "" } }
  ],
  "capsApplied": [],
  "verificationEvidencePath": "verification-results/cursor/case-001.json",
  "tokens": 42000,
  "durationMs": 180000,
  "durationAssessment": {
    "actualDurationMs": 180000,
    "referenceTimeoutMs": 3600000,
    "timeoutRatio": 0.05,
    "band": "within-quarter",
    "scoreAdjustment": 0
  },
  "critical": false,
  "unfinished": false
}
```

There is one `score`, never `codebaseScore`, `implementationScore`, or `speedScore`. Criterion awards form the content subtotal; apply caps and then the deterministic `durationAssessment.scoreAdjustment` to obtain the final score.
