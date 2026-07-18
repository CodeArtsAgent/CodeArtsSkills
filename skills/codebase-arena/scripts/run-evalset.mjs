#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  realpathSync, renameSync, statSync, writeFileSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertPortableSegment, assertWindowsPathBudget, removeTree } from './platform-utils.mjs';

const locales = new Set(['zh-CN', 'en']);
const rawStatuses = new Set(['completed', 'unfinished', 'infra-error', 'protocol-error']);
const rollbackStatuses = new Set(['clean', 'rollback-error']);
const cleanupStatuses = new Set(['clean', 'cleanup-error']);
const cleanResourceStatuses = new Set(['removed', 'restored', 'terminated', 'verified-clean', 'not-created']);
const retrievalTools = new Set(['grep', 'glob', 'read', 'codebase-index', 'symbol-search', 'reference-search']);
const retrievalSummaryTools = new Set([...retrievalTools, 'unknown']);
const retrievalSources = new Set(['host-native', 'worker-journal', 'unavailable']);
const retrievalRoles = new Set(['discovery', 'verification']);
const lexicalDiscoveryTools = new Set(['grep', 'glob', 'read']);
const indexDiscoveryTools = new Set(['codebase-index', 'symbol-search', 'reference-search']);
const commandStatuses = new Set(['succeeded', 'failed', 'timed-out', 'terminated']);
const maximumActivityEvents = 20;
const maximumRetrievalKeyActions = 8;
const secondPrecisionUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
    if (flag === '--help') args.help = true;
    else args[flag.slice(2)] = rest[++i];
  }
  return args;
}
function requireArg(args, key) { if (!args[key]) throw new Error(`--${key} is required`); return args[key]; }
function readJson(file) { return JSON.parse(readFileSync(path.resolve(file), 'utf8')); }
function relativePathText(value) {
  const relative = path.relative(process.cwd(), path.resolve(value)) || '.';
  return relative.split(path.sep).join('/');
}
function writeJson(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, target);
}
function requireFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const field of fields) if (value[field] === undefined || value[field] === null || value[field] === '') throw new Error(`${label} is missing ${field}`);
}
function safeSegment(value, label) {
  return assertPortableSegment(value, label);
}
function within(root, candidate, label, allowRoot = false) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  if ((!allowRoot && target === base) || (target !== base && !target.startsWith(`${base}${path.sep}`))) throw new Error(`${label} escapes its root`);
  return target;
}
function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new Error(`${label} must be a safe relative path`);
  return value;
}
function sameOrInside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}
function canonicalPath(value) {
  let current = path.resolve(value);
  const missing = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(value);
    missing.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...missing);
}
function jsonFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => path.join(directory, entry.name)).sort();
}
function localized(value, locale, label) { if (!value || typeof value[locale] !== 'string') throw new Error(`${label} is missing ${locale}`); return value[locale]; }
function localizedList(value, locale, label) { if (!value || !Array.isArray(value[locale])) throw new Error(`${label} is missing ${locale}`); return value[locale]; }
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function taskId(system, caseId, locale) { return `${safeSegment(system, 'system')}--${safeSegment(caseId, 'case')}--${safeSegment(locale, 'locale')}`; }
function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) throw new Error(`${label}.${key} is not allowed; shared execution policy cannot be overridden`);
}
function resolveExecutionConfig(source, evalset, manifest) {
  if (!source.contract) return { effective: source, stored: source, contract: null };
  assertExactKeys(source, new Set(['schemaVersion', 'contract', 'system', 'tokenEvidence', 'activityTrace', 'environmentVerification', 'output']), 'execution config');
  if (source.schemaVersion !== 3) throw new Error('Contract-based execution config requires schemaVersion 3');
  requireFields(source.contract, ['path', 'releaseId', 'sha256'], 'execution config.contract');
  if (typeof source.contract.path !== 'string' || !source.contract.path || path.isAbsolute(source.contract.path)) throw new Error('execution config.contract.path must be relative');
  const expectedContract = path.join(evalset, 'execution-contract.json');
  if (!existsSync(expectedContract) || realpathSync(path.resolve(source.contract.path)) !== realpathSync(expectedContract)) throw new Error('Execution config must reference the selected public package execution-contract.json');
  if (sha256(expectedContract) !== source.contract.sha256) throw new Error('Execution contract SHA-256 mismatch');
  const contract = readJson(expectedContract);
  requireFields(contract, ['schemaVersion', 'kind', 'identity', 'executionPolicy', 'evidenceRequirements', 'environmentPolicy', 'serviceReadiness', 'cleanupPolicy'], 'execution contract');
  if (contract.schemaVersion !== 3 || contract.kind !== 'codebase-eval-execution-contract') throw new Error('Unsupported execution contract');
  requireFields(contract.identity, ['roundId', 'releaseId', 'track', 'repository', 'baseRevision', 'caseIdDigest'], 'execution contract.identity');
  for (const field of ['roundId', 'releaseId', 'track', 'repository', 'baseRevision', 'caseIdDigest']) if (contract.identity[field] !== manifest[field]) throw new Error(`Execution contract identity differs from manifest: ${field}`);
  if (source.contract.releaseId !== contract.identity.releaseId) throw new Error('Execution config contract releaseId mismatch');
  requireFields(contract.executionPolicy, ['caseSelection', 'maximumAttempts', 'childConcurrency', 'caseConcurrency', 'caseCoordinatorPerCase', 'freshCaseCoordinatorPerCase', 'workerConcurrencyPerCase', 'workerSpawnOwner', 'perCaseTimeoutMs', 'promptLocaleSource', 'freshChildPerAttempt', 'noInheritedContext', 'directProjectExecution', 'serialExecution', 'initialProjectSnapshot', 'baselineSnapshotScope', 'gitIgnoredContent', 'gitMetadataHandling', 'protocolDirectoryCleanup', 'snapshotAfterAttempt', 'rollbackToBaselineAfterAttempt', 'projectRestoration', 'initialSnapshotOwner', 'completedSnapshotAndRollbackOwner', 'dependencyMutationDuringRun', 'dirtyDataCleanupPerAttempt', 'stopRunOnCleanupError', 'stopRunOnChildIsolationViolation'], 'execution contract.executionPolicy');
  const policy = contract.executionPolicy;
  if (policy.caseSelection !== 'all-released-cases' || policy.maximumAttempts !== 2 || policy.childConcurrency !== 2 || policy.caseConcurrency !== 1 || policy.caseCoordinatorPerCase !== true || policy.freshCaseCoordinatorPerCase !== true || policy.workerConcurrencyPerCase !== 1 || policy.workerSpawnOwner !== 'case-coordinator' || policy.perCaseTimeoutMs !== 3600000 || policy.promptLocaleSource !== 'fixed-en' || policy.freshChildPerAttempt !== true || policy.noInheritedContext !== true || policy.directProjectExecution !== true || policy.serialExecution !== true || policy.initialProjectSnapshot !== 'required-before-first-attempt' || policy.baselineSnapshotScope !== 'git-tracked-and-nonignored-untracked' || policy.gitIgnoredContent !== 'excluded-from-snapshot-managed-by-cleanup-controls' || policy.gitMetadataHandling !== 'private-snapshot-semantic-verification' || policy.protocolDirectoryCleanup !== 'required-before-next-attempt' || policy.snapshotAfterAttempt !== true || policy.rollbackToBaselineAfterAttempt !== true || policy.projectRestoration !== 'case-coordinator-deterministic-from-snapshot' || policy.initialSnapshotOwner !== 'main-coordinator' || policy.completedSnapshotAndRollbackOwner !== 'case-coordinator' || policy.dependencyMutationDuringRun !== 'forbidden' || policy.dirtyDataCleanupPerAttempt !== true || policy.stopRunOnCleanupError !== true || policy.stopRunOnChildIsolationViolation !== true) throw new Error('Execution contract policy violates benchmark invariants');
  requireFields(contract.evidenceRequirements, ['finalResponseFormat', 'activityLogRequired', 'commandAndTestLogsRequiredWhenExecuted', 'collectInspectedAndCitedLocationsWhenObservable', 'retrievalSummaryRequired', 'maximumRetrievalKeyActions', 'retainFullRetrievalTrace', 'collectChainOfThought'], 'execution contract.evidenceRequirements');
  if (contract.evidenceRequirements.finalResponseFormat !== 'markdown' || contract.evidenceRequirements.activityLogRequired !== true || contract.evidenceRequirements.retrievalSummaryRequired !== true || contract.evidenceRequirements.maximumRetrievalKeyActions !== maximumRetrievalKeyActions || contract.evidenceRequirements.retainFullRetrievalTrace !== false || contract.evidenceRequirements.collectChainOfThought !== false) throw new Error('Execution contract evidence requirements are invalid');
  requireFields(contract.environmentPolicy, ['installationPolicy', 'dependencyMutationsDuringRun', 'credentialRequirementIds'], 'execution contract.environmentPolicy');
  if (contract.environmentPolicy.installationPolicy !== 'ask-before-install-before-cases' || contract.environmentPolicy.dependencyMutationsDuringRun !== 'forbidden' || !Array.isArray(contract.environmentPolicy.credentialRequirementIds)) throw new Error('Execution contract environment policy is invalid');
  if (!Array.isArray(contract.serviceReadiness)) throw new Error('Execution contract serviceReadiness must be an array');
  requireFields(source.environmentVerification, ['status', 'baselineId', 'evidencePaths', 'verifiedCredentialRequirementIds', 'serviceVerification'], 'execution config.environmentVerification');
  if (source.environmentVerification.status !== 'verified-and-sealed-before-cases') throw new Error('Execution environment must be re-verified and sealed before cases');
  const requiredCredentials = [...contract.environmentPolicy.credentialRequirementIds].sort();
  const verifiedCredentials = [...source.environmentVerification.verifiedCredentialRequirementIds].sort();
  if (JSON.stringify(requiredCredentials) !== JSON.stringify(verifiedCredentials)) throw new Error('Execution credential verification does not match contract requirements');
  if (!Array.isArray(source.environmentVerification.serviceVerification)) throw new Error('serviceVerification must be an array');
  const verificationById = new Map(source.environmentVerification.serviceVerification.map((item) => [item.id, item]));
  if (verificationById.size !== source.environmentVerification.serviceVerification.length) throw new Error('Duplicate service verification ID');
  const serviceReadiness = contract.serviceReadiness.map((service) => {
    const verification = verificationById.get(service.id);
    if (!verification || verification.status !== 'verified' || Number.isNaN(Date.parse(verification.verifiedAt))) throw new Error(`Service ${service.id} was not re-verified before execution`);
    return { ...service, status: 'verified', verifiedAt: verification.verifiedAt };
  });
  if (verificationById.size !== serviceReadiness.length) throw new Error('Execution config contains service verification outside the contract');
  requireFields(source.activityTrace, ['source'], 'execution config.activityTrace');
  const effective = {
    schemaVersion: 3,
    system: source.system,
    promptLocale: 'en',
    promptLocaleSource: policy.promptLocaleSource,
    sessionPolicy: 'fresh-case-coordinator-per-case-and-fresh-worker-per-attempt',
    subagentContextPolicy: 'no-parent-turns',
    concurrency: { children: policy.childConcurrency, cases: policy.caseConcurrency, workersPerCase: policy.workerConcurrencyPerCase },
    maxAttempts: policy.maximumAttempts,
    tokenEvidence: source.tokenEvidence,
    evidenceCapture: { activityTraceSource: source.activityTrace.source, requireActivityLog: contract.evidenceRequirements.activityLogRequired, maximumActivityEvents, retrievalSummaryRequired: true, maximumRetrievalKeyActions, retainFullRetrievalTrace: false, collectChainOfThought: contract.evidenceRequirements.collectChainOfThought },
    executionTimeoutMs: policy.perCaseTimeoutMs,
    workspacePolicy: 'direct-project-main-initial-snapshot-case-coordinator-freeze-rollback',
    environmentPolicy: { status: source.environmentVerification.status, installationPolicy: contract.environmentPolicy.installationPolicy, mutationsDuringRun: contract.environmentPolicy.dependencyMutationsDuringRun, baselineId: source.environmentVerification.baselineId, evidencePaths: source.environmentVerification.evidencePaths, serviceReadiness },
    cleanupPolicy: { ...contract.cleanupPolicy, status: 'verified-before-cases' },
    outputPolicy: source.output,
    repositoryRoot: contract.identity.repository,
    executionContract: { path: source.contract.path, releaseId: source.contract.releaseId, sha256: source.contract.sha256 }
  };
  return { effective, stored: source, contract };
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
}

