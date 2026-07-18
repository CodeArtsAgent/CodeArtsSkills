# Evaluation Model

## Five capability dimensions

Use exactly five codebase capabilities. Tag every case with one primary capability and zero or more secondary capabilities from this same set.

1. `code_retrieval`: locate implementations, callers, configuration, tests, generated code, and authoritative evidence.
2. `architecture_conventions`: understand boundaries, lifecycle, dependency direction, plugins, naming rules, source/build relationships, and environment differences.
3. `behavior_workflows`: trace inputs, transformations, state transitions, side effects, failures, and asynchronous boundaries.
4. `dependency_impact`: identify direct and indirect consumers, interfaces, schemas, compatibility, build, deployment, and migration impact.
5. `bug_diagnosis`: statically trace a symptom to the most likely root cause, distinguish competing hypotheses, and identify the exact supporting code paths and boundaries.
Implementation, consistency, integration, industry, and technology may appear in prompt context, but development is not an evaluated task type and they are not independent coverage dimensions or report slices.

## Retrieval-tool suitability

Attach one sealed `retrievalTool` tag to every blueprint case concept. It is not an eleventh scored capability and not a required tool choice:

- `grep-glob-read`: authentic exact clues have high overlap with repository text and favor grep/glob/read-style discovery, followed by contextual verification;
- `codebase-index`: behavior or domain wording has low overlap with code and dispersed symbol, reference, caller, implementation, registration, or related-concept relationships favor a code index;
- `hybrid`: an exact entry clue must be expanded through relationship traversal.

Do not create a separate retrieval case or detailed retrieval object. Use exactly five cases for each retrieval class. Add `expectedToolCalls` from `grep`, `glob`, `read`, `codebase-index`, `symbol-search`, and `reference-search`; require a lexical call for `grep-glob-read`, an index/symbol/reference call for `codebase-index`, and both groups for `hybrid`. Public prompts remain natural and tool-neutral, and both annotations are excluded from the public projection and worker envelope. Correct results reached through a different mechanism remain valid; report only `retrievalTool` as a diagnostic slice over the same score.

## Difficulty axes

Assign all four axes independently:

- scope: `S1` symbol/file, `S2` module, `S3` cross-module/layer, `S4` architecture/process/repository;
- reasoning: `R1` direct lookup, `R2` chain tracing, `R3` dynamic/configured/generated lifecycle, `R4` runtime/concurrency/transaction/distributed ambiguity;
- information: `I1` explicit location and behavior, `I2` feature/behavior only, `I3` symptom/log/failing test, `I4` incomplete requirements requiring constraint discovery;
- validation: use `V1` static for every new Generate case. `V2`–`V4` remain legacy metadata only.

Retain overall difficulty `L1` through `L4` for aggregation. Do not confuse difficulty with code-generation load.

## Code-generation load

Every new private case uses `generationLoad: none`. The measured output is repository retrieval, explanation, static diagnosis, or static impact analysis. `low`, `medium`, and `high` are forbidden in Generate schema v4; they remain readable only for legacy approved packages.

`generationLoad` is metadata. It may be used for coverage and diagnostic slices but never creates a separate result, sub-score, adjustment, or weighted component.

## Task types and coverage

Use exactly 6 `retrieve_explain`, 5 `impact_analyze`, and 4 `diagnose` tasks. Do not generate `implement`, `refactor`, `test_design`, or `verify`. Balance repository modules, mechanisms, difficulty, and task type. A case may cover multiple dimensions, but it receives one final score.

Each blueprint contains exactly 15 cases per track. The five capabilities crossed with the three retrieval classes form a complete 5 × 3 matrix: every cell contains exactly one primary case. Every case must remain repository-specific, statically checkable, non-duplicative, and dominated by codebase understanding. Require complete repository-root-relative paths, exact symbols, and precise line numbers or ranges in the answer.
