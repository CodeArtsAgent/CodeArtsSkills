const fs = require('fs');
const path = require('path');
const os = require('os');
const { run, runCapture, rmDir } = require('../lib/exec');
const { readEnabledSkills } = require('../lib/status-file');

const SKILL_NAME = 'playwright-cli';
const NPM_PACKAGE = '@playwright/cli';
const SKILLS_SOURCE = 'https://github.com/microsoft/playwright-cli';
const BROWSER = 'chromium';

function installSkillFiles(ctx) {
  console.log('\n==> Step 1: Installing skill files...');
  const globalFlag = ctx.scope === 'user' ? '-g' : '';
  const cmd = [
    'npx', '-y', 'skills', 'add', SKILLS_SOURCE,
    '--skill', SKILL_NAME,
    '-a', 'codearts-agent',
    '--copy',
    '-y',
    globalFlag,
  ].filter(Boolean).join(' ');
  const opts = ctx.scope === 'project' ? { cwd: ctx.root } : {};
  run(cmd, opts);
}

function installCli() {
  console.log(`\n==> Step 2: Installing ${NPM_PACKAGE} globally...`);
  run(`npm install -g ${NPM_PACKAGE}@latest`);
}

function installBrowser() {
  console.log(`\n==> Step 3: Installing ${BROWSER} browser...`);
  run(`playwright-cli install-browser ${BROWSER}`);
}

function dryRunCheck() {
  console.log('\n==> Step 4: Dry-run check...');
  console.log('  Verifying browser installation...');
  const dryRun = runCapture('playwright-cli install-browser --dry-run 2>&1');
  if (!dryRun || !dryRun.includes('chromium')) {
    console.log('    Browser verification FAILED.');
    return false;
  }
  console.log('    Browser verification PASSED.');
  console.log('  Running functional test (open/close)...');
  const tmpDir = path.join(os.tmpdir(), `pwcli-dryrun-${process.pid}`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const { execSync } = require('child_process');
    execSync('playwright-cli open https://example.com', { stdio: 'pipe', cwd: tmpDir, timeout: 30000 });
    execSync('playwright-cli close', { stdio: 'pipe', cwd: tmpDir, timeout: 10000 });
    console.log('    Functional test PASSED.');
    return true;
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().split('\n')[0];
    console.log('    Functional test FAILED.');
    if (msg) console.log(`    ${msg}`);
    return false;
  } finally {
    rmDir(path.join(tmpDir, '.playwright-cli'));
    rmDir(tmpDir);
  }
}

function runInstall(ctx) {
  console.log(`  Skills dir   : ${ctx.skillsDir}`);
  console.log(`  CLI package  : ${NPM_PACKAGE}`);
  console.log(`  Browser      : ${BROWSER}\n`);

  if (fs.existsSync(path.join(ctx.skillsDir, SKILL_NAME, 'SKILL.md'))) {
    console.log('==> Existing install detected — use "update" to refresh.\n');
  }

  installSkillFiles(ctx);

  const existingVersion = runCapture('playwright-cli --version');
  if (existingVersion) {
    console.log(`\n==> ${NPM_PACKAGE} already installed (${existingVersion}).`);
  } else {
    installCli();
  }

  installBrowser();
  const passed = dryRunCheck();
  if (passed) {
    console.log('\n==> Done! playwright-cli installed successfully.');
    console.log('    Restart CodeArts to load the skill.');
  } else {
    console.log('\n==> Installation completed with warnings.');
    console.log('    The dry-run check failed. Check the output above.');
  }
}

module.exports = {
  name: 'playwright-cli',
  displayName: 'Playwright-CLI',
  description: 'Browser automation skill (40+ CLI commands) + @playwright/cli + chromium browser.',
  scopes: ['project', 'user'],
  commands: ['init', 'update', 'delete', 'status'],

  init(ctx) {
    runInstall(ctx);
  },

  update(ctx) {
    if (!fs.existsSync(path.join(ctx.skillsDir, SKILL_NAME, 'SKILL.md'))) {
      console.error('Error: playwright-cli skill is not installed. Run "init" first.');
      process.exit(1);
    }
    installSkillFiles(ctx);
    installCli();
    installBrowser();
    const passed = dryRunCheck();
    if (passed) console.log('\n==> Done! playwright-cli updated successfully.');
    else console.log('\n==> Update completed with warnings.');
  },

  delete(ctx) {
    console.log('==> Removing skill files...');
    const globalFlag = ctx.scope === 'user' ? '-g' : '';
    const cmd = [
      'npx', '-y', 'skills', 'remove', SKILL_NAME,
      '-a', 'codearts-agent',
      '-y',
      globalFlag,
    ].filter(Boolean).join(' ');
    const opts = ctx.scope === 'project' ? { cwd: ctx.root } : {};
    try {
      run(cmd, opts);
    } catch (e) {
      console.log('    Warning: skills remove failed. Cleaning up manually...');
      rmDir(path.join(ctx.skillsDir, SKILL_NAME));
    }
    console.log('\n==> Done! playwright-cli skill files removed.');
    console.log(`    Note: ${NPM_PACKAGE} and ${BROWSER} browser are global and were NOT removed.`);
    console.log('    To remove them manually:');
    console.log(`      npm uninstall -g ${NPM_PACKAGE}`);
  },

  status(ctx) {
    const skillDir = path.join(ctx.skillsDir, SKILL_NAME);
    const skillOk = fs.existsSync(path.join(skillDir, 'SKILL.md'));
    console.log(`  Skill files  : ${skillOk ? 'installed' : 'NOT installed'}`);
    if (skillOk) {
      console.log(`    Path       : ${skillDir}`);
      const refsDir = path.join(skillDir, 'references');
      if (fs.existsSync(refsDir)) {
        console.log(`    References : ${fs.readdirSync(refsDir).length} files`);
      }
    }
    const cliVersion = runCapture('playwright-cli --version');
    console.log(`  CLI binary   : ${cliVersion ? `installed (${cliVersion})` : 'NOT installed'}`);
    const browserList = runCapture('playwright-cli install-browser --list 2>&1');
    const browserOk = !!(browserList && browserList.includes('chromium'));
    console.log(`  Chromium     : ${browserOk ? 'installed' : 'NOT installed'}`);
    const healthy = skillOk && cliVersion && browserOk;
    console.log(`\n  Overall      : ${healthy ? 'HEALTHY' : 'INCOMPLETE'}`);
    return healthy ? 0 : 1;
  }
};