function selected(relative, selection) {
  const normalized = relative.split(path.sep).join('/');
  if (selection.included.has(normalized)) return true;
  return [...selection.recursiveRoots].some((prefix) => normalized.startsWith(`${prefix}/`));
}
function inventory(root, relative = '', result = {}, selection) {
  if (!selection) throw new Error('Managed inventory requires an explicit Git project selection');
  const current = path.join(root, relative);
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['.git', '.codebase-eval', '.codebase-eval-worker'].includes(entry.name) && relative === '') continue;
    const rel = path.join(relative, entry.name);
    const full = path.join(root, rel);
    const normalized = rel.split(path.sep).join('/');
    if (!selected(normalized, selection)) continue;
    if (entry.isDirectory()) inventory(root, rel, result, selection);
    else if (entry.isSymbolicLink()) result[normalized] = { type: 'symlink', target: readlinkSync(full) };
    else if (entry.isFile()) {
      const stat = statSync(full);
      result[normalized] = { type: 'file', size: stat.size, sha256: createHash('sha256').update(readFileSync(full)).digest('hex') };
    }
  }
  return result;
}
function gitProjectSelection(root) {
  const listed = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`Cannot resolve Git snapshot surface: ${(listed.stderr || '').toString('utf8').trim()}`);
  const included = new Set();
  const recursiveRoots = new Set();
  for (const item of listed.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const normalized = item.split(path.sep).join('/');
    if (!normalized || normalized === '.codebase-eval' || normalized.startsWith('.codebase-eval/') || normalized === '.codebase-eval-worker' || normalized.startsWith('.codebase-eval-worker/')) continue;
    included.add(normalized);
    let parent = path.posix.dirname(normalized);
    while (parent !== '.') { included.add(parent); parent = path.posix.dirname(parent); }
    const full = path.join(root, ...normalized.split('/'));
    if (existsSync(full) && lstatSync(full).isDirectory()) recursiveRoots.add(normalized);
  }
  return { included, recursiveRoots };
}
function serializeSelection(selection) {
  return { included: [...selection.included].sort(), recursiveRoots: [...selection.recursiveRoots].sort() };
}
function deserializeSelection(value) {
  requireFields(value, ['included', 'recursiveRoots'], 'completed project selection');
  if (!Array.isArray(value.included) || !Array.isArray(value.recursiveRoots) || value.included.some((item) => typeof item !== 'string') || value.recursiveRoots.some((item) => typeof item !== 'string')) throw new Error('Completed project selection is invalid');
  return { included: new Set(value.included), recursiveRoots: new Set(value.recursiveRoots) };
}
function gitSemanticState(root) {
  const command = (args, allowFailure = false) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) {
      if (allowFailure) return Buffer.alloc(0);
      throw new Error(`Cannot inspect semantic Git state: ${(result.stderr || '').toString('utf8').trim()}`);
    }
    return result.stdout;
  };
  return {
    head: command(['rev-parse', '--verify', 'HEAD'], true).toString('utf8').trim() || null,
    symbolicHead: command(['symbolic-ref', '-q', 'HEAD'], true).toString('utf8').trim() || null,
    indexEntriesSha256: createHash('sha256').update(command(['ls-files', '--stage', '-z'])).digest('hex'),
    refsSha256: createHash('sha256').update(command(['for-each-ref', '--format=%(refname)%00%(objectname)%00'])).digest('hex')
  };
}
function projectStateInventory(root, relative = '', result = {}, selection = null) {
  if (!selection) selection = gitProjectSelection(root);
  const current = path.join(root, relative);
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['.codebase-eval', '.codebase-eval-worker'].includes(entry.name) && relative === '') continue;
    const rel = path.join(relative, entry.name);
    const full = path.join(root, rel);
    const normalized = rel.split(path.sep).join('/');
    if (!selection.included.has(normalized) && ![...selection.recursiveRoots].some((prefix) => normalized.startsWith(`${prefix}/`))) continue;
    const stat = lstatSync(full);
    const mode = stat.mode & 0o777;
    if (entry.isDirectory()) {
      result[normalized] = { type: 'directory', mode };
      projectStateInventory(root, rel, result, selection);
    } else if (entry.isSymbolicLink()) result[normalized] = { type: 'symlink', mode, target: readlinkSync(full) };
    else if (entry.isFile()) result[normalized] = { type: 'file', mode, size: stat.size, sha256: createHash('sha256').update(readFileSync(full)).digest('hex') };
    else result[normalized] = { type: 'special', mode, size: stat.size };
  }
  return result;
}
function diffInventory(before, after) {
  const added = [], modified = [], deleted = [];
  for (const file of Object.keys(after)) {
    if (!before[file]) added.push(file);
    else if (JSON.stringify(before[file]) !== JSON.stringify(after[file])) modified.push(file);
  }
  for (const file of Object.keys(before)) if (!after[file]) deleted.push(file);
  return { added: added.sort(), modified: modified.sort(), deleted: deleted.sort() };
}
function attemptPaths(root, task, attempt, repository = null) {
  const taskRoot = within(path.join(root, 'artifacts'), path.join(root, 'artifacts', task), 'task artifact');
  return {
    attemptDir: within(taskRoot, path.join(taskRoot, `attempt-${attempt}`), 'attempt artifact'),
    internalDir: within(taskRoot, path.join(taskRoot, `attempt-${attempt}`, '.internal'), 'attempt internal artifact'),
    record: within(taskRoot, path.join(taskRoot, `attempt-${attempt}`, 'execution-result.json'), 'execution result'),
    workspace: repository ? path.resolve(repository) : null,
    frozenWorkspace: within(path.join(root, 'workspaces'), path.join(root, 'workspaces', task, `attempt-${attempt}`), 'frozen workspace')
  };
}
function loadRun(runRoot) {
  const root = realpathSync(path.resolve(runRoot));
  const statePath = path.join(root, 'execution-state.json');
  const document = readJson(statePath);
  requireFields(document, ['schemaVersion', 'request', 'plan', 'todo'], 'execution-state');
  const plan = document.plan;
  const recordedOutputLayout = { ...plan.outputLayout };
  plan.repository = path.resolve(plan.repository);
  plan.publicPackage = path.resolve(plan.publicPackage);
  plan.outputLayout = {
    ...plan.outputLayout,
    evaluationRoot: path.resolve(plan.outputLayout.evaluationRoot),
    roundRoot: path.resolve(plan.outputLayout.roundRoot),
    runRoot: path.resolve(plan.outputLayout.runRoot)
  };
  plan.tasks = plan.tasks.map((task) => ({ ...task, publicCasePath: path.resolve(task.publicCasePath) }));
  return { root, statePath, document, plan, recordedOutputLayout, todo: document.todo };
}
function saveRunState(state) {
  state.document.plan = {
    ...state.plan,
    repository: relativePathText(state.plan.repository),
    publicPackage: relativePathText(state.plan.publicPackage),
    outputLayout: state.recordedOutputLayout,
    config: { ...state.plan.config, repositoryRoot: relativePathText(state.plan.repository), outputPolicy: state.recordedOutputLayout },
    tasks: state.plan.tasks.map((task) => ({ ...task, publicCasePath: relativePathText(task.publicCasePath) }))
  };
  state.document.todo = state.todo;
  writeJson(state.statePath, state.document);
}
function findTask(state, id) {
  const task = state.plan.tasks.find((item) => item.id === id);
  const todo = state.todo.items.find((item) => item.id === id);
  if (!task || !todo) throw new Error(`Unknown task: ${id}`);
  return { task, todo };
}
function stopRunForProtocolViolation(state, reason, currentTaskId = null, preserveCurrentStatus = false) {
  const at = new Date().toISOString();
  state.todo.runStatus = 'protocol-error';
  state.todo.stopReason = 'child-or-isolation-protocol-violation';
  state.todo.updatedAt = at;
  for (const item of state.todo.items) {
    if (item.id === currentTaskId && preserveCurrentStatus) continue;
    if (!['completed', 'blocked'].includes(item.status)) {
      item.status = 'blocked';
      item.blockReason = 'protocol-error';
    }
  }
  const record = { schemaVersion: 1, status: 'protocol-error', detectedAt: at, reason, currentTaskId, activeChildrenMustBeTerminated: true, cleanupRequired: true, retryAllowed: false };
  writeJson(path.join(state.root, 'protocol-violation.json'), record);
  saveRunState(state);
  return record;
}

