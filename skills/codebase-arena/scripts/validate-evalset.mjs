#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isPortableSegment } from './platform-utils.mjs';
import {
  readOnlyTaskTypeTargets,
  validateReadOnlyBlueprintPolicy,
  validateReadOnlyPrivateCase,
  validateReadOnlyPublicCase
} from './generation-policy.mjs';

const locales = ['zh-CN', 'en'];
const loads = new Set(['none', 'low', 'medium']);
const retrievalTools = new Set(['grep-glob-read', 'codebase-index', 'hybrid']);
const expectedToolCalls = new Set(['grep', 'glob', 'read', 'codebase-index', 'symbol-search', 'reference-search']);
const lexicalToolCalls = new Set(['grep', 'glob', 'read']);
const indexToolCalls = new Set(['codebase-index', 'symbol-search', 'reference-search']);
const capabilities = new Set([
  'code_retrieval', 'architecture_conventions', 'behavior_workflows', 'dependency_impact',
  'bug_diagnosis'
]);
const privateKeys = new Set([
  'generationLoad', 'expectedBehavior', 'evidence', 'solution', 'hiddenTests', 'scoringCriteria',
  'provenance', 'requiredImpact', 'verification', 'referencePatch', 'judgePackage', 'retrievalTool', 'expectedToolCalls', 'assessmentRationale', 'retrievalDesign', 'retrievalTopology'
]);
const errors = [];
const warnings = [];
const discouragedChineseTerms = new Map([
  ['生成 Intake 摘要', '生成阶段确认事项'],
  ['Intake', '范围确认、启动确认或输入确认'],
  ['停止门', '人工确认节点或审批节点'],
  ['代码仓画像', '项目分析报告'],
  ['代码仓', '代码库或项目'],
  ['赛道', '评测类型'],
  ['候选工具', '被测产品'],
  ['候选系统', '被测产品'],
  ['Judge', '独立评分方或评分阶段'],
  ['结果核验', '结果检查'],
  ['脏数据', '临时数据、残留数据或未清理状态'],
  ['不变量', '必须始终满足的业务规则'],
  ['生成负载', '需要编写代码的工作量'],
  ['护栏', '比例限制或约束条件']
]);

