# Case Authoring

## Source and evidence

Prefer real code-understanding questions derived from regressions, issues, pull requests, commits, migrations, integration failures, and architectural traps. Convert them into read-only explanation, impact, or static diagnosis tasks. Repository documentation, Git history, issues, pull requests, and network sources are pre-authorized for private authoring; record provenance only in the sealed Judge package and honor confidentiality and platform network policy.

For historical cases, select the parent revision, exclude future solution history, write a natural public task without solution hints, derive behavior from multiple sources, and statically check the response against authoritative source lines. A reference patch is supporting evidence, never the sole correctness check and never a requested candidate deliverable.

Every sealed scoring record contains evidence locations, observable behavior, edge cases and invariants, required impact areas, result-verification instructions, one set of 10-point scoring criteria, score limits, dependencies, cleanup, difficulty, five-capability tags, and `generationLoad`. Retrieval suitability is not duplicated here; the logical case has `retrievalTool` and `expectedToolCalls` annotations on its sealed blueprint concept.

## Annotate retrieval suitability

Add exactly one sealed tag to each blueprint case concept:

- `grep-glob-read`: authentic exact clues have high lexical overlap with code; success still requires filtering candidates and reading context.
- `codebase-index`: behavior or domain language has low lexical overlap and the answer depends on cross-file symbols, implementations, references, callers, registrations, or related concepts.
- `hybrid`: an exact lexical entry point must be expanded through semantic or relationship traversal; use this most often for realistic maintenance work.

Keep only `retrievalTool` plus the flat `expectedToolCalls` list; do not create a separate retrieval-specific private case or a detailed retrieval object. Public prompts must remain natural and tool-neutral. A different retrieval path that reaches the correct, complete, well-supported result is valid.

Across each 15-case track, require exactly one primary case for every capability × retrieval-class combination, yielding five `grep-glob-read`, five `codebase-index`, and five `hybrid` cases. Secondary capabilities may overlap. Use matched cases from different modules to control difficulty; do not paraphrase the same answer twice. Reject artificial identifier renaming, irrelevant corpus padding, prompts stripped of normal engineering context, and cases whose expected advantage comes only from repository size.

Reject any case that requires credentials, runtime setup, services, databases, queues, browsers, containers, external writes, project tests, or builds. Static repository reading must be sufficient.

## Enforce read-only code understanding

Set every case to `generationLoad: none`. Permit only repository search and file reading. Reject any request to implement, refactor, edit, patch, design tests, run tests, build, start services, reproduce behavior dynamically, or create a change plan whose quality depends on development judgment.

Require the public answer to state a direct conclusion, explain the relevant relationships clearly, and cite complete repository-root-relative paths, exact symbols, and precise line numbers or ranges. In the sealed record, keep at least two authoritative line-level evidence entries. Do not reward prose volume or a list of paths without a correct relationship explanation.

## Public/private separation

The evaluated repository contains only the public package. The sealed Judge package must be outside the repository and unavailable to evaluated agents.

Public material must not reveal evidence locations, expected behavior beyond the user-visible requirement, private provenance, hidden test names, scoring criteria, reference-answer symbols, future commits, or likely files unless naturally supplied by the task.

### Native repository

Preserve all files tracked at the base revision, including repository instructions, documentation, tests, and comments. Exclude private evaluation material, untracked local data, vendor caches, and future solution history.

### Code-only

Preserve source, manifests, build/test configuration, schemas, original tests, and base-revision repository-native agent guidance such as `AGENTS.md`, `CLAUDE.md`, and equivalent instruction files. Finding and correctly applying those instructions is part of measured codebase capability. Do not remove repository-native guidance merely because it contains architecture summaries, conventions, pitfalls, or useful solution direction. If retained guidance or a source comment makes a proposed case trivial, reject or rebase the case instead of sanitizing authentic repository knowledge to manufacture difficulty.

Remove evaluator/private material, benchmark-authored answer or solution files, future solution history, untracked local data, generated runtime output, and vendor indexes/caches that are not part of the intended codebase surface. A repository instruction file may be removed only when sealed provenance proves it was introduced specifically for the benchmark rather than belonging to the base revision. Record every removal and original hash in the sanitization manifest.

## Bilingual parity and quality

Derive `zh-CN` and `en` from one behavior contract. Keep titles, paragraphs, list items, and table rows in corresponding order, and keep paths, symbols, commands, error strings, versions, and numeric constraints unchanged. Write the Chinese prompt directly for a Chinese engineer; do not translate English syntax, noun phrases, or benchmark jargon literally. Materialize only `en` for evaluated workers; retain `zh-CN` solely for human comparison, authoring review, and reporting.

Reject or revise a case when correctness is not reproducible, required infrastructure is unavailable, external dirty data cannot be isolated and reset, one locale provides extra hints, the result check overfits one patch, difficulty or tags lack evidence, another case duplicates it, private material can enter the evaluated snapshot, or generic generation ability can dominate codebase understanding.