function validateConfig(config) {
  requireFields(config, ['schemaVersion', 'system', 'promptLocale', 'promptLocaleSource', 'sessionPolicy', 'subagentContextPolicy', 'concurrency', 'maxAttempts', 'tokenEvidence', 'evidenceCapture', 'executionTimeoutMs', 'workspacePolicy', 'environmentPolicy', 'cleanupPolicy', 'outputPolicy'], 'effective execution config');
  requireFields(config.system, ['id', 'label'], 'system');
  safeSegment(config.system.id, 'system.id');
  if (['evalset', 'report'].includes(config.system.id)) throw new Error(`system.id ${config.system.id} is reserved by the shared round layout`);
  if (config.promptLocale !== 'en') throw new Error('promptLocale is fixed to en for evaluated workers');
  if (config.promptLocaleSource !== 'fixed-en') throw new Error('promptLocaleSource must be fixed-en');
  if (config.sessionPolicy !== 'fresh-case-coordinator-per-case-and-fresh-worker-per-attempt' || config.subagentContextPolicy !== 'no-parent-turns') throw new Error('Fresh case coordinators and workers with no inherited context are required');
  if (config.concurrency?.children !== 2 || config.concurrency?.cases !== 1 || config.concurrency?.workersPerCase !== 1) throw new Error('concurrency must allow one case coordinator and one nested worker for exactly one active case');
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) throw new Error('maxAttempts must be positive');
  if (config.executionTimeoutMs !== 3600000) throw new Error('executionTimeoutMs must be 3600000');
  if (config.workspacePolicy !== 'direct-project-main-initial-snapshot-case-coordinator-freeze-rollback') throw new Error('Direct project execution with main initial snapshot and case-coordinator freeze/rollback is required');
  if (config.environmentPolicy?.status !== 'verified-and-sealed-before-cases' || config.environmentPolicy?.installationPolicy !== 'ask-before-install-before-cases' || config.environmentPolicy?.mutationsDuringRun !== 'forbidden' || !config.environmentPolicy?.baselineId) throw new Error('Environment is not verified and sealed');
  requireFields(config.cleanupPolicy, ['status', 'processTreeTermination', 'outsideSnapshotWrites', 'controls'], 'cleanupPolicy');
  if (config.cleanupPolicy.status !== 'verified-before-cases' || config.cleanupPolicy.processTreeTermination !== 'required' || config.cleanupPolicy.outsideSnapshotWrites !== 'forbidden-unless-declared' || !Array.isArray(config.cleanupPolicy.controls)) throw new Error('Cleanup policy is not verified before cases');
  const cleanupControlIds = new Set();
  for (const [index, control] of config.cleanupPolicy.controls.entries()) {
    requireFields(control, ['id', 'scope', 'reset', 'verify'], `cleanupPolicy.controls[${index}]`);
    safeSegment(control.id, `cleanupPolicy.controls[${index}].id`);
    if (cleanupControlIds.has(control.id)) throw new Error(`Duplicate cleanup control: ${control.id}`);
    if (!Array.isArray(control.reset) || !Array.isArray(control.verify)) throw new Error(`cleanupPolicy.controls[${index}] reset and verify must be arrays`);
    cleanupControlIds.add(control.id);
  }
  if (!Array.isArray(config.environmentPolicy.serviceReadiness)) throw new Error('environmentPolicy.serviceReadiness must be an array');
  const serviceIds = new Set();
  const safeCommand = (value, label, optional = false) => {
    if (optional && value === null) return;
    if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== 'string' || !part || /[\r\n\0]/.test(part))) throw new Error(`${label} must be a non-empty argument array`);
    const joined = value.join(' ');
    if (/(?:password|passwd|token|secret|api[_-]?key|authorization|cookie)\s*(?:=|:)/i.test(joined)) throw new Error(`${label} appears to contain an embedded secret; use requirement IDs and secure injection instead`);
  };
  for (const [index, service] of config.environmentPolicy.serviceReadiness.entries()) {
    const label = `environmentPolicy.serviceReadiness[${index}]`;
    requireFields(service, ['id', 'status', 'verifiedAt', 'workingDirectory', 'startCommand', 'readiness', 'stop', 'requirementIds', 'cleanupControlIds', 'notes'], label);
    const allowed = new Set(['id', 'status', 'verifiedAt', 'workingDirectory', 'buildCommand', 'startCommand', 'readiness', 'stop', 'requirementIds', 'cleanupControlIds', 'notes']);
    for (const key of Object.keys(service)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not candidate-safe service metadata`);
    safeSegment(service.id, `${label}.id`);
    if (serviceIds.has(service.id)) throw new Error(`Duplicate service readiness record: ${service.id}`);
    serviceIds.add(service.id);
    if (service.status !== 'verified') throw new Error(`${label}.status must be verified`);
    if (Number.isNaN(Date.parse(service.verifiedAt))) throw new Error(`${label}.verifiedAt must be ISO-8601`);
    safeRelative(service.workingDirectory, `${label}.workingDirectory`);
    safeCommand(service.buildCommand ?? null, `${label}.buildCommand`, true);
    safeCommand(service.startCommand, `${label}.startCommand`);
    if (!Array.isArray(service.requirementIds) || service.requirementIds.some((id) => typeof id !== 'string' || !id)) throw new Error(`${label}.requirementIds must be a string array`);
    if (!Array.isArray(service.cleanupControlIds) || service.cleanupControlIds.some((id) => typeof id !== 'string' || !cleanupControlIds.has(id))) throw new Error(`${label}.cleanupControlIds must reference known cleanup controls`);
    localized(service.notes, 'zh-CN', `${label}.notes`);
    localized(service.notes, 'en', `${label}.notes`);
    requireFields(service.stop, ['strategy'], `${label}.stop`);
    if (Object.keys(service.stop).some((key) => key !== 'strategy')) throw new Error(`${label}.stop contains unsupported candidate-visible fields`);
    if (service.stop.strategy !== 'terminate-attempt-process-tree') throw new Error(`${label}.stop.strategy must be terminate-attempt-process-tree`);
    requireFields(service.readiness, ['type', 'timeoutMs'], `${label}.readiness`);
    if (!Number.isInteger(service.readiness.timeoutMs) || service.readiness.timeoutMs < 1) throw new Error(`${label}.readiness.timeoutMs must be positive`);
    if (service.readiness.type === 'http') {
      const allowedReadiness = new Set(['type', 'url', 'method', 'expectedStatusCodes', 'timeoutMs']);
      for (const key of Object.keys(service.readiness)) if (!allowedReadiness.has(key)) throw new Error(`${label}.readiness.${key} is not candidate-safe HTTP metadata`);
      requireFields(service.readiness, ['url', 'method', 'expectedStatusCodes'], `${label}.readiness`);
      const url = new URL(service.readiness.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${label}.readiness.url must be a credential-free HTTP(S) URL`);
      if (!['GET', 'HEAD'].includes(service.readiness.method) || !Array.isArray(service.readiness.expectedStatusCodes) || service.readiness.expectedStatusCodes.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) throw new Error(`${label}.readiness HTTP contract is invalid`);
    } else if (service.readiness.type === 'command') {
      const allowedReadiness = new Set(['type', 'command', 'expectedExitCode', 'timeoutMs']);
      for (const key of Object.keys(service.readiness)) if (!allowedReadiness.has(key)) throw new Error(`${label}.readiness.${key} is not candidate-safe command metadata`);
      requireFields(service.readiness, ['command', 'expectedExitCode'], `${label}.readiness`);
      safeCommand(service.readiness.command, `${label}.readiness.command`);
      if (!Number.isInteger(service.readiness.expectedExitCode)) throw new Error(`${label}.readiness.expectedExitCode must be an integer`);
    } else throw new Error(`${label}.readiness.type must be http or command`);
  }
  requireFields(config.tokenEvidence, ['availability', 'source'], 'tokenEvidence');
  if (!['available', 'unavailable'].includes(config.tokenEvidence.availability) || typeof config.tokenEvidence.source !== 'string' || !config.tokenEvidence.source) throw new Error('tokenEvidence requires availability available|unavailable and a non-empty source');
  requireFields(config.evidenceCapture, ['activityTraceSource', 'requireActivityLog', 'collectChainOfThought'], 'evidenceCapture');
  if (config.evidenceCapture.requireActivityLog !== true || config.evidenceCapture.collectChainOfThought !== false) throw new Error('Observable activity evidence is required and chain-of-thought collection is forbidden');
  requireFields(config.outputPolicy, ['layoutVersion', 'evaluationRoot', 'roundId', 'roundRoot', 'evalsetDirectoryName', 'reportDirectoryName', 'productDirectoryName', 'executionRunId', 'runRoot'], 'outputPolicy');
  if (config.outputPolicy.layoutVersion !== 2 || config.outputPolicy.evalsetDirectoryName !== 'evalset' || config.outputPolicy.reportDirectoryName !== 'report') throw new Error('Unsupported shared round layout');
  if (config.outputPolicy.evaluationRoot !== '.codebase-eval') throw new Error('evaluationRoot must be the fixed repository-root-relative path .codebase-eval');
  if (path.isAbsolute(config.outputPolicy.evaluationRoot) || path.isAbsolute(config.outputPolicy.roundRoot) || path.isAbsolute(config.outputPolicy.runRoot)) throw new Error('Output paths must be relative to the declared workflow working directory');
  if (config.outputPolicy.productDirectoryName !== config.system.id) throw new Error('Product directory must equal system.id');
  safeSegment(config.outputPolicy.roundId, 'roundId');
  safeSegment(config.outputPolicy.productDirectoryName, 'productDirectoryName');
  safeSegment(config.outputPolicy.executionRunId, 'executionRunId');
  const expectedRoundRoot = path.join(canonicalPath(config.outputPolicy.evaluationRoot), config.outputPolicy.roundId);
  if (canonicalPath(config.outputPolicy.roundRoot) !== expectedRoundRoot) throw new Error('roundRoot does not match the shared round layout');
  const expectedRunRoot = path.join(expectedRoundRoot, config.system.id, config.outputPolicy.executionRunId);
  if (canonicalPath(config.outputPolicy.runRoot) !== expectedRunRoot) throw new Error('runRoot does not match the shared output layout');
}

