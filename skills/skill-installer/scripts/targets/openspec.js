const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { run, rmDir, cpDir, isWindows, parseSemver, semverGte } = require('../lib/exec');
const { enableSkills, disableSkills, readEnabledSkills } = require('../lib/status-file');
const { manifestFileFor, collectFiles, writeManifest, readManifest, removeManifest } = require('../lib/manifest');

const OPENSPEC_PKG = '@fission-ai/openspec@latest';
const DONOR_TOOL = 'trae';
const PROFILE = 'core';
const SKILL_PREFIX = 'openspec-';
const DONOR_SKILLS_REL = path.join(`.${DONOR_TOOL}`, 'skills');

function openspecBin() {
  return isWindows() ? 'openspec.cmd' : 'openspec';
}

function detectCli() {
  try {
    return execSync(`${openspecBin()} --version`, { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

function ensureCli() {
  let version = detectCli();
  if (version) return version;
  console.log('==> openspec CLI not found. Installing globally...');
  run(`npm install -g ${OPENSPEC_PKG}`);
  version = detectCli();
  if (!version) {
    console.error('Error: openspec CLI still not found after global install.');
    console.error(`Try manually: npm install -g ${OPENSPEC_PKG}`);
    process.exit(1);
  }
  console.log(`    openspec CLI installed: ${version}`);
  return version;
}

function checkNode() {
  const cur = parseSemver(process.version);
  if (!semverGte(cur, [20, 19, 0])) {
    console.error(`Error: OpenSpec requires Node.js >= 20.19.0. Current is ${process.version}.`);
    process.exit(1);
  }
}

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

function installSkills(ctx, action, openspecVersion) {
  const { skillsDir, statusFile } = ctx;
  const tmpDir = path.join(os.tmpdir(), `openspec-installer-${action}-${process.pid}`);
  const { donorSkillsDir, skillNames } = generateDonorSkills(tmpDir);

  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  console.log(`\n==> ${action === 'update' ? 'Overwriting' : 'Installing'} skills...`);
  for (const name of skillNames) {
    cpDir(path.join(donorSkillsDir, name), path.join(skillsDir, name));
    console.log(`    ${name}`);
  }

  console.log('\n==> Registering skills...');
  enableSkills(statusFile, skillNames);

  console.log('\n==> Writing manifest...');
  const manifestFile = manifestFileFor(skillsDir);
  const files = [];
  for (const name of skillNames) {
    const dir = path.join(skillsDir, name);
    if (fs.existsSync(dir)) collectFiles(dir, files);
  }
  writeManifest(manifestFile, {
    installedAt: new Date().toISOString(),
    target: 'openspec',
    openspecVersion,
    skillsDir,
    skillNames,
    files
  });
  console.log(`    Manifest saved: ${files.length} files tracked.`);

  rmDir(tmpDir);
  console.log(`\n==> Done! OpenSpec skills ${action === 'update' ? 'updated' : 'installed'}. Restart CodeArts to apply.`);
  console.log('    Create the project spec dir with `openspec init` before your first change.');
}

module.exports = {
  name: 'openspec',
  displayName: 'OpenSpec',
  description: 'Spec-driven development (SDD) skills — propose/explore/apply/sync/archive — via the openspec CLI.',
  scopes: ['project', 'user'],
  commands: ['init', 'update', 'delete', 'status'],

  init(ctx) {
    checkNode();
    const version = ensureCli();
    installSkills(ctx, 'init', version);
  },

  update(ctx) {
    checkNode();
    const version = ensureCli();
    installSkills(ctx, 'update', version);
  },

  delete(ctx) {
    const { skillsDir, statusFile } = ctx;
    const manifestFile = manifestFileFor(skillsDir);
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
      disableSkills(statusFile, skillNames);
    }

    removeManifest(manifestFile);
    console.log('\n==> Removed manifest.');
    console.log('\n==> Done! OpenSpec skills uninstalled. (openspec/ spec data left intact.)');
  },

  status(ctx) {
    const { skillsDir, statusFile } = ctx;
    const manifestFile = manifestFileFor(skillsDir);

    const cliVersion = detectCli();
    console.log(`  openspec CLI    : ${cliVersion || 'NOT installed'}`);

    const present = [];
    if (fs.existsSync(skillsDir)) {
      present.push(...fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith(SKILL_PREFIX))
        .map(e => e.name)
        .sort());
    }
    console.log(`  Skills present  : ${present.length ? present.join(', ') : '(none)'}`);

    const enabled = readEnabledSkills(statusFile).filter(n => n.startsWith(SKILL_PREFIX)).sort();
    console.log(`  Status file     : ${fs.existsSync(statusFile) ? statusFile : '(missing)'}`);
    console.log(`  Skills enabled  : ${enabled.length ? enabled.join(', ') : '(none)'}`);

    const manifest = readManifest(manifestFile);
    console.log(`  Manifest        : ${manifest ? `openspec ${manifest.openspecVersion || '?'}, ${manifest.skillNames ? manifest.skillNames.length : 0} skills, ${manifest.installedAt}` : 'NOT found'}`);

    const expected = (manifest && Array.isArray(manifest.skillNames)) ? manifest.skillNames : present;
    const healthy = !!cliVersion
      && expected.length > 0
      && expected.every(n => present.includes(n))
      && expected.every(n => enabled.includes(n))
      && !!manifest;
    console.log(`\n  Overall         : ${healthy ? 'HEALTHY' : 'INCOMPLETE'}`);
    return healthy ? 0 : 1;
  }
};