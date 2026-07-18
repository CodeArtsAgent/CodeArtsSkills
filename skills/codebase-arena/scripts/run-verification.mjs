#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertPortableSegment, childEnvironment, removeTree, terminateProcessTree } from './platform-utils.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--private-root') args.privateRoot = argv[++i];
    else if (argv[i] === '--case-id') args.caseId = argv[++i];
    else if (argv[i] === '--candidate-workspace') args.candidateWorkspace = argv[++i];
    else if (argv[i] === '--judge-workspace') args.judgeWorkspace = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function required(args, key) { if (!args[key]) throw new Error(`--${key.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)} is required`); return args[key]; }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function safeId(value) { return assertPortableSegment(value, 'case-id'); }
function within(root, candidate, label) {
  const base = path.resolve(root), target = path.resolve(candidate);
  if (target === base || !target.startsWith(`${base}${path.sep}`)) throw new Error(`${label} escapes its root`);
  return target;
}
function safeRelative(value, label) { if (typeof value !== 'string' || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new Error(`${label} must be relative`); return value; }
function commandArray(value, label, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((part) => typeof part !== 'string' || !part)) throw new Error(`${label} must be an argument array`);
  return value;
}
function refuseInstall(command) {
  const executable = path.basename(command[0]).toLowerCase();
  const verb = (command[1] || '').toLowerCase();
  if (['brew', 'apt', 'apt-get', 'yum', 'dnf', 'apk', 'nvm', 'pyenv', 'sdk'].includes(executable)
      || (['npm', 'pnpm', 'yarn', 'pip', 'pip3', 'poetry', 'bundle', 'cargo'].includes(executable) && ['install', 'i', 'ci', 'add'].includes(verb))
      || (executable === 'playwright' && verb === 'install')
      || (executable === 'docker' && verb === 'pull')) throw new Error(`Result verification refuses dependency mutation: ${command.join(' ')}`);
}
async function execute(command, cwd, timeoutMs, env, prefix) {
  refuseInstall(command);
  const start = Date.now();
  const startedAt = new Date().toISOString();
  const child = spawn(command[0], command.slice(1), { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = [], stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  let timedOut = false;
  let termination = null;
  const timer = setTimeout(() => {
    timedOut = true;
    termination = terminateProcessTree(child.pid);
  }, timeoutMs);
  const result = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (exitCode, signal) => resolve({ exitCode, signal })); });
  clearTimeout(timer);
  const stdoutPath = `${prefix}.stdout.log`, stderrPath = `${prefix}.stderr.log`;
  writeFileSync(stdoutPath, Buffer.concat(stdout));
  writeFileSync(stderrPath, Buffer.concat(stderr));
  return { command, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - start, exitCode: result.exitCode, signal: result.signal, timedOut, termination, stdoutPath, stderrPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: run-verification.mjs --private-root PATH --case-id ID --candidate-workspace PATH --judge-workspace PATH --out FILE\n');
    return;
  }
  const privateRoot = realpathSync(path.resolve(required(args, 'privateRoot')));
  const caseId = safeId(required(args, 'caseId'));
  const candidate = realpathSync(path.resolve(required(args, 'candidateWorkspace')));
  const judgeWorkspace = path.resolve(required(args, 'judgeWorkspace'));
  const out = path.resolve(required(args, 'out'));
  if (existsSync(judgeWorkspace)) throw new Error('judge-workspace must not already exist');
  mkdirSync(path.dirname(judgeWorkspace), { recursive: true });
  mkdirSync(path.dirname(out), { recursive: true });
  let workspaceRemoved = false;
  let fatalError = null;
  let finalResult = null;
  try {
  cpSync(candidate, judgeWorkspace, { recursive: true, dereference: true, errorOnExist: true, force: false });

  const privateCasePath = within(privateRoot, path.join(privateRoot, 'cases', 'private', `${caseId}.json`), 'private case');
  const privateCase = readJson(privateCasePath);
  const verification = privateCase.verification;
  const cwd = verification.cwd === '.' ? judgeWorkspace : within(judgeWorkspace, path.join(judgeWorkspace, safeRelative(verification.cwd, 'verification.cwd')), 'verification.cwd');
  const timeoutMs = Number(verification.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('verification.timeoutMs must be positive');
  const env = childEnvironment(verification.envAllowlist);
  const injected = [], setupResults = [], cleanupResults = [];
  let verificationResult = null;
  let setupPassed = true;
  try {
    for (const item of verification.injectFiles || []) {
      const source = within(privateRoot, path.join(privateRoot, safeRelative(item.source, 'injection source')), 'injection source');
      const target = within(judgeWorkspace, path.join(judgeWorkspace, safeRelative(item.target, 'injection target')), 'injection target');
      if (existsSync(target)) throw new Error(`Injection target already exists: ${item.target}`);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true, dereference: true, errorOnExist: true, force: false });
      injected.push(target);
    }
    for (const [index, value] of (verification.setupCommands || []).entries()) {
      const result = await execute(commandArray(value, `setupCommands[${index}]`), cwd, timeoutMs, env, path.join(path.dirname(out), `setup-${index + 1}`));
      setupResults.push(result);
      if (result.exitCode !== 0 || result.timedOut) { setupPassed = false; break; }
    }
    if (verification.type === 'hidden-test' && setupPassed) verificationResult = await execute(commandArray(verification.command, 'verification.command'), cwd, timeoutMs, env, path.join(path.dirname(out), 'verification'));
    else if (verification.type === 'human-review') commandArray(verification.command, 'verification.command', true);
    else if (verification.type !== 'hidden-test') throw new Error(`Unsupported result-verification type: ${verification.type}`);
  } finally {
    for (const [index, value] of (verification.cleanupCommands || []).entries()) {
      try { cleanupResults.push(await execute(commandArray(value, `cleanupCommands[${index}]`), cwd, timeoutMs, env, path.join(path.dirname(out), `cleanup-${index + 1}`))); }
      catch (error) { cleanupResults.push({ error: error instanceof Error ? error.message : String(error) }); }
    }
    for (const target of injected.reverse()) removeTree(target);
  }
  let workspaceRemovalError = null;
  try { removeTree(judgeWorkspace); workspaceRemoved = !existsSync(judgeWorkspace); }
  catch (error) { workspaceRemovalError = error instanceof Error ? error.message : String(error); }
  const cleanupPassed = cleanupResults.every((item) => !item.error && item.exitCode === 0 && !item.timedOut) && workspaceRemoved;
  const passed = verification.type === 'human-review' ? null : Boolean(setupPassed && verificationResult && verificationResult.exitCode === 0 && !verificationResult.timedOut);
  finalResult = {
    schemaVersion: 2,
    caseId,
    verificationType: verification.type,
    completedAt: new Date().toISOString(),
    candidateWorkspace: candidate,
    judgeWorkspace,
    setupPassed,
    passed,
    cleanupPassed,
    infrastructureError: !setupPassed || !cleanupPassed,
    cleanupAudit: { injectedFilesRemoved: injected.filter((target) => !existsSync(target)).length, judgeWorkspaceRemoved: workspaceRemoved, workspaceRemovalError },
    setupResults,
    verificationResult,
    cleanupResults,
    humanReviewSteps: verification.type === 'human-review' ? verification.steps : null
  };
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (!workspaceRemoved && existsSync(judgeWorkspace)) {
      try { removeTree(judgeWorkspace); } catch {}
    }
    workspaceRemoved = !existsSync(judgeWorkspace);
    if (finalResult) {
      finalResult.cleanupAudit.judgeWorkspaceRemoved = workspaceRemoved;
      if (workspaceRemoved) finalResult.cleanupAudit.workspaceRemovalError = null;
      finalResult.cleanupPassed = finalResult.cleanupResults.every((item) => !item.error && item.exitCode === 0 && !item.timedOut) && workspaceRemoved;
      finalResult.infrastructureError = !finalResult.setupPassed || !finalResult.cleanupPassed;
      writeFileSync(out, `${JSON.stringify(finalResult, null, 2)}\n`, 'utf8');
      process.stdout.write(`${out}\n`);
    } else if (fatalError) {
      const failure = {
        schemaVersion: 2,
        caseId,
        verificationType: null,
        completedAt: new Date().toISOString(),
        candidateWorkspace: candidate,
        judgeWorkspace,
        setupPassed: false,
        passed: false,
        cleanupPassed: workspaceRemoved,
        infrastructureError: true,
        error: fatalError,
        cleanupAudit: { injectedFilesRemoved: null, judgeWorkspaceRemoved: workspaceRemoved, workspaceRemovalError: workspaceRemoved ? null : 'Judge workspace remains after failure' },
        setupResults: [],
        verificationResult: null,
        cleanupResults: [],
        humanReviewSteps: null
      };
      writeFileSync(out, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
    }
  }
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
