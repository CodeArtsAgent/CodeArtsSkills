#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = { repo: process.cwd(), out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo') args.repo = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function git(repo, args, fallback = null) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    }).trimEnd();
  } catch {
    return fallback;
  }
}

const ignoredDirectories = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', 'dist', 'build', 'target',
  '.next', '.cache', 'coverage', '__pycache__', '.venv', 'venv'
]);

function walk(root, relative = '', result = []) {
  const current = path.join(root, relative);
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(root, rel, result);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      result.push(rel.split(path.sep).join('/'));
    }
  }
  return result;
}

function extensionOf(file) {
  const base = path.basename(file);
  if (!base.includes('.') || base.startsWith('.') && base.indexOf('.', 1) === -1) return '[no-extension]';
  return path.extname(base).toLowerCase() || '[no-extension]';
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const manifestNames = new Set([
  'package.json', 'pyproject.toml', 'requirements.txt', 'pipfile', 'poetry.lock',
  'cargo.toml', 'go.mod', 'go.sum', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'settings.gradle', 'settings.gradle.kts', 'gemfile', 'composer.json', 'mix.exs',
  'pubspec.yaml', 'deno.json', 'deno.jsonc', 'bun.lockb', 'bun.lock', 'pnpm-workspace.yaml',
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'uv.lock', 'pipfile.lock',
  'cargo.lock', 'gemfile.lock', 'composer.lock'
]);

const environmentRequirementNames = new Set([
  '.nvmrc', '.node-version', '.python-version', '.ruby-version', '.java-version',
  '.tool-versions', 'rust-toolchain', 'rust-toolchain.toml', 'global.json',
  'gradle-wrapper.properties', 'maven-wrapper.properties'
]);

function isEnvironmentRequirementFile(file) {
  return environmentRequirementNames.has(path.basename(file).toLowerCase());
}

function isManifest(file) {
  const lower = path.basename(file).toLowerCase();
  return manifestNames.has(lower) || /\.(csproj|fsproj|vbproj|sln)$/.test(lower);
}

function isInstruction(file) {
  const lower = file.toLowerCase();
  const base = path.basename(lower);
  return base === 'agents.md' || base === 'claude.md' || base === '.cursorrules' ||
    base === '.windsurfrules' || base.startsWith('readme') || base.startsWith('contributing') ||
    lower.endsWith('.github/copilot-instructions.md') || lower.includes('/.github/instructions/');
}

function isTestFile(file) {
  const lower = file.toLowerCase();
  return /(^|\/)(__tests__|tests?|specs?)(\/|$)/.test(lower) ||
    /\.(test|spec)\.[a-z0-9]+$/.test(lower);
}

function isBuildOrTestConfig(file) {
  const base = path.basename(file).toLowerCase();
  return /^(jest|vitest|playwright|cypress|webpack|vite|rollup|eslint|tsconfig|babel|swc)/.test(base) ||
    /^(makefile|dockerfile|docker-compose\.(yml|yaml)|compose\.(yml|yaml))$/.test(base) ||
    file.startsWith('.github/workflows/') || file.startsWith('.circleci/');
}

function packageSummary(repo, manifestPaths) {
  const summaries = [];
  for (const file of manifestPaths.filter((file) => path.basename(file) === 'package.json').slice(0, 100)) {
    try {
      const value = JSON.parse(readFileSync(path.join(repo, file), 'utf8'));
      summaries.push({
        path: file,
        name: value.name ?? null,
        version: value.version ?? null,
        type: value.type ?? null,
        private: value.private === true,
        workspaces: value.workspaces ?? null,
        packageManager: value.packageManager ?? null,
        scripts: value.scripts ?? {},
        engines: value.engines ?? {},
        devEngines: value.devEngines ?? {}
      });
    } catch {
      summaries.push({ path: file, parseError: true });
    }
  }
  return summaries;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: collect-repo-facts.mjs [--repo PATH] [--out FILE]\n');
    return;
  }
  if (!existsSync(args.repo) || !lstatSync(args.repo).isDirectory()) {
    throw new Error(`Repository directory does not exist: ${args.repo}`);
  }

  const repo = realpathSync(args.repo);
  const insideGit = git(repo, ['rev-parse', '--is-inside-work-tree'], 'false') === 'true';
  const tracked = insideGit ? git(repo, ['ls-files', '-z'], '') : '';
  const files = tracked ? tracked.split('\0').filter(Boolean) : walk(repo);
  const manifests = files.filter(isManifest).sort();
  const instructions = files.filter(isInstruction).sort();
  const tests = files.filter(isTestFile).sort();
  const configs = files.filter(isBuildOrTestConfig).sort();
  const environmentRequirements = files.filter(isEnvironmentRequirementFile).sort();
  const generatedOrVendor = files.filter((file) => /(^|\/)(dist|build|target|generated|vendor|node_modules)(\/|$)/.test(file));

  const result = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    repoPath: (path.relative(process.cwd(), repo) || '.').split(path.sep).join('/'),
    git: insideGit ? {
      head: git(repo, ['rev-parse', 'HEAD']),
      branch: git(repo, ['branch', '--show-current'], ''),
      shallow: git(repo, ['rev-parse', '--is-shallow-repository'], 'unknown'),
      commitCount: Number(git(repo, ['rev-list', '--count', 'HEAD'], '0')),
      status: git(repo, ['status', '--short'], '').split('\n').filter(Boolean),
      remotes: git(repo, ['remote', '-v'], '').split('\n').filter(Boolean)
    } : null,
    inventory: {
      source: insideGit ? 'git-tracked-files' : 'filesystem-with-common-generated-directories-excluded',
      totalFiles: files.length,
      extensions: countBy(files, extensionOf),
      topLevel: countBy(files, (file) => file.split('/')[0]),
      potentialGeneratedOrVendorPathCount: generatedOrVendor.length,
      potentialGeneratedOrVendorPathSample: generatedOrVendor.slice(0, 100)
    },
    manifests,
    packageManifests: packageSummary(repo, manifests),
    environmentRequirementFiles: environmentRequirements,
    instructionAndDocumentationFiles: instructions,
    buildAndTestConfigFiles: configs,
    testFileCount: tests.length,
    testFileSample: tests.slice(0, 200),
    notes: [
      'This file contains deterministic inventory only; architecture, industry, and workflow claims require source inspection and human confirmation.',
      'Untracked secrets and file contents are not collected.',
      'Generated/vendor path detection is heuristic; confirm each candidate before exclusion.',
      'Environment requirement files and manifest constraints are evidence only; compare installed versions read-only and ask before any installation.'
    ]
  };

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    writeFileSync(path.resolve(args.out), output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
