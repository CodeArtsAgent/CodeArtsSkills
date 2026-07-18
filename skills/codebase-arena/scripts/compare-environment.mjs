#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = { input: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function versionTuple(value) {
  if (typeof value !== 'string') return null;
  if (/\d+(?:\.\d+){0,2}-[0-9A-Za-z]/.test(value)) return null;
  const match = value.trim().match(/(?:^|[^0-9])(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function assess(item) {
  const mode = item.requirement?.mode;
  const local = versionTuple(item.local?.version);
  const required = versionTuple(item.requirement?.version);
  const maximum = versionTuple(item.requirement?.maximumExclusiveVersion);

  if (!item.local?.version) return { comparison: 'missing', status: 'needs-user-decision' };
  if (!local || !required || !['minimum', 'exact', 'bounded'].includes(mode)) {
    return { comparison: 'unknown', status: 'needs-user-decision' };
  }

  const versusRequired = compare(local, required);
  if (mode === 'exact') {
    return versusRequired === 0
      ? { comparison: 'equal', status: 'reuse-local' }
      : { comparison: 'incompatible', status: 'needs-user-decision' };
  }

  if (versusRequired < 0) return { comparison: 'lower', status: 'needs-user-decision' };
  if (mode === 'bounded') {
    if (!maximum) return { comparison: 'unknown', status: 'needs-user-decision' };
    if (compare(local, maximum) >= 0) return { comparison: 'incompatible', status: 'needs-user-decision' };
  }
  return { comparison: versusRequired === 0 ? 'equal' : 'higher', status: 'reuse-local' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: compare-environment.mjs --input FILE [--out FILE]\n');
    return;
  }
  if (!args.input) throw new Error('--input is required');
  const input = JSON.parse(readFileSync(path.resolve(args.input), 'utf8'));
  if (!Array.isArray(input.requirements)) throw new Error('Input must contain a requirements array');

  const requirements = input.requirements.map((item) => {
    for (const field of ['id', 'component', 'category', 'requiredForSelectedCases', 'requirement', 'local']) {
      if (item[field] === undefined || item[field] === null) throw new Error(`Requirement is missing ${field}`);
    }
    const result = assess(item);
    return {
      ...item,
      comparison: result.comparison,
      decision: { status: result.status, approval: null },
      finalVerifiedVersion: result.status === 'reuse-local' ? item.local.version : null,
      notes: item.notes || {
        'zh-CN': result.status === 'reuse-local' ? '本地版本满足项目约束。' : '必须询问用户是否安装或提供兼容环境。',
        en: result.status === 'reuse-local' ? 'The local version satisfies the project constraint.' : 'Ask the user whether to install or provide a compatible environment.'
      }
    };
  });

  const output = {
    locales: ['zh-CN', 'en'],
    policy: 'reuse-compatible-local-otherwise-ask',
    requirements,
    summary: {
      'zh-CN': '已完成只读版本比较；任何待决项都必须先询问用户，禁止自行安装。',
      en: 'Read-only version comparison is complete; ask the user about every unresolved item and never install automatically.'
    },
    warnings: { 'zh-CN': [], en: [] }
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (args.out) writeFileSync(path.resolve(args.out), serialized, 'utf8');
  else process.stdout.write(serialized);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
