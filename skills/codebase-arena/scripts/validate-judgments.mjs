#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { assertPortableSegment } from './platform-utils.mjs';
import { validateDurationAssessment } from './duration-scoring.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--private-root') args.privateRoot = argv[++i];
    else if (argv[i] === '--intake') args.intake = argv[++i];
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function readJson(file) { return JSON.parse(readFileSync(path.resolve(file), 'utf8')); }
function required(args, key) { if (!args[key]) throw new Error(`--${key === 'privateRoot' ? 'private-root' : key} is required`); return args[key]; }
function isHalf(value) { return typeof value === 'number' && value >= 0 && value <= 10 && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9; }
function localized(value) { return value && typeof value['zh-CN'] === 'string' && typeof value.en === 'string'; }
function statusFor(score) { return score >= 9 ? 'full_success' : score >= 8 ? 'pass' : score >= 6 ? 'partial' : 'fail'; }
function requireFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const field of fields) if (value[field] === undefined || value[field] === null || value[field] === '') throw new Error(`${label} is missing ${field}`);
}
function safeSegment(value, label) {
  return assertPortableSegment(value, label);
}
function sameOrInside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}
const capabilities = new Set(['code_retrieval', 'architecture_conventions', 'behavior_workflows', 'dependency_impact', 'bug_diagnosis']);

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write('Usage: validate-judgments.mjs --input JUDGMENTS.json --private-root SEALED --intake judge-intake.json\n'); return; }
  const input = readJson(required(args, 'input'));
  const privateRoot = realpathSync(path.resolve(required(args, 'privateRoot')));
  const intake = readJson(required(args, 'intake'));
  if (intake.workflow !== 'judge' || intake.confirmation?.status !== 'confirmed' || !intake.confirmation.confirmedBy || !intake.confirmation.confirmedAt) throw new Error('Confirmed judge-intake.json is required');
  if (!Array.isArray(intake.inputs?.sealedPrivatePackages) || !intake.inputs.sealedPrivatePackages.some((item) => existsSync(item) && realpathSync(path.resolve(item)) === privateRoot)) throw new Error('Judge intake sealed packages do not include --private-root');
  requireFields(intake.output, ['layoutVersion', 'evaluationRoot', 'roundId', 'roundRoot', 'reportDirectoryName', 'judgeRunId', 'reportRoot'], 'judge intake output');
  if (intake.output.layoutVersion !== 2 || intake.output.reportDirectoryName !== 'report') throw new Error('Unsupported shared round layout');
  if (intake.output.evaluationRoot !== '.codebase-eval') throw new Error('Judge evaluationRoot must be the fixed repository-root-relative path .codebase-eval');
  if (path.isAbsolute(intake.output.evaluationRoot) || path.isAbsolute(intake.output.roundRoot) || path.isAbsolute(intake.output.reportRoot)) throw new Error('Judge output paths must be relative to the declared workflow working directory');
  safeSegment(intake.output.roundId, 'roundId');
  safeSegment(intake.output.judgeRunId, 'judgeRunId');
  const evaluationRoot = realpathSync(path.resolve(intake.output.evaluationRoot));
  const expectedRoundRoot = path.join(evaluationRoot, intake.output.roundId);
  if (realpathSync(path.resolve(intake.output.roundRoot)) !== expectedRoundRoot) throw new Error('roundRoot does not match the shared round layout');
  const expectedReportRoot = path.join(expectedRoundRoot, 'report', intake.output.judgeRunId);
  if (realpathSync(path.resolve(intake.output.reportRoot)) !== expectedReportRoot) throw new Error('reportRoot does not match the shared output layout');
  if (realpathSync(path.dirname(path.resolve(args.input))) !== expectedReportRoot) throw new Error('judgments.json must be stored directly in the derived Judge report root');
  if (sameOrInside(evaluationRoot, privateRoot) || sameOrInside(privateRoot, evaluationRoot)) throw new Error('The sealed private package and evaluation output root must not contain one another');
  const privateManifest = readJson(path.join(privateRoot, 'manifest.json'));
  if (privateManifest.roundId !== intake.output.roundId) throw new Error('Sealed package roundId differs from Judge round');
  if (!Array.isArray(intake.inputs?.publicPackages) || intake.inputs.publicPackages.length === 0) throw new Error('Judge intake requires discovered publicPackages');
  const publicRootValue = intake.inputs.publicPackages.find((item) => {
    const candidate = existsSync(item) ? realpathSync(path.resolve(item)) : path.resolve(item);
    return candidate === path.join(expectedRoundRoot, 'evalset', privateManifest.track);
  });
  if (!publicRootValue) throw new Error('Judge intake lacks the round public package matching the sealed track');
  const publicRoot = realpathSync(path.resolve(publicRootValue));
  const publicManifest = readJson(path.join(publicRoot, 'manifest.json'));
  const publicContractPath = path.join(publicRoot, 'execution-contract.json');
  const publicContract = readJson(publicContractPath);
  const referenceTimeoutMs = publicContract?.executionPolicy?.perCaseTimeoutMs;
  if (!Number.isFinite(referenceTimeoutMs) || referenceTimeoutMs <= 0) throw new Error('Execution contract lacks a valid per-case timeout for duration scoring');
  const publicContractSha256 = existsSync(publicContractPath) ? createHash('sha256').update(readFileSync(publicContractPath)).digest('hex') : null;
  if (publicManifest.roundId !== intake.output.roundId || publicManifest.evalsetId !== privateManifest.evalsetId || publicManifest.releaseId !== privateManifest.releaseId) throw new Error('Public and sealed package identities differ');
  if (!Array.isArray(intake.inputs?.rawRunRoots) || intake.inputs.rawRunRoots.length === 0) throw new Error('Judge intake requires rawRunRoots');
  const rawMetrics = new Map();
  for (const runRootValue of intake.inputs.rawRunRoots) {
    const runRoot = realpathSync(path.resolve(runRootValue));
    const relative = path.relative(expectedRoundRoot, runRoot);
    const segments = relative.split(path.sep);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || segments.length !== 2) throw new Error(`Raw run root violates the shared output layout: ${runRoot}`);
    const [productId, executionRunId] = segments;
    safeSegment(productId, 'raw run product ID');
    safeSegment(executionRunId, 'raw run ID');
    if (['evalset', 'report'].includes(productId)) throw new Error(`Raw run root cannot be under reserved directory ${productId}`);
    const rawResult = readJson(path.join(runRoot, 'execution-results.json'));
    const executionValidation = rawResult.validation || {};
    if (rawResult.schemaVersion !== 5 || executionValidation.schemaVersion !== 1 || executionValidation.status !== 'passed') throw new Error(`Judge requires a validated Execute v5 run: ${runRoot}`);
    if (executionValidation.rollbackIntegrity !== true || !Number.isInteger(executionValidation.rollbackErrors) || executionValidation.rollbackErrors !== 0) throw new Error(`Raw run lacks clean project-restoration integrity evidence: ${runRoot}`);
    if (executionValidation.cleanupIntegrity !== true || !Number.isInteger(executionValidation.cleanupErrors) || executionValidation.cleanupErrors !== 0) throw new Error(`Raw run lacks clean external-state integrity evidence: ${runRoot}`);
    if (!Array.isArray(rawResult.results) || rawResult.results.length === 0) throw new Error(`Raw run contains no case results: ${runRoot}`);
    for (const result of rawResult.results) {
      const metricKey = `${productId}\u0000${result.caseId}`;
      if (rawMetrics.has(metricKey)) throw new Error(`Duplicate raw duration evidence: ${productId}/${result.caseId}`);
      rawMetrics.set(metricKey, { durationMs: result.durationMs, unfinished: Boolean(result.unfinished) });
      if (!result.integrity || ![true, null].includes(result.integrity.projectRestored) || ![true, null].includes(result.integrity.externalStateClean)) throw new Error(`Raw result has an execution-integrity failure: ${runRoot}/${result.caseId}`);
      if (result.finalStatus !== 'protocol-error' && (!result.finalWorkspace || !existsSync(result.finalWorkspace))) throw new Error(`Raw result lacks its retained completed-state snapshot: ${runRoot}/${result.caseId}`);
      if (result.finalWorkspace) {
        const workspace = realpathSync(path.resolve(result.finalWorkspace));
        if (!sameOrInside(path.join(runRoot, 'workspaces'), workspace)) throw new Error(`Completed-state snapshot escapes the raw run root: ${runRoot}/${result.caseId}`);
      }
    }
    if (rawResult.system?.id !== productId) throw new Error(`Raw run product directory differs from execution result system: ${runRoot}`);
    if (rawResult.evalsetIdentity?.roundId !== intake.output.roundId || rawResult.evalsetIdentity?.evalsetId !== privateManifest.evalsetId || rawResult.evalsetIdentity?.releaseId !== privateManifest.releaseId) throw new Error(`Raw run evalset identity mismatch: ${runRoot}`);
    if (publicContractSha256 && (rawResult.executionContract?.sha256 !== publicContractSha256 || rawResult.executionContract?.releaseId !== publicManifest.releaseId)) throw new Error(`Raw run execution contract evidence mismatch: ${runRoot}`);
    if (!existsSync(rawResult.outputLayout?.evaluationRoot || '') || !existsSync(rawResult.outputLayout?.roundRoot || '') || !existsSync(rawResult.outputLayout?.runRoot || '') || realpathSync(path.resolve(rawResult.outputLayout.evaluationRoot)) !== evaluationRoot || rawResult.outputLayout?.roundId !== intake.output.roundId || realpathSync(path.resolve(rawResult.outputLayout.roundRoot)) !== expectedRoundRoot || realpathSync(path.resolve(rawResult.outputLayout.runRoot)) !== runRoot) throw new Error(`Raw run output layout evidence mismatch: ${runRoot}`);
  }
  const intakeComparability = intake.comparisonPolicy?.tokenComparability;
  if (intakeComparability !== 'derive-from-run-evidence' && intakeComparability !== input.tokenComparability) throw new Error('Judge intake token comparability differs from judgments');
  if (!Array.isArray(input.judgments) || !input.judgments.length) throw new Error('judgments must be non-empty');
  const privateDir = path.join(privateRoot, 'cases', 'private');
  const blueprint = readJson(path.join(privateRoot, 'evaluation-blueprint.json'));
  if (![3, 4].includes(blueprint.schemaVersion)) throw new Error('Judge requires evaluation-blueprint.json schemaVersion 3 or 4');
  const retrievalToolsByCase = new Map((blueprint.caseConcepts || []).map((concept) => [concept.id, concept.retrievalTool]));
  const cases = new Map(readdirSync(privateDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => {
    const value = readJson(path.join(privateDir, entry.name));
    return [value.id, value];
  }));
  const systems = new Set(input.judgments.map((item) => item.system));
  const promptLocales = new Set(input.judgments.map((item) => item.promptLocale));
  if (promptLocales.size !== 1) throw new Error('A comparison must use exactly one promptLocale');
  const seen = new Set();
  for (const judgment of input.judgments) {
    for (const field of ['schemaVersion', 'system', 'caseId', 'promptLocale', 'difficulty', 'taskType', 'generationLoad', 'dimensions', 'score', 'status', 'criteria', 'capsApplied', 'verificationEvidencePath', 'tokens', 'durationMs', 'durationAssessment', 'critical', 'unfinished']) {
      if (judgment[field] === undefined || (judgment[field] === null && field !== 'tokens')) throw new Error(`Judgment is missing ${field}`);
    }
    if (judgment.schemaVersion !== 3) throw new Error(`Judgment schemaVersion must be 3: ${judgment.system}/${judgment.caseId}`);
    const key = `${judgment.system}\u0000${judgment.caseId}`;
    if (seen.has(key)) throw new Error(`Duplicate judgment: ${judgment.system}/${judgment.caseId}`);
    seen.add(key);
    if (Object.hasOwn(judgment, 'codebaseScore') || Object.hasOwn(judgment, 'implementationScore')) throw new Error(`Split score is forbidden: ${judgment.caseId}`);
    if (!isHalf(judgment.score)) throw new Error(`Invalid single score: ${judgment.caseId}`);
    if (judgment.status !== statusFor(judgment.score)) throw new Error(`Status does not match score: ${judgment.caseId}`);
    const privateCase = cases.get(judgment.caseId);
    if (!privateCase) throw new Error(`Unknown private case: ${judgment.caseId}`);
    if (judgment.generationLoad !== privateCase.generationLoad) throw new Error(`generationLoad mismatch: ${judgment.caseId}`);
    if (judgment.difficulty !== privateCase.difficulty.overall) throw new Error(`difficulty mismatch: ${judgment.caseId}`);
    if (!['retrieve_explain', 'impact_analyze', 'diagnose', 'implement', 'refactor', 'test_design', 'verify'].includes(judgment.taskType)) throw new Error(`Invalid taskType: ${judgment.caseId}`);
    if (!['none', 'low', 'medium'].includes(judgment.generationLoad)) throw new Error(`Invalid generationLoad: ${judgment.caseId}`);
    if (!Array.isArray(judgment.dimensions?.capabilities) || judgment.dimensions.capabilities.length === 0 || judgment.dimensions.capabilities.some((item) => !capabilities.has(item))) throw new Error(`Invalid capability dimensions: ${judgment.caseId}`);
    const expectedCapabilities = [privateCase.capabilities.primary, ...(privateCase.capabilities.secondary || [])];
    if (JSON.stringify(judgment.dimensions.capabilities) !== JSON.stringify(expectedCapabilities)) throw new Error(`Capability dimensions mismatch: ${judgment.caseId}`);
    if (judgment.dimensions?.retrievalTool !== retrievalToolsByCase.get(judgment.caseId)) throw new Error(`retrievalTool mismatch: ${judgment.caseId}`);
    if ((judgment.tokens !== null && (!Number.isFinite(judgment.tokens) || judgment.tokens < 0)) || !Number.isFinite(judgment.durationMs) || judgment.durationMs < 0) throw new Error(`Invalid metrics: ${judgment.caseId}`);
    if (typeof judgment.critical !== 'boolean' || typeof judgment.unfinished !== 'boolean') throw new Error(`Invalid result flags: ${judgment.caseId}`);
    const rawMetric = rawMetrics.get(key);
    if (!rawMetric || judgment.durationMs !== rawMetric.durationMs || judgment.unfinished !== rawMetric.unfinished) throw new Error(`Judgment duration/status differs from immutable Execute evidence: ${judgment.system}/${judgment.caseId}`);
    const durationError = validateDurationAssessment(judgment.durationAssessment, judgment.durationMs, referenceTimeoutMs, judgment.unfinished);
    if (durationError) throw new Error(`${durationError}: ${judgment.system}/${judgment.caseId}`);
    const scoringCriteria = new Map((privateCase.scoringCriteria?.criteria || []).map((criterion) => [criterion.id, criterion]));
    if (!Array.isArray(judgment.criteria) || judgment.criteria.length !== scoringCriteria.size) throw new Error(`Criterion count mismatch: ${judgment.caseId}`);
    let total = 0;
    const criterionIds = new Set();
    for (const award of judgment.criteria) {
      const expected = scoringCriteria.get(award.id);
      if (!expected || criterionIds.has(award.id)) throw new Error(`Invalid criterion ${award.id}: ${judgment.caseId}`);
      criterionIds.add(award.id);
      if (!isHalf(award.awarded) || award.awarded > expected.max) throw new Error(`Invalid award ${award.id}: ${judgment.caseId}`);
      if (!localized(award.evidence)) throw new Error(`Criterion evidence must be bilingual: ${judgment.caseId}/${award.id}`);
      total += award.awarded;
    }
    const caps = new Map((privateCase.scoringCriteria?.caps || []).map((cap) => [cap.id, cap]));
    let maximum = 10;
    for (const applied of judgment.capsApplied || []) {
      const expected = caps.get(applied.id);
      if (!expected || applied.max !== expected.max) throw new Error(`Invalid cap ${applied.id}: ${judgment.caseId}`);
      maximum = Math.min(maximum, expected.max);
    }
    const contentScoreAfterCaps = Math.min(total, maximum);
    const durationAdjustedScore = Math.max(0, contentScoreAfterCaps + judgment.durationAssessment.scoreAdjustment);
    if (judgment.score !== durationAdjustedScore) throw new Error(`score does not match criteria, caps, and duration adjustment: ${judgment.caseId}`);
    if (!judgment.verificationEvidencePath || path.isAbsolute(judgment.verificationEvidencePath) || judgment.verificationEvidencePath.split(/[\\/]/).includes('..')) throw new Error(`Invalid verificationEvidencePath: ${judgment.caseId}`);
    const verificationEvidence = path.resolve(path.dirname(path.resolve(args.input)), judgment.verificationEvidencePath);
    if (!existsSync(verificationEvidence)) throw new Error(`Missing result-verification evidence: ${verificationEvidence}`);
  }
  for (const system of systems) for (const caseId of cases.keys()) if (!seen.has(`${system}\u0000${caseId}`)) throw new Error(`Missing judgment: ${system}/${caseId}`);
  process.stdout.write(`Judgment validation passed: ${input.judgments.length} single-score results.\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
