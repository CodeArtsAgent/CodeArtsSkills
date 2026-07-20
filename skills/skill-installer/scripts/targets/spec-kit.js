const fs = require('fs');
const path = require('path');
const os = require('os');
const { run, runCapture, rmDir, cpDir, isWindows } = require('../lib/exec');
const { enableSkills, disableSkills, readEnabledSkills } = require('../lib/status-file');
const { manifestFileFor, collectFiles, writeManifest, readManifest, removeManifest } = require('../lib/manifest');

const SPECIFY_PKG = 'specify-cli';
const PYTHON_TARGET = '3.12';
const DONOR_INTEGRATION = 'copilot';
const DONOR_OPTIONS = '--skills';
const SKILL_PREFIX = 'speckit-';

function q(p) {
  return `"${p}"`;
}

function exe(name) {
  return isWindows() ? `${name}.exe` : name;
}

function uvPathCandidates() {
  const bin = exe('uv');
  return [
    path.join(os.homedir(), '.local', 'bin', bin),
    path.join(os.homedir(), '.cargo', 'bin', bin)
  ];
}

function resolveUv() {
  if (runCapture('uv --version')) return 'uv';
  for (const c of uvPathCandidates()) {
    if (fs.existsSync(c)) return q(c);
  }
  return null;
}

function detectUv() {
  const cmd = resolveUv();
  return cmd ? runCapture(`${cmd} --version`) : null;
}

function ensureUv() {
  let cmd = resolveUv();
  if (cmd) return cmd;
  console.log('==> uv not found. Attempting install...');
  const pip = runCapture('pip3 --version') ? 'pip3' : (runCapture('pip --version') ? 'pip' : null);
  if (pip) {
    try { run(`${pip} install --user uv`); } catch (e) { /* fall through */ }
  }
  cmd = resolveUv();
  if (cmd) { console.log(`    uv installed: ${runCapture(`${cmd} --version`)}`); return cmd; }
  if (isWindows()) {
    try { run('powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'); } catch (e) { /* fall through */ }
  } else {
    try { run('curl -LsSf https://astral.sh/uv/install.sh | sh'); } catch (e) { /* fall through */ }
  }
  cmd = resolveUv();
  if (!cmd) {
    console.error('Error: uv still not found after install attempts.');
    console.error('Install manually: https://docs.astral.sh/uv/ (e.g. `curl -LsSf https://astral.sh/uv/install.sh | sh`).');
    process.exit(1);
  }
  console.log(`    uv installed: ${runCapture(`${cmd} --version`)}`);
  return cmd;
}

function resolveSpecify() {
  if (runCapture('specify --version')) return 'specify';
  const uv = resolveUv();
  if (uv) {
    const binDir = runCapture(`${uv} tool dir --bin`);
    if (binDir) {
      const cand = path.join(binDir, exe('specify'));
      if (fs.existsSync(cand)) return q(cand);
    }
  }
  const fallback = path.join(os.homedir(), '.local', 'bin', exe('specify'));
  if (fs.existsSync(fallback)) return q(fallback);
  return null;
}

function detectSpecify() {
  const cmd = resolveSpecify();
  return cmd ? runCapture(`${cmd} --version`) : null;
}

function ensureCli(force) {
  let cmd = resolveSpecify();
  if (cmd && !force) {
    const v = runCapture(`${cmd} --version`);
    if (v) return { cmd, version: v };
  }
  const uv = ensureUv();
  console.log(`==> ${force ? 'Reinstalling' : 'Installing'} specify-cli via uv (Python ${PYTHON_TARGET})...`);
  run(`${uv} tool install ${force ? '--force ' : ''}--python ${PYTHON_TARGET} ${SPECIFY_PKG}`);
  cmd = resolveSpecify();
  if (!cmd) {
    console.error('Error: specify CLI not found after `uv tool install`.');
    console.error(`Try manually: uv tool install --python ${PYTHON_TARGET} ${SPECIFY_PKG}`);
    process.exit(1);
  }
  const version = runCapture(`${cmd} --version`) || 'unknown';
  console.log(`    specify CLI ready: ${version}`);
  return { cmd, version };
}

function findSpeckitSkills(rootDir) {
  const found = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(SKILL_PREFIX) && fs.existsSync(path.join(full, 'SKILL.md'))) {
        found.push(full);
      } else {
        walk(full);
      }
    }
  }
  walk(rootDir);
  return found.sort();
}

