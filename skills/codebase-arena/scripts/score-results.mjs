#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validateDurationAssessment } from './duration-scoring.mjs';

const weights = { L1: 1, L2: 1.5, L3: 2, L4: 3 };
const locales = new Set(['zh-CN', 'en']);
const loads = new Set(['none', 'low', 'medium']);
const retrievalTools = new Set(['grep-glob-read', 'codebase-index', 'hybrid']);
const capabilities = new Set(['code_retrieval', 'architecture_conventions', 'behavior_workflows', 'dependency_impact', 'bug_diagnosis']);
const roundHalf = (value) => Math.round(value * 2) / 2;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function validScore(value) { return typeof value === 'number' && value >= 0 && value <= 10 && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9; }
function slice(runs) {
  if (!runs.length) return null;
  const totalWeight = runs.reduce((sum, run) => sum + weights[run.difficulty], 0);
  const accuracy = runs.reduce((sum, run) => sum + run.score * weights[run.difficulty], 0) / totalWeight;
  const passedWeight = runs.filter((run) => run.score >= 8 && !run.unfinished).reduce((sum, run) => sum + weights[run.difficulty], 0);
  return {
    caseCount: runs.length,
    rawAccuracy: Number(accuracy.toFixed(4)),
    accuracyScore: roundHalf(accuracy),
    weightedPassRate: Number((100 * passedWeight / totalWeight).toFixed(2)),
    totalTokens: runs.every((run) => Number.isFinite(run.tokens)) ? runs.reduce((sum, run) => sum + run.tokens, 0) : null,
    totalDurationMs: runs.reduce((sum, run) => sum + run.durationMs, 0),
    averageDurationMs: Math.round(runs.reduce((sum, run) => sum + run.durationMs, 0) / runs.length),
    totalDurationScoreAdjustment: runs.reduce((sum, run) => sum + run.durationAssessment.scoreAdjustment, 0)
  };
}
function keyedSlices(runs, valuesFor) {
  const keys = new Set(runs.flatMap(valuesFor));
  return Object.fromEntries([...keys].sort().map((key) => [key, slice(runs.filter((run) => valuesFor(run).includes(key)))]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write('Usage: score-results.mjs --input JUDGMENTS.json [--out SCOREBOARD.json]\n'); return; }
  if (!args.input) throw new Error('--input is required');
  const input = JSON.parse(readFileSync(path.resolve(args.input), 'utf8'));
  if (!Array.isArray(input.judgments) || input.judgments.length === 0) throw new Error('Input requires a non-empty judgments array');

  const systems = new Map();
  const keys = new Set();
  const systemsByCaseLocale = new Map();
  const promptLocales = new Set(input.judgments.map((item) => item.promptLocale));
  if (promptLocales.size !== 1) throw new Error('A comparison must use exactly one promptLocale');
  for (const item of input.judgments) {
    for (const field of ['system', 'caseId', 'promptLocale', 'difficulty', 'taskType', 'generationLoad', 'dimensions', 'score', 'tokens', 'durationMs', 'durationAssessment', 'unfinished']) if (item[field] === undefined || (item[field] === null && field !== 'tokens')) throw new Error(`Judgment is missing ${field}`);
    if (!locales.has(item.promptLocale)) throw new Error(`Invalid promptLocale: ${item.promptLocale}`);
    if (!weights[item.difficulty]) throw new Error(`Invalid difficulty: ${item.difficulty}`);
    if (!['retrieve_explain', 'impact_analyze', 'diagnose', 'implement', 'refactor', 'test_design', 'verify'].includes(item.taskType)) throw new Error(`Invalid taskType: ${item.taskType}`);
    if (!Array.isArray(item.dimensions?.capabilities) || item.dimensions.capabilities.length === 0 || item.dimensions.capabilities.some((value) => !capabilities.has(value))) throw new Error(`Invalid capability dimensions: ${item.caseId}`);
    if (!retrievalTools.has(item.dimensions?.retrievalTool)) throw new Error(`Invalid or missing retrievalTool: ${item.caseId}`);
    if (!loads.has(item.generationLoad)) throw new Error(`generationLoad must be none, low, or medium: ${item.caseId}`);
    if (!validScore(item.score)) throw new Error(`score must be 0..10 in 0.5 increments: ${item.caseId}`);
    if (Object.hasOwn(item, 'codebaseScore') || Object.hasOwn(item, 'implementationScore')) throw new Error(`Split scores are forbidden: ${item.caseId}`);
    if ((item.tokens !== null && (!Number.isFinite(item.tokens) || item.tokens < 0)) || !Number.isFinite(item.durationMs) || item.durationMs < 0) throw new Error(`Invalid metrics: ${item.caseId}`);
    if (typeof item.unfinished !== 'boolean') throw new Error(`Invalid unfinished flag: ${item.caseId}`);
    const durationError = validateDurationAssessment(item.durationAssessment, item.durationMs, item.durationAssessment?.referenceTimeoutMs, item.unfinished);
    if (durationError) throw new Error(`${durationError}: ${item.system}/${item.caseId}`);
    const key = `${item.system}\u0000${item.caseId}`;
    if (keys.has(key)) throw new Error(`Duplicate judgment: ${item.system}/${item.caseId}/${item.promptLocale}`);
    keys.add(key);
    const cohort = `${item.caseId}\u0000${item.promptLocale}`;
    const compared = systemsByCaseLocale.get(cohort) || new Set();
    compared.add(item.system);
    systemsByCaseLocale.set(cohort, compared);
    const list = systems.get(item.system) || [];
    list.push(item);
    systems.set(item.system, list);
  }
  const allSystems = new Set(systems.keys());
  for (const [cohort, compared] of systemsByCaseLocale) {
    const missing = [...allSystems].filter((system) => !compared.has(system));
    if (missing.length) throw new Error(`Incomplete comparison cohort ${cohort.replace('\u0000', '/')}: ${missing.join(', ')}`);
  }

  const ranking = [...systems.entries()].map(([system, runs]) => {
    const summary = slice(runs);
    const fullWeight = runs.filter((run) => run.score >= 9 && !run.unfinished).reduce((sum, run) => sum + weights[run.difficulty], 0);
    const totalWeight = runs.reduce((sum, run) => sum + weights[run.difficulty], 0);
    return {
      system,
      ...summary,
      weightedFullSuccessRate: Number((100 * fullWeight / totalWeight).toFixed(2)),
      criticalFailures: runs.filter((run) => run.critical === true).length,
      unfinished: runs.filter((run) => run.unfinished === true).length,
      caseResults: [...runs].sort((a, b) => a.caseId.localeCompare(b.caseId)).map((run) => ({
        caseId: run.caseId,
        score: run.score,
        durationMs: run.durationMs,
        durationAssessment: run.durationAssessment
      })),
      slices: {
        generationLoad: keyedSlices(runs, (run) => [run.generationLoad]),
        capability: keyedSlices(runs, (run) => run.dimensions?.capabilities || []),
        retrievalTool: keyedSlices(runs, (run) => run.dimensions?.retrievalTool ? [run.dimensions.retrievalTool] : []),
        taskType: keyedSlices(runs, (run) => run.taskType ? [run.taskType] : []),
        difficulty: keyedSlices(runs, (run) => [run.difficulty])
      }
    };
  });
  ranking.sort((a, b) => {
    if (a.accuracyScore !== b.accuracyScore) return b.accuracyScore - a.accuracyScore;
    if (Number.isFinite(a.totalTokens) && Number.isFinite(b.totalTokens)) {
      const lower = Math.min(a.totalTokens, b.totalTokens);
      const upper = Math.max(a.totalTokens, b.totalTokens);
      const difference = lower === 0 ? (upper === 0 ? 0 : Infinity) : upper / lower - 1;
      if (difference > 0.0500000001 && a.totalTokens !== b.totalTokens) return a.totalTokens - b.totalTokens;
    }
    if (a.totalDurationMs !== b.totalDurationMs) return a.totalDurationMs - b.totalDurationMs;
    return a.system.localeCompare(b.system);
  });
  const nativeWarning = (input.tokenComparability || 'unspecified') === 'native-model';
  const unavailableWarning = ranking.some((item) => item.totalTokens === null);
  const scoreboard = {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    resultModel: 'single-score-per-system-case',
    scoreScale: { minimum: 0, maximum: 10, increment: 0.5 },
    durationScoringPolicy: {
      basis: 'execution-contract-per-case-timeout',
      withinQuarterAdjustment: 0,
      quarterToHalfAdjustment: -0.5,
      overHalfOrUnfinishedAdjustment: -1
    },
    precedence: ['accuracy-including-duration-adjustment', 'tokens-when-available-and-accuracy-equal-and-token-gap-exceeds-5-percent', 'speed-when-token-evidence-is-unavailable-or-token-gap-at-most-5-percent'],
    tokenComparability: input.tokenComparability || 'unspecified',
    messages: {
      'zh-CN': {
        resultModel: '每个系统与用例只有一个 0–10 分结果；该结果包含基于执行合同单用例时限的耗时调整，generationLoad 仅用于诊断切片。',
        warnings: [...(nativeWarning ? ['不同产品的原生模型 Token 统计可能不可直接比较。'] : []), ...(unavailableWarning ? ['至少一个产品没有可用的 Token 证据；相关总量记为 null，排名不会把缺失值当作零消耗。'] : [])]
      },
      en: {
        resultModel: 'Each system and case has one 0–10 result including a duration adjustment based on the execution-contract per-case timeout; generationLoad is diagnostic metadata only.',
        warnings: [...(nativeWarning ? ['Native-model token accounting may not be directly comparable across products.'] : []), ...(unavailableWarning ? ['At least one product lacks token evidence; affected totals are null and ranking never treats missing values as zero usage.'] : [])]
      }
    },
    ranking: ranking.map((item, index) => ({ rank: index + 1, ...item }))
  };
  const output = `${JSON.stringify(scoreboard, null, 2)}\n`;
  if (args.out) writeFileSync(path.resolve(args.out), output, 'utf8');
  else process.stdout.write(output);
}

try { main(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
