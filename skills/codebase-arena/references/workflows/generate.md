# Generate a Codebase Evalset

Generate candidate-visible cases under the evaluated project and a separate sealed Judge package outside it. Do not execute scored cases in this workflow.

## H0: mandatory structured intake

Make the first tool call after loading this workflow a structured user-input call. Do not inspect the repository or run commands first. Ask at most three questions per batch, do not repeat supplied facts, and require a final explicit confirmation.

Collect:

1. repository root or URL, base revision, workspace boundary, and dirty/generated-file policy; express every local path relative to the confirmed workspace and use the repository root as the workflow command base;
2. evaluation objective, success criteria for the evalset itself, and coverage constraints; apply the fixed requirement of exactly 15 cases per track across the five fixed capabilities without asking for a count or capability selection;
3. `native-repository`, `code-only`, or both as separately packaged tracks;
4. desired stopping gate, a new round ID, and relative sealed private package locations outside every evaluated project and the fixed `.codebase-eval` root; derive each public package as `.codebase-eval/<round-id>/evalset/<track>`;
5. static authoring and result-check feasibility: repository readability, candidate-answer evidence checks, sealed line-level evidence, and per-case time/token ceilings; do not collect runtime, service, test-execution, or credential requirements because new cases are read-only;
6. exclusions, sensitive paths, forbidden operations, licensing, and confidentiality constraints.

Do not ask which products will be evaluated, product labels, adapters, execution sessions, concurrency, attempt count, worker prompt locale, token accounting/comparability, run budgets, report audience, ranking policy, or final report location. Worker prompt locale is fixed to English by policy; the remaining items belong to execution or reporting.

Apply without asking: repository documentation, Git history, issues, pull requests, and network sources are authorized for private authoring. Record provenance only in the sealed package, honor repository confidentiality and platform network policy, and never expose private source material to evaluated products.

Do not author credential-, runtime-, test-, build-, browser-, database-, queue-, or service-dependent cases. New Generate cases are answered from repository reading only. Judge-side result checking may inspect the final response and frozen source statically, but it must not execute the candidate project.

After confirmation, create `generation-intake.json` from [../../assets/generation-intake.template.json](../../assets/generation-intake.template.json), paired bilingual intake summaries, and begin H1. Reject a round ID that already contains released packages or product results unless the user explicitly requested revision of that same round.

Set `round.evaluationRoot` to `.codebase-eval` without asking. Never search the repository for an existing or latest evalset directory, and ignore evalset-like artifacts outside this fixed root, including anything under product-owned configuration/state directories.

## Required references

Read before the corresponding work:

- profiling and blueprint: [../../references/evaluation-model.md](../../references/evaluation-model.md)
- authoring: [../../references/case-authoring.md](../../references/case-authoring.md)
- schemas and layouts: [../../references/case-schema.md](../../references/case-schema.md)
- shared result/report output layout and collision rules: [../../references/output-layout.md](../../references/output-layout.md)
- bilingual artifacts: [../../references/bilingual-output.md](../../references/bilingual-output.md)
- environment checks: [../../references/environment-policy.md](../../references/environment-policy.md)
- side-effect feasibility and cleanup: [../../references/data-lifecycle.md](../../references/data-lifecycle.md)
- scoring criteria: [../../references/scoring-criteria.md](../../references/scoring-criteria.md)

## H1: repository profile

Inspect repository identity, architecture, authoritative knowledge, core flows, industry domains and invariants, technology domains, tests as readable code, leakage risks, and candidate-visible sources. Run read-only fact and version discovery only. Do not start services, execute project tests, build the project, install dependencies, or verify application credentials for new cases.

Produce paired profile and environment reports plus machine-readable evidence in the sealed authoring/Judge package, never in the candidate package. Record that runtime, credential, and service requirements are absent for the new read-only release; do not create service lifecycle metadata. Run `validate-evalset.mjs --stage profile`, fix every bilingual structure and Chinese-terminology failure, then present both languages and stop for explicit approval.

## H2: prompt and coverage review

Author all 15 bilingual public prompts before H2 approval. Use only five capability dimensions: code retrieval, architecture and repository conventions, behavior and business workflows, dependency and change impact, and bug diagnosis. Assign each prompt one primary capability and zero or more secondary capabilities from the same five. For every capability, require exactly one primary `grep-glob-read`, one primary `codebase-index`, and one primary `hybrid` prompt.

Use blueprint schema v4 and exactly these task targets: 6 `retrieve_explain`, 5 `impact_analyze`, and 4 `diagnose`. Every task is read-only and has `generationLoad: none`. A diagnosis asks for the most likely root cause, competing hypotheses, and the exact supporting control/data-flow locations; it must not ask the worker to reproduce the bug, run a test, implement a fix, or propose a patch. An impact analysis traces consumers, interfaces, schemas, lifecycle boundaries, and compatibility consequences without asking for a change plan or implementation.

Every prompt and deliverable must require a self-contained answer with:

- a direct, accurate conclusion;
- a clear call chain, control/data flow, lifecycle, convention, or impact explanation as appropriate;
- evidence using complete repository-root-relative paths, exact symbols, and precise line numbers or line ranges;
- explicit uncertainty where the repository does not prove a claim.

Reject prompts whose success depends on prose volume. Score whether the cited line ranges actually support the stated relationships and whether the explanation is clear enough for another engineer to follow.

