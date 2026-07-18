#!/usr/bin/env node
/**
 * skill-installer — single entry point for CodeArts skill/tool installers.
 *
 * Usage:
 *   node installer.js list
 *   node installer.js init   --target <name> [--project|--user]
 *   node installer.js update --target <name> [--project|--user]
 *   node installer.js delete --target <name> [--project|--user]
 *   node installer.js status [--target <name>] [--project|--user]
 *
 * <name> may be passed as --target <name> or as a positional argument.
 * Works on Windows, Linux, macOS — Node.js built-ins only.
 */

const { resolveScope, resolvePaths } = require('./lib/paths');
const registry = require('./targets');

const COMMANDS = ['list', 'init', 'update', 'delete', 'status'];

function usage() {
  console.error('Usage: node installer.js <command> [--target <name>] [--project|--user]');
  console.error('');
  console.error('Commands:');
  console.error('  list                            List supported targets');
  console.error('  init    --target <name>         Install a target');
  console.error('  update  --target <name>         Update a target');
  console.error('  delete  --target <name>         Uninstall a target');
  console.error('  status  [--target <name>]       Status of one target, or all');
  console.error('');
  console.error('Options:');
  console.error('  --target <name>   Target installer (see "list")');
  console.error('  --project         Target project-level (.codeartsdoer/skills/)');
  console.error('  --user            Target user-level (~/.codeartsdoer/skills/)');
  console.error('  (omit scope)      Auto-detect: project if .codeartsdoer/ in cwd, else user');
  console.error('');
  console.error('Supported targets: ' + registry.map(t => t.name).join(', '));
}

function findTarget(name) {
  return registry.find(t => t.name === name) || null;
}

function cmdList() {
  console.log('\nskill-installer — supported targets:\n');
  for (const t of registry) {
    console.log(`  ${t.name.padEnd(16)} ${t.displayName}`);
    console.log(`  ${' '.repeat(16)} scopes: ${t.scopes.join(', ')}  |  commands: ${t.commands.join(', ')}`);
    console.log(`  ${' '.repeat(16)} ${t.description}`);
    console.log('');
  }
}

function cmdStatusAll(scopeArgs) {
  const { scope, root } = resolveScope(scopeArgs);
  let allHealthy = true;
  let anyRan = false;
  for (const t of registry) {
    console.log(`\n=== ${t.displayName} (${t.name}) ===`);
    if (!t.scopes.includes(scope)) {
      console.log(`  (skipped: ${scope} scope not supported; supports ${t.scopes.join(', ')})`);
      continue;
    }
    anyRan = true;
    const ctx = resolvePaths(scope, root);
    const code = t.status(ctx);
    if (code !== 0) allHealthy = false;
  }
  if (!anyRan) {
    console.log('\n(no targets support the resolved scope)');
  }
  process.exit(allHealthy ? 0 : 1);
}

function parseArgs(argv) {
  const command = argv[0];
  if (!command || !COMMANDS.includes(command)) {
    usage();
    process.exit(1);
  }
  const rest = argv.slice(1);
  let targetName = null;
  const scopeArgs = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--target') {
      targetName = rest[++i];
      if (!targetName) { console.error('Error: --target requires a value.'); process.exit(1); }
      continue;
    }
    if (a.startsWith('--target=')) { targetName = a.slice('--target='.length); continue; }
    if (a === '--project' || a === '--user') { scopeArgs.push(a); continue; }
    if (!a.startsWith('-') && !targetName) { targetName = a; continue; }
    console.error(`Error: unknown argument "${a}".`);
    usage();
    process.exit(1);
  }
  return { command, targetName, scopeArgs };
}

function main() {
  const { command, targetName, scopeArgs } = parseArgs(process.argv.slice(2));

  if (command === 'list') {
    cmdList();
    process.exit(0);
  }

  if (command === 'status' && !targetName) {
    cmdStatusAll(scopeArgs);
    return;
  }

  if (!targetName) {
    console.error('Error: --target <name> is required for this command.');
    console.error('Available targets: ' + registry.map(t => t.name).join(', '));
    console.error('Run "list" for details.');
    process.exit(1);
  }

  const target = findTarget(targetName);
  if (!target) {
    console.error(`Error: unknown target "${targetName}".`);
    console.error('Available targets: ' + registry.map(t => t.name).join(', '));
    process.exit(1);
  }

  if (!target.commands.includes(command)) {
    console.error(`Error: target "${targetName}" does not support command "${command}".`);
    console.error(`  Supported commands: ${target.commands.join(', ')}`);
    process.exit(1);
  }

  const { scope, root } = resolveScope(scopeArgs);
  if (!target.scopes.includes(scope)) {
    console.error(`Error: target "${targetName}" does not support scope "${scope}".`);
    console.error(`  Supported scopes: ${target.scopes.join(', ')}`);
    process.exit(1);
  }

  const ctx = resolvePaths(scope, root);
  console.log(`\nskill-installer — ${command} ${target.name} — ${scope} scope\n`);
  const code = target[command](ctx);
  process.exit(typeof code === 'number' ? code : 0);
}

main();