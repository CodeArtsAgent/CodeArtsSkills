#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
    args[flag.slice(2)] = rest[++i];
  }
  return args;
}
function required(args, key) { if (!args[key]) throw new Error(`--${key} is required`); return args[key]; }
function quoteYaml(value) { return JSON.stringify(String(value)); }
function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${file} is missing YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!item) throw new Error(`${file} has unsupported frontmatter syntax: ${line}`);
    fields[item[1]] = item[2].replace(/^(["'])(.*)\1$/, '$2').trim();
  }
  return fields;
}
function parseOpenaiYaml(file) {
  const text = readFileSync(file, 'utf8');
  if (!/^interface:\s*$/m.test(text)) throw new Error(`${file} is missing interface`);
  const result = {};
  for (const key of ['display_name', 'short_description', 'default_prompt']) {
    const match = text.match(new RegExp(`^\\s{2}${key}:\\s*("(?:[^"\\\\]|\\\\.)*")\\s*$`, 'm'));
    if (!match) throw new Error(`${file} is missing quoted ${key}`);
    result[key] = JSON.parse(match[1]);
  }
  return result;
}
function validateSkill(root) {
  const skillFile = path.join(root, 'SKILL.md');
  const fields = frontmatter(skillFile);
  const keys = Object.keys(fields).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['description', 'name'])) throw new Error('Root SKILL.md frontmatter must contain exactly name and description');
  if (!/^[a-z0-9-]{1,63}$/.test(fields.name)) throw new Error('Skill name must be lowercase hyphen-case and shorter than 64 characters');
  if (path.basename(root) !== fields.name) throw new Error('Skill folder name must match frontmatter name');
  if (!fields.description) throw new Error('Skill description must be non-empty');
  const ui = parseOpenaiYaml(path.join(root, 'agents', 'openai.yaml'));
  if (ui.short_description.length < 25 || ui.short_description.length > 64) throw new Error('short_description must be 25-64 characters');
  if (!ui.default_prompt.includes(`$${fields.name}`)) throw new Error(`default_prompt must mention $${fields.name}`);
  const workflows = [
    'references/workflows/generate.md',
    'references/workflows/execute.md',
    'references/workflows/report.md'
  ];
  for (const relative of workflows) {
    const file = path.join(root, relative);
    if (!existsSync(file)) throw new Error(`Missing workflow: ${relative}`);
    if (readFileSync(file, 'utf8').startsWith('---\n')) throw new Error(`${relative} must be a workflow reference, not a nested skill`);
  }
  for (const relative of ['assets/evaluation-blueprint.template.json', 'assets/judgment.template.json', 'assets/execution-contract.template.json', 'assets/execution-request.template.json']) {
    if (!existsSync(path.join(root, relative))) throw new Error(`Missing execution protocol template: ${relative}`);
  }
  process.stdout.write(`Skill validation passed: ${fields.name}\n`);
}
function generate(root, args) {
  const fields = frontmatter(path.join(root, 'SKILL.md'));
  const displayName = required(args, 'display-name');
  const shortDescription = required(args, 'short-description');
  const defaultPrompt = required(args, 'default-prompt');
  if (!defaultPrompt.includes(`$${fields.name}`)) throw new Error(`default-prompt must mention $${fields.name}`);
  const output = `interface:\n  display_name: ${quoteYaml(displayName)}\n  short_description: ${quoteYaml(shortDescription)}\n  default_prompt: ${quoteYaml(defaultPrompt)}\n`;
  const target = path.join(root, 'agents', 'openai.yaml');
  writeFileSync(target, output, 'utf8');
  process.stdout.write(`${target}\n`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(required(args, 'skill-root'));
  if (args.command === 'generate') generate(root, args);
  else if (args.command === 'validate') validateSkill(root);
  else throw new Error('Usage: skill-metadata.mjs <generate|validate> --skill-root PATH [generate options]');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