function planCommand(args) {
  const evalset = realpathSync(path.resolve(requireArg(args, 'evalset')));
  const requestPath = args.request ? canonicalPath(args.request) : null;
  const request = requestPath ? readJson(requestPath) : null;
  if (request) assertExactKeys(request, new Set(['schemaVersion', 'workflow', 'system', 'contract', 'publicPackage', 'tokenEvidence', 'activityTrace', 'environmentVerification', 'runConstraints', 'environmentDecisions', 'output', 'confirmation']), 'execution request');
  if (request) requireFields(request, ['schemaVersion', 'workflow', 'system', 'contract', 'output', 'publicPackage', 'tokenEvidence', 'activityTrace', 'environmentVerification', 'confirmation'], 'execution request');
  if (request && (request.schemaVersion !== 1 || request.workflow !== 'execute')) throw new Error('execution-request.json is invalid');
  const sourceConfig = request ? { schemaVersion: 3, contract: request.contract, system: request.system, tokenEvidence: request.tokenEvidence, activityTrace: request.activityTrace, environmentVerification: request.environmentVerification, output: request.output } : readJson(requireArg(args, 'config'));
  const intake = request ? { schemaVersion: 3, workflow: 'execute', system: request.system, contract: request.contract, output: request.output, publicPackage: request.publicPackage, selection: { source: 'execution-contract', mode: 'all-released-cases' }, tokenEvidence: request.tokenEvidence, evidenceCapture: { requireActivityLog: true, collectChainOfThought: false }, runConstraints: request.runConstraints || {}, environmentDecisions: request.environmentDecisions || [], fixedDefaults: { source: 'execution-contract', overrides: [] }, confirmation: request.confirmation } : readJson(requireArg(args, 'intake'));
  const manifest = readJson(path.join(evalset, 'manifest.json'));
  const resolvedConfig = resolveExecutionConfig(sourceConfig, evalset, manifest);
  const config = resolvedConfig.effective;
  validateConfig(config);
  requireFields(intake, ['schemaVersion', 'workflow', 'system', 'output', 'publicPackage', 'selection', 'tokenEvidence', 'evidenceCapture', 'runConstraints', 'environmentDecisions', 'fixedDefaults', 'confirmation'], 'execution intake');
  if (intake.workflow !== 'execute' || intake.confirmation?.status !== 'confirmed' || !intake.confirmation.confirmedBy || !intake.confirmation.confirmedAt) throw new Error('Confirmed execution intake is required');
  if (intake.system?.id !== config.system.id || intake.system?.label !== config.system.label) throw new Error('Execution intake system differs from config');
  requireFields(intake.output, ['layoutVersion', 'evaluationRoot', 'roundId', 'roundRoot', 'evalsetDirectoryName', 'reportDirectoryName', 'productDirectoryName', 'executionRunId', 'runRoot'], 'execution intake output');
  for (const field of ['layoutVersion', 'roundId', 'evalsetDirectoryName', 'reportDirectoryName', 'productDirectoryName', 'executionRunId']) if (intake.output[field] !== config.outputPolicy[field]) throw new Error(`Execution intake output ${field} differs from config`);
  for (const field of ['evaluationRoot', 'roundRoot', 'runRoot']) if (canonicalPath(intake.output[field]) !== canonicalPath(config.outputPolicy[field])) throw new Error(`Execution intake output ${field} differs from config`);
  if (realpathSync(path.resolve(intake.publicPackage)) !== evalset) throw new Error('Execution intake publicPackage differs from --evalset');
  if (resolvedConfig.contract) {
    requireFields(intake, ['contract'], 'contract-based execution intake');
    if (JSON.stringify(intake.contract) !== JSON.stringify(sourceConfig.contract)) throw new Error('Execution intake contract reference differs from config');
    if (intake.selection?.source !== 'execution-contract' || intake.selection?.mode !== 'all-released-cases') throw new Error('Contract-based execution must use all released cases');
    if (intake.fixedDefaults?.source !== 'execution-contract' || !Array.isArray(intake.fixedDefaults?.overrides) || intake.fixedDefaults.overrides.length) throw new Error('Execution intake may not override the shared contract');
  } else if (!['all-released-cases', 'explicit-case-ids'].includes(intake.selection?.mode) || !Array.isArray(intake.selection?.caseIds) || (intake.selection.mode === 'explicit-case-ids' && intake.selection.caseIds.length === 0)) throw new Error('Legacy execution intake case selection is invalid');
  if (intake.evidenceCapture?.requireActivityLog !== true || intake.evidenceCapture?.collectChainOfThought !== false) throw new Error('Execution intake evidence policy is invalid');
  if (!resolvedConfig.contract && (intake.fixedDefaults?.childConcurrency !== 2 || intake.fixedDefaults?.maximumAttempts !== config.maxAttempts || intake.fixedDefaults?.perCaseTimeoutMs !== 3600000 || intake.fixedDefaults?.freshChildPerAttempt !== true || intake.fixedDefaults?.directProjectExecution !== true || intake.fixedDefaults?.snapshotAfterAttempt !== true || intake.fixedDefaults?.rollbackToBaselineAfterAttempt !== true || intake.fixedDefaults?.dirtyDataCleanupPerAttempt !== true || intake.fixedDefaults?.stopRunOnCleanupError !== true || intake.fixedDefaults?.sameMachineFilesystem !== true)) throw new Error('Legacy execution intake resolved defaults are invalid');
  const out = canonicalPath(requireArg(args, 'out'));
  assertWindowsPathBudget(out, 180);
  if (out !== canonicalPath(config.outputPolicy.runRoot)) throw new Error('--out must equal outputPolicy.runRoot');
  if (existsSync(path.join(out, 'execution-state.json'))) throw new Error(`Run already exists: ${out}`);
  const validator = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-evalset.mjs');
  const validation = spawnSync(process.execPath, [validator, '--root', evalset, '--stage', 'release', '--public-only'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (validation.status !== 0) throw new Error(`Public evalset validation failed: ${(validation.stderr || validation.stdout || '').trim()}`);
  if (manifest.releaseStatus !== 'approved') throw new Error('H4-approved public release is required');
  const repository = canonicalPath(config.repositoryRoot || path.dirname(evalset));
  if (!existsSync(path.join(repository, '.git'))) throw new Error('Execution repository must be a local Git repository');
  const evaluationRoot = canonicalPath(config.outputPolicy.evaluationRoot);
  if (evaluationRoot === repository || !sameOrInside(repository, evaluationRoot)) throw new Error('The dedicated evaluation root must be a strict descendant of the evaluated repository');
  if (manifest.roundId !== config.outputPolicy.roundId) throw new Error('Public manifest roundId differs from the selected round');
  const expectedPublicPackage = path.join(canonicalPath(config.outputPolicy.roundRoot), 'evalset', manifest.track);
  if (evalset !== expectedPublicPackage) throw new Error('Public package does not match .codebase-eval/<round-id>/evalset/<track>');
  const allPublicFiles = jsonFiles(path.join(evalset, 'cases', 'public'));
  const selectedIds = !resolvedConfig.contract && intake.selection.mode === 'explicit-case-ids' ? new Set(intake.selection.caseIds) : null;
  const tasks = allPublicFiles.map((file) => {
    const item = readJson(file);
    localized(item.prompt, config.promptLocale, `${file}.prompt`);
    if (selectedIds && !selectedIds.has(item.id)) return null;
    requireFields(item.environment?.sideEffects, ['mode', 'resourceIds', 'outsideSnapshotWrites', 'cleanupControlIds'], `${file}.environment.sideEffects`);
    if (!Array.isArray(item.environment.services) || item.environment.services.some((value) => typeof value !== 'string' || !value)) throw new Error(`${file}.environment.services must be a string array`);
    const knownServices = new Set(config.environmentPolicy.serviceReadiness.map((service) => service.id));
    const unknownServices = item.environment.services.filter((serviceId) => !knownServices.has(serviceId));
    if (unknownServices.length) throw new Error(`${file} references services without verified shared readiness: ${unknownServices.join(', ')}`);
    if (!['snapshot-only', 'isolated-external'].includes(item.environment.sideEffects.mode)) throw new Error(`${file}.environment.sideEffects.mode is invalid`);
    for (const field of ['resourceIds', 'outsideSnapshotWrites', 'cleanupControlIds']) if (!Array.isArray(item.environment.sideEffects[field]) || item.environment.sideEffects[field].some((value) => typeof value !== 'string')) throw new Error(`${file}.environment.sideEffects.${field} must be a string array`);
    const knownControls = new Set(config.cleanupPolicy.controls.map((control) => control.id));
    const unknownControls = item.environment.sideEffects.cleanupControlIds.filter((controlId) => !knownControls.has(controlId));
    if (unknownControls.length) throw new Error(`${file} references unknown cleanup controls: ${unknownControls.join(', ')}`);
    if (item.environment.sideEffects.mode === 'isolated-external' && item.environment.sideEffects.cleanupControlIds.length === 0) throw new Error(`${file} requires cleanup controls for isolated external side effects`);
    return {
      id: taskId(config.system.id, item.id, config.promptLocale),
      system: config.system.id,
      caseId: item.id,
      promptLocale: config.promptLocale,
      track: item.track,
      baseRevision: item.baseRevision,
      publicCasePath: relativePathText(file),
      serviceIds: item.environment.services,
      sideEffects: item.environment.sideEffects
    };
  }).filter(Boolean);
  if (selectedIds) {
    const plannedIds = new Set(tasks.map((task) => task.caseId));
    const missing = [...selectedIds].filter((id) => !plannedIds.has(id));
    if (missing.length) throw new Error(`Execution intake references unknown case IDs: ${missing.join(', ')}`);
  }
  const now = new Date().toISOString();
  const outputLayout = {
    ...config.outputPolicy,
    evaluationRoot: relativePathText(evaluationRoot),
    roundRoot: relativePathText(path.join(evaluationRoot, config.outputPolicy.roundId)),
    runRoot: relativePathText(out)
  };
  const effectiveConfigForStorage = { ...config };
  delete effectiveConfigForStorage.conformance;
  const normalizedConfig = resolvedConfig.contract
    ? { ...sourceConfig, contract: { ...sourceConfig.contract, path: relativePathText(path.resolve(sourceConfig.contract.path)) }, output: outputLayout }
    : { ...effectiveConfigForStorage, repositoryRoot: relativePathText(repository), outputPolicy: outputLayout };
  const normalizedIntake = { ...intake, publicPackage: relativePathText(evalset), output: outputLayout };
  mkdirSync(out, { recursive: true });
  const plan = { schemaVersion: 3, createdAt: now, evalsetIdentity: { roundId: manifest.roundId, evalsetId: manifest.evalsetId, releaseId: manifest.releaseId, baseRevision: manifest.baseRevision, caseIdDigest: manifest.caseIdDigest }, executionContract: resolvedConfig.contract ? config.executionContract : null, repository: relativePathText(repository), publicPackage: relativePathText(evalset), track: manifest.track, outputLayout, config: { ...effectiveConfigForStorage, repositoryRoot: relativePathText(repository), outputPolicy: outputLayout }, tasks };
  const requiredServiceIds = new Set(tasks.flatMap((task) => task.serviceIds));
  const sharedServiceReadiness = config.environmentPolicy.serviceReadiness.filter((service) => requiredServiceIds.has(service.id));
  const todo = { schemaVersion: 4, createdAt: now, updatedAt: now, owner: 'evaluated-product-main-agent', runStatus: 'running', stopReason: null, serviceReadiness: sharedServiceReadiness, items: tasks.map((task) => ({ id: task.id, system: task.system, caseId: task.caseId, promptLocale: task.promptLocale, serviceIds: task.serviceIds, status: 'pending', blockReason: null, coordinator: null, currentAttempt: 0, attempts: [] })) };
  const normalizedRequest = request ? { ...request, contract: normalizedConfig.contract, output: outputLayout, publicPackage: relativePathText(evalset) } : { schemaVersion: 1, workflow: 'execute', system: normalizedIntake.system, contract: normalizedConfig.contract, output: outputLayout, publicPackage: relativePathText(evalset), tokenEvidence: normalizedIntake.tokenEvidence, activityTrace: normalizedConfig.activityTrace, environmentVerification: normalizedConfig.environmentVerification, runConstraints: normalizedIntake.runConstraints, environmentDecisions: normalizedIntake.environmentDecisions, confirmation: normalizedIntake.confirmation };
  writeJson(path.join(out, 'execution-state.json'), { schemaVersion: 1, request: normalizedRequest, plan, todo });
  if (requestPath && sameOrInside(out, requestPath) && path.basename(requestPath) === 'execution-request.json') removeTree(requestPath);
  process.stdout.write(`${relativePathText(path.join(out, 'execution-state.json'))}\n`);
}

function coordinateCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  if (state.todo.runStatus === 'protocol-error') throw new Error('Run terminated by a coordinator/worker/isolation protocol violation');
  const id = requireArg(args, 'task-id');
  const agentId = requireArg(args, 'agent');
  const sessionId = requireArg(args, 'session');
  if (args['context-inherited'] !== 'false') throw new Error('--context-inherited must be exactly false for a fresh case coordinator');
  const { todo } = findTask(state, id);
  if (todo.status !== 'pending' || todo.coordinator) throw new Error(`Cannot assign a case coordinator from ${todo.status}`);
  const active = state.todo.items.find((item) => ['coordinating', 'prepared', 'running', 'captured', 'rollback-verified', 'cleanup-verified', 'review-required'].includes(item.status));
  if (active) throw new Error(`Strict serial case coordination is blocked by ${active.id}`);
  const prior = state.todo.items.map((item) => item.coordinator).filter(Boolean);
  if (prior.some((item) => item.agentId === agentId)) throw new Error(`Case coordinator agent ID must be fresh per case: ${agentId}`);
  if (prior.some((item) => item.sessionId === sessionId)) throw new Error(`Case coordinator session ID must be fresh per case: ${sessionId}`);
  todo.coordinator = { agentId, sessionId, contextInherited: false, assignedAt: new Date().toISOString() };
  todo.status = 'coordinating';
  state.todo.updatedAt = new Date().toISOString();
  saveRunState(state);
  process.stdout.write(`${id}\n`);
}

function prepareCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  if (state.todo.runStatus === 'protocol-error') throw new Error('Run terminated by a child/subtask/isolation protocol violation');
  const stopped = state.todo.items.find((item) => ['rollback-error', 'cleanup-error'].includes(item.status) || ['rollback-error', 'cleanup-error'].includes(item.blockReason));
  if (stopped) throw new Error(`Run stopped because restoration or cleanup failed: ${stopped.id}`);
  const id = requireArg(args, 'task-id');
  const { task, todo } = findTask(state, id);
  const active = state.todo.items.find((item) => item.id !== id && ['coordinating', 'prepared', 'running', 'captured', 'rollback-verified', 'cleanup-verified', 'review-required'].includes(item.status));
  if (active) throw new Error(`Strict serial execution requires the current case to finish before another is prepared: ${active.id}`);
  if (!['coordinating', 'review-required'].includes(todo.status) || !todo.coordinator || todo.coordinator.contextInherited !== false) throw new Error(`Cannot prepare without the assigned fresh case coordinator from ${todo.status}`);
  const attempt = todo.attempts.length + 1;
  if (attempt > state.plan.config.maxAttempts) throw new Error('maxAttempts exceeded');
  const paths = attemptPaths(state.root, id, attempt, state.plan.repository);
  assertWindowsPathBudget(paths.frozenWorkspace, 40);
  if (existsSync(paths.frozenWorkspace) || existsSync(paths.attemptDir)) throw new Error('Attempt paths already exist');
  mkdirSync(paths.attemptDir, { recursive: true });
  mkdirSync(path.dirname(paths.frozenWorkspace), { recursive: true });
  const baselineSnapshotPath = path.join(state.root, 'project-baseline-snapshot');
  const baselineManifestPath = path.join(state.root, 'project-baseline-manifest.json');
  if (!existsSync(baselineSnapshotPath) || !lstatSync(baselineSnapshotPath).isDirectory() || !existsSync(baselineManifestPath)) throw new Error('Main coordinator must create the initial project snapshot before preparing the first case');
  const baselineManifest = readJson(baselineManifestPath);
  requireFields(baselineManifest, ['schemaVersion', 'kind', 'createdAt', 'owner', 'snapshotPath', 'exclusions', 'inventoryDigest', 'inventory'], 'project baseline manifest');
  if (baselineManifest.schemaVersion !== 3 || baselineManifest.kind !== 'codebase-eval-project-baseline' || baselineManifest.owner !== 'evaluated-product-main-agent' || baselineManifest.gitIgnorePolicy !== 'exclude-standard-ignored' || baselineManifest.gitMetadataPolicy !== 'restore-private-snapshot-verify-semantic-state' || canonicalPath(baselineManifest.snapshotPath) !== canonicalPath(baselineSnapshotPath)) throw new Error('Initial project snapshot identity is invalid');
  if (JSON.stringify(projectStateInventory(paths.workspace)) !== JSON.stringify(baselineManifest.inventory) || JSON.stringify(gitSemanticState(paths.workspace)) !== JSON.stringify(baselineManifest.gitSemanticState)) throw new Error('Live project does not match the saved initial project and semantic Git state; prior case-coordinator rollback is incomplete');
  const currentSelection = gitProjectSelection(paths.workspace);
  const currentInventory = inventory(paths.workspace, '', {}, currentSelection);
  const publicCase = readJson(task.publicCasePath);
  const publicTask = {
    id: publicCase.id,
    title: localized(publicCase.title, task.promptLocale, 'title'),
    prompt: localized(publicCase.prompt, task.promptLocale, 'prompt'),
    baseRevision: publicCase.baseRevision,
    track: publicCase.track,
    taskType: publicCase.taskType,
    promptLocale: task.promptLocale,
    deliverables: localizedList(publicCase.deliverables, task.promptLocale, 'deliverables'),
    allowedOperations: localizedList(publicCase.allowedOperations, task.promptLocale, 'allowedOperations'),
    forbiddenOperations: localizedList(publicCase.forbiddenOperations, task.promptLocale, 'forbiddenOperations'),
    environment: { services: publicCase.environment.services, requirementIds: publicCase.environment.requirementIds, notes: localized(publicCase.environment.notes, task.promptLocale, 'environment.notes') }
  };
  const protocolDir = path.join(paths.workspace, '.codebase-eval-worker');
  removeTree(protocolDir);
  mkdirSync(protocolDir, { recursive: true });
  const envelopePath = path.join(protocolDir, 'worker-envelope.json');
  const workerInstructions = 'Execute only the single English case in publicTask. Follow publicTask.allowedOperations and publicTask.forbiddenOperations exactly; when the case is read-only, do not modify source, run project tests or builds, or start an application or service. Record startedAt yourself immediately before beginning core case work and completedAt yourself immediately after finishing it; use exact second-precision UTC timestamps in YYYY-MM-DDTHH:mm:ssZ form. When serviceContext is non-empty, use its verified shared startup contract to build, start, probe, and stop only the services needed by this case; do not seek the full TODO. Work directly in the current project; do not read .codebase-eval, other evaluation cases, Chinese comparison text, or private evaluator material, and do not install or change dependencies. Record only material observable actions under activityContract, classify each action by its primary purpose, and never relabel a real command as search or another type. Every command or test event must include status and exitCode inline; separate command/test log files are needed only when material output must be retained. Provide only bounded representative retrieval evidence under resultContract; the Runner derives tools, family counts, mode, and confidence without worker-supplied guesses. Do not reproduce a full tool transcript or chain-of-thought. Create or replace final-response.md exactly once with only this case\'s English answer; never append, concatenate, replay, or copy host/chat output or any earlier case response into it. Every repository location presented as evidence in the final response must use its complete repository-root-relative path, optionally followed by a line range or symbol. Record those same displayed locations in evidence.citedRepositoryLocations; do not put merely inspected but undisclosed locations there. Reference final-response.md from resultPath. When done, write resultPath according to resultContract. Do not snapshot, roll back, score, or create an evaluation report; freeze, capture, rollback, and cleanup belong to the case coordinator.';
  if (!Array.isArray(state.todo.serviceReadiness)) throw new Error('Shared TODO is missing serviceReadiness');
  const serviceContext = task.serviceIds.map((serviceId) => {
    const expected = state.plan.config.environmentPolicy.serviceReadiness.find((service) => service.id === serviceId);
    const shared = state.todo.serviceReadiness.find((service) => service.id === serviceId);
    if (!expected || !shared || JSON.stringify(expected) !== JSON.stringify(shared)) throw new Error(`Shared TODO service readiness was altered or is missing: ${serviceId}`);
    return { ...shared, notes: localized(shared.notes, task.promptLocale, `service ${serviceId} notes`) };
  });
  writeJson(envelopePath, {
    schemaVersion: 3,
    taskId: id,
    attempt,
    system: task.system,
    caseId: task.caseId,
    promptLocale: task.promptLocale,
    timeoutMs: state.plan.config.executionTimeoutMs,
    environmentBaselineId: state.plan.config.environmentPolicy.baselineId,
    dependencyMutation: 'forbidden',
    workspace: '.',
    resultPath: '.codebase-eval-worker/worker-result.json',
    instructions: workerInstructions,
    resultContract: {
      schemaVersion: 3,
      requiredFields: ['schemaVersion', 'taskId', 'attempt', 'system', 'caseId', 'promptLocale', 'child', 'startedAt', 'completedAt', 'status', 'finalResponsePath', 'logPaths', 'evidence', 'tokens', 'tokenEvidence', 'durationMs', 'unfinished', 'environmentBaselineId', 'protocolViolations'],
      allowedStatuses: ['completed', 'unfinished', 'infra-error', 'protocol-error'],
      childContract: { contextInherited: false, requireAgentId: true, requireSessionId: true },
      timestampContract: { owner: 'worker', format: 'YYYY-MM-DDTHH:mm:ssZ', precision: 'second', preserveVerbatimInExecutionResult: true, durationConsistencyPolicy: 'shorter-of-timestamp-interval-and-worker-duration' },
      finalResponseFormat: 'markdown',
      finalResponsePath: 'final-response.md',
      artifactPaths: 'relative-to-live-project',
      scoringFields: 'forbidden',
      retrievalEvidence: {
        required: true,
        allowedSources: [...retrievalSources],
        allowedTools: [...retrievalSummaryTools],
        allowedRoles: [...retrievalRoles],
        maximumActions: maximumRetrievalKeyActions,
        derivedByRunner: ['observedTools', 'familyDiscoveryCounts', 'observedMode', 'confidence'],
        fullTraceRetention: 'forbidden'
      }
    },
    activityContract: {
      path: '.codebase-eval-worker/activity-log.jsonl',
      format: 'json-lines',
      requiredFields: ['at', 'type', 'target', 'outcome'],
      allowedTypes: ['search', 'read', 'edit', 'command', 'test', 'deliverable'],
      typeSemantics: {
        search: 'repository discovery regardless of whether the host used a shell or a dedicated search tool',
        read: 'context inspection without discovery',
        edit: 'project content modification',
        command: 'state-changing or operational command not better classified as search, read, or test',
        test: 'test or verification command',
        deliverable: 'creation of a requested answer or artifact'
      },
      commandAndTestFields: { required: ['status', 'exitCode'], allowedStatuses: [...commandStatuses], exitCode: 'integer-or-null' },
      captureMode: 'key-events-only',
      maximumEvents: maximumActivityEvents,
      observableFactsOnly: true,
      chainOfThought: 'forbidden',
      fullToolTrace: 'forbidden'
    },
    serviceContext,
    publicTask
  });
  mkdirSync(paths.internalDir, { recursive: true });
  writeJson(path.join(paths.internalDir, 'baseline-inventory.json'), currentInventory);
  const preparedAt = new Date().toISOString();
  todo.status = 'prepared';
  todo.blockReason = null;
  todo.currentAttempt = attempt;
  todo.attempts.push({ attempt, status: 'prepared', agentId: null, sessionId: null, preparedAt, executionResultPath: relativePathText(paths.record), liveProject: relativePathText(paths.workspace), completedStateSnapshot: relativePathText(paths.frozenWorkspace) });
  state.todo.updatedAt = new Date().toISOString();
  saveRunState(state);
  process.stdout.write(`${relativePathText(envelopePath)}\n`);
}

function assignCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  if (state.todo.runStatus === 'protocol-error') throw new Error('Run terminated by a child/subtask/isolation protocol violation');
  const id = requireArg(args, 'task-id');
  const agent = requireArg(args, 'agent');
  const session = requireArg(args, 'session');
  const { task, todo } = findTask(state, id);
  if (todo.status !== 'prepared') throw new Error('Task must be prepared before assignment');
  const otherActive = state.todo.items.find((item) => item.id !== id && ['coordinating', 'prepared', 'running', 'captured', 'rollback-verified', 'cleanup-verified', 'review-required'].includes(item.status));
  if (otherActive) throw new Error(`Strict serial execution is blocked by ${otherActive.id}`);
  const running = state.todo.items.filter((item) => item.status === 'running').length;
  if (running >= state.plan.config.concurrency.workersPerCase) throw new Error(`Worker concurrency limit reached: ${state.plan.config.concurrency.workersPerCase}`);
  const priorAttempts = state.todo.items.flatMap((item) => item.attempts || []);
  if (priorAttempts.some((item) => item.agentId === agent)) throw new Error(`Child agent ID must be fresh per attempt: ${agent}`);
  if (priorAttempts.some((item) => item.sessionId === session)) throw new Error(`Child session ID must be fresh per attempt: ${session}`);
  const attempt = todo.attempts.find((item) => item.attempt === todo.currentAttempt);
  attempt.agentId = agent;
  attempt.sessionId = session;
  attempt.status = 'running';
  attempt.assignedAt = new Date().toISOString();
  todo.status = 'running';
  state.todo.updatedAt = new Date().toISOString();
  saveRunState(state);
  process.stdout.write(`${todo.currentAttempt}\n`);
}

function copyArtifact(source, attemptDir, name) {
  const target = path.join(attemptDir, name);
  cpSync(source, target, { recursive: false, dereference: true, errorOnExist: true, force: false });
  return { path: name, sha256: sha256(target), size: statSync(target).size };
}

function findAppendedPriorFinalResponse(runRoot, currentAttemptDir, currentResponseFile) {
  const artifactsRoot = path.join(runRoot, 'artifacts');
  if (!existsSync(artifactsRoot)) return null;
  const current = readFileSync(currentResponseFile, 'utf8').trimEnd();
  for (const taskEntry of readdirSync(artifactsRoot, { withFileTypes: true })) {
    if (!taskEntry.isDirectory()) continue;
    const taskRoot = path.join(artifactsRoot, taskEntry.name);
    for (const attemptEntry of readdirSync(taskRoot, { withFileTypes: true })) {
      if (!attemptEntry.isDirectory()) continue;
      const priorAttemptDir = path.join(taskRoot, attemptEntry.name);
      if (canonicalPath(priorAttemptDir) === canonicalPath(currentAttemptDir)) continue;
      const priorFile = path.join(priorAttemptDir, 'final-response.md');
      if (!existsSync(priorFile) || !lstatSync(priorFile).isFile()) continue;
      const prior = readFileSync(priorFile, 'utf8').trim();
      if (prior.length < 64 || current.length <= prior.length || !current.endsWith(prior)) continue;
      const prefix = current.slice(0, current.length - prior.length).trim();
      if (prefix) return relativePathText(priorFile);
    }
  }
  return null;
}

function repositoryPathFromLocation(location, workspace, baselineWorkspace) {
  if (typeof location !== 'string' || !location || path.isAbsolute(location) || location.split(/[\\/]/).includes('..')) return null;
  const normalized = location.split(path.sep).join('/');
  const candidates = [normalized];
  for (let index = normalized.lastIndexOf(':'); index > 0; index = normalized.lastIndexOf(':', index - 1)) candidates.push(normalized.slice(0, index));
  for (const candidate of candidates) {
    if (!candidate || path.isAbsolute(candidate) || candidate.split('/').includes('..')) continue;
    const live = path.join(workspace, ...candidate.split('/'));
    const baseline = path.join(baselineWorkspace, ...candidate.split('/'));
    if ((existsSync(live) && lstatSync(live).isFile()) || (existsSync(baseline) && lstatSync(baseline).isFile())) return candidate;
  }
  return null;
}