function parseArgs(argv) {
  const args = { root: null, privateRoot: null, stage: 'release', publicOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--root') args.root = argv[++i];
    else if (flag === '--private-root') args.privateRoot = argv[++i];
    else if (flag === '--stage') args.stage = argv[++i];
    else if (flag === '--public-only') args.publicOnly = true;
    else if (flag === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }
function checkChineseProse(value, label) {
  if (typeof value !== 'string') return;
  for (const [term, preferred] of discouragedChineseTerms) if (value.includes(term)) fail(`${label} uses literal benchmark term ${JSON.stringify(term)}; prefer ${preferred}`);
}
function markdownChineseProse(value) {
  let inFence = false;
  return value.split(/\r?\n/).map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; return ''; }
    if (inFence) return '';
    return line.replace(/`[^`]*`/g, '').replace(/\]\([^)]+\)/g, ']');
  }).join('\n');
}
function readJson(file, required = true) {
  if (!existsSync(file)) {
    if (required) fail(`Missing file: ${file}`);
    return null;
  }
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { fail(`Invalid JSON ${file}: ${error.message}`); return null; }
}
function requireFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(`${label} must be an object`); return; }
  for (const field of fields) if (value[field] === undefined || value[field] === null || value[field] === '') fail(`${label} missing ${field}`);
}
function requireLocales(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || locales.some((locale) => !value.includes(locale))) fail(`${label} must contain exactly zh-CN and en`);
}
function localizedText(value, label, allowEmpty = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(`${label} must be localized`); return; }
  for (const locale of locales) {
    if (typeof value[locale] !== 'string' || (!allowEmpty && value[locale].trim() === '')) fail(`${label}.${locale} must be ${allowEmpty ? 'a string' : 'non-empty'}`);
    else if (locale === 'zh-CN') checkChineseProse(value[locale], `${label}.zh-CN`);
  }
}
function localizedList(value, label, allowEmpty = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(`${label} must be a localized list`); return; }
  for (const locale of locales) {
    if (!Array.isArray(value[locale]) || (!allowEmpty && value[locale].length === 0)) fail(`${label}.${locale} must be ${allowEmpty ? 'an array' : 'non-empty'}`);
    else if (locale === 'zh-CN') value[locale].forEach((item, index) => checkChineseProse(item, `${label}.zh-CN[${index}]`));
  }
  if (Array.isArray(value?.['zh-CN']) && Array.isArray(value?.en) && value['zh-CN'].length !== value.en.length) fail(`${label} locale lengths differ`);
}
function markdownBlockSignature(text) {
  const signature = [];
  let prose = false;
  let inFence = false;
  const flushProse = () => { if (prose) signature.push('P'); prose = false; };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^```|^~~~/.test(trimmed)) {
      flushProse();
      if (!inFence) signature.push('C');
      inFence = !inFence;
    } else if (inFence) continue;
    else if (!trimmed) flushProse();
    else if (/^#{1,6}\s+/.test(trimmed)) {
      flushProse();
      signature.push(`H${trimmed.match(/^#+/)[0].length}`);
    } else if (/^(?:[-*+] |\d+\. )/.test(trimmed)) {
      flushProse();
      signature.push('L');
    } else if (/^\|.*\|$/.test(trimmed)) {
      flushProse();
      signature.push('T');
    } else prose = true;
  }
  flushProse();
  if (inFence) signature.push('UNTERMINATED-CODE-FENCE');
  return signature;
}
function pairedMarkdown(root, name, required = true) {
  const contents = [];
  for (const locale of locales) {
    const file = path.join(root, `${name}.${locale}.md`);
    if (!existsSync(file)) { if (required) fail(`Missing bilingual artifact: ${file}`); continue; }
    const value = readFileSync(file, 'utf8');
    if (!value.trim()) fail(`Empty bilingual artifact: ${file}`);
    if (locale === 'zh-CN') checkChineseProse(markdownChineseProse(value), `${name}.zh-CN.md`);
    contents.push(value);
  }
  if (contents.length === 2) {
    const levels = (text) => text.split(/\r?\n/).map((line) => line.match(/^(#{1,6})\s+/)?.[1].length).filter(Boolean);
    if (JSON.stringify(levels(contents[0])) !== JSON.stringify(levels(contents[1]))) fail(`${name} bilingual heading structures differ`);
    if (JSON.stringify(markdownBlockSignature(contents[0])) !== JSON.stringify(markdownBlockSignature(contents[1]))) fail(`${name} bilingual titles, paragraphs, lists, tables, or code-block structures differ`);
  }
}
function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => path.join(directory, entry.name)).sort();
}
function allKeys(value, result = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, result));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { result.add(key); allKeys(child, result); }
  return result;
}
function isHalf(value) { return typeof value === 'number' && value >= 0 && value <= 10 && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9; }
function safeRelative(value) { return typeof value === 'string' && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'); }
function digestIds(ids) { return createHash('sha256').update([...ids].sort().join('\n')).digest('hex'); }
function safeSegment(value) { return isPortableSegment(value); }
function sameOrInside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function validateManifest(value, label) {
  requireFields(value, ['schemaVersion', 'roundId', 'evalsetId', 'releaseId', 'repository', 'baseRevision', 'track', 'locales', 'releaseStatus', 'caseIds', 'caseIdDigest'], label);
  if (!safeSegment(value?.roundId)) fail(`${label}.roundId is invalid`);
  requireLocales(value?.locales, `${label}.locales`);
  if (!['native-repository', 'code-only'].includes(value?.track)) fail(`${label}.track is invalid`);
  if (!Array.isArray(value?.caseIds) || value.caseIds.some((id) => typeof id !== 'string' || !id)) fail(`${label}.caseIds must be non-empty strings`);
  if (Array.isArray(value?.caseIds) && value.caseIdDigest !== digestIds(value.caseIds)) fail(`${label}.caseIdDigest does not match caseIds`);
  if (!['draft', 'approved'].includes(value?.releaseStatus)) fail(`${label}.releaseStatus must be draft or approved`);
}

function validateExecutionContract(value, manifest, label) {
  requireFields(value, ['schemaVersion', 'kind', 'identity', 'executionPolicy', 'evidenceRequirements', 'environmentPolicy', 'serviceReadiness', 'cleanupPolicy'], label);
  if (value?.schemaVersion !== 3 || value?.kind !== 'codebase-eval-execution-contract') fail(`${label} has an unsupported identity`);
  requireFields(value?.identity, ['roundId', 'releaseId', 'track', 'repository', 'baseRevision', 'caseIdDigest'], `${label}.identity`);
  for (const field of ['roundId', 'releaseId', 'track', 'repository', 'baseRevision', 'caseIdDigest']) if (value?.identity?.[field] !== manifest?.[field]) fail(`${label}.identity.${field} differs from manifest`);
  if (typeof value?.identity?.repository !== 'string' || !value.identity.repository || path.isAbsolute(value.identity.repository)) fail(`${label}.identity.repository must be relative`);
  const policy = value?.executionPolicy;
  requireFields(policy, ['caseSelection', 'maximumAttempts', 'childConcurrency', 'caseConcurrency', 'caseCoordinatorPerCase', 'freshCaseCoordinatorPerCase', 'workerConcurrencyPerCase', 'workerSpawnOwner', 'perCaseTimeoutMs', 'promptLocaleSource', 'freshChildPerAttempt', 'noInheritedContext', 'directProjectExecution', 'serialExecution', 'initialProjectSnapshot', 'baselineSnapshotScope', 'gitIgnoredContent', 'gitMetadataHandling', 'protocolDirectoryCleanup', 'snapshotAfterAttempt', 'rollbackToBaselineAfterAttempt', 'projectRestoration', 'initialSnapshotOwner', 'completedSnapshotAndRollbackOwner', 'dependencyMutationDuringRun', 'dirtyDataCleanupPerAttempt', 'stopRunOnCleanupError', 'stopRunOnChildIsolationViolation'], `${label}.executionPolicy`);
  if (policy?.caseSelection !== 'all-released-cases' || policy?.maximumAttempts !== 2 || policy?.childConcurrency !== 2 || policy?.caseConcurrency !== 1 || policy?.caseCoordinatorPerCase !== true || policy?.freshCaseCoordinatorPerCase !== true || policy?.workerConcurrencyPerCase !== 1 || policy?.workerSpawnOwner !== 'case-coordinator' || policy?.perCaseTimeoutMs !== 3600000 || policy?.promptLocaleSource !== 'fixed-en' || policy?.freshChildPerAttempt !== true || policy?.noInheritedContext !== true || policy?.directProjectExecution !== true || policy?.serialExecution !== true || policy?.initialProjectSnapshot !== 'required-before-first-attempt' || policy?.baselineSnapshotScope !== 'git-tracked-and-nonignored-untracked' || policy?.gitIgnoredContent !== 'excluded-from-snapshot-managed-by-cleanup-controls' || policy?.gitMetadataHandling !== 'private-snapshot-semantic-verification' || policy?.protocolDirectoryCleanup !== 'required-before-next-attempt' || policy?.snapshotAfterAttempt !== true || policy?.rollbackToBaselineAfterAttempt !== true || policy?.projectRestoration !== 'case-coordinator-deterministic-from-snapshot' || policy?.initialSnapshotOwner !== 'main-coordinator' || policy?.completedSnapshotAndRollbackOwner !== 'case-coordinator' || policy?.dependencyMutationDuringRun !== 'forbidden' || policy?.dirtyDataCleanupPerAttempt !== true || policy?.stopRunOnCleanupError !== true || policy?.stopRunOnChildIsolationViolation !== true) fail(`${label}.executionPolicy violates fixed benchmark policy`);
  requireFields(value?.evidenceRequirements, ['finalResponseFormat', 'activityLogRequired', 'commandAndTestLogsRequiredWhenExecuted', 'collectInspectedAndCitedLocationsWhenObservable', 'retrievalSummaryRequired', 'maximumRetrievalKeyActions', 'retainFullRetrievalTrace', 'collectChainOfThought'], `${label}.evidenceRequirements`);
  if (value?.evidenceRequirements?.finalResponseFormat !== 'markdown' || value?.evidenceRequirements?.activityLogRequired !== true || value?.evidenceRequirements?.retrievalSummaryRequired !== true || value?.evidenceRequirements?.maximumRetrievalKeyActions !== 8 || value?.evidenceRequirements?.retainFullRetrievalTrace !== false || value?.evidenceRequirements?.collectChainOfThought !== false) fail(`${label}.evidenceRequirements is invalid`);
  requireFields(value?.environmentPolicy, ['installationPolicy', 'dependencyMutationsDuringRun', 'credentialRequirementIds'], `${label}.environmentPolicy`);
  if (value?.environmentPolicy?.installationPolicy !== 'ask-before-install-before-cases' || value?.environmentPolicy?.dependencyMutationsDuringRun !== 'forbidden' || !Array.isArray(value?.environmentPolicy?.credentialRequirementIds)) fail(`${label}.environmentPolicy is invalid`);
  if (!Array.isArray(value?.serviceReadiness)) fail(`${label}.serviceReadiness must be an array`);
  requireFields(value?.cleanupPolicy, ['status', 'processTreeTermination', 'outsideSnapshotWrites', 'controls'], `${label}.cleanupPolicy`);
  if (value?.cleanupPolicy?.status !== 'verified-before-release' || value?.cleanupPolicy?.processTreeTermination !== 'required' || value?.cleanupPolicy?.outsideSnapshotWrites !== 'forbidden-unless-declared' || !Array.isArray(value?.cleanupPolicy?.controls)) fail(`${label}.cleanupPolicy is invalid`);
  const forbidden = [...allKeys(value)].filter((key) => privateKeys.has(key) || ['system', 'promptLocale', 'executionRunId', 'runRoot', 'tokenEvidence', 'activityTrace'].includes(key));
  if (forbidden.length) fail(`${label} contains product-specific or private keys: ${[...new Set(forbidden)].sort().join(', ')}`);
}

function validatePublic(value, file) {
  requireFields(value, ['schemaVersion', 'id', 'locales', 'title', 'prompt', 'baseRevision', 'track', 'taskType', 'deliverables', 'allowedOperations', 'forbiddenOperations', 'environment'], file);
  requireLocales(value?.locales, `${file}.locales`);
  localizedText(value?.title, `${file}.title`);
  localizedText(value?.prompt, `${file}.prompt`);
  const promptText = JSON.stringify({ title: value?.title, prompt: value?.prompt, deliverables: value?.deliverables, allowedOperations: value?.allowedOperations, forbiddenOperations: value?.forbiddenOperations });
  const prescribedRetrievalTool = /(?:\b(?:use|using|via|with|required to use|must use)\s+(?:grep|ripgrep|rg|glob|semantic search|code index|symbol index|reference search)\b|(?:使用|通过|必须用|请用).{0,10}(?:grep|ripgrep|rg|glob|语义检索|代码索引|符号索引|引用检索))/i;
  if (prescribedRetrievalTool.test(promptText)) fail(`${file}.prompt prescribes a retrieval tool; public tasks must be tool-neutral`);
  localizedList(value?.deliverables, `${file}.deliverables`, false);
  localizedList(value?.allowedOperations, `${file}.allowedOperations`);
  localizedList(value?.forbiddenOperations, `${file}.forbiddenOperations`);
  requireFields(value?.environment, ['services', 'requirementIds', 'notes', 'sideEffects'], `${file}.environment`);
  localizedText(value?.environment?.notes, `${file}.environment.notes`, true);
  requireFields(value?.environment?.sideEffects, ['mode', 'resourceIds', 'outsideSnapshotWrites', 'cleanupControlIds'], `${file}.environment.sideEffects`);
  if (!['snapshot-only', 'isolated-external'].includes(value?.environment?.sideEffects?.mode)) fail(`${file}.environment.sideEffects.mode is invalid`);
  for (const field of ['resourceIds', 'outsideSnapshotWrites', 'cleanupControlIds']) if (!Array.isArray(value?.environment?.sideEffects?.[field]) || value.environment.sideEffects[field].some((item) => typeof item !== 'string')) fail(`${file}.environment.sideEffects.${field} must be a string array`);
  if (value?.environment?.sideEffects?.mode === 'isolated-external' && (!Array.isArray(value.environment.sideEffects.cleanupControlIds) || value.environment.sideEffects.cleanupControlIds.length === 0)) fail(`${file}.environment.sideEffects requires cleanup controls for isolated external side effects`);
  if (!['native-repository', 'code-only'].includes(value?.track)) fail(`${file}.track is invalid`);
  for (const key of allKeys(value)) if (privateKeys.has(key)) fail(`${file} leaks private key: ${key}`);
}

function validatePrivate(value, file, privateRoot) {
  requireFields(value, ['schemaVersion', 'id', 'locales', 'generationLoad', 'capabilities', 'difficulty', 'evidence', 'expectedBehavior', 'edgeCases', 'requiredImpact', 'verification', 'scoringCriteria', 'provenance', 'estimatedCost'], file);
  requireLocales(value?.locales, `${file}.locales`);
  if (value?.schemaVersion !== 2) fail(`${file}.schemaVersion must be 2`);
  if (!loads.has(value?.generationLoad)) fail(`${file}.generationLoad must be none, low, or medium`);
  if (!capabilities.has(value?.capabilities?.primary)) fail(`${file} has invalid primary capability`);
  if (!Array.isArray(value?.capabilities?.secondary) || value.capabilities.secondary.some((item) => !capabilities.has(item) || item === value.capabilities.primary) || new Set(value.capabilities.secondary).size !== value.capabilities.secondary.length) fail(`${file} has invalid secondary capabilities`);
  if (!['L1', 'L2', 'L3', 'L4'].includes(value?.difficulty?.overall)) fail(`${file} has invalid overall difficulty`);
  localizedList(value?.expectedBehavior, `${file}.expectedBehavior`, false);
  localizedList(value?.edgeCases, `${file}.edgeCases`);
  localizedList(value?.requiredImpact, `${file}.requiredImpact`);
  for (const [index, evidence] of (value?.evidence || []).entries()) {
    requireFields(evidence, ['source', 'claim', 'confidence'], `${file}.evidence[${index}]`);
    localizedText(evidence?.claim, `${file}.evidence[${index}].claim`);
  }
  const verification = value?.verification;
  requireFields(verification, ['type', 'cwd', 'timeoutMs', 'command', 'setupCommands', 'cleanupCommands', 'injectFiles', 'envAllowlist', 'steps', 'cleanup'], `${file}.verification`);
  if (!['hidden-test', 'human-review'].includes(verification?.type)) fail(`${file}.verification.type is invalid`);
  if (!safeRelative(verification?.cwd)) fail(`${file}.verification.cwd must remain in the workspace`);
  for (const [index, injection] of (verification?.injectFiles || []).entries()) {
    requireFields(injection, ['source', 'target'], `${file}.verification.injectFiles[${index}]`);
    if (!safeRelative(injection?.source) || !safeRelative(injection?.target)) fail(`${file}.verification.injectFiles[${index}] escapes a root`);
    if (safeRelative(injection?.source) && !existsSync(path.join(privateRoot, injection.source))) fail(`${file}.verification injection source is missing: ${injection.source}`);
  }
  for (const [label, command, empty] of [['command', verification?.command, verification?.type === 'human-review'], ...((verification?.setupCommands || []).map((item, i) => [`setupCommands[${i}]`, item, false])), ...((verification?.cleanupCommands || []).map((item, i) => [`cleanupCommands[${i}]`, item, false]))]) {
    if (!Array.isArray(command) || (!empty && command.length === 0) || command.some((part) => typeof part !== 'string' || !part)) fail(`${file}.verification.${label} must be an argument array`);
  }
  localizedList(verification?.steps, `${file}.verification.steps`);
  localizedList(verification?.cleanup, `${file}.verification.cleanup`);
  const criteria = value?.scoringCriteria?.criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) fail(`${file}.scoringCriteria.criteria must be non-empty`);
  let maximum = 0;
  for (const criterion of criteria || []) {
    requireFields(criterion, ['id', 'description', 'max'], `${file}.scoringCriteria criterion`);
    localizedText(criterion?.description, `${file}.scoringCriteria.${criterion?.id}.description`);
    if (!isHalf(criterion?.max)) fail(`${file}.scoringCriteria.${criterion?.id}.max must use 0.5 increments`);
    maximum += Number(criterion?.max || 0);
  }
  if (Math.abs(maximum - 10) > 1e-9) fail(`${file}.scoringCriteria maximums total ${maximum}, expected 10`);
  for (const cap of value?.scoringCriteria?.caps || []) if (!isHalf(cap?.max)) fail(`${file}.scoringCriteria score limit must use 0.5 increments`);
}

