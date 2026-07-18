#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { assertPortableSegment, assertWindowsPathBudget } from './platform-utils.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') args.help = true;
    else if (flag.startsWith('--')) args[flag.slice(2)] = argv[++index];
    else throw new Error(`Unexpected argument: ${flag}`);
  }
  return args;
}
function required(args, key) { if (!args[key]) throw new Error(`--${key} is required`); return args[key]; }
function safeSegment(value, label) {
  return assertPortableSegment(value, label);
}
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function relativePathText(value) {
  const relative = path.relative(process.cwd(), value) || '.';
  return relative.split(path.sep).join('/');
}
function portablePackage(item) { return { ...item, path: relativePathText(item.path), executionContract: item.executionContract ? { ...item.executionContract, path: relativePathText(item.executionContract.path) } : null }; }
function directories(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}
function generatedId(prefix) { return `${prefix}-${new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z')}`; }
function publicPackages(roundRoot, roundId) {
  const evalsetRoot = path.join(roundRoot, 'evalset');
  return directories(evalsetRoot).map((track) => {
    const packageRoot = path.join(evalsetRoot, track);
    const manifestPath = path.join(packageRoot, 'manifest.json');
    if (!existsSync(manifestPath)) return null;
    const manifest = readJson(manifestPath);
    if (manifest.roundId !== roundId || manifest.track !== track || manifest.releaseStatus !== 'approved') return null;
    const contractPath = path.join(packageRoot, 'execution-contract.json');
    return {
      track,
      path: packageRoot,
      executionContract: existsSync(contractPath) ? { path: contractPath, sha256: sha256(contractPath) } : null,
      identity: {
        roundId: manifest.roundId,
        evalsetId: manifest.evalsetId,
        releaseId: manifest.releaseId,
        baseRevision: manifest.baseRevision,
        caseIdDigest: manifest.caseIdDigest
      }
    };
  }).filter(Boolean);
}
function executeLayout(args, evaluationRoot, roundId, roundRoot) {
  const systemId = safeSegment(required(args, 'system'), 'system');
  if (['evalset', 'report'].includes(systemId)) throw new Error(`${systemId} is reserved and cannot be a system ID`);
  const packages = publicPackages(roundRoot, roundId);
  if (!packages.length) throw new Error('No approved public package was discovered in this round');
  let selected;
  if (args.track) {
    selected = packages.find((item) => item.track === args.track);
    if (!selected) throw new Error(`No approved ${args.track} package exists in this round`);
  } else if (packages.length === 1) selected = packages[0];
  else throw new Error(`Multiple approved tracks exist; select one of: ${packages.map((item) => item.track).join(', ')}`);
  const executionRunId = safeSegment(args['run-id'] || generatedId('exec'), 'execution run ID');
  const runRoot = path.join(roundRoot, systemId, executionRunId);
  assertWindowsPathBudget(runRoot, 180);
  if (existsSync(runRoot)) throw new Error(`Execution run already exists: ${runRoot}`);
  return {
    schemaVersion: 2,
    mode: 'execute',
    collectedDirectoryInputs: { evaluationRoot: relativePathText(evaluationRoot), roundId },
    discoveredPublicPackages: packages.map(portablePackage),
    selectedPublicPackage: relativePathText(selected.path),
    outputPolicy: {
      layoutVersion: 2,
      evaluationRoot: relativePathText(evaluationRoot),
      roundId,
      roundRoot: relativePathText(roundRoot),
      evalsetDirectoryName: 'evalset',
      reportDirectoryName: 'report',
      productDirectoryName: systemId,
      executionRunId,
      runRoot: relativePathText(runRoot)
    }
  };
}
function judgeLayout(args, evaluationRoot, roundId, roundRoot) {
  const packages = publicPackages(roundRoot, roundId);
  if (!packages.length) throw new Error('No approved public package was discovered in this round');
  const discovered = [];
  for (const systemId of directories(roundRoot)) {
    if (['evalset', 'report'].includes(systemId)) continue;
    safeSegment(systemId, 'system directory');
    for (const runId of directories(path.join(roundRoot, systemId))) {
      safeSegment(runId, 'execution run directory');
      const runRoot = path.join(roundRoot, systemId, runId);
      const resultPath = path.join(runRoot, 'execution-results.json');
      if (!existsSync(resultPath)) continue;
      const result = readJson(resultPath);
      const validation = result.validation || {};
      const layout = result.outputLayout || {};
      const layoutMatches = layout.layoutVersion === 2
        && layout.roundId === roundId
        && layout.productDirectoryName === systemId
        && layout.executionRunId === runId
        && existsSync(layout.evaluationRoot || '')
        && existsSync(layout.roundRoot || '')
        && existsSync(layout.runRoot || '')
        && realpathSync(path.resolve(layout.evaluationRoot)) === evaluationRoot
        && realpathSync(path.resolve(layout.roundRoot)) === roundRoot
        && realpathSync(path.resolve(layout.runRoot)) === runRoot;
      if (result.schemaVersion !== 5 || validation.schemaVersion !== 1 || validation.status !== 'passed' || result.system?.id !== systemId || result.evalsetIdentity?.roundId !== roundId || !layoutMatches) continue;
      discovered.push({ systemId, runId, runRoot, generatedAt: result.generatedAt, resultSchemaVersion: result.schemaVersion, track: result.track, promptLocale: result.promptLocale, rollbackIntegrity: validation.rollbackIntegrity === true, rollbackErrors: validation.rollbackErrors || 0, cleanupIntegrity: validation.cleanupIntegrity !== false, cleanupErrors: validation.cleanupErrors || 0, protocolIntegrity: validation.protocolIntegrity !== false, evalsetIdentity: result.evalsetIdentity, executionContract: result.executionContract || null });
    }
  }
  if (!discovered.length) throw new Error('No validated product runs were discovered in this round');
  const groups = new Map();
  for (const run of discovered) {
    const identity = run.evalsetIdentity || {};
    const key = [run.resultSchemaVersion, identity.evalsetId, identity.releaseId, identity.baseRevision, identity.caseIdDigest, run.executionContract?.sha256 || 'legacy-no-contract', run.track, run.promptLocale].join('\u0000');
    const group = groups.get(key) || [];
    group.push(run);
    groups.set(key, group);
  }
  const cohorts = [...groups.values()].map((runs) => {
    const bySystem = new Map();
    for (const run of runs) {
      const list = bySystem.get(run.systemId) || [];
      list.push(run);
      bySystem.set(run.systemId, list);
    }
    const selected = [];
    const superseded = [];
    for (const list of bySystem.values()) {
      list.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)) || b.runId.localeCompare(a.runId));
      selected.push(list[0]);
      superseded.push(...list.slice(1));
    }
    selected.sort((a, b) => a.systemId.localeCompare(b.systemId));
    const first = selected[0];
    return {
      identity: first.evalsetIdentity,
      track: first.track,
      promptLocale: first.promptLocale,
      executionContract: first.executionContract,
      systems: selected.map((item) => item.systemId),
      rollbackIntegrity: Object.fromEntries(selected.map((item) => [item.systemId, { passed: item.rollbackIntegrity, errors: item.rollbackErrors }])),
      cleanupIntegrity: Object.fromEntries(selected.map((item) => [item.systemId, { passed: item.cleanupIntegrity, errors: item.cleanupErrors }])),
      protocolIntegrity: Object.fromEntries(selected.map((item) => [item.systemId, item.protocolIntegrity])),
      selectedRunRoots: selected.map((item) => relativePathText(item.runRoot)),
      supersededRunRoots: superseded.map((item) => relativePathText(item.runRoot)).sort()
    };
  });
  const judgeRunId = safeSegment(args['run-id'] || generatedId('judge'), 'Judge run ID');
  const reportRoot = path.join(roundRoot, 'report', judgeRunId);
  assertWindowsPathBudget(reportRoot, 120);
  if (existsSync(reportRoot)) throw new Error(`Judge run already exists: ${reportRoot}`);
  return {
    schemaVersion: 2,
    mode: 'judge',
    collectedDirectoryInputs: { evaluationRoot: relativePathText(evaluationRoot), roundId },
    discoveredPublicPackages: packages.map(portablePackage),
    cohorts,
    outputPolicy: {
      layoutVersion: 2,
      evaluationRoot: relativePathText(evaluationRoot),
      roundId,
      roundRoot: relativePathText(roundRoot),
      reportDirectoryName: 'report',
      judgeRunId,
      reportRoot: relativePathText(reportRoot)
    }
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: resolve-round-layout.mjs --mode execute|judge --round ID [--system ID] [--track TRACK] [--run-id ID]\nEvaluation root is fixed to .codebase-eval relative to the current evaluated repository root.\n');
    return;
  }
  const mode = required(args, 'mode');
  if (args.root && args.root !== '.codebase-eval') throw new Error('Evaluation root is fixed to .codebase-eval; --root cannot select another directory');
  const evaluationRoot = realpathSync(path.resolve('.codebase-eval'));
  const roundId = safeSegment(required(args, 'round'), 'round ID');
  const roundRoot = path.join(evaluationRoot, roundId);
  if (!existsSync(roundRoot)) throw new Error(`Round does not exist: ${roundRoot}`);
  const result = mode === 'execute' ? executeLayout(args, evaluationRoot, roundId, roundRoot) : mode === 'judge' ? judgeLayout(args, evaluationRoot, roundId, roundRoot) : null;
  if (!result) throw new Error('--mode must be execute or judge');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
