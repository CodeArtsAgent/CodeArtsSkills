#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortableSegment, removeTree } from './platform-utils.mjs';
import {
  validateReadOnlyBlueprintPolicy,
  validateReadOnlyPrivateCase,
  validateReadOnlyPublicCase
} from './generation-policy.mjs';
import { assessDuration } from './duration-scoring.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(scripts, 'run-evalset.mjs');
const projectState = path.join(scripts, 'project-state.mjs');
const verifier = path.join(scripts, 'run-verification.mjs');
const resolver = path.join(scripts, 'resolve-round-layout.mjs');
const scorer = path.join(scripts, 'score-results.mjs');
const judgmentValidator = path.join(scripts, 'validate-judgments.mjs');

function json(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function run(file, args, expectFailure = false) {
  const result = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
  if (!expectFailure && result.status !== 0) throw new Error(`${path.basename(file)} failed: ${result.stderr || result.stdout}`);
  if (expectFailure && result.status === 0) throw new Error(`${path.basename(file)} unexpectedly succeeded`);
  return result;
}
function digest(ids) { return createHash('sha256').update([...ids].sort().join('\n')).digest('hex'); }
function fileDigest(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function read(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function secondUtc(value = Date.now()) { return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function runState(runRoot) { return read(path.join(runRoot, 'execution-state.json')); }
function relativePathText(value) { return (path.relative(process.cwd(), value) || '.').split(path.sep).join('/'); }
function assertNoAbsolutePathStrings(value, label) {
  if (typeof value === 'string') {
    if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) throw new Error(`${label} contains an absolute path`);
    return;
  }
  if (Array.isArray(value)) value.forEach((item, index) => assertNoAbsolutePathStrings(item, `${label}[${index}]`));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) assertNoAbsolutePathStrings(item, `${label}.${key}`);
}

function publicCase(id, revision) {
  return {
    schemaVersion: 2, id, locales: ['zh-CN', 'en'],
    title: { 'zh-CN': '解释模块', en: 'Explain the module' },
    prompt: { 'zh-CN': '解释入口模块并给出证据。', en: 'Explain the entry module and provide evidence.' },
    baseRevision: revision, track: 'native-repository', taskType: 'retrieve_explain',
    deliverables: { 'zh-CN': ['结论'], en: ['conclusion'] },
    allowedOperations: { 'zh-CN': ['读取代码'], en: ['read code'] },
    forbiddenOperations: { 'zh-CN': ['安装依赖'], en: ['install dependencies'] },
    environment: {
      services: ['self-test-http'], requirementIds: [], notes: { 'zh-CN': '使用测试服务。', en: 'Use the test service.' },
      sideEffects: { mode: 'snapshot-only', resourceIds: [], outsideSnapshotWrites: [], cleanupControlIds: [] }
    }
  };
}
function executionFiles(repo, evaluationRoot, roundId, evalset, runId, tokenEvidence = { availability: 'available', source: 'self-test' }) {
  const roundRoot = path.join(evaluationRoot, roundId);
  const runRoot = path.join(roundRoot, 'test-product', runId);
  const output = { layoutVersion: 2, evaluationRoot: '.codebase-eval', roundId, roundRoot: relativePathText(roundRoot), evalsetDirectoryName: 'evalset', reportDirectoryName: 'report', productDirectoryName: 'test-product', executionRunId: runId, runRoot: relativePathText(runRoot) };
  const contractPath = path.join(evalset, 'execution-contract.json');
  const contractReference = { path: relativePathText(contractPath), releaseId: 'self-test-release', sha256: fileDigest(contractPath) };
  const request = {
    schemaVersion: 1, workflow: 'execute', contract: contractReference, system: { id: 'test-product', label: 'Test Product' },
    publicPackage: relativePathText(evalset),
    tokenEvidence,
    activityTrace: { source: 'worker-journal' },
    environmentVerification: { status: 'verified-and-sealed-before-cases', baselineId: 'self-test-baseline', evidencePaths: [], verifiedCredentialRequirementIds: [], serviceVerification: [{ id: 'self-test-http', status: 'verified', verifiedAt: new Date().toISOString() }] },
    runConstraints: {}, environmentDecisions: [], output,
    confirmation: { status: 'confirmed', confirmedBy: 'self-test', confirmedAt: new Date().toISOString() }
  };
  mkdirSync(runRoot, { recursive: true });
  const requestPath = path.join(runRoot, 'execution-request.json');
  json(requestPath, request);
  return { runRoot, requestPath };
}
function ensureProjectBaseline(runRoot) {
  const snapshot = path.join(runRoot, 'project-baseline-snapshot');
  const manifest = path.join(runRoot, 'project-baseline-manifest.json');
  if (!existsSync(manifest)) run(projectState, ['snapshot', '--project', '.', '--snapshot', snapshot, '--manifest', manifest]);
  if (existsSync(path.join(snapshot, 'ignored-cache')) || read(manifest).gitIgnorePolicy !== 'exclude-standard-ignored' || read(manifest).gitMetadataPolicy !== 'restore-private-snapshot-verify-semantic-state') throw new Error('Project baseline snapshot policies are invalid');
  return { snapshot, manifest };
}
function materializeWorker(runRoot, taskId, status = 'completed', contextInherited = false, exerciseAtomicCapture = false, crossCaseContamination = false) {
  const baseline = ensureProjectBaseline(runRoot);
  run(runner, ['coordinate', '--run-root', runRoot, '--task-id', taskId, '--agent', `${taskId}-coordinator`, '--session', `${taskId}-coordinator-session`, '--context-inherited', 'false']);
  run(runner, ['prepare', '--run-root', runRoot, '--task-id', taskId]);
  run(runner, ['assign', '--run-root', runRoot, '--task-id', taskId, '--agent', `${taskId}-agent`, '--session', `${taskId}-session`]);
  const todo = runState(runRoot).todo;
  const configuredTokenEvidence = runState(runRoot).plan.config.tokenEvidence;
  assertNoAbsolutePathStrings(todo, 'execution-state.json.todo');
  const attempt = todo.items[0].attempts[0];
  const workspace = path.resolve(attempt.liveProject);
  const frozenWorkspace = path.resolve(attempt.completedStateSnapshot);
  const envelope = read(path.join(workspace, '.codebase-eval-worker', 'worker-envelope.json'));
  if (envelope.promptLocale !== 'en' || envelope.publicTask?.promptLocale !== 'en' || JSON.stringify(envelope).includes('解释入口模块')) throw new Error('Worker envelope was not English-only');
  if (envelope.schemaVersion !== 3 || envelope.resultContract?.schemaVersion !== 3 || !Array.isArray(envelope.resultContract?.retrievalEvidence?.derivedByRunner)) throw new Error('Worker envelope did not disclose the normalized evidence contract');
  if (envelope.serviceContext?.length !== 1 || envelope.serviceContext[0].id !== 'self-test-http' || typeof envelope.serviceContext[0].notes !== 'string') throw new Error('Case-scoped service readiness was not projected into the worker envelope');
  const priorResponse = '# Prior case result\n\nThis is a complete retained response from a different benchmark case and must never be appended to the active answer.\n';
  const finalResponse = crossCaseContamination ? `# Current result\n\nCurrent case answer with evidence from index.js.\n\n${priorResponse}` : '# Result\n\nEntry module explanation with evidence from index.js.\n';
  writeFileSync(path.join(workspace, 'final-response.md'), finalResponse, 'utf8');
  writeFileSync(path.join(workspace, 'session.log'), 'session evidence\n', 'utf8');
  const activityPath = path.join(workspace, '.codebase-eval-worker', 'activity-log.jsonl');
  const validActivity = [
    { at: new Date().toISOString(), type: 'search', target: 'index.js', outcome: 'located entry module' },
    { at: new Date().toISOString(), type: 'command', target: 'git status --short', outcome: 'inspected worktree status', status: 'succeeded', exitCode: 0 }
  ];
  writeFileSync(activityPath, `${validActivity.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
  writeFileSync(path.join(workspace, 'index.js'), 'export const value = 2;\n', 'utf8');
  const completedTimestampMs = Date.now();
  json(path.join(workspace, '.codebase-eval-worker', 'worker-result.json'), {
    schemaVersion: 3, taskId, attempt: 1, system: 'test-product', caseId: 'case-001', promptLocale: 'en',
    child: { agentId: `${taskId}-agent`, sessionId: `${taskId}-session`, contextInherited },
    startedAt: secondUtc(completedTimestampMs - 5000), completedAt: secondUtc(completedTimestampMs), status,
    finalResponsePath: 'final-response.md', logPaths: ['session.log'],
    evidence: {
      activityLogPath: '.codebase-eval-worker/activity-log.jsonl', activityLogSource: 'worker-journal',
      commandLogPaths: [], testLogPaths: [], deliverablePaths: ['final-response.md'],
      inspectedRepositoryLocations: ['index.js'], citedRepositoryLocations: ['index.js'],
      retrievalEvidence: {
        source: 'worker-journal',
        actions: [
          { tool: 'reference-search', role: 'discovery', target: 'entry symbol', outcome: 'located indexed references' },
          { tool: 'read', role: 'verification', target: 'index.js', outcome: 'verified indexed result in context' }
        ],
        gaps: ['No product-native trace in self-test']
      },
      gaps: []
    },
    tokens: configuredTokenEvidence.availability === 'available' ? 10 : null, tokenEvidence: { availability: configuredTokenEvidence.availability, source: configuredTokenEvidence.source, comparable: false }, durationMs: 10000, unfinished: status === 'unfinished', environmentBaselineId: 'self-test-baseline', protocolViolations: []
  });
  writeFileSync(path.join(workspace, 'ignored-cache', 'generated.bin'), 'IDE state before completed snapshot\n', 'utf8');
  run(projectState, ['freeze', '--project', '.', '--snapshot', frozenWorkspace]);
  if (existsSync(path.join(frozenWorkspace, 'ignored-cache'))) throw new Error('Completed-state snapshot retained Git-ignored content');
  if (process.platform !== 'win32' && readlinkSync(path.join(frozenWorkspace, 'linked-entry.js')) !== 'linked-target.js') throw new Error('Completed-state snapshot changed a relative symbolic-link target');
  writeFileSync(path.join(workspace, 'ignored-cache', 'generated.bin'), 'IDE state changed after completed snapshot\n', 'utf8');
  const artifactDir = path.dirname(path.resolve(attempt.executionResultPath));
  if (crossCaseContamination) {
    const priorArtifactRoot = path.join(runRoot, 'artifacts', 'prior-case', 'attempt-1');
    mkdirSync(priorArtifactRoot, { recursive: true });
    writeFileSync(path.join(priorArtifactRoot, 'final-response.md'), priorResponse, 'utf8');
    const contaminatedCapture = run(runner, ['capture', '--run-root', runRoot, '--task-id', taskId, '--attempt', '1', '--worker-result', path.join(workspace, '.codebase-eval-worker', 'worker-result.json')], true);
    if (!contaminatedCapture.stderr.includes('Cross-case final-response contamination detected') || runState(runRoot).todo.runStatus !== 'protocol-error' || existsSync(path.join(artifactDir, 'final-response.md'))) throw new Error('Runner did not reject an appended prior-case final response atomically');
    run(projectState, ['restore', '--project', '.', '--snapshot', baseline.snapshot, '--manifest', baseline.manifest, '--evidence', path.join(artifactDir, 'project-restore-evidence.json')]);
    rmSync(path.join(runRoot, 'artifacts', 'prior-case'), { recursive: true, force: true });
    return artifactDir;
  }
  if (exerciseAtomicCapture) {
    const workerResultPath = path.join(workspace, '.codebase-eval-worker', 'worker-result.json');
    const invalidCitationResult = read(workerResultPath);
    invalidCitationResult.evidence.citedRepositoryLocations = ['modules/index.js'];
    json(workerResultPath, invalidCitationResult);
    writeFileSync(path.join(workspace, 'final-response.md'), '# Result\n\nEntry module explanation with shortened evidence from modules/index.js.\n', 'utf8');
    const invalidCitationCapture = run(runner, ['capture', '--run-root', runRoot, '--task-id', taskId, '--attempt', '1', '--worker-result', workerResultPath], true);
    if (!invalidCitationCapture.stderr.includes('complete repository-root-relative') || readdirSync(artifactDir).some((name) => name !== '.internal')) throw new Error('Runner accepted a shortened cited repository path or left partial durable artifacts');
    invalidCitationResult.evidence.citedRepositoryLocations = ['index.js'];
    json(workerResultPath, invalidCitationResult);
    writeFileSync(path.join(workspace, 'final-response.md'), '# Result\n\nEntry module explanation with evidence from index.js.\n', 'utf8');
    writeFileSync(activityPath, `${JSON.stringify({ at: new Date().toISOString(), type: 'command', target: 'git status --short', outcome: 'missing inline status evidence' })}\n`, 'utf8');
    const invalidCapture = run(runner, ['capture', '--run-root', runRoot, '--task-id', taskId, '--attempt', '1', '--worker-result', path.join(workspace, '.codebase-eval-worker', 'worker-result.json')], true);
    if (!invalidCapture.stderr.includes('missing status') || readdirSync(artifactDir).some((name) => name !== '.internal')) throw new Error('Failed capture left partial durable artifacts');
    writeFileSync(activityPath, `${validActivity.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
  }
  const capture = run(runner, ['capture', '--run-root', runRoot, '--task-id', taskId, '--attempt', '1', '--worker-result', path.join(workspace, '.codebase-eval-worker', 'worker-result.json')], contextInherited);
  if (contextInherited && !capture.stderr.includes('entire run is terminated')) throw new Error('Inherited child context did not terminate capture');
  if (!contextInherited && (!existsSync(path.join(artifactDir, 'final-response.md')) || existsSync(path.join(artifactDir, 'evidence-0-deliverable.md')))) throw new Error('Final response was not retained with precedence over duplicate deliverable metadata');
  run(projectState, ['restore', '--project', '.', '--snapshot', baseline.snapshot, '--manifest', baseline.manifest, '--evidence', path.join(artifactDir, 'project-restore-evidence.json')]);
  if (readFileSync(path.join(workspace, 'index.js'), 'utf8') !== 'export const value = 1;\n') throw new Error('Initial project file content was not restored');
  execFileSync('git', ['update-index', '--index-version', '4'], { cwd: workspace });
  if (!contextInherited) {
    writeFileSync(path.join(artifactDir, 'rollback.log'), 'initial project snapshot restored exactly\n', 'utf8');
    json(path.join(artifactDir, 'rollback-result.json'), { schemaVersion: 1, taskId, attempt: 1, status: 'clean', completedAt: new Date().toISOString(), owner: 'evaluated-product-case-coordinator', completedStateSnapshotPath: relativePathText(frozenWorkspace), restoreEvidencePath: 'project-restore-evidence.json', baselineRestored: true, protocolDirectoryRemoved: true, evidencePaths: ['rollback.log'], dirtyDataRemaining: [] });
    run(runner, ['rollback', '--run-root', runRoot, '--task-id', taskId, '--attempt', '1', '--rollback-result', path.join(artifactDir, 'rollback-result.json')]);
  }
  return artifactDir;
}

const originalCwd = process.cwd();
const temp = mkdtempSync(path.join(os.tmpdir(), 'codebase-eval-self-test-'));
try {
  if (assessDuration(900000, 3600000).scoreAdjustment !== 0 ||
      assessDuration(900001, 3600000).scoreAdjustment !== -0.5 ||
      assessDuration(1800000, 3600000).scoreAdjustment !== -0.5 ||
      assessDuration(1800001, 3600000).scoreAdjustment !== -1 ||
      assessDuration(3600000, 3600000).band !== 'unfinished-or-timeout' ||
      assessDuration(1, 3600000, true).scoreAdjustment !== -1) throw new Error('Duration scoring boundaries are invalid');
  const blueprintTemplate = read(path.join(scripts, '..', 'assets', 'evaluation-blueprint.template.json'));
  if (validateReadOnlyBlueprintPolicy(blueprintTemplate).length) throw new Error('Read-only blueprint template violates generation policy');
  const readOnlyPublicFixture = {
    taskType: 'retrieve_explain',
    prompt: {
      'zh-CN': '解释流程，并为证据给出完整仓库根相对路径、精确符号和行号或行范围。',
      en: 'Explain the flow and cite every evidence item with its complete repository-root-relative path, exact symbol, and precise line number or line range.'
    },
    deliverables: {
      'zh-CN': ['结论、关系链和带完整仓库根相对路径、符号、行号或行范围的证据'],
      en: ['conclusion, relationship chain, and evidence with repository-root-relative paths, symbols, and line numbers or line ranges']
    },
    allowedOperations: { 'zh-CN': ['只读搜索和阅读代码仓'], en: ['search and read the repository'] },
    forbiddenOperations: {
      'zh-CN': ['修改源码或代码仓', '运行项目测试', '构建项目', '启动应用、服务或服务器'],
      en: ['modify the source or repository', 'run project tests', 'build the project', 'start the app, service, or server']
    },
    environment: {
      services: [], requirementIds: [],
      sideEffects: { mode: 'snapshot-only', resourceIds: [], outsideSnapshotWrites: [], cleanupControlIds: [] }
    }
  };
  if (validateReadOnlyPublicCase(readOnlyPublicFixture).length) throw new Error('Valid read-only public case was rejected');
  const invalidPublicFixture = structuredClone(readOnlyPublicFixture);
  invalidPublicFixture.taskType = 'implement';
  invalidPublicFixture.allowedOperations.en.push('modify source and run tests');
  if (!validateReadOnlyPublicCase(invalidPublicFixture).length) throw new Error('Development-oriented public case was accepted');
  const readOnlyPrivateFixture = {
    generationLoad: 'none',
    difficulty: { validation: 'V1' },
    evidence: [{ source: 'src/a.js:10-14' }, { source: 'src/b.js:28' }],
    verification: { type: 'human-review', command: [], setupCommands: [], cleanupCommands: [], injectFiles: [] },
    scoringCriteria: { criteria: [
      { id: 'core', max: 4 }, { id: 'localization', max: 2.5 }, { id: 'reasoning', max: 2 },
      { id: 'impact', max: 1 }, { id: 'verification', max: 0.5 }
    ] },
    estimatedCost: { services: [] }
  };
  if (validateReadOnlyPrivateCase(readOnlyPrivateFixture).length) throw new Error('Valid read-only private case was rejected');
  const invalidPrivateFixture = structuredClone(readOnlyPrivateFixture);
  invalidPrivateFixture.generationLoad = 'low';
  invalidPrivateFixture.difficulty.validation = 'V2';
  invalidPrivateFixture.verification = { type: 'hidden-test', command: ['node', '--test', 'hidden.test.js'], setupCommands: [], cleanupCommands: [], injectFiles: [{ source: 'hidden.test.js', target: '.judge/hidden.test.js' }] };
  if (!validateReadOnlyPrivateCase(invalidPrivateFixture).length) throw new Error('Executable private result check was accepted');
  for (const value of ['CON', 'nul.txt', 'LPT1', '.', '..', 'bad.']) {
    let rejected = false;
    try { assertPortableSegment(value, 'test'); } catch { rejected = true; }
    if (!rejected) throw new Error(`Windows-unsafe segment was accepted: ${value}`);
  }
  const repo = path.join(temp, 'repo');
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'self-test@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Self Test'], { cwd: repo });
  writeFileSync(path.join(repo, 'index.js'), 'export const value = 1;\n', 'utf8');
  writeFileSync(path.join(repo, 'linked-target.js'), 'export const linked = true;\n', 'utf8');
  if (process.platform !== 'win32') symlinkSync('linked-target.js', path.join(repo, 'linked-entry.js'));
  writeFileSync(path.join(repo, '.gitignore'), 'ignored-cache/\n', 'utf8');
  mkdirSync(path.join(repo, 'ignored-cache'), { recursive: true });
  writeFileSync(path.join(repo, 'ignored-cache', 'generated.bin'), 'ignored baseline data\n', 'utf8');
  execFileSync('git', ['add', 'index.js', 'linked-target.js', '.gitignore', ...(process.platform !== 'win32' ? ['linked-entry.js'] : [])], { cwd: repo });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repo });
  process.chdir(repo);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const evaluationRoot = path.join(repo, '.codebase-eval'), roundId = 'round-self-test';
  const evalset = path.join(evaluationRoot, roundId, 'evalset', 'native-repository');
  const ids = ['case-001'];
  json(path.join(evalset, 'manifest.json'), { schemaVersion: 2, roundId, evalsetId: 'self-test-evalset', releaseId: 'self-test-release', repository: relativePathText(repo), baseRevision: revision, track: 'native-repository', locales: ['zh-CN', 'en'], releaseStatus: 'approved', caseIds: ids, caseIdDigest: digest(ids) });
  json(path.join(evalset, 'execution-contract.json'), {
    schemaVersion: 3, kind: 'codebase-eval-execution-contract',
    identity: { roundId, releaseId: 'self-test-release', track: 'native-repository', repository: relativePathText(repo), baseRevision: revision, caseIdDigest: digest(ids) },
    executionPolicy: { caseSelection: 'all-released-cases', maximumAttempts: 2, childConcurrency: 2, caseConcurrency: 1, caseCoordinatorPerCase: true, freshCaseCoordinatorPerCase: true, workerConcurrencyPerCase: 1, workerSpawnOwner: 'case-coordinator', perCaseTimeoutMs: 3600000, promptLocaleSource: 'fixed-en', freshChildPerAttempt: true, noInheritedContext: true, directProjectExecution: true, serialExecution: true, initialProjectSnapshot: 'required-before-first-attempt', baselineSnapshotScope: 'git-tracked-and-nonignored-untracked', gitIgnoredContent: 'excluded-from-snapshot-managed-by-cleanup-controls', gitMetadataHandling: 'private-snapshot-semantic-verification', protocolDirectoryCleanup: 'required-before-next-attempt', snapshotAfterAttempt: true, rollbackToBaselineAfterAttempt: true, projectRestoration: 'case-coordinator-deterministic-from-snapshot', initialSnapshotOwner: 'main-coordinator', completedSnapshotAndRollbackOwner: 'case-coordinator', dependencyMutationDuringRun: 'forbidden', dirtyDataCleanupPerAttempt: true, stopRunOnCleanupError: true, stopRunOnChildIsolationViolation: true },
    evidenceRequirements: { finalResponseFormat: 'markdown', activityLogRequired: true, commandAndTestLogsRequiredWhenExecuted: true, collectInspectedAndCitedLocationsWhenObservable: true, retrievalSummaryRequired: true, maximumRetrievalKeyActions: 8, retainFullRetrievalTrace: false, collectChainOfThought: false },
    environmentPolicy: { installationPolicy: 'ask-before-install-before-cases', dependencyMutationsDuringRun: 'forbidden', credentialRequirementIds: [] },
    serviceReadiness: [{ id: 'self-test-http', workingDirectory: '.', buildCommand: null, startCommand: ['node', 'server.js'], readiness: { type: 'http', url: 'http://127.0.0.1:3000/', method: 'GET', expectedStatusCodes: [200], timeoutMs: 30000 }, stop: { strategy: 'terminate-attempt-process-tree' }, requirementIds: [], cleanupControlIds: [], notes: { 'zh-CN': '测试服务启动契约。', en: 'Test service startup contract.' } }],
    cleanupPolicy: { status: 'verified-before-release', processTreeTermination: 'required', outsideSnapshotWrites: 'forbidden-unless-declared', controls: [] }
  });
  json(path.join(evalset, 'case-index.json'), { schemaVersion: 2, caseIds: ids });
  json(path.join(evalset, 'cases', 'public', 'case-001.json'), publicCase('case-001', revision));

  const resolvedLayout = spawnSync(process.execPath, [resolver, '--mode', 'execute', '--round', roundId, '--system', 'test-product', '--run-id', 'exec-resolver'], { cwd: repo, encoding: 'utf8' });
  if (resolvedLayout.status !== 0 || JSON.parse(resolvedLayout.stdout).collectedDirectoryInputs.evaluationRoot !== '.codebase-eval') throw new Error(`Fixed evaluation root resolution failed: ${resolvedLayout.stderr || resolvedLayout.stdout}`);
  const overriddenRoot = spawnSync(process.execPath, [resolver, '--mode', 'execute', '--root', '.codeartsdoer/.codebase/evalset', '--round', roundId, '--system', 'test-product'], { cwd: repo, encoding: 'utf8' });
  if (overriddenRoot.status === 0 || !overriddenRoot.stderr.includes('fixed to .codebase-eval')) throw new Error('Resolver accepted an evaluation root override');

  const happy = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-happy');
  run(runner, ['plan', '--evalset', evalset, '--request', happy.requestPath, '--out', happy.runRoot]);
  if (existsSync(happy.requestPath) || ['execution-intake.json', 'execution-config.json', 'execution-plan.json', 'execution-todo.json'].some((name) => existsSync(path.join(happy.runRoot, name)))) throw new Error('Planning retained redundant Execute control JSON files');
  assertNoAbsolutePathStrings(runState(happy.runRoot), 'execution-state.json');
  const storedRequest = runState(happy.runRoot).request;
  if (Object.hasOwn(storedRequest, 'conformance') || Object.hasOwn(storedRequest, 'maxAttempts') || Object.hasOwn(storedRequest, 'cleanupPolicy') || Object.hasOwn(storedRequest, 'promptLocale') || existsSync(path.join(happy.runRoot, 'conformance-result.json'))) throw new Error('Execution request persisted a shared-policy override or capability preflight result');
  if (runState(happy.runRoot).plan.executionContract?.sha256 !== storedRequest.contract.sha256) throw new Error('Execution plan did not preserve the verified contract identity');
  const happyTask = runState(happy.runRoot).todo.items[0].id;
  const happyArtifact = materializeWorker(happy.runRoot, happyTask, 'completed', false, true);
  const happyExecution = read(path.join(happyArtifact, 'execution-result.json'));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(happyExecution.startedAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(happyExecution.completedAt) || happyExecution.durationMs !== 5000 || happyExecution.durationEvidence?.selectionPolicy !== 'shorter') throw new Error('Worker timestamps or shorter-duration consistency policy were not preserved');
  const capturedRetrieval = read(path.join(happyArtifact, 'execution-result.json')).evidence.retrievalSummary;
  if (capturedRetrieval.observedMode !== 'codebase-index' || capturedRetrieval.familyDiscoveryCounts.lexical !== 0 || capturedRetrieval.familyDiscoveryCounts.index !== 1 || capturedRetrieval.keyActions.length !== 2 || capturedRetrieval.source !== 'worker-journal') throw new Error('Runner did not derive the bounded retrieval summary from representative actions');
  writeFileSync(path.join(happyArtifact, 'cleanup.log'), 'baseline restored\n', 'utf8');
  json(path.join(happyArtifact, 'cleanup-result.json'), { schemaVersion: 3, taskId: happyTask, attempt: 1, status: 'clean', completedAt: new Date().toISOString(), owner: 'evaluated-product-case-coordinator', workspaceEvidencePreserved: true, attemptOwnedProcesses: [], externalResources: [], outsideProjectPaths: [], cacheAndTempPaths: [], environmentRestored: true, evidencePaths: ['cleanup.log'], dirtyDataRemaining: [], protocolViolations: [] });
  run(runner, ['cleanup', '--run-root', happy.runRoot, '--task-id', happyTask, '--attempt', '1', '--cleanup-result', path.join(happyArtifact, 'cleanup-result.json')]);
  if (existsSync(path.join(happyArtifact, 'rollback-result.json')) || existsSync(path.join(happyArtifact, 'cleanup-result.json')) || existsSync(path.join(happyArtifact, 'project-restore-evidence.json')) || existsSync(path.join(happyArtifact, '.internal')) || !existsSync(path.join(happyArtifact, 'execution-result.json'))) throw new Error('Only the independent execution result should remain after attempt gates');
  run(runner, ['sync', '--run-root', happy.runRoot]);
  run(runner, ['aggregate', '--run-root', happy.runRoot, '--out', path.join(happy.runRoot, 'execution-results.json')]);
  assertNoAbsolutePathStrings(read(path.join(happy.runRoot, 'execution-results.json')), 'execution-results.json');
  run(runner, ['validate-run', '--run-root', happy.runRoot]);
  if (existsSync(path.join(happy.runRoot, 'execution-validation.json'))) throw new Error('Validation was not embedded in execution-results.json');
  const happyResults = read(path.join(happy.runRoot, 'execution-results.json'));
  if (happyResults.schemaVersion !== 5 || happyResults.validation.cleanupIntegrity !== true || happyResults.validation.rollbackIntegrity !== true || happyResults.results[0].integrity.projectRestored !== true || happyResults.results[0].integrity.externalStateClean !== true) throw new Error('Happy compact execution integrity failed');

  const unavailableTokens = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-token-unavailable', { availability: 'unavailable', source: 'product-does-not-expose-token-usage' });
  run(runner, ['plan', '--evalset', evalset, '--request', unavailableTokens.requestPath, '--out', unavailableTokens.runRoot]);
  const unavailableTask = runState(unavailableTokens.runRoot).todo.items[0].id;
  const unavailableArtifact = materializeWorker(unavailableTokens.runRoot, unavailableTask);
  const unavailableResult = read(path.join(unavailableArtifact, 'execution-result.json'));
  if (unavailableResult.tokens !== null || unavailableResult.tokenEvidence.availability !== 'unavailable') throw new Error('Unavailable token evidence was not preserved as null');
  const judgeDiscovery = spawnSync(process.execPath, [resolver, '--mode', 'judge', '--round', roundId, '--run-id', 'judge-self-test'], { cwd: repo, encoding: 'utf8' });
  if (judgeDiscovery.status !== 0) throw new Error(`Judge discovery failed: ${judgeDiscovery.stderr || judgeDiscovery.stdout}`);
  const discoveredCohort = JSON.parse(judgeDiscovery.stdout).cohorts[0];
  if (discoveredCohort?.rollbackIntegrity?.['test-product']?.passed !== true) throw new Error('Judge discovery did not retain Execute restoration integrity');

  const override = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-contract-override');
  const overrideRequest = read(override.requestPath);
  overrideRequest.maxAttempts = 9;
  json(override.requestPath, overrideRequest);
  const overrideResult = run(runner, ['plan', '--evalset', evalset, '--request', override.requestPath, '--out', override.runRoot], true);
  if (!overrideResult.stderr.includes('cannot be overridden')) throw new Error('Product config shared-policy override was not rejected');

  const badDigest = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-contract-bad-digest');
  const badDigestRequest = read(badDigest.requestPath);
  badDigestRequest.contract.sha256 = '0'.repeat(64);
  json(badDigest.requestPath, badDigestRequest);
  const digestResult = run(runner, ['plan', '--evalset', evalset, '--request', badDigest.requestPath, '--out', badDigest.runRoot], true);
  if (!digestResult.stderr.includes('SHA-256 mismatch')) throw new Error('Execution contract digest mismatch was not rejected');

  const protocol = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-protocol-stop');
  run(runner, ['plan', '--evalset', evalset, '--request', protocol.requestPath, '--out', protocol.runRoot]);
  const protocolTask = runState(protocol.runRoot).todo.items[0].id;
  ensureProjectBaseline(protocol.runRoot);
  run(runner, ['coordinate', '--run-root', protocol.runRoot, '--task-id', protocolTask, '--agent', 'protocol-coordinator', '--session', 'protocol-coordinator-session', '--context-inherited', 'false']);
  run(runner, ['prepare', '--run-root', protocol.runRoot, '--task-id', protocolTask]);
  run(runner, ['assign', '--run-root', protocol.runRoot, '--task-id', protocolTask, '--agent', 'protocol-agent', '--session', 'protocol-session']);
  run(runner, ['protocol-violation', '--run-root', protocol.runRoot, '--task-id', protocolTask, '--reason', 'inherited parent context observed']);
  const stoppedTodo = runState(protocol.runRoot).todo;
  if (stoppedTodo.runStatus !== 'protocol-error' || stoppedTodo.items.some((item) => item.status !== 'blocked')) throw new Error('Protocol violation did not terminate the entire run');
  const stoppedPrepare = run(runner, ['prepare', '--run-root', protocol.runRoot, '--task-id', protocolTask], true);
  if (!stoppedPrepare.stderr.includes('protocol violation')) throw new Error('Protocol-terminated run accepted more work');
  run(runner, ['aggregate', '--run-root', protocol.runRoot, '--out', path.join(protocol.runRoot, 'execution-results.json')]);
  run(runner, ['validate-run', '--run-root', protocol.runRoot]);
  if (read(path.join(protocol.runRoot, 'execution-results.json')).validation.protocolIntegrity !== false) throw new Error('Protocol integrity failure was not preserved');

  const inherited = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-inherited-context-stop');
  run(runner, ['plan', '--evalset', evalset, '--request', inherited.requestPath, '--out', inherited.runRoot]);
  const inheritedTask = runState(inherited.runRoot).todo.items[0].id;
  materializeWorker(inherited.runRoot, inheritedTask, 'completed', true);
  if (runState(inherited.runRoot).todo.runStatus !== 'protocol-error') throw new Error('Inherited context did not stop the run');

  const contaminated = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-cross-case-response-stop');
  run(runner, ['plan', '--evalset', evalset, '--request', contaminated.requestPath, '--out', contaminated.runRoot]);
  const contaminatedTask = runState(contaminated.runRoot).todo.items[0].id;
  materializeWorker(contaminated.runRoot, contaminatedTask, 'completed', false, false, true);
  if (runState(contaminated.runRoot).todo.runStatus !== 'protocol-error') throw new Error('Cross-case final-response contamination did not stop the run');

  const blocked = executionFiles(repo, evaluationRoot, roundId, evalset, 'exec-cleanup-error');
  run(runner, ['plan', '--evalset', evalset, '--request', blocked.requestPath, '--out', blocked.runRoot]);
  const blockedTask = runState(blocked.runRoot).todo.items[0].id;
  const blockedArtifact = materializeWorker(blocked.runRoot, blockedTask);
  json(path.join(blockedArtifact, 'cleanup-result.json'), { schemaVersion: 3, taskId: blockedTask, attempt: 1, status: 'cleanup-error', completedAt: new Date().toISOString(), owner: 'evaluated-product-case-coordinator', workspaceEvidencePreserved: true, attemptOwnedProcesses: [], externalResources: [], outsideProjectPaths: [], cacheAndTempPaths: [], environmentRestored: false, evidencePaths: [], dirtyDataRemaining: ['fixture dirty state'], protocolViolations: [] });
  run(runner, ['cleanup', '--run-root', blocked.runRoot, '--task-id', blockedTask, '--attempt', '1', '--cleanup-result', path.join(blockedArtifact, 'cleanup-result.json')]);
  run(runner, ['sync', '--run-root', blocked.runRoot]);
  const blockedPrepare = run(runner, ['prepare', '--run-root', blocked.runRoot, '--task-id', blockedTask], true);
  if (!blockedPrepare.stderr.includes('restoration or cleanup failed')) throw new Error('Cleanup error did not block the run');

  const privateRoot = path.join(temp, 'private'), judgeOut = path.join(temp, 'judge', 'verification.json'), judgeWorkspace = path.join(temp, 'judge-workspace');
  mkdirSync(path.join(privateRoot, 'evaluator-assets', 'case-001'), { recursive: true });
  writeFileSync(path.join(privateRoot, 'evaluator-assets', 'case-001', 'hidden.test.js'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('ok',()=>assert.equal(1,1));\n", 'utf8');
  json(path.join(privateRoot, 'cases', 'private', 'case-001.json'), {
    id: 'case-001', generationLoad: 'none',
    capabilities: { primary: 'code_retrieval', secondary: [] },
    difficulty: { overall: 'L2' },
    verification: { type: 'hidden-test', cwd: '.', timeoutMs: 60000, command: ['node', '--test', '.judge/hidden.test.js'], setupCommands: [], cleanupCommands: [], injectFiles: [{ source: 'evaluator-assets/case-001/hidden.test.js', target: '.judge/hidden.test.js' }], envAllowlist: [], steps: { 'zh-CN': [], en: [] }, cleanup: { 'zh-CN': [], en: [] } },
    scoringCriteria: {
      criteria: [
        { id: 'core', max: 4 }, { id: 'localization', max: 2.5 }, { id: 'reasoning', max: 2 },
        { id: 'impact', max: 1 }, { id: 'verification', max: 0.5 }
      ],
      caps: []
    }
  });
  run(verifier, ['--private-root', privateRoot, '--case-id', 'case-001', '--candidate-workspace', read(path.join(happy.runRoot, 'execution-results.json')).results[0].finalWorkspace, '--judge-workspace', judgeWorkspace, '--out', judgeOut]);
  if (existsSync(judgeWorkspace) || read(judgeOut).cleanupAudit.judgeWorkspaceRemoved !== true) throw new Error('Judge workspace cleanup failed');
  const failureWorkspace = path.join(temp, 'judge-failure-workspace'), failureOut = path.join(temp, 'judge', 'failure.json');
  run(verifier, ['--private-root', privateRoot, '--case-id', 'missing-case', '--candidate-workspace', read(path.join(happy.runRoot, 'execution-results.json')).results[0].finalWorkspace, '--judge-workspace', failureWorkspace, '--out', failureOut], true);
  if (existsSync(failureWorkspace) || !existsSync(failureOut) || read(failureOut).cleanupAudit.judgeWorkspaceRemoved !== true) throw new Error('Judge failure-path cleanup failed');
  json(path.join(privateRoot, 'manifest.json'), { roundId, evalsetId: 'self-test-evalset', releaseId: 'self-test-release', track: 'native-repository' });
  json(path.join(privateRoot, 'evaluation-blueprint.json'), { schemaVersion: 4, caseConcepts: [{ id: 'case-001', retrievalTool: 'grep-glob-read' }] });
  const reportRoot = path.join(evaluationRoot, roundId, 'report', 'judge-duration-self-test');
  mkdirSync(path.join(reportRoot, 'verification-results', 'test-product'), { recursive: true });
  json(path.join(reportRoot, 'verification-results', 'test-product', 'case-001.json'), read(judgeOut));
  const judgeIntakePath = path.join(reportRoot, 'judge-intake.json');
  json(judgeIntakePath, {
    workflow: 'judge',
    inputs: { publicPackages: [relativePathText(evalset)], sealedPrivatePackages: [relativePathText(privateRoot)], rawRunRoots: [relativePathText(happy.runRoot)] },
    output: { layoutVersion: 2, evaluationRoot: '.codebase-eval', roundId, roundRoot: relativePathText(path.join(evaluationRoot, roundId)), reportDirectoryName: 'report', judgeRunId: 'judge-duration-self-test', reportRoot: relativePathText(reportRoot) },
    comparisonPolicy: { tokenComparability: 'derive-from-run-evidence' },
    confirmation: { status: 'confirmed', confirmedBy: 'self-test', confirmedAt: new Date().toISOString() }
  });
  const judgedDuration = read(path.join(happy.runRoot, 'execution-results.json')).results[0].durationMs;
  const judgmentInputPath = path.join(reportRoot, 'judgments.json');
  const judgmentRecord = {
    schemaVersion: 3, system: 'test-product', caseId: 'case-001', promptLocale: 'en', difficulty: 'L2', taskType: 'retrieve_explain', generationLoad: 'none',
    dimensions: { capabilities: ['code_retrieval'], retrievalTool: 'grep-glob-read' },
    score: 9, status: 'full_success',
    criteria: [
      { id: 'core', awarded: 4, evidence: { 'zh-CN': '正确', en: 'Correct' } },
      { id: 'localization', awarded: 2, evidence: { 'zh-CN': '准确', en: 'Accurate' } },
      { id: 'reasoning', awarded: 1.5, evidence: { 'zh-CN': '完整', en: 'Complete' } },
      { id: 'impact', awarded: 1, evidence: { 'zh-CN': '覆盖', en: 'Covered' } },
      { id: 'verification', awarded: 0.5, evidence: { 'zh-CN': '可信', en: 'Credible' } }
    ],
    capsApplied: [], verificationEvidencePath: 'verification-results/test-product/case-001.json',
    tokens: 10, durationMs: judgedDuration, durationAssessment: assessDuration(judgedDuration, 3600000, false),
    critical: false, unfinished: false
  };
  json(judgmentInputPath, { tokenComparability: 'native-model', judgments: [judgmentRecord] });
  run(judgmentValidator, ['--input', judgmentInputPath, '--private-root', privateRoot, '--intake', judgeIntakePath]);
  const invalidJudgmentRecord = structuredClone(judgmentRecord);
  invalidJudgmentRecord.durationAssessment.scoreAdjustment = -1;
  json(judgmentInputPath, { tokenComparability: 'native-model', judgments: [invalidJudgmentRecord] });
  const invalidJudgmentResult = run(judgmentValidator, ['--input', judgmentInputPath, '--private-root', privateRoot, '--intake', judgeIntakePath], true);
  if (!invalidJudgmentResult.stderr.includes('durationAssessment must equal')) throw new Error('Judgment validation accepted a fabricated duration assessment');
  const scoreInput = path.join(temp, 'score-input.json'), scoreOutput = path.join(temp, 'score-output.json');
  const scoreRecord = (system, tokens, durationMs) => ({ system, caseId: 'case-001', promptLocale: 'en', difficulty: 'L2', taskType: 'retrieve_explain', generationLoad: 'none', dimensions: { capabilities: ['code_retrieval'], retrievalTool: 'grep-glob-read' }, score: 8, tokens, durationMs, durationAssessment: assessDuration(durationMs, 3600000, false), unfinished: false, critical: false });
  json(scoreInput, { tokenComparability: 'unavailable', judgments: [scoreRecord('missing-token-product', null, 10), scoreRecord('measured-product', 100, 20)] });
  run(scorer, ['--input', scoreInput, '--out', scoreOutput]);
  const scored = read(scoreOutput);
  if (scored.schemaVersion !== 4 || scored.ranking.find((item) => item.system === 'missing-token-product')?.totalTokens !== null || !scored.messages.en.warnings.some((item) => item.includes('lacks token evidence')) || scored.ranking.some((item) => item.caseResults[0].durationMs <= 0 || item.totalDurationScoreAdjustment !== 0)) throw new Error('Score aggregation mishandled token or duration evidence');
  const invalidDurationInput = path.join(temp, 'score-invalid-duration.json');
  const invalidDurationRecord = scoreRecord('invalid-duration-product', 100, 20);
  invalidDurationRecord.durationAssessment.scoreAdjustment = -1;
  json(invalidDurationInput, { tokenComparability: 'native-model', judgments: [invalidDurationRecord] });
  const invalidDurationResult = run(scorer, ['--input', invalidDurationInput], true);
  if (!invalidDurationResult.stderr.includes('durationAssessment must equal')) throw new Error('Score aggregation accepted a fabricated duration assessment');
  process.stdout.write('codebase-arena self-test passed\n');
} finally {
  process.chdir(originalCwd);
  removeTree(temp);
}