function approved(approvals, key) {
  const item = approvals?.[key];
  if (item) localizedText(item.notes, `approvals.${key}.notes`, true);
  return item?.status === 'approved' && Boolean(item.approvedBy) && Boolean(item.approvedAt);
}

function validateBlueprint(blueprint, privateCases) {
  requireFields(blueprint, ['schemaVersion', 'locales', 'plannedTotal', 'coverage', 'taskTypeTargets', 'generationLoadTargets', 'automaticEvaluationTarget', 'notes'], 'evaluation-blueprint.json');
  requireLocales(blueprint?.locales, 'evaluation-blueprint.json.locales');
  if (![3, 4].includes(blueprint?.schemaVersion)) fail('evaluation-blueprint.json schemaVersion must be 3 (legacy released package) or 4 (read-only code-understanding authoring)');
  if (blueprint?.schemaVersion === 4) {
    requireFields(blueprint, ['authoringPolicy', 'generationLoadPolicy', 'retrievalToolTargets', 'retrievalToolPolicy'], 'evaluation-blueprint.json');
    for (const error of validateReadOnlyBlueprintPolicy(blueprint)) fail(`evaluation-blueprint.json ${error}`);
  }
  localizedList(blueprint?.notes, 'evaluation-blueprint.json.notes');
  if (blueprint?.plannedTotal !== 15) fail('evaluation-blueprint.json plannedTotal must equal 15');
  const coverage = Array.isArray(blueprint?.coverage) ? blueprint.coverage : [];
  const capabilityCoverage = new Map(coverage.map((item) => [item?.key, item]));
  if (coverage.length !== capabilities.size || coverage.some((item) => item?.dimension !== 'capability' || !capabilities.has(item?.key) || item?.minCount !== 3) || capabilityCoverage.size !== capabilities.size) fail('coverage must contain exactly the five capabilities with minCount 3');
  const taskTypeTotal = Object.values(blueprint?.taskTypeTargets || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (taskTypeTotal !== 15) fail(`taskTypeTargets total ${taskTypeTotal}, expected 15`);
  if (!Number.isInteger(blueprint?.automaticEvaluationTarget) || blueprint.automaticEvaluationTarget < 0 || blueprint.automaticEvaluationTarget > 15) fail('automaticEvaluationTarget must be an integer from 0 to 15');
  const targets = blueprint?.generationLoadTargets || {};
  const keys = Object.keys(targets).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['low', 'medium', 'none'])) fail('generationLoadTargets must contain exactly none, low, and medium');
  const total = Object.values(targets).reduce((sum, value) => sum + Number(value || 0), 0);
  if (total !== blueprint?.plannedTotal) fail(`generationLoadTargets total ${total}, expected ${blueprint?.plannedTotal}`);
  if (blueprint?.plannedTotal > 0) {
    if (targets.none / blueprint.plannedTotal < 0.4) fail('generationLoadTargets requires at least 40% none');
    if ((targets.none + targets.low) / blueprint.plannedTotal < 0.7) fail('generationLoadTargets requires at least 70% none + low');
    if (targets.medium / blueprint.plannedTotal > 0.3) fail('generationLoadTargets allows at most 30% medium');
  }
  requireFields(blueprint, ['retrievalToolTargets', 'retrievalToolPolicy', 'caseConcepts'], 'evaluation-blueprint.json schema v3');
  const retrievalTargets = blueprint?.retrievalToolTargets || {};
  const retrievalKeys = Object.keys(retrievalTargets).sort();
  if (JSON.stringify(retrievalKeys) !== JSON.stringify(['codebase-index', 'grep-glob-read', 'hybrid']) || [...retrievalTools].some((key) => retrievalTargets[key] !== 5)) fail('retrievalToolTargets must contain exactly five grep-glob-read, five codebase-index, and five hybrid cases');
  const policy = blueprint?.retrievalToolPolicy || {};
  requireFields(policy, ['requiredPerRetrievalTool', 'allowedExpectedToolCalls', 'publicProjectionIncludesRetrievalMetadata', 'scoreDependsOnToolChoice'], 'retrievalToolPolicy');
  if (policy.requiredPerRetrievalTool !== 5 || JSON.stringify(policy.allowedExpectedToolCalls) !== JSON.stringify([...expectedToolCalls]) || policy.publicProjectionIncludesRetrievalMetadata !== false || policy.scoreDependsOnToolChoice !== false) fail('retrievalToolPolicy differs from the fixed retrieval strategy');
  if (!Array.isArray(blueprint?.caseConcepts) || blueprint.caseConcepts.length !== 15) fail('schema v3 caseConcepts must contain exactly 15 cases');
  const conceptIds = new Set();
  const retrievalCounts = { 'grep-glob-read': 0, 'codebase-index': 0, hybrid: 0 };
  const capabilityCounts = Object.fromEntries([...capabilities].map((key) => [key, 0]));
  const capabilityRetrievalCounts = Object.fromEntries([...capabilities].map((capability) => [capability, Object.fromEntries([...retrievalTools].map((retrievalTool) => [retrievalTool, 0]))]));
  const loadCounts = { none: 0, low: 0, medium: 0 };
  for (const [index, concept] of (blueprint?.caseConcepts || []).entries()) {
    const label = `evaluation-blueprint.json.caseConcepts[${index}]`;
    requireFields(concept, ['id', 'capabilities', 'generationLoad', 'retrievalTool', 'expectedToolCalls', 'assessmentRationale'], label);
    if (conceptIds.has(concept.id)) fail(`Duplicate blueprint case concept: ${concept.id}`);
    conceptIds.add(concept.id);
    if (!capabilities.has(concept?.capabilities?.primary)) fail(`${label}.capabilities.primary is invalid`);
    if (!Array.isArray(concept?.capabilities?.secondary) || concept.capabilities.secondary.some((item) => !capabilities.has(item) || item === concept.capabilities.primary) || new Set(concept.capabilities.secondary).size !== concept.capabilities.secondary.length) fail(`${label}.capabilities.secondary is invalid`);
    if (capabilities.has(concept?.capabilities?.primary)) capabilityCounts[concept.capabilities.primary] += 1;
    if (!loads.has(concept?.generationLoad)) fail(`${label}.generationLoad is invalid`);
    else loadCounts[concept.generationLoad] += 1;
    if (!retrievalTools.has(concept.retrievalTool)) fail(`${label}.retrievalTool is invalid`);
    else retrievalCounts[concept.retrievalTool] += 1;
    if (capabilities.has(concept?.capabilities?.primary) && retrievalTools.has(concept?.retrievalTool)) capabilityRetrievalCounts[concept.capabilities.primary][concept.retrievalTool] += 1;
    if (!Array.isArray(concept.expectedToolCalls) || concept.expectedToolCalls.length === 0 || concept.expectedToolCalls.some((item) => !expectedToolCalls.has(item)) || new Set(concept.expectedToolCalls).size !== concept.expectedToolCalls.length) fail(`${label}.expectedToolCalls is invalid`);
    const hasLexical = concept.expectedToolCalls?.some((item) => lexicalToolCalls.has(item));
    const hasIndex = concept.expectedToolCalls?.some((item) => indexToolCalls.has(item));
    if (concept.retrievalTool === 'grep-glob-read' && !hasLexical) fail(`${label} requires a lexical expected tool call`);
    if (concept.retrievalTool === 'codebase-index' && !hasIndex) fail(`${label} requires an index expected tool call`);
    if (concept.retrievalTool === 'hybrid' && (!hasLexical || !hasIndex)) fail(`${label} requires lexical and index expected tool calls`);
    localizedText(concept?.assessmentRationale, `${label}.assessmentRationale`);
  }
  for (const capability of capabilities) if (capabilityCounts[capability] !== 3) fail(`Blueprint primary capability ${capability} count ${capabilityCounts[capability]}, expected 3`);
  for (const retrievalTool of retrievalTools) if (retrievalCounts[retrievalTool] !== 5) fail(`Blueprint ${retrievalTool} count ${retrievalCounts[retrievalTool]}, expected 5`);
  for (const capability of capabilities) for (const retrievalTool of retrievalTools) if (capabilityRetrievalCounts[capability][retrievalTool] !== 1) fail(`Blueprint matrix cell ${capability} × ${retrievalTool} count ${capabilityRetrievalCounts[capability][retrievalTool]}, expected 1`);
  for (const load of loads) if (loadCounts[load] !== targets[load]) fail(`Blueprint ${load} count ${loadCounts[load]}, expected ${targets[load]}`);
  if (privateCases.length) {
    const concepts = new Map((blueprint.caseConcepts || []).map((concept) => [concept.id, concept]));
    const privateIds = new Set(privateCases.map((item) => item.id));
    for (const id of conceptIds) if (!privateIds.has(id)) fail(`Blueprint case concept has no sealed scoring record: ${id}`);
    for (const id of privateIds) if (!conceptIds.has(id)) fail(`Sealed scoring record has no blueprint case concept: ${id}`);
    for (const item of privateCases) {
      const concept = concepts.get(item.id);
      if (concept && item.generationLoad !== concept.generationLoad) fail(`Blueprint/scoring-record generationLoad mismatch: ${item.id}`);
      if (concept && JSON.stringify(item.capabilities) !== JSON.stringify(concept.capabilities)) fail(`Blueprint/scoring-record capabilities mismatch: ${item.id}`);
    }
  }
}

