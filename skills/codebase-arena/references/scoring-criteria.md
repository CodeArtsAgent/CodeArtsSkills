# Unified Scoring Criteria

## Single-result rule

Produce exactly one `score` for each `system × case`. Use 0 through 10 in 0.5 increments. Do not produce separate codebase, reasoning, implementation, or generation scores. Criterion awards are evidence for the one score, not independent results.

`generationLoad` is copied from the sealed scoring record and `retrievalTool` from the sealed blueprint concept. Use both only for coverage and diagnostic slices. Never subtract, normalize, split, or weight a score by code-generation load or retrieval method. Do not award points for using an index or deduct points for solving a `codebase-index` case through careful text search and reading.

## Default scoring criteria

Use one construct-valid set of scoring criteria across task types, adapting descriptions without changing the single-result rule:

| Criterion | Max |
|---|---:|
| Core conclusion or observable outcome correctness | 4.0 |
| Complete repository-root-relative paths, exact symbols, line locations, and evidence accuracy | 2.5 |
| Relationship, workflow, convention, and invariant reasoning | 2.0 |
| Impact-boundary and requirement completeness | 1.0 |
| Answer evidence clarity and static reviewability | 0.5 |

Maximums total 10. Every maximum and award is a multiple of 0.5. New schema-v4 cases are read-only and use `generationLoad: none`: score only the accuracy and clarity of repository understanding, static reasoning, and precise source localization. Do not ask for or reward code changes, executed tests, builds, service startup, or similarity to a reference patch. The criterion ID `verification` is retained in machine records for compatibility, but in v4 it means whether the answer's cited evidence can be statically checked against the frozen source.

## Duration scoring dimension

After summing the private content criteria and applying score caps, Report applies one deterministic duration adjustment using the durable Execute `durationMs` and the immutable execution-contract `perCaseTimeoutMs`:

| Actual duration | Band | Adjustment |
|---|---|---:|
| At or below 25% of the timeout | `within-quarter` | 0 |
| Above 25% through 50% | `quarter-to-half` | -0.5 |
| Above 50% but below timeout | `over-half` | -1.0 |
| At timeout or unfinished | `unfinished-or-timeout` | -1.0 |

The final single score is `max(0, content score after caps + duration adjustment)`. Never estimate, repair, normalize across competitors, or replace the recorded duration. This fixed rule keeps a case's score stable when systems are added or removed. `durationAssessment` records the actual milliseconds, reference timeout, ratio, band, and adjustment as evidence for the single score; it is not a separate speed score.

## Score limits and status

Apply the lowest relevant score limit after summing criteria:

| Failure | Maximum |
|---|---:|
| Core result or conclusion is wrong | 5.5 |
| Severe regression, security issue, or data-loss risk | 4.5 |
| Symptom suppressed without the root cause | 6.5 |
| Claimed verification was not run or used stale evidence | 5.5 |
| Fabricated file, symbol, log, or result | 3.5 |
| Destructive out-of-scope work | 4.5 |
| Hidden-answer access or cheating | 0 |

Judge only from frozen evidence. Do not treat an unrecorded activity as completed. A missing optional host-native trace is an evidence gap, not automatic failure, when the standardized worker journal and final response remain complete. For schema-v4 cases, no changed workspace or command/test evidence is expected. Missing final response, missing required path/symbol/line citations, unresolved citations, or materially incomplete static evidence makes the affected criterion unverified; apply the relevant evidence-gap or fabrication cap and report the gap separately from the single score. Legacy executable cases continue to require their declared workspace and command/test evidence.

Map the final score to `full_success` (9.0–10.0), `pass` (8.0–8.5), `partial` (6.0–7.5), or `fail` (0–5.5). The status is a label for the same result.

## Aggregation and ranking

Use difficulty weights `L1=1`, `L2=1.5`, `L3=2`, `L4=3`:

```text
raw accuracy = sum(score * difficulty weight) / sum(difficulty weight)
accuracy score = round(raw accuracy * 2) / 2
```

Report raw accuracy, rounded accuracy, weighted pass/full-success rates, critical failures, unfinished cases, and slices by the five capabilities, task type, difficulty, generation load, and `retrievalTool`. Every slice reuses the same case `score`.

Rank lexicographically:

1. higher rounded accuracy;
2. lower total tokens when accuracy is equal;
3. lower completion duration when token totals differ by at most 5%;
4. stable system ID as final deterministic tie-breaker.

Do not calculate a token sub-score or add a second speed score. The bounded per-case duration adjustment above is already part of accuracy; total duration remains a later tie-breaker. When token accounting is not comparable, display it with a warning and do not overstate the ranking.

## Judgment input

`score-results.mjs` accepts one judgment per system and case:

```json
{
  "tokenComparability": "native-model",
  "judgments": [
    {
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
  ]
}
```

The Judge produces bilingual criterion evidence and final reports from the same machine judgments so values cannot drift between languages.