function validateActivityLog(file) {
  const allowedTypes = new Set(['search', 'read', 'edit', 'command', 'test', 'deliverable']);
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error('activity log must contain at least one observable event');
  if (lines.length > maximumActivityEvents) throw new Error(`activity log exceeds the ${maximumActivityEvents}-event key-summary limit`);
  const typeCounts = {};
  for (const [index, line] of lines.entries()) {
    let event;
    try { event = JSON.parse(line); } catch { throw new Error(`activity log line ${index + 1} is invalid JSON`); }
    requireFields(event, ['at', 'type', 'target', 'outcome'], `activity log line ${index + 1}`);
    if (!allowedTypes.has(event.type)) throw new Error(`activity log line ${index + 1} has invalid type`);
    if (event.type === 'command' || event.type === 'test') {
      requireFields(event, ['status'], `activity log line ${index + 1}`);
      if (!Object.hasOwn(event, 'exitCode')) throw new Error(`activity log line ${index + 1} is missing exitCode`);
      if (!commandStatuses.has(event.status) || (event.exitCode !== null && !Number.isInteger(event.exitCode))) throw new Error(`activity log line ${index + 1} has invalid command/test status evidence`);
      if (event.status === 'succeeded' && event.exitCode !== 0) throw new Error(`activity log line ${index + 1} succeeded without exitCode 0`);
      if (['timed-out', 'terminated'].includes(event.status) && event.exitCode !== null) throw new Error(`activity log line ${index + 1} must use null exitCode when timed out or terminated`);
    } else if (Object.hasOwn(event, 'status') || Object.hasOwn(event, 'exitCode')) throw new Error(`activity log line ${index + 1} uses command/test fields on a ${event.type} event`);
    typeCounts[event.type] = (typeCounts[event.type] || 0) + 1;
    for (const forbidden of ['reasoning', 'thought', 'chainOfThought', 'chain_of_thought']) if (Object.hasOwn(event, forbidden)) throw new Error(`activity log line ${index + 1} contains forbidden reasoning field`);
  }
  return { count: lines.length, typeCounts };
}

function normalizeRetrievalEvidence(value) {
  requireFields(value, ['source', 'actions', 'gaps'], 'worker-result.evidence.retrievalEvidence');
  if (!retrievalSources.has(value.source)) throw new Error('retrievalEvidence.source is invalid');
  if (!Array.isArray(value.actions) || value.actions.length > maximumRetrievalKeyActions) throw new Error(`retrievalEvidence.actions must contain at most ${maximumRetrievalKeyActions} actions`);
  if (!Array.isArray(value.gaps) || value.gaps.length > maximumRetrievalKeyActions || value.gaps.some((item) => typeof item !== 'string')) throw new Error('retrievalEvidence.gaps is invalid');
  const counts = { lexical: 0, index: 0, unknown: 0 };
  const observedTools = [];
  for (const [index, action] of value.actions.entries()) {
    requireFields(action, ['tool', 'role', 'target', 'outcome'], `retrievalEvidence.actions[${index}]`);
    if (!retrievalSummaryTools.has(action.tool) || !retrievalRoles.has(action.role) || typeof action.target !== 'string' || typeof action.outcome !== 'string') throw new Error(`retrievalEvidence.actions[${index}] is invalid`);
    for (const forbidden of ['reasoning', 'thought', 'chainOfThought', 'chain_of_thought']) if (Object.hasOwn(action, forbidden)) throw new Error(`retrievalEvidence.actions[${index}] contains forbidden reasoning`);
    if (action.tool !== 'unknown' && !observedTools.includes(action.tool)) observedTools.push(action.tool);
    if (action.role === 'discovery') {
      if (lexicalDiscoveryTools.has(action.tool)) counts.lexical += 1;
      else if (indexDiscoveryTools.has(action.tool)) counts.index += 1;
      else counts.unknown += 1;
    }
  }
  if (value.source === 'unavailable' && value.actions.length) throw new Error('Unavailable retrieval evidence cannot contain actions');
  const observedMode = counts.lexical && counts.index ? 'hybrid' : counts.lexical ? 'grep-glob-read' : counts.index ? 'codebase-index' : 'unknown';
  const confidence = value.source === 'unavailable' ? 'unknown' : value.source === 'worker-journal' ? 'low' : value.actions.length === 0 || value.gaps.length ? 'medium' : 'high';
  return {
    source: value.source,
    observedTools,
    familyDiscoveryCounts: counts,
    observedMode,
    keyActions: value.actions.map(({ tool, target, outcome }) => ({ tool, target, outcome })),
    confidence,
    gaps: value.gaps
  };
}

function captureCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  const id = requireArg(args, 'task-id');
  const attemptNumber = Number(requireArg(args, 'attempt'));
  const { task, todo } = findTask(state, id);
  const attempt = todo.attempts.find((item) => item.attempt === attemptNumber);
  if (!attempt || attempt.status !== 'running') throw new Error('Attempt is not running');
  const paths = attemptPaths(state.root, id, attemptNumber, state.plan.repository);
  if (!existsSync(paths.frozenWorkspace) || !lstatSync(paths.frozenWorkspace).isDirectory()) throw new Error('Assigned case coordinator must create the completed-state snapshot before capture');
  const sourceResult = realpathSync(path.resolve(requireArg(args, 'worker-result')));
  if (!sourceResult.startsWith(`${realpathSync(paths.workspace)}${path.sep}`)) throw new Error('worker-result must come from the attempt workspace');
  const result = readJson(sourceResult);
  requireFields(result, ['schemaVersion', 'taskId', 'attempt', 'system', 'caseId', 'promptLocale', 'child', 'startedAt', 'completedAt', 'status', 'finalResponsePath', 'logPaths', 'evidence', 'tokenEvidence', 'durationMs', 'unfinished', 'environmentBaselineId', 'protocolViolations'], 'worker-result');
  if (result.schemaVersion !== 3) throw new Error('worker-result schemaVersion must be 3');
  if (!Object.hasOwn(result, 'tokens')) throw new Error('worker-result is missing tokens');
  if (result.taskId !== id || result.attempt !== attemptNumber || result.system !== task.system || result.caseId !== task.caseId || result.promptLocale !== task.promptLocale) throw new Error('worker-result identity mismatch');
  if (!rawStatuses.has(result.status)) throw new Error('worker-result status is invalid');
  requireFields(result.child, ['agentId', 'sessionId', 'contextInherited'], 'worker-result.child');
  if (result.child.agentId !== attempt.agentId || result.child.sessionId !== attempt.sessionId || result.child.contextInherited !== false) {
    stopRunForProtocolViolation(state, 'Fresh child identity or no-inherited-context evidence mismatch', id);
    throw new Error('Fresh child identity/context evidence mismatch; the entire run is terminated');
  }
  if (!secondPrecisionUtcPattern.test(result.startedAt) || !secondPrecisionUtcPattern.test(result.completedAt)) throw new Error('Worker timestamps must use exact second-precision UTC form YYYY-MM-DDTHH:mm:ssZ');
  const timestampDurationMs = Date.parse(result.completedAt) - Date.parse(result.startedAt);
  if (!Number.isFinite(timestampDurationMs) || timestampDurationMs < 0) throw new Error('Worker completedAt must not precede startedAt');
  const tokensAvailable = state.plan.config.tokenEvidence.availability === 'available';
  if ((tokensAvailable && (!Number.isFinite(result.tokens) || result.tokens < 0)) || (!tokensAvailable && result.tokens !== null) || !Number.isFinite(result.durationMs) || result.durationMs < 0) throw new Error('worker-result metrics are invalid');
  const selectedDurationMs = Math.min(result.durationMs, timestampDurationMs);
  requireFields(result.tokenEvidence, ['availability', 'source', 'comparable'], 'worker-result.tokenEvidence');
  if (result.tokenEvidence.availability !== state.plan.config.tokenEvidence.availability || result.tokenEvidence.source !== state.plan.config.tokenEvidence.source || (!tokensAvailable && result.tokenEvidence.comparable !== false)) throw new Error('worker-result token-evidence metadata mismatch');
  if (selectedDurationMs > state.plan.config.executionTimeoutMs && result.unfinished !== true) throw new Error('Over-time result must be unfinished');
  if (result.environmentBaselineId !== state.plan.config.environmentPolicy.baselineId) throw new Error('Environment baseline mismatch');
  if (!Array.isArray(result.protocolViolations) || !Array.isArray(result.logPaths)) throw new Error('worker-result lists are invalid');
  if (result.protocolViolations.length && result.status !== 'protocol-error') throw new Error('Protocol violations require protocol-error status');

  requireFields(result.evidence, ['activityLogPath', 'activityLogSource', 'commandLogPaths', 'testLogPaths', 'deliverablePaths', 'inspectedRepositoryLocations', 'citedRepositoryLocations', 'retrievalEvidence', 'gaps'], 'worker-result.evidence');
  if (result.finalResponsePath !== 'final-response.md') throw new Error('worker-result.finalResponsePath must be exactly final-response.md');
  if (result.evidence.activityLogPath !== '.codebase-eval-worker/activity-log.jsonl') throw new Error('worker-result.evidence.activityLogPath must be exactly .codebase-eval-worker/activity-log.jsonl');
  if (!['host-native', 'worker-journal'].includes(result.evidence.activityLogSource)) throw new Error('activityLogSource must be host-native or worker-journal');
  for (const field of ['commandLogPaths', 'testLogPaths', 'deliverablePaths', 'inspectedRepositoryLocations', 'citedRepositoryLocations', 'gaps']) if (!Array.isArray(result.evidence[field])) throw new Error(`worker-result.evidence.${field} must be an array`);
  for (const field of ['inspectedRepositoryLocations', 'citedRepositoryLocations', 'gaps']) if (result.evidence[field].some((item) => typeof item !== 'string')) throw new Error(`worker-result.evidence.${field} entries must be strings`);
  const retrievalSummary = normalizeRetrievalEvidence(result.evidence.retrievalEvidence);
  const finalResponseSource = within(paths.workspace, path.join(paths.workspace, safeRelative(result.finalResponsePath, 'finalResponsePath')), 'final response');
  if (!existsSync(finalResponseSource) || !lstatSync(finalResponseSource).isFile()) throw new Error(`Missing worker artifact: ${result.finalResponsePath}`);
  const finalResponseText = readFileSync(finalResponseSource, 'utf8');
  const baselineWorkspace = path.join(state.root, 'project-baseline-snapshot');
  for (const location of result.evidence.citedRepositoryLocations) {
    const repositoryPath = repositoryPathFromLocation(location, paths.workspace, baselineWorkspace);
    if (!repositoryPath) throw new Error(`citedRepositoryLocations entry is not a complete repository-root-relative file location: ${location}`);
    if (!finalResponseText.includes(repositoryPath)) throw new Error(`citedRepositoryLocations entry must appear verbatim in final-response.md: ${repositoryPath}`);
  }

  const descriptors = [
    { kind: 'final-response', relative: safeRelative(result.finalResponsePath, 'finalResponsePath') },
    ...result.logPaths.map((item) => ({ kind: 'session-log', relative: safeRelative(item, 'log path') })),
    { kind: 'activity-log', relative: safeRelative(result.evidence.activityLogPath, 'activityLogPath') },
    ...result.evidence.commandLogPaths.map((item) => ({ kind: 'command-log', relative: safeRelative(item, 'command log path') })),
    ...result.evidence.testLogPaths.map((item) => ({ kind: 'test-log', relative: safeRelative(item, 'test log path') })),
    ...result.evidence.deliverablePaths.map((item) => ({ kind: 'deliverable', relative: safeRelative(item, 'deliverable path') }))
  ];
  const uniqueDescriptors = [];
  const seenDescriptorPaths = new Set();
  for (const descriptor of descriptors) {
    if (seenDescriptorPaths.has(descriptor.relative)) continue;
    seenDescriptorPaths.add(descriptor.relative);
    uniqueDescriptors.push(descriptor);
  }
  let activitySummary = { count: 0, typeCounts: {} };
  const sources = [];
  for (const [index, descriptor] of uniqueDescriptors.entries()) {
    const source = within(paths.workspace, path.join(paths.workspace, descriptor.relative), 'worker artifact');
    if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`Missing worker artifact: ${descriptor.relative}`);
    if (descriptor.kind === 'activity-log') activitySummary = validateActivityLog(source);
    if (descriptor.kind === 'final-response') {
      const appendedPriorResponse = findAppendedPriorFinalResponse(state.root, paths.attemptDir, source);
      if (appendedPriorResponse) {
        stopRunForProtocolViolation(state, `Final response contains a complete prior-case response as an appended suffix: ${appendedPriorResponse}`, id);
        throw new Error('Cross-case final-response contamination detected; the entire run is terminated');
      }
    }
    const extension = path.extname(descriptor.relative) || '.txt';
    const name = descriptor.kind === 'final-response' ? 'final-response.md' : descriptor.kind === 'activity-log' ? 'activity-log.jsonl' : `evidence-${index}-${descriptor.kind}${extension}`;
    sources.push({ source, name, kind: descriptor.kind, originalPath: descriptor.relative });
  }
  const baseline = readJson(path.join(paths.internalDir, 'baseline-inventory.json'));
  const completedSelection = gitProjectSelection(paths.workspace);
  const completedInventory = inventory(paths.workspace, '', {}, completedSelection);
  const frozenInventory = inventory(paths.frozenWorkspace, '', {}, completedSelection);
  if (JSON.stringify(completedInventory) !== JSON.stringify(frozenInventory)) throw new Error('Completed-state snapshot does not match the live project returned by the worker');
  const snapshotDiff = diffInventory(baseline, completedInventory);
  const staging = path.join(paths.internalDir, 'capture-staging');
  removeTree(staging);
  mkdirSync(staging, { recursive: true });
  const committed = [];
  try {
    const artifacts = sources.map((item) => ({ ...copyArtifact(item.source, staging, item.name), kind: item.kind, originalPath: item.originalPath }));
    const executionResult = {
      schemaVersion: 1,
      taskId: id,
      attempt: attemptNumber,
      system: task.system,
      caseId: task.caseId,
      promptLocale: task.promptLocale,
      coordinator: todo.coordinator,
      child: result.child,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.status,
      tokens: result.tokens,
      tokenEvidence: result.tokenEvidence,
      durationMs: selectedDurationMs,
      durationEvidence: { workerReportedDurationMs: result.durationMs, timestampDerivedDurationMs: timestampDurationMs, selectionPolicy: 'shorter' },
      unfinished: result.unfinished,
      protocolViolations: result.protocolViolations,
      evidence: {
        activityLogSource: result.evidence.activityLogSource,
        activityEventCount: activitySummary.count,
        activityTypeCounts: activitySummary.typeCounts,
        inspectedRepositoryLocations: result.evidence.inspectedRepositoryLocations,
        citedRepositoryLocations: result.evidence.citedRepositoryLocations,
        retrievalSummary,
        gaps: result.evidence.gaps,
        artifacts: artifacts.filter((item) => item.kind !== 'final-response')
      },
      snapshotDiff,
      workspace: relativePathText(paths.frozenWorkspace)
    };
    writeJson(path.join(staging, 'completed-inventory.json'), completedInventory);
    writeJson(path.join(staging, 'completed-selection.json'), serializeSelection(completedSelection));
    writeJson(path.join(staging, 'execution-result.json'), executionResult);
    const moves = [
      ...artifacts.map((item) => [path.join(staging, item.path), path.join(paths.attemptDir, item.path)]),
      [path.join(staging, 'completed-inventory.json'), path.join(paths.internalDir, 'completed-inventory.json')],
      [path.join(staging, 'completed-selection.json'), path.join(paths.internalDir, 'completed-selection.json')],
      [path.join(staging, 'execution-result.json'), paths.record]
    ];
    for (const [source, target] of moves) {
      if (existsSync(target)) throw new Error(`Capture target already exists: ${relativePathText(target)}`);
      renameSync(source, target);
      committed.push(target);
    }
  } catch (error) {
    for (const target of committed.reverse()) removeTree(target);
    removeTree(staging);
    throw error;
  }
  removeTree(staging);
  try {
    attempt.status = 'captured';
    todo.status = 'captured';
    state.todo.updatedAt = new Date().toISOString();
    saveRunState(state);
  } catch (error) {
    for (const target of committed.reverse()) removeTree(target);
    attempt.status = 'running';
    todo.status = 'running';
    throw error;
  }
  if (result.status === 'protocol-error' || result.protocolViolations.length) stopRunForProtocolViolation(state, result.protocolViolations.join('; ') || 'Worker reported a protocol error', id, true);
  process.stdout.write(`${relativePathText(paths.record)}\n`);
}

function rollbackCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  const id = requireArg(args, 'task-id');
  const attemptNumber = Number(requireArg(args, 'attempt'));
  const { todo } = findTask(state, id);
  const attempt = todo.attempts.find((item) => item.attempt === attemptNumber);
  if (!attempt || attempt.status !== 'captured' || todo.status !== 'captured') throw new Error('Attempt must be captured before rollback registration');
  const paths = attemptPaths(state.root, id, attemptNumber, state.plan.repository);
  const source = realpathSync(path.resolve(requireArg(args, 'rollback-result')));
  if (!sameOrInside(paths.attemptDir, source) || source === paths.attemptDir || !lstatSync(source).isFile()) throw new Error('rollback-result must be a file under the attempt artifact directory');
  const rollback = readJson(source);
  requireFields(rollback, ['schemaVersion', 'taskId', 'attempt', 'status', 'completedAt', 'owner', 'completedStateSnapshotPath', 'restoreEvidencePath', 'baselineRestored', 'protocolDirectoryRemoved', 'evidencePaths', 'dirtyDataRemaining'], 'rollback-result');
  if (rollback.taskId !== id || rollback.attempt !== attemptNumber || rollback.owner !== 'evaluated-product-case-coordinator') throw new Error('rollback-result identity or owner mismatch');
  if (!rollbackStatuses.has(rollback.status)) throw new Error('rollback-result status is invalid');
  if (!Array.isArray(rollback.evidencePaths) || rollback.evidencePaths.some((item) => typeof item !== 'string') || !Array.isArray(rollback.dirtyDataRemaining) || rollback.dirtyDataRemaining.some((item) => typeof item !== 'string')) throw new Error('rollback-result evidencePaths and dirtyDataRemaining must be string arrays');
  if (canonicalPath(rollback.completedStateSnapshotPath) !== canonicalPath(paths.frozenWorkspace)) throw new Error('rollback-result completedStateSnapshotPath mismatch');
  const baselineManifest = readJson(path.join(state.root, 'project-baseline-manifest.json'));
  const restoredInventory = projectStateInventory(paths.workspace);
  const completedInventory = readJson(path.join(paths.internalDir, 'completed-inventory.json'));
  const completedSelection = deserializeSelection(readJson(path.join(paths.internalDir, 'completed-selection.json')));
  const frozenInventory = inventory(paths.frozenWorkspace, '', {}, completedSelection);
  const baselineMatches = JSON.stringify(restoredInventory) === JSON.stringify(baselineManifest.inventory);
  const gitStateMatches = JSON.stringify(gitSemanticState(paths.workspace)) === JSON.stringify(baselineManifest.gitSemanticState);
  const snapshotMatches = JSON.stringify(frozenInventory) === JSON.stringify(completedInventory);
  const protocolRemoved = !existsSync(path.join(paths.workspace, '.codebase-eval-worker'));
  const restoreEvidenceRelative = safeRelative(rollback.restoreEvidencePath, 'rollback-result.restoreEvidencePath');
  const restoreEvidenceFile = within(paths.attemptDir, path.join(paths.attemptDir, restoreEvidenceRelative), 'project restore evidence');
  if (!existsSync(restoreEvidenceFile) || !lstatSync(restoreEvidenceFile).isFile()) throw new Error('Missing case-coordinator project restore evidence');
  const restoreEvidence = readJson(restoreEvidenceFile);
  if (restoreEvidence.kind !== 'codebase-eval-project-restore-evidence' || restoreEvidence.owner !== 'evaluated-product-case-coordinator' || restoreEvidence.expectedInventoryDigest !== baselineManifest.inventoryDigest) throw new Error('Case-coordinator project restore evidence identity is invalid');
  const restoreEvidenceValid = restoreEvidence.restoredExactly === true && restoreEvidence.gitRestoredSemantically === true;
  const requireClean = rollback.status === 'clean';
  if (requireClean && (rollback.baselineRestored !== true || rollback.protocolDirectoryRemoved !== true || rollback.dirtyDataRemaining.length || !baselineMatches || !gitStateMatches || !snapshotMatches || !protocolRemoved || !restoreEvidenceValid)) throw new Error('Clean rollback requires verified baseline and semantic Git restoration, preserved completed state, protocol removal, and no dirty data');
  if (!requireClean && rollback.baselineRestored === true && rollback.protocolDirectoryRemoved === true && rollback.dirtyDataRemaining.length === 0 && baselineMatches && gitStateMatches && snapshotMatches && protocolRemoved && restoreEvidenceValid) throw new Error('rollback-error must describe or exhibit a restoration failure');
  const evidence = rollback.evidencePaths.map((relative, index) => {
    const safe = safeRelative(relative, `rollback-result.evidencePaths[${index}]`);
    const file = within(paths.attemptDir, path.join(paths.attemptDir, safe), 'rollback evidence');
    if (!existsSync(file) || !lstatSync(file).isFile()) throw new Error(`Missing rollback evidence: ${safe}`);
    return { path: safe.split(path.sep).join('/'), sha256: sha256(file), size: statSync(file).size };
  });
  removeTree(source);
  removeTree(restoreEvidenceFile);
  for (const item of evidence) removeTree(path.join(paths.attemptDir, item.path));
  removeTree(paths.internalDir);
  attempt.rollbackStatus = rollback.status;
  attempt.status = requireClean ? 'rollback-verified' : 'rollback-error';
  todo.status = attempt.status;
  todo.blockReason = requireClean ? null : 'rollback-error';
  state.todo.updatedAt = new Date().toISOString();
  saveRunState(state);
  process.stdout.write(`${rollback.status}\n`);
}

function protocolViolationCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  const reason = requireArg(args, 'reason');
  const record = stopRunForProtocolViolation(state, reason, args['task-id'] || null);
  process.stdout.write(`${relativePathText(path.join(state.root, 'protocol-violation.json'))}\n`);
  return record;
}

function validateCleanupResources(items, label, requireClean) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
  for (const [index, item] of items.entries()) {
    requireFields(item, ['id', 'status'], `${label}[${index}]`);
    if (typeof item.id !== 'string' || typeof item.status !== 'string') throw new Error(`${label}[${index}] identity and status must be strings`);
    if (requireClean && !cleanResourceStatuses.has(item.status)) throw new Error(`${label}[${index}] is not clean: ${item.status}`);
  }
}

function cleanupCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  const id = requireArg(args, 'task-id');
  const attemptNumber = Number(requireArg(args, 'attempt'));
  const { task, todo } = findTask(state, id);
  const attempt = todo.attempts.find((item) => item.attempt === attemptNumber);
  if (!attempt || attempt.status !== 'rollback-verified' || todo.status !== 'rollback-verified') throw new Error('Attempt rollback must be verified before cleanup registration');
  const paths = attemptPaths(state.root, id, attemptNumber, state.plan.repository);
  const source = realpathSync(path.resolve(requireArg(args, 'cleanup-result')));
  if (!sameOrInside(paths.attemptDir, source) || source === paths.attemptDir) throw new Error('cleanup-result must be a file under the attempt artifact directory');
  if (!lstatSync(source).isFile()) throw new Error('cleanup-result must be a file');
  const cleanup = readJson(source);
  requireFields(cleanup, ['schemaVersion', 'taskId', 'attempt', 'status', 'completedAt', 'owner', 'workspaceEvidencePreserved', 'attemptOwnedProcesses', 'externalResources', 'outsideProjectPaths', 'cacheAndTempPaths', 'environmentRestored', 'evidencePaths', 'dirtyDataRemaining', 'protocolViolations'], 'cleanup-result');
  if (cleanup.taskId !== id || cleanup.attempt !== attemptNumber || cleanup.owner !== 'evaluated-product-case-coordinator') throw new Error('cleanup-result identity or owner mismatch');
  if (!cleanupStatuses.has(cleanup.status)) throw new Error('cleanup-result status is invalid');
  if (cleanup.workspaceEvidencePreserved !== true) throw new Error('Frozen workspace evidence must be preserved');
  if (!Array.isArray(cleanup.dirtyDataRemaining) || cleanup.dirtyDataRemaining.some((item) => typeof item !== 'string') || !Array.isArray(cleanup.protocolViolations) || cleanup.protocolViolations.some((item) => typeof item !== 'string')) throw new Error('cleanup-result dirtyDataRemaining and protocolViolations must be string arrays');
  const requireClean = cleanup.status === 'clean';
  for (const field of ['attemptOwnedProcesses', 'externalResources', 'outsideProjectPaths', 'cacheAndTempPaths']) validateCleanupResources(cleanup[field], `cleanup-result.${field}`, requireClean);
  const externalIds = new Set(cleanup.externalResources.map((item) => item.id));
  const outsidePathIds = new Set(cleanup.outsideProjectPaths.map((item) => item.id));
  const missingExternal = task.sideEffects.resourceIds.filter((item) => !externalIds.has(item));
  const missingPaths = task.sideEffects.outsideSnapshotWrites.filter((item) => !outsidePathIds.has(item));
  if (missingExternal.length || missingPaths.length) throw new Error(`cleanup-result omits declared side effects: ${[...missingExternal, ...missingPaths].join(', ')}`);
  if (!Array.isArray(cleanup.evidencePaths) || cleanup.evidencePaths.some((item) => typeof item !== 'string')) throw new Error('cleanup-result.evidencePaths must be a string array');
  const evidence = cleanup.evidencePaths.map((relative, index) => {
    const safe = safeRelative(relative, `cleanup-result.evidencePaths[${index}]`);
    const file = within(paths.attemptDir, path.join(paths.attemptDir, safe), 'cleanup evidence');
    if (!existsSync(file) || !lstatSync(file).isFile()) throw new Error(`Missing cleanup evidence: ${safe}`);
    return { path: safe.split(path.sep).join('/'), sha256: sha256(file), size: statSync(file).size };
  });
  if (requireClean && (cleanup.environmentRestored !== true || cleanup.dirtyDataRemaining.length !== 0)) throw new Error('Clean status requires a restored environment and no remaining dirty data');
  if (!requireClean && cleanup.environmentRestored === true && cleanup.dirtyDataRemaining.length === 0) throw new Error('cleanup-error must describe remaining dirty data or an unrestored environment');
  removeTree(source);
  for (const item of evidence) removeTree(path.join(paths.attemptDir, item.path));
  attempt.cleanupStatus = cleanup.status;
  attempt.cleanupCompletedAt = cleanup.completedAt;
  attempt.status = requireClean ? 'cleanup-verified' : 'cleanup-error';
  todo.status = attempt.status;
  todo.blockReason = requireClean ? null : 'cleanup-error';
  state.todo.updatedAt = new Date().toISOString();
  saveRunState(state);
  process.stdout.write(`${cleanup.status}\n`);
}

function syncCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  for (const todo of state.todo.items) {
    if (!['cleanup-verified', 'cleanup-error', 'rollback-error'].includes(todo.status)) continue;
    const attempt = todo.attempts.find((item) => item.attempt === todo.currentAttempt);
    const result = readJson(attempt.executionResultPath);
    if (todo.status === 'rollback-error') {
      attempt.status = 'rollback-error';
      todo.status = 'blocked';
      todo.blockReason = 'rollback-error';
      continue;
    }
    attempt.completedAt = attempt.cleanupCompletedAt;
    attempt.rawStatus = result.status;
    if (attempt.cleanupStatus === 'cleanup-error') {
      attempt.status = 'cleanup-error';
      todo.status = 'blocked';
      todo.blockReason = 'cleanup-error';
    } else if (result.status === 'protocol-error') {
      attempt.status = 'protocol-error';
      todo.status = 'blocked';
      todo.blockReason = 'protocol-error';
      state.todo.runStatus = 'protocol-error';
      state.todo.stopReason = 'child-or-isolation-protocol-violation';
    } else if (result.status === 'infra-error') {
      attempt.status = result.status;
      todo.status = todo.attempts.length < state.plan.config.maxAttempts ? 'review-required' : 'blocked';
      todo.blockReason = todo.status === 'blocked' ? 'max-attempts' : null;
    } else {
      attempt.status = result.status;
      todo.status = 'completed';
      todo.blockReason = null;
    }
  }
  state.todo.updatedAt = new Date().toISOString();
  saveRunState(state);
  process.stdout.write(`${relativePathText(state.statePath)}\n`);
}

function aggregateCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  const unfinished = state.todo.items.filter((item) => !['completed', 'blocked'].includes(item.status));
  if (unfinished.length) throw new Error(`TODO is not terminal: ${unfinished.map((item) => item.id).join(', ')}`);
  const results = state.todo.items.map((todo) => {
    const capturedAttempts = todo.attempts.filter((item) => item.executionResultPath && existsSync(item.executionResultPath));
    if (!capturedAttempts.length && todo.blockReason === 'protocol-error') return {
      system: todo.system,
      caseId: todo.caseId,
      promptLocale: todo.promptLocale,
      finalStatus: 'protocol-error',
      tokens: null,
      durationMs: 0,
      unfinished: true,
      attempts: 0,
      executionResultPath: null,
      finalWorkspace: null,
      integrity: { projectRestored: null, externalStateClean: null },
      retention: { workspaceEvidence: 'not-created', cleanupDisposition: 'not-required' },
      evidence: { activityEventCount: 0, activityTypeCounts: {}, artifacts: [] },
      evidenceGaps: ['Run terminated before this case because of a child/subtask/isolation protocol violation.'],
      protocolViolations: [state.todo.stopReason || 'child-or-isolation-protocol-violation']
    };
    const attempts = capturedAttempts.map((item) => readJson(item.executionResultPath));
    if (!attempts.length) throw new Error(`No captured result for ${todo.id}`);
    if (capturedAttempts.some((item) => !rollbackStatuses.has(item.rollbackStatus))) throw new Error(`Attempt lacks a restoration gate outcome for ${todo.id}`);
    if (capturedAttempts.some((item) => item.rollbackStatus === 'clean' && !cleanupStatuses.has(item.cleanupStatus))) throw new Error(`Restored attempt lacks a cleanup gate outcome for ${todo.id}`);
    const final = attempts.at(-1);
    const projectRestored = capturedAttempts.every((item) => item.rollbackStatus === 'clean');
    const externalStateClean = projectRestored && capturedAttempts.every((item) => item.cleanupStatus === 'clean');
    return {
      system: todo.system,
      caseId: todo.caseId,
      promptLocale: todo.promptLocale,
      finalStatus: final.status,
      tokens: attempts.every((item) => Number.isFinite(item.tokens)) ? attempts.reduce((sum, item) => sum + item.tokens, 0) : null,
      durationMs: attempts.reduce((sum, item) => sum + item.durationMs, 0),
      unfinished: final.unfinished || todo.status === 'blocked',
      attempts: attempts.length,
      executionResultPath: capturedAttempts.at(-1).executionResultPath,
      finalWorkspace: final.workspace,
      integrity: { projectRestored, externalStateClean },
      retention: { workspaceEvidence: 'retained-for-judge', cleanupDisposition: externalStateClean ? 'clean' : 'blocked' },
      evidence: final.evidence,
      evidenceGaps: attempts.flatMap((item) => item.evidence?.gaps || []),
      protocolViolations: attempts.flatMap((item) => item.protocolViolations || [])
    };
  });
  const output = { schemaVersion: 5, generatedAt: new Date().toISOString(), evalsetIdentity: state.plan.evalsetIdentity, executionContract: state.plan.executionContract, track: state.plan.track, system: state.plan.config.system, outputLayout: state.recordedOutputLayout, promptLocale: 'en', tokenEvidence: state.plan.config.tokenEvidence, environmentBaselineId: state.plan.config.environmentPolicy.baselineId, runStatus: state.todo.runStatus || 'completed', validation: null, results };
  const target = canonicalPath(requireArg(args, 'out'));
  writeJson(target, output);
  process.stdout.write(`${relativePathText(target)}\n`);
}

function validateRunCommand(args) {
  const state = loadRun(requireArg(args, 'run-root'));
  if (realpathSync(path.resolve(state.plan.outputLayout.runRoot)) !== state.root) throw new Error('Run root violates the shared output layout');
  const bad = state.todo.items.filter((item) => !['completed', 'blocked'].includes(item.status));
  if (bad.length) throw new Error(`Non-terminal TODO items: ${bad.map((item) => item.id).join(', ')}`);
  const resultPath = path.join(state.root, 'execution-results.json');
  if (!existsSync(resultPath)) throw new Error('Missing execution-results.json');
  const aggregate = readJson(resultPath);
  if (!Array.isArray(aggregate.results) || aggregate.results.length !== state.todo.items.length) throw new Error('execution-results.json result count mismatch');
  for (const item of aggregate.results) {
    const forbidden = ['score', 'accuracy', 'scoringCriteria', 'verification', 'criteria', 'capsApplied', 'codebaseScore', 'implementationScore'];
    for (const key of forbidden) if (Object.hasOwn(item, key)) throw new Error(`Raw execution result contains Judge field: ${key}`);
    if (!item.evidence || !Number.isInteger(item.evidence.activityEventCount) || (item.finalStatus !== 'protocol-error' && item.evidence.activityEventCount < 1) || !Array.isArray(item.evidence.artifacts)) throw new Error(`Raw execution result lacks complete activity evidence: ${item.caseId}`);
    if (!item.integrity || ![true, false, null].includes(item.integrity.projectRestored) || ![true, false, null].includes(item.integrity.externalStateClean)) throw new Error(`Raw execution result lacks execution-integrity gates: ${item.caseId}`);
    if (item.finalStatus !== 'protocol-error') {
      if (typeof item.executionResultPath !== 'string' || !item.executionResultPath) throw new Error(`Raw execution result lacks its attempt path: ${item.caseId}`);
      const finalResponse = path.join(path.dirname(path.resolve(item.executionResultPath)), 'final-response.md');
      if (!existsSync(finalResponse) || !lstatSync(finalResponse).isFile()) throw new Error(`Raw execution result lacks retained final-response.md: ${item.caseId}`);
    }
  }
  const cleanupErrors = aggregate.results.filter((item) => item.integrity.externalStateClean === false).length;
  const rollbackErrors = aggregate.results.filter((item) => item.integrity.projectRestored === false).length;
  aggregate.validation = { schemaVersion: 1, validatedAt: new Date().toISOString(), status: 'passed', taskCount: state.todo.items.length, rawResultCount: aggregate.results.length, rollbackIntegrity: rollbackErrors === 0, rollbackErrors, cleanupIntegrity: cleanupErrors === 0, cleanupErrors, protocolIntegrity: aggregate.runStatus !== 'protocol-error', scoringPresent: false, reportPresent: false };
  writeJson(resultPath, aggregate);
  process.stdout.write(`${relativePathText(resultPath)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === 'help' || args.help) {
    process.stdout.write('Usage: run-evalset.mjs <plan|coordinate|prepare|assign|capture|rollback|protocol-violation|cleanup|sync|aggregate|validate-run> [options]\n');
    return;
  }
  if (args.command === 'plan') planCommand(args);
  else if (args.command === 'coordinate') coordinateCommand(args);
  else if (args.command === 'prepare') prepareCommand(args);
  else if (args.command === 'assign') assignCommand(args);
  else if (args.command === 'capture') captureCommand(args);
  else if (args.command === 'rollback') rollbackCommand(args);
  else if (args.command === 'protocol-violation') protocolViolationCommand(args);
  else if (args.command === 'cleanup') cleanupCommand(args);
  else if (args.command === 'sync') syncCommand(args);
  else if (args.command === 'aggregate') aggregateCommand(args);
  else if (args.command === 'validate-run') validateRunCommand(args);
  else throw new Error(`Unknown command: ${args.command}`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
