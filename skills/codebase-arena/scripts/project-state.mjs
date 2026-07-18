#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { removeTree } from './platform-utils.mjs';

const excludedRootNames = new Set(['.codebase-eval', '.codebase-eval-worker']);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
    args[flag.slice(2)] = rest[++index];
  }
  return args;
}
function required(args, key) { if (!args[key]) throw new Error(`--${key} is required`); return args[key]; }
function relativePathText(value) { return (path.relative(process.cwd(), path.resolve(value)) || '.').split(path.sep).join('/'); }
function writeJson(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, target);
}
function readJson(file) { return JSON.parse(readFileSync(path.resolve(file), 'utf8')); }
function sameOrInside(root, candidate) {
  const canonical = (value) => {
    let current = path.resolve(value);
    const missing = [];
    while (!existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(value);
      missing.unshift(path.basename(current));
      current = parent;
    }
    return path.join(realpathSync(current), ...missing);
  };
  const base = canonical(root);
  const target = canonical(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}
function assertEvidencePath(project, candidate, label) {
  const evaluationRoot = path.join(project, '.codebase-eval');
  if (!sameOrInside(evaluationRoot, candidate) || path.resolve(candidate) === evaluationRoot) throw new Error(`${label} must remain under the project's .codebase-eval root`);
}
function gitSnapshotSelection(project) {
  try {
    if (execFileSync('git', ['-C', project, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).trim() !== 'true') throw new Error('not a work tree');
    const listed = execFileSync('git', ['-C', project, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
    const included = new Set();
    const recursiveRoots = new Set();
    for (const item of listed) {
      const normalized = item.split(path.sep).join('/');
      if (!normalized || normalized === '.codebase-eval' || normalized.startsWith('.codebase-eval/') || normalized === '.codebase-eval-worker' || normalized.startsWith('.codebase-eval-worker/')) continue;
      included.add(normalized);
      let parent = path.posix.dirname(normalized);
      while (parent !== '.') { included.add(parent); parent = path.posix.dirname(parent); }
      const full = path.join(project, ...normalized.split('/'));
      if (existsSync(full) && lstatSync(full).isDirectory()) recursiveRoots.add(normalized);
    }
    return { included, recursiveRoots };
  } catch (error) {
    throw new Error(`Project snapshot requires a Git work tree so .gitignore exclusions can be applied: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function gitSemanticState(project) {
  const command = (args, allowFailure = false) => {
    try { return execFileSync('git', ['-C', project, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }); }
    catch (error) { if (allowFailure) return Buffer.alloc(0); throw error; }
  };
  return {
    head: command(['rev-parse', '--verify', 'HEAD'], true).toString('utf8').trim() || null,
    symbolicHead: command(['symbolic-ref', '-q', 'HEAD'], true).toString('utf8').trim() || null,
    indexEntriesSha256: createHash('sha256').update(command(['ls-files', '--stage', '-z'])).digest('hex'),
    refsSha256: createHash('sha256').update(command(['for-each-ref', '--format=%(refname)%00%(objectname)%00'])).digest('hex')
  };
}
function selected(relative, selection) {
  if (!selection) return true;
  const normalized = relative.split(path.sep).join('/');
  if (selection.included.has(normalized)) return true;
  return [...selection.recursiveRoots].some((root) => normalized.startsWith(`${root}/`));
}
function inventory(root, relative = '', result = {}, selection = null) {
  const current = path.join(root, relative);
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (relative === '' && excludedRootNames.has(entry.name)) continue;
    const rel = path.join(relative, entry.name);
    const normalized = rel.split(path.sep).join('/');
    if (!selected(normalized, selection)) continue;
    const full = path.join(root, rel);
    const stat = lstatSync(full);
    const mode = stat.mode & 0o777;
    if (entry.isDirectory()) {
      result[normalized] = { type: 'directory', mode };
      inventory(root, rel, result, selection);
    } else if (entry.isSymbolicLink()) result[normalized] = { type: 'symlink', mode, target: readlinkSync(full) };
    else if (entry.isFile()) result[normalized] = { type: 'file', mode, size: stat.size, sha256: createHash('sha256').update(readFileSync(full)).digest('hex') };
    else result[normalized] = { type: 'special', mode, size: stat.size };
  }
  return result;
}
function digestInventory(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function materializeInventory(source, target, entries) {
  mkdirSync(target, { recursive: true });
  for (const [relative, item] of Object.entries(entries).filter(([, item]) => item.type === 'directory').sort(([a], [b]) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const destination = path.join(target, ...relative.split('/'));
    mkdirSync(destination, { recursive: true });
    chmodSync(destination, item.mode);
  }
  for (const [relative, item] of Object.entries(entries).filter(([, item]) => item.type !== 'directory').sort(([a], [b]) => a.localeCompare(b))) {
    const origin = path.join(source, ...relative.split('/'));
    const destination = path.join(target, ...relative.split('/'));
    mkdirSync(path.dirname(destination), { recursive: true });
    if (existsSync(destination) || lstatExists(destination)) removeTree(destination);
    if (item.type === 'file') {
      copyFileSync(origin, destination);
      chmodSync(destination, item.mode);
    } else if (item.type === 'symlink') symlinkSync(readlinkSync(origin), destination);
    else throw new Error(`Unsupported project entry type during snapshot or restore: ${relative}`);
  }
}
function lstatExists(target) { try { lstatSync(target); return true; } catch { return false; } }
function removeManagedEntries(project, entries) {
  for (const [relative, item] of Object.entries(entries).sort(([a], [b]) => b.split('/').length - a.split('/').length || b.localeCompare(a))) {
    if (relative === '.git' || relative.startsWith('.git/')) continue;
    const target = path.join(project, ...relative.split('/'));
    if (!lstatExists(target)) continue;
    if (item.type === 'directory') {
      try { rmdirSync(target); } catch (error) { if (error?.code !== 'ENOTEMPTY' && error?.code !== 'EEXIST') throw error; }
    } else removeTree(target);
  }
  removeTree(path.join(project, '.git'));
  removeTree(path.join(project, '.codebase-eval-worker'));
}
function snapshotCommand(args) {
  const project = path.resolve(required(args, 'project'));
  const snapshot = path.resolve(required(args, 'snapshot'));
  const manifestPath = path.resolve(required(args, 'manifest'));
  if (!existsSync(project) || !statSync(project).isDirectory()) throw new Error('Project must be an existing directory');
  assertEvidencePath(project, snapshot, 'snapshot');
  assertEvidencePath(project, manifestPath, 'manifest');
  if (existsSync(snapshot) || existsSync(manifestPath)) throw new Error('Initial project snapshot or manifest already exists');
  const selection = gitSnapshotSelection(project);
  const before = inventory(project, '', {}, selection);
  materializeInventory(project, snapshot, before);
  const gitDirectory = path.join(project, '.git');
  if (!existsSync(gitDirectory) || !lstatSync(gitDirectory).isDirectory()) throw new Error('Project snapshot currently requires .git to be a directory');
  cpSync(gitDirectory, path.join(snapshot, '.git'), { recursive: true, dereference: false, errorOnExist: true, force: false, preserveTimestamps: true, verbatimSymlinks: true });
  const copied = inventory(snapshot, '', {}, selection);
  if (JSON.stringify(before) !== JSON.stringify(copied)) {
    removeTree(snapshot);
    throw new Error('Initial project snapshot does not exactly match the project state');
  }
  const createdAt = new Date().toISOString();
  const gitSnapshotInventory = inventory(path.join(snapshot, '.git'));
  const manifest = { schemaVersion: 3, kind: 'codebase-eval-project-baseline', createdAt, owner: 'evaluated-product-main-agent', snapshotPath: relativePathText(snapshot), exclusions: [...excludedRootNames, '.git-bytewise-comparison', 'git-ignored-files-and-directories'].sort(), gitIgnorePolicy: 'exclude-standard-ignored', gitMetadataPolicy: 'restore-private-snapshot-verify-semantic-state', gitSemanticState: gitSemanticState(project), gitSnapshotDigest: digestInventory(gitSnapshotInventory), inventoryDigest: digestInventory(before), inventory: before };
  writeJson(manifestPath, manifest);
  process.stdout.write(`${relativePathText(manifestPath)}\n`);
}
function freezeCommand(args) {
  const project = path.resolve(required(args, 'project'));
  const snapshot = path.resolve(required(args, 'snapshot'));
  if (!existsSync(project) || !statSync(project).isDirectory()) throw new Error('Project must be an existing directory');
  assertEvidencePath(project, snapshot, 'snapshot');
  if (existsSync(snapshot)) throw new Error('Completed-state snapshot already exists');
  const selection = gitSnapshotSelection(project);
  const before = inventory(project, '', {}, selection);
  materializeInventory(project, snapshot, before);
  const copied = inventory(snapshot, '', {}, selection);
  if (JSON.stringify(before) !== JSON.stringify(copied)) {
    removeTree(snapshot);
    throw new Error('Completed-state snapshot does not exactly match the managed project state');
  }
  process.stdout.write(`${relativePathText(snapshot)}\n`);
}
function restoreCommand(args) {
  const project = path.resolve(required(args, 'project'));
  const snapshot = path.resolve(required(args, 'snapshot'));
  const manifestPath = path.resolve(required(args, 'manifest'));
  const evidencePath = path.resolve(required(args, 'evidence'));
  assertEvidencePath(project, snapshot, 'snapshot');
  assertEvidencePath(project, manifestPath, 'manifest');
  assertEvidencePath(project, evidencePath, 'evidence');
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 3 || manifest.kind !== 'codebase-eval-project-baseline' || manifest.owner !== 'evaluated-product-main-agent' || manifest.gitIgnorePolicy !== 'exclude-standard-ignored' || manifest.gitMetadataPolicy !== 'restore-private-snapshot-verify-semantic-state') throw new Error('Unsupported project baseline manifest');
  const snapshotInventory = inventory(snapshot, '', {}, gitSnapshotSelection(project));
  if (digestInventory(snapshotInventory) !== manifest.inventoryDigest || JSON.stringify(snapshotInventory) !== JSON.stringify(manifest.inventory)) throw new Error('Initial project snapshot is incomplete or modified; refusing restoration');
  if (digestInventory(inventory(path.join(snapshot, '.git'))) !== manifest.gitSnapshotDigest) throw new Error('Initial private Git snapshot is incomplete or modified; refusing restoration');
  const liveSelection = gitSnapshotSelection(project);
  const liveManaged = inventory(project, '', {}, liveSelection);
  removeManagedEntries(project, liveManaged);
  materializeInventory(snapshot, project, manifest.inventory);
  cpSync(path.join(snapshot, '.git'), path.join(project, '.git'), { recursive: true, dereference: false, errorOnExist: true, force: false, preserveTimestamps: true, verbatimSymlinks: true });
  const restored = inventory(project, '', {}, gitSnapshotSelection(project));
  const restoredExactly = JSON.stringify(restored) === JSON.stringify(manifest.inventory);
  const gitRestoredSemantically = JSON.stringify(gitSemanticState(project)) === JSON.stringify(manifest.gitSemanticState);
  const evidence = { schemaVersion: 2, kind: 'codebase-eval-project-restore-evidence', completedAt: new Date().toISOString(), owner: 'evaluated-product-case-coordinator', baselineManifestPath: relativePathText(manifestPath), baselineSnapshotPath: relativePathText(snapshot), restoredExactly, gitRestoredSemantically, restoredInventoryDigest: digestInventory(restored), expectedInventoryDigest: manifest.inventoryDigest, exclusions: manifest.exclusions };
  writeJson(evidencePath, evidence);
  if (!restoredExactly || !gitRestoredSemantically) throw new Error('Project restoration did not reproduce the initial project and semantic Git state');
  process.stdout.write(`${relativePathText(evidencePath)}\n`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'snapshot') snapshotCommand(args);
  else if (args.command === 'freeze') freezeCommand(args);
  else if (args.command === 'restore') restoreCommand(args);
  else throw new Error('Usage: project-state.mjs snapshot|freeze|restore --project <project> --snapshot <snapshot> [--manifest <manifest>] [--evidence <evidence>]');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