Annotate every blueprint case concept with one sealed `retrievalTool` and a non-empty sealed `expectedToolCalls` list. Use exactly five `grep-glob-read`, five `codebase-index`, and five `hybrid` cases. Allowed tool-call labels are `grep`, `glob`, `read`, `codebase-index`, `symbol-search`, and `reference-search`. These fields describe which retrieval operations the prompt is intended to exercise for human review; they are not copied into the public prompt or worker envelope and do not prescribe the evaluated product's actual method.

Design the public semantics to create the intended advantage naturally. `grep-glob-read` cases provide authentic exact clues such as an error, symbol, configuration key, protocol field, or filename pattern but still require reading and disambiguation. `codebase-index` cases describe behavior or domain intent with low wording overlap, dispersed implementation, and symbol/reference/call relationships. `hybrid` cases require an exact entry clue followed by cross-module relationship traversal. Never instruct the worker to use a particular retrieval tool; the evaluated product may solve through any method. Reject artificial identifier obfuscation, irrelevant-file padding, or duplicate answer pairs created only to force a tool.

Reject a blueprint that does not contain exactly 15 distinct prompts. Do not add extra cases for repository size; choose stronger cross-module prompts and secondary capability tags instead.

Allow only `none`: the worker reads and explains repository state without source edits or project execution. `low`, `medium`, and `high` are invalid for new Generate releases.

H2 is primarily a human prompt review. Produce a 15-row bilingual review table with: case ID, full Chinese prompt, full English prompt, primary capability, secondary capabilities, `retrievalTool`, `expectedToolCalls`, and a concise bilingual explanation of what the prompt exercises. Do not ask the reviewer to approve repository-specific difficulty, hidden answers, implementation suitability, or omission analysis they cannot independently judge. Keep difficulty, generation load, result-check approach, environment requirements, and cleanup feasibility as authoring checks enforced by the generator and deterministic validator.

The full English prompt shown at H2 must be byte-equivalent to the prompt later supplied to the evaluated worker; the Chinese prompt is its independently written human-review counterpart. Reject duplicate prompts, artificial tool forcing, generic coding tasks, uncontrollable external state, or a prompt whose declared capabilities and expected tool calls cannot be justified from its semantics.

Produce the bilingual blueprint review and machine blueprint. Run `validate-evalset.mjs --stage blueprint`, fix every prompt-count, capability, tool-call, bilingual-structure, and Chinese-terminology failure, then stop for H2 approval.

## H4: release

Generate only the approved distribution. Package:

- candidate package under the evaluated repository, containing only the public manifest, prompt-free case index, immutable `execution-contract.json`, public cases, approved track sanitization material when needed, and no profile, blueprint, audit narrative, private key, or answer;
- one candidate-visible `execution-contract.json` in each public track package, created from [../../assets/execution-contract.template.json](../../assets/execution-contract.template.json), containing every cross-product execution invariant, evidence requirement, and repository/release identity, with empty service, credential-requirement, and external-cleanup-control arrays; hash the exact file and bind that SHA-256 in the release audit;
- sealed Judge package outside the evaluated repository, containing all bilingual process artifacts, approvals, repository profile, blueprint, matching private cases, scoring criteria, static line-level answer evidence, provenance, and release evidence. New schema-v4 cases do not contain hidden executable tests.

For `native-repository`, preserve base-revision repository instructions and documentation. For `code-only`, also preserve base-revision repository-native agent guidance, including `AGENTS.md`, `CLAUDE.md`, and equivalents, because locating and applying it is measured codebase capability. Never remove authentic guidance merely because it helps solve a case; reject or rebase a trivialized case instead. The audited sanitization manifest removes only evaluator/private material, benchmark-authored answers, future solution history, untracked/generated runtime data, and vendor caches outside the intended codebase surface.

Run validation with each public/sealed track pair, perform bilingual parity, natural-Chinese readability, terminology, leakage, and retrieval-tool distribution checks, and record separate `structuralCorrespondence`, `semanticCorrespondence`, `chineseReadability`, and `terminologyScan` decisions in the machine release audit. Verify that `retrievalTool`, `expectedToolCalls`, and `assessmentRationale` exist only in the sealed blueprint and no public prompt names a required retrieval tool. Before requesting H4 approval, run `validate-evalset.mjs --stage candidate`; after approval, run the full `--stage release` gate. Require corresponding titles and paragraphs, but reject sentence-by-sentence literal translation or Chinese that depends on English for meaning. Put `roundId` in matching public and private manifests. Never copy the sealed package into the evaluated project after approval.

Put only candidate-visible public packages under the shared round's `evalset/<track>` paths. Keep every sealed package outside the evaluated repository and the entire evaluation root. Generate never creates product or report directories and never asks which products will be evaluated.

The execution contract is immutable after H4 approval. It contains no product name, execution run ID, output path, product-native token/activity source, live coordinator/worker session ID, secret, private evidence, result check, answer, or score. Generate fixes case selection, attempts, strict serial case concurrency, one fresh non-inherited case coordinator per case, one nested fresh non-inherited worker per attempt, timeout, locale source, direct live-project execution, main-agent-owned initial snapshot, case-coordinator-owned completed-state snapshot and exact baseline rollback, worker-owned second-precision timestamps, shorter-duration consistency selection, dependency mutation, cleanup, and evidence requirements. New read-only releases use empty credential requirement IDs, service contracts, and external cleanup controls. If any fixed value must change, issue a new release and contract digest rather than allowing Execute to override it.
