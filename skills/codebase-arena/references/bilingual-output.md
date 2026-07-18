# Bilingual Output Contract

Use exactly `zh-CN` and `en`. Neither language may add requirements, hints, evidence, exceptions, or scoring signals. Preserve repository-native paths, symbols, APIs, hashes, commands, code, configuration keys, product names, enum values, and raw logs verbatim.

Write both versions from the same fact-and-decision outline. Do not write one version by translating its sentences into the other language. The two files must align structurally while each reads as an independently written native-language document.

Use plain terminology consistently in all human-readable artifacts:

- Chinese: `结果检查`; English: `result verification` or `result check`.
- Chinese: `评分标准`; English: `scoring criteria`.

Prefer these terms over specialist or academic jargon. Machine field names use `verification` and `scoringCriteria` so the JSON contract matches the human language.

## Human-readable artifacts

Create paired files `<name>.zh-CN.md` and `<name>.en.md`. Keep the following structure aligned:

- each title and heading has one counterpart at the same position and heading level;
- each prose paragraph has one counterpart in the same section and order;
- list items, table rows, case IDs, evidence IDs, metrics, risks, and decisions correspond one for one;
- code blocks, paths, commands, symbols, values, and citations remain attached to the corresponding point.

Do not require corresponding headings or paragraphs to use the same word order, sentence count, grammar, punctuation, or rhetorical structure. A Chinese paragraph may split or combine sentences inside that paragraph, but it must not absorb the content of another paragraph or move content to a different section.

Apply this to intake summaries, environment reports, repository analysis, blueprint/sample reviews, validation/release checks, execution receipts, independent scoring findings, and final reports.

## Natural Chinese requirements

Write `zh-CN` for a Chinese reader who will not open the English file:

- state the conclusion or decision first, then give the reason and evidence;
- prefer short subject-verb sentences and concrete verbs over stacked abstract nouns;
- explain specialist concepts on first use when the repository does not define them;
- use established Chinese technical terms, but keep repository-native names and identifiers unchanged;
- remove filler such as “基于……进行……”, “实现了对于……的……”, and repeated “该” constructions when a direct sentence is clearer;
- avoid unexplained English role names and benchmark jargon in Chinese prose.

Use these default Chinese expressions in human-readable outputs:

| Avoid as default | Prefer |
|---|---|
| 生成 Intake 摘要 / Intake | 生成阶段确认事项 / 范围确认 / 启动确认 |
| 停止门 | 人工确认节点 / 审批节点 |
| 代码仓画像 | 项目分析报告 |
| 代码仓 | 代码库 or 项目 |
| 赛道 | 评测类型 |
| 候选工具 / 候选系统 | 被测产品 |
| Judge | 独立评分方 or 评分阶段 |
| 结果核验 | 结果检查 |
| 脏数据 | 临时数据、残留数据, or 未清理状态 |
| 不变量 | 必须始终满足的业务规则 |
| 计分板 | 成绩汇总 |
| generation load | 需要编写代码的工作量; keep `generationLoad` only when naming the machine field |
| codebase 能力 | 理解和使用现有代码库的能力 |
| 护栏 | 比例限制 / 约束条件 |

These are writing defaults, not replacements inside file names, JSON keys, enum values, commands, source symbols, or repository-native terminology.

Reject or rewrite a Chinese artifact when it shows English word order, long chains of “的”, unexplained literal translations, excessive passive voice, noun-heavy headings, or terminology that requires the English file to understand. Read the Chinese file by itself as the final quality check.

Treat the avoid-list expressions above as release-blocking in Chinese prose, headings, prompts, result checks, approval notes, and reports. Repository-native identifiers, JSON keys, commands, paths, code, and quoted raw logs are exempt. Run `validate-evalset.mjs` at the maximum stage available before every H1, H2, or H4 approval request; its terminology scan must pass. A shape-only bilingual check is insufficient.

Evaluated execution produces no quality report. Its optional bilingual receipt may state only completion, infrastructure/protocol state, and artifact paths.

## JSON localization

Use locale maps for prose:

```json
{ "zh-CN": "中文内容", "en": "English content" }
```

Use aligned locale arrays for lists. Keep machine fields single-valued: IDs, paths, hashes, commands, timestamps, scores, counts, booleans, enums, and raw metrics.

## Prompt fairness

Package both public prompt locales, but materialize exactly one locale in a scored run. Derive it from the initial execution prompt unless explicitly overridden, and use the same locale for all products in one comparison cohort. Never show both prompt variants to a worker.

Private Judges may read both locales. Executable behavior must be language-independent unless localization is itself under test.

At sample, release, and final-report audit, verify aligned requirements, exclusions, paths, numeric limits, edge cases, scoring-criterion maximums, score limits, findings, and metric values. Automated shape validation does not replace human semantic parity review.

The audit must separately record:

1. structural correspondence: titles, headings, paragraphs, list items, and table rows align;
2. semantic correspondence: facts, requirements, exclusions, evidence, and decisions match;
3. Chinese readability: the Chinese file passes the natural-language requirements above without consulting English.

For H4, record all three decisions separately in `release-audit.json.bilingualAudit`, together with `terminologyScan`. Use `passed` only after human semantic/readability review and deterministic terminology validation both succeed.