function validateReadOnlyCaseSet(blueprint, publicCases, privateCases = []) {
  if (blueprint?.schemaVersion !== 4) return;
  const taskCounts = Object.fromEntries(Object.keys(readOnlyTaskTypeTargets).map((key) => [key, 0]));
  for (const item of publicCases) {
    const publicCase = item.value;
    for (const error of validateReadOnlyPublicCase(publicCase)) fail(`${item.file} ${error}`);
    if (Object.hasOwn(taskCounts, publicCase.taskType)) taskCounts[publicCase.taskType] += 1;
  }
  for (const [taskType, expected] of Object.entries(readOnlyTaskTypeTargets)) if (taskCounts[taskType] !== expected) fail(`Public ${taskType} count ${taskCounts[taskType]}, expected ${expected}`);
  for (const item of privateCases) for (const error of validateReadOnlyPrivateCase(item.value)) fail(`${item.file} ${error}`);
}

function validateH2PromptReview(privateRoot, blueprint, publicCases) {
  const concepts = new Map((blueprint?.caseConcepts || []).map((concept) => [concept.id, concept]));
  const publicIds = new Set(publicCases.map((item) => item.value.id));
  if (publicCases.length !== 15 || concepts.size !== 15) fail('H2 requires exactly 15 complete public prompts and blueprint concepts');
  for (const id of concepts.keys()) if (!publicIds.has(id)) fail(`H2 blueprint concept has no public prompt: ${id}`);
  for (const id of publicIds) if (!concepts.has(id)) fail(`H2 public prompt has no blueprint concept: ${id}`);
  for (const locale of locales) {
    const file = path.join(privateRoot, `blueprint-review.${locale}.md`);
    if (!existsSync(file)) continue;
    const review = readFileSync(file, 'utf8');
    for (const item of publicCases) {
      const publicCase = item.value;
      const concept = concepts.get(publicCase.id);
      if (!review.includes(publicCase.id)) fail(`${file} omits case ID ${publicCase.id}`);
      if (typeof publicCase.prompt?.[locale] !== 'string' || !review.includes(publicCase.prompt[locale])) fail(`${file} omits the full ${locale} prompt for ${publicCase.id}`);
      if (concept && !review.includes(concept.capabilities.primary)) fail(`${file} omits the primary capability for ${publicCase.id}`);
      for (const capability of concept?.capabilities?.secondary || []) if (!review.includes(capability)) fail(`${file} omits secondary capability ${capability} for ${publicCase.id}`);
      if (concept && !review.includes(concept.retrievalTool)) fail(`${file} omits retrievalTool for ${publicCase.id}`);
      for (const toolCall of concept?.expectedToolCalls || []) if (!review.includes(toolCall)) fail(`${file} omits expected tool call ${toolCall} for ${publicCase.id}`);
      if (typeof concept?.assessmentRationale?.[locale] !== 'string' || !review.includes(concept.assessmentRationale[locale])) fail(`${file} omits the ${locale} assessment rationale for ${publicCase.id}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: validate-evalset.mjs --root PUBLIC [--private-root SEALED] [--public-only] [--stage profile|blueprint|candidate|release]\n');
    return;
  }
  if (!args.root) throw new Error('--root is required');
  if (!['profile', 'blueprint', 'candidate', 'release'].includes(args.stage)) throw new Error(`Invalid stage: ${args.stage}`);
  const stage = ['profile', 'blueprint', 'candidate', 'release'].indexOf(args.stage);
  const root = realpathSync(path.resolve(args.root));
  const privateRoot = args.privateRoot ? realpathSync(path.resolve(args.privateRoot)) : null;
  if (!args.publicOnly && !privateRoot) fail('--private-root is required for full authoring/release validation');

  const manifest = readJson(path.join(root, 'manifest.json'));
  validateManifest(manifest, 'public manifest');
  const executionContractPath = path.join(root, 'execution-contract.json');
  const executionContract = existsSync(executionContractPath) ? readJson(executionContractPath) : null;
  if (executionContract) validateExecutionContract(executionContract, manifest, 'execution-contract.json');
  else if (stage >= 2) fail('Candidate and released packages require execution-contract.json');
  if (path.basename(root) !== manifest?.track || path.basename(path.dirname(root)) !== 'evalset' || path.basename(path.dirname(path.dirname(root))) !== manifest?.roundId) fail('Public package must use .codebase-eval/<round-id>/evalset/<track>');
  const manifestRepository = typeof manifest?.repository === 'string' && existsSync(manifest.repository) ? realpathSync(path.resolve(manifest.repository)) : null;
  if (manifestRepository && (root === manifestRepository || !sameOrInside(manifestRepository, root))) fail('Public package must remain under the evaluated repository');
  const caseIndex = readJson(path.join(root, 'case-index.json'));
  requireFields(caseIndex, ['schemaVersion', 'caseIds'], 'case-index.json');
  if (caseIndex && JSON.stringify(Object.keys(caseIndex).sort()) !== JSON.stringify(['caseIds', 'schemaVersion'])) fail('case-index.json may contain only schemaVersion and caseIds');
  if (!Array.isArray(caseIndex?.caseIds) || JSON.stringify([...caseIndex.caseIds].sort()) !== JSON.stringify([...(manifest?.caseIds || [])].sort())) fail('case-index.json caseIds do not match manifest');
  for (const relative of ['cases/private', 'evaluator-assets', 'generation-intake.json', 'repository-profile.json', 'evaluation-blueprint.json', 'approvals.json', 'release-audit.json', 'intake-summary.zh-CN.md', 'repository-profile.zh-CN.md', 'blueprint-review.zh-CN.md', 'release-audit.zh-CN.md']) {
    if (existsSync(path.join(root, relative))) fail(`Candidate package leaks authoring/Judge artifact: ${relative}`);
  }

  const publicFiles = stage >= 1 ? files(path.join(root, 'cases', 'public')) : [];
  const publicCases = publicFiles.map((file) => ({ file, value: readJson(file) })).filter((entry) => entry.value);
  for (const item of publicCases) validatePublic(item.value, item.file);
  if (stage >= 1 && publicCases.length === 0) fail('No public prompts found');

  let privateManifest = null;
  let privateCases = [];
  let approvals = null;
  if (privateRoot && !args.publicOnly) {
    const repositoryPath = typeof manifest?.repository === 'string' && existsSync(manifest.repository) ? realpathSync(path.resolve(manifest.repository)) : null;
    if (repositoryPath && (privateRoot === repositoryPath || privateRoot.startsWith(`${repositoryPath}${path.sep}`))) fail('Sealed package must remain outside the evaluated repository');
    privateManifest = readJson(path.join(privateRoot, 'manifest.json'));
    validateManifest(privateManifest, 'private manifest');
    const fields = ['roundId', 'evalsetId', 'releaseId', 'repository', 'baseRevision', 'track', 'releaseStatus', 'caseIdDigest'];
    for (const field of fields) if (manifest?.[field] !== privateManifest?.[field]) fail(`Public/private manifest mismatch: ${field}`);
    const generationIntake = readJson(path.join(privateRoot, 'generation-intake.json'));
    const readOnlyIntake = generationIntake?.evaluationDesign?.mode === 'read-only-code-understanding';
    requireFields(generationIntake, ['schemaVersion', 'workflow', 'locales', 'repository', 'evaluationDesign', 'tracks', 'round', 'deliverable', 'sourceAuthorization', readOnlyIntake ? 'staticReviewFeasibility' : 'verificationFeasibility', 'governance', 'unresolvedRisks', 'confirmation'], 'generation-intake.json');
    if (readOnlyIntake) {
      if (Object.hasOwn(generationIntake, 'verificationFeasibility')) fail('read-only generation-intake.json must use staticReviewFeasibility instead of runtime verificationFeasibility');
      const feasibility = generationIntake?.staticReviewFeasibility;
      requireFields(feasibility, ['answerEvidenceReview', 'candidateProjectExecution', 'runtimeRequirements', 'serviceRequirements', 'credentialRequirements', 'perCaseCostCeilings'], 'generation-intake.json.staticReviewFeasibility');
      if (feasibility?.answerEvidenceReview !== 'final-response-and-frozen-source-only' || feasibility?.candidateProjectExecution !== 'forbidden') fail('generation-intake.json.staticReviewFeasibility policy is invalid');
      for (const field of ['runtimeRequirements', 'serviceRequirements', 'credentialRequirements']) if ((feasibility?.[field] || []).length) fail(`generation-intake.json.staticReviewFeasibility.${field} must be empty`);
    }
    if (generationIntake?.workflow !== 'generate') fail('generation-intake.json workflow must be generate');
    requireLocales(generationIntake?.locales, 'generation-intake.json.locales');
    if (generationIntake?.evaluationDesign?.caseCount?.exact !== 15 || generationIntake?.evaluationDesign?.caseCount?.source !== 'fixed-policy') fail('generation-intake.json must fix caseCount to exactly 15');
    if (Object.hasOwn(generationIntake?.evaluationDesign || {}, 'emphasizedCapabilities')) fail('generation-intake.json must not request capability selection; the five capabilities are fixed');
    requireFields(generationIntake?.round, ['layoutVersion', 'evaluationRoot', 'roundId', 'roundRoot', 'evalsetDirectoryName'], 'generation-intake.json.round');
    if (generationIntake?.round?.layoutVersion !== 2 || generationIntake?.round?.evalsetDirectoryName !== 'evalset') fail('generation-intake.json round layout is invalid');
    if (generationIntake?.round?.evaluationRoot !== '.codebase-eval') fail('generation-intake.json evaluationRoot must be the fixed repository-root-relative path .codebase-eval');
    if (generationIntake?.round?.roundId !== manifest?.roundId) fail('generation-intake.json roundId differs from manifest');
    const intakeEvaluationRoot = realpathSync(path.resolve(generationIntake?.round?.evaluationRoot || ''));
    const expectedRoundRoot = path.join(intakeEvaluationRoot, manifest?.roundId || '');
    if (!existsSync(generationIntake?.round?.roundRoot || '') || realpathSync(path.resolve(generationIntake?.round?.roundRoot || '')) !== expectedRoundRoot) fail('generation-intake.json round paths are invalid');
    if (root !== path.join(expectedRoundRoot, 'evalset', manifest?.track || '')) fail('Public package differs from the generation round layout');
    if (sameOrInside(intakeEvaluationRoot, privateRoot) || sameOrInside(privateRoot, intakeEvaluationRoot)) fail('Sealed package and evaluation root must not contain one another');
    if (stage >= 2) {
      if (!Array.isArray(generationIntake?.deliverable?.packages)) fail('generation-intake.json deliverable.packages must be an array');
      const packageRecord = generationIntake?.deliverable?.packages?.find((item) => item?.track === manifest?.track);
      if (!packageRecord || !existsSync(packageRecord.publicPackage || '') || !existsSync(packageRecord.sealedPrivatePackage || '') || realpathSync(path.resolve(packageRecord.publicPackage || '')) !== root || realpathSync(path.resolve(packageRecord.sealedPrivatePackage || '')) !== privateRoot) fail('generation-intake.json package paths do not match this released track');
    }
    if (generationIntake?.confirmation?.status !== 'confirmed' || !generationIntake.confirmation.confirmedBy || !generationIntake.confirmation.confirmedAt) fail('generation-intake.json confirmation is incomplete');
    const preflight = readJson(path.join(privateRoot, 'environment-preflight.json'));
    requireFields(preflight, ['locales', 'policy', 'requirements', 'summary', 'warnings'], 'environment-preflight.json');
    requireLocales(preflight?.locales, 'environment-preflight.json.locales');
    localizedText(preflight?.summary, 'environment-preflight.json.summary');
    localizedList(preflight?.warnings, 'environment-preflight.json.warnings');
    if (preflight?.policy !== 'reuse-compatible-local-otherwise-ask') fail('environment-preflight policy is invalid');
    for (const item of preflight?.requirements || []) if (stage >= 2 && ['needs-user-decision', 'installation-approved-pending'].includes(item?.decision?.status)) fail(`Environment requirement blocks release candidate: ${item?.id}`);
    readJson(path.join(privateRoot, 'repository-profile.json'));
    pairedMarkdown(privateRoot, 'intake-summary');
    pairedMarkdown(privateRoot, 'environment-preflight');
    pairedMarkdown(privateRoot, 'repository-profile');
    for (const optional of ['blueprint-review', 'release-audit']) {
      if (existsSync(path.join(privateRoot, `${optional}.zh-CN.md`)) || existsSync(path.join(privateRoot, `${optional}.en.md`))) pairedMarkdown(privateRoot, optional);
    }
    approvals = readJson(path.join(privateRoot, 'approvals.json'));
    let blueprint = null;
    if (stage >= 1) {
      blueprint = readJson(path.join(privateRoot, 'evaluation-blueprint.json'));
      validateBlueprint(blueprint, []);
      if (blueprint?.schemaVersion === 4 && generationIntake?.evaluationDesign?.mode !== 'read-only-code-understanding') fail('generation-intake.json evaluationDesign.mode must be read-only-code-understanding for blueprint schema v4');
      if (blueprint?.schemaVersion === 4 && (preflight?.requirements || []).length) fail('schema-v4 read-only generation cannot declare runtime or service preflight requirements');
      if (blueprint?.schemaVersion === 4 && executionContract) {
        if ((executionContract?.environmentPolicy?.credentialRequirementIds || []).length) fail('schema-v4 read-only execution contract cannot require credentials');
        if ((executionContract?.serviceReadiness || []).length) fail('schema-v4 read-only execution contract cannot declare services');
        if ((executionContract?.cleanupPolicy?.controls || []).length) fail('schema-v4 read-only execution contract cannot declare external cleanup controls');
      }
      validateReadOnlyCaseSet(blueprint, publicCases);
      pairedMarkdown(privateRoot, 'blueprint-review');
      validateH2PromptReview(privateRoot, blueprint, publicCases);
      if (!approved(approvals, 'repository_profile')) fail('H1 repository_profile approval is missing');
    }
    if (stage >= 2) {
      const privateFiles = files(path.join(privateRoot, 'cases', 'private'));
      privateCases = privateFiles.map((file) => ({ file, value: readJson(file) })).filter((entry) => entry.value);
      for (const item of privateCases) validatePrivate(item.value, item.file, privateRoot);
      if (blueprint?.schemaVersion === 4) for (const item of privateCases) for (const error of validateReadOnlyPrivateCase(item.value)) fail(`${item.file} ${error}`);
      const publicIds = new Set(publicCases.map((item) => item.value.id));
      const privateIds = new Set(privateCases.map((item) => item.value.id));
      for (const id of publicIds) if (!privateIds.has(id)) fail(`Missing sealed scoring record: ${id}`);
      for (const id of privateIds) if (!publicIds.has(id)) fail(`Missing public case: ${id}`);
      if (!approved(approvals, 'evaluation_blueprint')) fail('H2 evaluation_blueprint approval is missing');
    }
  }

  if (stage >= 2) {
    if (!args.publicOnly) {
      const releaseAudit = readJson(path.join(privateRoot, 'release-audit.json'));
      if (executionContract && releaseAudit?.executionContractSha256 !== createHash('sha256').update(readFileSync(executionContractPath)).digest('hex')) fail('release-audit.json executionContractSha256 does not match the public contract');
      if (executionContract) {
        requireFields(releaseAudit?.bilingualAudit, ['structuralCorrespondence', 'semanticCorrespondence', 'chineseReadability', 'terminologyScan'], 'release-audit.json.bilingualAudit');
        for (const field of ['structuralCorrespondence', 'semanticCorrespondence', 'chineseReadability', 'terminologyScan']) if (releaseAudit?.bilingualAudit?.[field] !== 'passed') fail(`release-audit.json.bilingualAudit.${field} must be passed`);
      }
      pairedMarkdown(privateRoot, 'release-audit');
    }
    const blueprint = privateRoot && !args.publicOnly ? readJson(path.join(privateRoot, 'evaluation-blueprint.json')) : null;
    if (blueprint) validateBlueprint(blueprint, privateCases.map((item) => item.value));
    else if (!args.publicOnly) fail('Missing sealed evaluation-blueprint.json');
    if (publicCases.length !== manifest?.caseIds?.length) fail('Public case count differs from manifest caseIds');
    if (publicCases.some((item) => !manifest?.caseIds?.includes(item.value.id))) fail('Public case ID is missing from manifest');
    if (manifest?.track === 'code-only' && !existsSync(path.join(root, 'sanitization-manifest.json'))) fail('code-only release requires sanitization-manifest.json');
  }

  if (stage >= 3) {
    if (manifest?.releaseStatus !== 'approved') fail('Public manifest releaseStatus must be approved');
    if (!args.publicOnly && !approved(approvals, 'release_audit')) fail('H4 release_audit approval is missing');
  }

  if (warnings.length) process.stdout.write(`Warnings (${warnings.length}):\n${warnings.map((item) => `- ${item}`).join('\n')}\n`);
  if (errors.length) {
    process.stderr.write(`Validation failed (${errors.length}):\n${errors.map((item) => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`Validation passed for stage '${args.stage}'${args.publicOnly ? ' (public only)' : ''}.\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