function ensureFrontmatter(skillDir, skillName) {
  const file = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(content);
  const fm = m ? m[1] : '';
  const body = m ? content.slice(m[0].length) : content;
  const lines = fm.split('\n').filter(l => l.trim().length);
  const has = (k) => lines.some(l => new RegExp(`^${k}\\s*:`).test(l));
  if (!has('name')) lines.unshift(`name: ${skillName}`);
  if (!has('description')) {
    const h = /^#\s+(.+)$/m.exec(body);
    const desc = h ? h[1].trim() : `Spec Kit SDD skill (${skillName}).`;
    lines.push(`description: ${JSON.stringify(desc)}`);
  }
  fs.writeFileSync(file, `---\n${lines.join('\n')}\n---\n${body}`);
}

function generateDonorSkills(tmpDir, specifyCmd) {
  console.log(`==> Generating Spec Kit skills (donor: ${DONOR_INTEGRATION} ${DONOR_OPTIONS})...`);
  rmDir(tmpDir);
  fs.mkdirSync(tmpDir, { recursive: true });
  run(`${specifyCmd} init proj --integration ${DONOR_INTEGRATION} --integration-options=${q(DONOR_OPTIONS)}`, {
    cwd: tmpDir,
    env: { ...process.env, CI: '1' }
  });
  const projectDir = path.join(tmpDir, 'proj');
  const skillDirs = findSpeckitSkills(projectDir);
  if (skillDirs.length === 0) {
    console.error('Error: specify init did not generate any speckit-* skills.');
    console.error('The spec-kit CLI layout may have changed.');
    process.exit(1);
  }
  const skillNames = skillDirs.map(d => path.basename(d));
  console.log(`    Generated ${skillNames.length} skill(s): ${skillNames.join(', ')}`);
  return { skillDirs, skillNames };
}

function installSkills(ctx, action, specifyVersion) {
  const { skillsDir, statusFile } = ctx;
  const tmpDir = path.join(os.tmpdir(), `spec-kit-installer-${action}-${process.pid}`);
  const { cmd } = ensureCli(action === 'update');
  const { skillDirs, skillNames } = generateDonorSkills(tmpDir, cmd);

  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  console.log(`\n==> ${action === 'update' ? 'Overwriting' : 'Installing'} skills...`);
  for (const dir of skillDirs) {
    const name = path.basename(dir);
    const dest = path.join(skillsDir, name);
    cpDir(dir, dest);
    ensureFrontmatter(dest, name);
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
    target: 'spec-kit',
    specifyVersion,
    skillsDir,
    skillNames,
    files
  });
  console.log(`    Manifest saved: ${files.length} files tracked.`);

  rmDir(tmpDir);
  console.log(`\n==> Done! Spec Kit skills ${action === 'update' ? 'updated' : 'installed'}. Restart CodeArts to apply.`);
  console.log('    Use the /speckit.* commands (constitution, specify, plan, tasks, implement) in your agent.');
}

module.exports = {
  name: 'spec-kit',
  displayName: 'Spec Kit',
  description: 'GitHub Spec-Driven Development (SDD) skills — /speckit.constitution/specify/plan/tasks/implement — via the specify CLI.',
  scopes: ['project', 'user'],
  commands: ['init', 'update', 'delete', 'status'],

  init(ctx) {
    const { version } = ensureCli(false);
    installSkills(ctx, 'init', version);
  },

  update(ctx) {
    const { version } = ensureCli(true);
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
      console.log('==> No manifest found — scanning skills dir for speckit-* skills (best-effort).');
      if (fs.existsSync(skillsDir)) {
        skillNames = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && e.name.startsWith(SKILL_PREFIX))
          .map(e => e.name);
      }
    }

    if (skillNames.length === 0) {
      console.log('    No speckit-* skills found — nothing to remove.');
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
    console.log('\n==> Done! Spec Kit skills uninstalled. (spec-kit spec data left intact.)');
  },

  status(ctx) {
    const { skillsDir, statusFile } = ctx;
    const manifestFile = manifestFileFor(skillsDir);

    const uvVersion = detectUv();
    console.log(`  uv              : ${uvVersion || 'NOT installed'}`);

    const specifyVersion = detectSpecify();
    console.log(`  specify CLI     : ${specifyVersion || 'NOT installed'}`);

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
    console.log(`  Manifest        : ${manifest ? `specify ${manifest.specifyVersion || '?'}, ${manifest.skillNames ? manifest.skillNames.length : 0} skills, ${manifest.installedAt}` : 'NOT found'}`);

    const expected = (manifest && Array.isArray(manifest.skillNames)) ? manifest.skillNames : present;
    const healthy = !!specifyVersion
      && expected.length > 0
      && expected.every(n => present.includes(n))
      && expected.every(n => enabled.includes(n))
      && !!manifest;
    console.log(`\n  Overall         : ${healthy ? 'HEALTHY' : 'INCOMPLETE'}`);
    return healthy ? 0 : 1;
  }
};