#!/usr/bin/env node
/**
 * OpenSpec Installer for CodeArts
 *
 * Usage:
 *   node installer.js init    [--project|--user]   Install OpenSpec skills
 *   node installer.js update  [--project|--user]   Regenerate skills from latest openspec CLI
 *   node installer.js delete  [--project|--user]   Uninstall OpenSpec skills
 *   node installer.js status  [--project|--user]   Show install state
 *
 * If --project/--user is omitted and .codeartsdoer/ exists in the current
 * directory, it defaults to that project. Otherwise defaults to user-level.
 *
 * Installs skills only (no openspec/ spec dir). Run `openspec init` in each
 * project to create its openspec/ directory.
 *
 * Works on Windows, Linux, macOS — only dependencies are Node.js (>= 20.19)
 * and npm (for the openspec CLI). No git required.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const OPENSPEC_PKG = '@fission-ai/openspec@latest';
const DONOR_TOOL = 'trae';
const PROFILE = 'core';
const SKILL_PREFIX = 'openspec-';
const DONOR_SKILLS_REL = path.join(`.${DONOR_TOOL}`, 'skills');

const INSTALLER_ROOT = path.join(__dirname, '..');
const MANIFESTS_DIR = path.join(INSTALLER_ROOT, 'assets', 'manifests');

// ─── helpers ────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function cpDir(src, dest) {
  rmDir(dest);
  fs.cpSync(src, dest, { recursive: true });
}

function isWindows() {
  return process.platform === 'win32';
}

function openspecBin() {
  return isWindows() ? 'openspec.cmd' : 'openspec';
}

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.codeartsdoer'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ─── node version ───────────────────────────────────────────────────────────

function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function semverGte(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function checkNodeVersion() {
  const cur = parseSemver(process.version);
  const need = [20, 19, 0];
  if (!semverGte(cur, need)) {
    console.error(`Error: OpenSpec requires Node.js >= 20.19.0. Current is ${process.version}.`);
    console.error('Please upgrade Node.js and re-run.');
    process.exit(1);
  }
}

// ─── openspec CLI ───────────────────────────────────────────────────────────

function detectOpenspecCli() {
  try {
    return execSync(`${openspecBin()} --version`, { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

function ensureOpenspecCli() {
  let version = detectOpenspecCli();
  if (version) return version;
  console.log('==> openspec CLI not found. Installing globally...');
  run(`npm install -g ${OPENSPEC_PKG}`);
  version = detectOpenspecCli();
  if (!version) {
    console.error('Error: openspec CLI still not found after global install.');
    console.error(`Try manually: npm install -g ${OPENSPEC_PKG}`);
    process.exit(1);
  }
  console.log(`    openspec CLI installed: ${version}`);
  return version;
}

// ─── parse CLI / target ─────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || !['init', 'update', 'delete', 'status'].includes(command)) {
    console.error('Usage: node installer.js <init|update|delete|status> [--project|--user]');
    console.error('');
    console.error('  init    Install OpenSpec skills');
    console.error('  update  Regenerate skills from latest openspec CLI');
    console.error('  delete  Uninstall OpenSpec skills completely');
    console.error('  status  Show current install state');
    console.error('');
    console.error('Options:');
    console.error('  --project   Target project-level (.codeartsdoer/skills/)');
    console.error('  --user      Target user-level (~/.codeartsdoer/skills/)');
    console.error('  (omit)      Auto-detect: project if .codeartsdoer/ in cwd, else user');
    process.exit(1);
  }
  return { command, args: args.slice(1) };
}

function resolveTarget(extraArgs) {
  const explicitUser = extraArgs.includes('--user');
  const explicitProject = extraArgs.includes('--project');
  if (explicitUser && explicitProject) {
    console.error('Error: cannot use both --user and --project.');
    process.exit(1);
  }
  if (explicitUser) return 'user';
  if (explicitProject) return 'project';
  const cwd = process.env.INIT_CWD || process.cwd();
  if (fs.existsSync(path.join(cwd, '.codeartsdoer'))) {
    console.log(`Auto-detected project at: ${cwd}`);
    return 'project';
  }
  console.log('No .codeartsdoer/ in current directory, defaulting to user-level.');
  return 'user';
}

function getPaths(target) {
  const home = os.homedir();
  let skillsDir, statusFile;
  if (target === 'user') {
    skillsDir = path.join(home, '.codeartsdoer', 'skills');
    statusFile = path.join(skillsDir, 'UserSkillStatus.txt');
  } else {
    const root = findProjectRoot(process.env.INIT_CWD || process.cwd());
    if (!root) {
      console.error('Error: not inside a CodeArts project (no .codeartsdoer/ found).');
      console.error('Use --user to install at user level, or run from a project directory.');
      process.exit(1);
    }
    skillsDir = path.join(root, '.codeartsdoer', 'skills');
    statusFile = path.join(skillsDir, 'ProjectSkillStatus.txt');
  }
  if (!fs.existsSync(MANIFESTS_DIR)) fs.mkdirSync(MANIFESTS_DIR, { recursive: true });
  const dirHash = crypto.createHash('md5').update(skillsDir).digest('hex').substring(0, 8);
  const manifestFile = path.join(MANIFESTS_DIR, `manifest-${dirHash}.json`);
  const label = target === 'user' ? 'user-level' : `project-level (${skillsDir})`;
  return { target, skillsDir, statusFile, manifestFile, label };
}

// ─── manifest ───────────────────────────────────────────────────────────────

function collectFiles(dir, result) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, result);
    else result.push(full);
  }
}

function writeManifest(manifestFile, skillsDir, skillNames, openspecVersion) {
  const files = [];
  for (const name of skillNames) {
    const dir = path.join(skillsDir, name);
    if (fs.existsSync(dir)) collectFiles(dir, files);
  }
  const manifest = {
    installedAt: new Date().toISOString(),
    openspecVersion,
    skillsDir,
    skillNames,
    files
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`    Manifest saved: ${files.length} files tracked.`);
}

function readManifest(manifestFile) {
  if (!fs.existsSync(manifestFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// ─── status file ────────────────────────────────────────────────────────────

function readEnabledSkills(statusFile) {
  if (!fs.existsSync(statusFile)) return [];
  const content = fs.readFileSync(statusFile, 'utf-8').replace(/\r\n/g, '\n');
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => l && l.includes('='))
    .map(l => l.split('=')[0]);
}

function updateStatusFile(statusFile, mode, skillNames) {
  if (!fs.existsSync(statusFile)) {
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, '');
  }
  let content = fs.readFileSync(statusFile, 'utf-8').replace(/\r\n/g, '\n');

  if (mode === 'enable') {
    let added = 0;
    for (const name of skillNames) {
      if (!content.split('\n').some(l => l.trim().startsWith(`${name}=`))) {
        content = (content.trim() + `\n${name}=true`).replace(/^\n/, '');
        added++;
      }
    }
    if (added > 0) {
      fs.writeFileSync(statusFile, content.trim() + '\n');
      console.log(`    Enabled ${added} skill(s) in ${path.basename(statusFile)}.`);
    } else {
      console.log('    All skills already registered in status file.');
    }
  } else if (mode === 'disable') {
    const set = new Set(skillNames);
    const lines = content.split('\n').filter(l => {
      const t = l.trim();
      if (!t) return false;
      const name = t.split('=')[0];
      return !set.has(name);
    });
    fs.writeFileSync(statusFile, lines.join('\n').trim() + '\n');
    console.log(`    Removed ${skillNames.length} skill(s) from ${path.basename(statusFile)}.`);
  }
}

// ─── donor skill generation ─────────────────────────────────────────────────

function generateDonorSkills(tmpDir) {
  console.log(`==> Generating OpenSpec skills (donor: ${DONOR_TOOL}, profile: ${PROFILE})...`);
  rmDir(tmpDir);
  fs.mkdirSync(tmpDir, { recursive: true });
  run(`${openspecBin()} init --tools ${DONOR_TOOL} --profile ${PROFILE}`, {
    cwd: tmpDir,
    env: { ...process.env, CI: '1' }
  });
  const donorSkillsDir = path.join(tmpDir, DONOR_SKILLS_REL);
  if (!fs.existsSync(donorSkillsDir)) {
    console.error(`Error: expected generated skills at ${DONOR_SKILLS_REL}/ in temp dir.`);
    console.error('The openspec CLI layout may have changed.');
    process.exit(1);
  }
  const skillNames = fs.readdirSync(donorSkillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith(SKILL_PREFIX))
    .map(e => e.name)
    .sort();
  if (skillNames.length === 0) {
    console.error('Error: openspec init did not generate any openspec-* skills.');
    process.exit(1);
  }
  console.log(`    Generated ${skillNames.length} skill(s): ${skillNames.join(', ')}`);
  return { donorSkillsDir, skillNames };
}

// ─── commands ───────────────────────────────────────────────────────────────

function installSkills(paths, openspecVersion, action) {
  const { skillsDir, statusFile, manifestFile, label } = paths;
  console.log(`\nOpenSpec ${action === 'update' ? 'Update' : 'Init'} — ${label}\n`);
  console.log(`  Skills dir   : ${skillsDir}`);
  console.log(`  Status file  : ${statusFile}`);
  console.log(`  Manifest     : ${manifestFile}`);
  console.log(`  openspec     : ${openspecVersion}\n`);

  const tmpDir = path.join(os.tmpdir(), `openspec-installer-${action}-${process.pid}`);
  const { donorSkillsDir, skillNames } = generateDonorSkills(tmpDir);

  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  console.log(`\n==> ${action === 'update' ? 'Overwriting' : 'Installing'} skills...`);
  for (const name of skillNames) {
    cpDir(path.join(donorSkillsDir, name), path.join(skillsDir, name));
    console.log(`    ${name}`);
  }

  console.log('\n==> Registering skills...');
  updateStatusFile(statusFile, 'enable', skillNames);

  console.log('\n==> Writing manifest...');
  writeManifest(manifestFile, skillsDir, skillNames, openspecVersion);

  rmDir(tmpDir);
  console.log(`\n==> Done! OpenSpec skills ${action === 'update' ? 'updated' : 'installed'}. Restart CodeArts to apply.`);
  console.log('    Create the project spec dir with `openspec init` before your first change.');
}

function cmdInit(paths) {
  checkNodeVersion();
  const openspecVersion = ensureOpenspecCli();
  installSkills(paths, openspecVersion, 'init');
}

function cmdUpdate(paths) {
  checkNodeVersion();
  const openspecVersion = ensureOpenspecCli();
  installSkills(paths, openspecVersion, 'update');
}

function cmdDelete(paths) {
  const { skillsDir, statusFile, manifestFile, label } = paths;
  console.log(`\nOpenSpec Delete — ${label}\n`);

  let skillNames = [];
  const manifest = readManifest(manifestFile);
  if (manifest && Array.isArray(manifest.skillNames)) {
    skillNames = manifest.skillNames;
    console.log('==> Using manifest to identify installed skills.');
  } else {
    console.log('==> No manifest found — scanning skills dir for openspec-* skills (best-effort).');
    if (fs.existsSync(skillsDir)) {
      skillNames = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith(SKILL_PREFIX))
        .map(e => e.name);
    }
  }

  if (skillNames.length === 0) {
    console.log('    No openspec-* skills found — nothing to remove.');
  } else {
    console.log('\n==> Removing skills...');
    for (const name of skillNames) {
      const dir = path.join(skillsDir, name);
      if (fs.existsSync(dir)) {
        rmDir(dir);
        console.log(`    Removed ${name}`);
      } else {
        console.log(`    ${name} not found — skipping.`);
      }
    }

    console.log('\n==> Unregistering skills...');
    updateStatusFile(statusFile, 'disable', skillNames);
  }

  if (fs.existsSync(manifestFile)) {
    rmDir(manifestFile);
    console.log('\n==> Removed manifest.');
  }

  console.log('\n==> Done! OpenSpec skills uninstalled. (openspec/ spec data left intact.)');
}

function cmdStatus(paths) {
  const { skillsDir, statusFile, manifestFile, label } = paths;
  console.log(`\nOpenSpec Status — ${label}\n`);

  const cliVersion = detectOpenspecCli();
  console.log(`  openspec CLI    : ${cliVersion || 'NOT installed'}`);

  const present = [];
  if (fs.existsSync(skillsDir)) {
    present.push(...fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith(SKILL_PREFIX))
      .map(e => e.name)
      .sort());
  }
  console.log(`  Skills dir      : ${skillsDir}`);
  console.log(`  Skills present  : ${present.length ? present.join(', ') : '(none)'}`);

  const enabled = readEnabledSkills(statusFile).filter(n => n.startsWith(SKILL_PREFIX)).sort();
  console.log(`  Status file     : ${fs.existsSync(statusFile) ? statusFile : '(missing)'}`);
  console.log(`  Skills enabled  : ${enabled.length ? enabled.join(', ') : '(none)'}`);

  const manifest = readManifest(manifestFile);
  console.log(`  Manifest        : ${manifest ? `${manifestFile} (openspec ${manifest.openspecVersion || '?'}, ${manifest.skillNames ? manifest.skillNames.length : 0} skills, ${manifest.installedAt})` : 'NOT found'}`);

  const expected = (manifest && Array.isArray(manifest.skillNames)) ? manifest.skillNames : present;
  const allPresent = expected.length > 0 && expected.every(n => present.includes(n));
  const allEnabled = expected.length > 0 && expected.every(n => enabled.includes(n));
  const healthy = !!cliVersion && allPresent && allEnabled && !!manifest;

  console.log(`\n  Overall         : ${healthy ? 'HEALTHY' : 'INCOMPLETE'}\n`);
  process.exit(healthy ? 0 : 1);
}

// ─── main ───────────────────────────────────────────────────────────────────

function main() {
  const { command, args } = parseArgs();
  const target = resolveTarget(args);
  const paths = getPaths(target);
  switch (command) {
    case 'init':   cmdInit(paths); break;
    case 'update': cmdUpdate(paths); break;
    case 'delete': cmdDelete(paths); break;
    case 'status': cmdStatus(paths); break;
  }
}

main();