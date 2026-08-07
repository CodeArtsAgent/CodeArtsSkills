const fs = require('fs');
const path = require('path');
const { run, runCapture, rmDir } = require('../lib/exec');
const { enableSkills, disableSkills, readEnabledSkills } = require('../lib/status-file');
const { manifestFileFor, collectFiles, writeManifest, readManifest, removeManifest } = require('../lib/manifest');

const SKILL_NAME = 'azure-devops-cli';
const SKILLS_SOURCE = 'https://github.com/github/awesome-copilot';
const AZURE_CLI_MIN_VERSION = [2, 81, 0];

function azBin() {
  return process.platform === 'win32' ? 'az.cmd' : 'az';
}

function detectAzCli() {
  return runCapture(`${azBin()} --version`);
}

function ensureAzCli() {
  let version = detectAzCli();
  if (version) {
    console.log(`  Azure CLI detected: ${version.split('\n')[0]}`);
    return version;
  }
  console.log('==> Azure CLI not found. Installing...');
  if (process.platform === 'win32') {
    run('winget install Microsoft.AzureCLI --accept-package-agreements --accept-source-agreements');
  } else if (process.platform === 'darwin') {
    run('brew install azure-cli');
  } else {
    run('curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash');
  }
  version = detectAzCli();
  if (!version) {
    console.error('Error: Azure CLI still not found after install.');
    console.error('Install manually: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli');
    process.exit(1);
  }
  console.log(`  Azure CLI installed: ${version.split('\n')[0]}`);
  return version;
}

function ensureExtension() {
  console.log('==> Checking azure-devops extension...');
  const exts = runCapture(`${azBin()} extension list --output json`);
  let hasExt = false;
  if (exts) {
    try {
      const list = JSON.parse(exts);
      hasExt = Array.isArray(list) && list.some(e => e.name === 'azure-devops');
    } catch (e) { }
  }
  if (hasExt) {
    console.log('  azure-devops extension already installed.');
    return;
  }
  console.log('  Installing azure-devops extension...');
  run(`${azBin()} extension add --name azure-devops`);
  console.log('  azure-devops extension installed.');
}

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

function runInstall(ctx) {
  const { skillsDir, statusFile } = ctx;
  console.log(`  Skills dir   : ${skillsDir}`);
  console.log(`  Skill source : ${SKILLS_SOURCE}`);
  console.log(`  Skill name   : ${SKILL_NAME}\n`);

  if (fs.existsSync(path.join(skillsDir, SKILL_NAME, 'SKILL.md'))) {
    console.log('==> Existing install detected — use "update" to refresh.\n');
  }

  installSkillFiles(ctx);

  console.log('\n==> Step 2: Checking Azure CLI...');
  ensureAzCli();

  console.log('\n==> Step 3: Checking azure-devops extension...');
  ensureExtension();

  console.log('\n==> Registering skill...');
  enableSkills(statusFile, [SKILL_NAME]);

  console.log('\n==> Writing manifest...');
  const manifestFile = manifestFileFor(skillsDir);
  const files = [];
  const skillDir = path.join(skillsDir, SKILL_NAME);
  if (fs.existsSync(skillDir)) collectFiles(skillDir, files);
  writeManifest(manifestFile, {
    installedAt: new Date().toISOString(),
    target: 'azure-devops-cli',
    skillsDir,
    skillNames: [SKILL_NAME],
    files
  });
  console.log(`    Manifest saved: ${files.length} files tracked.`);

  console.log('\n==> Done! azure-devops-cli installed successfully.');
  console.log('    Next steps:');
  console.log('      az devops configure --defaults organization=<URL> project=<PROJECT>');
  console.log('      export AZURE_DEVOPS_EXT_PAT=<PAT>');
  console.log('      az devops project show  (smoke test)');
  console.log('    Restart CodeArts to load the skill.');
}

module.exports = {
  name: 'azure-devops-cli',
  displayName: 'Azure DevOps CLI',
  description: 'Azure DevOps skill (repos, pipelines, boards via az CLI) — alternative to GitHub + Jira.',
  scopes: ['project', 'user'],
  commands: ['init', 'update', 'delete', 'status'],

  init(ctx) {
    runInstall(ctx);
  },

  update(ctx) {
    const { skillsDir, statusFile } = ctx;
    if (!fs.existsSync(path.join(skillsDir, SKILL_NAME, 'SKILL.md'))) {
      console.error('Error: azure-devops-cli skill is not installed. Run "init" first.');
      process.exit(1);
    }
    console.log('==> Updating skill files...');
    installSkillFiles(ctx);
    console.log('\n==> Checking Azure CLI...');
    ensureAzCli();
    ensureExtension();

    const manifestFile = manifestFileFor(skillsDir);
    const files = [];
    const skillDir = path.join(skillsDir, SKILL_NAME);
    if (fs.existsSync(skillDir)) collectFiles(skillDir, files);
    writeManifest(manifestFile, {
      installedAt: new Date().toISOString(),
      target: 'azure-devops-cli',
      skillsDir,
      skillNames: [SKILL_NAME],
      files
    });
    console.log(`\n==> Done! azure-devops-cli updated. (${files.length} files tracked)`);
    console.log('    Restart CodeArts to apply.');
  },

  delete(ctx) {
    const { skillsDir, statusFile } = ctx;
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
      rmDir(path.join(skillsDir, SKILL_NAME));
    }
    console.log('\n==> Unregistering skill...');
    disableSkills(statusFile, [SKILL_NAME]);

    const manifestFile = manifestFileFor(skillsDir);
    removeManifest(manifestFile);
    console.log('    Removed manifest.');

    console.log('\n==> Done! azure-devops-cli skill removed.');
    console.log('    Note: Azure CLI and azure-devops extension are NOT removed.');
    console.log('    To remove them manually:');
    console.log(`      ${azBin()} extension remove --name azure-devops`);
  },

  status(ctx) {
    const { skillsDir, statusFile } = ctx;
    const manifestFile = manifestFileFor(skillsDir);

    const skillDir = path.join(skillsDir, SKILL_NAME);
    const skillOk = fs.existsSync(path.join(skillDir, 'SKILL.md'));
    console.log(`  Skill files  : ${skillOk ? 'installed' : 'NOT installed'}`);
    if (skillOk) {
      console.log(`    Path       : ${skillDir}`);
      const refsDir = path.join(skillDir, 'references');
      if (fs.existsSync(refsDir)) {
        console.log(`    References : ${fs.readdirSync(refsDir).length} files`);
      }
    }

    const azVersion = detectAzCli();
    console.log(`  Azure CLI    : ${azVersion ? `installed (${azVersion.split('\n')[0]})` : 'NOT installed'}`);

    let extOk = false;
    if (azVersion) {
      const exts = runCapture(`${azBin()} extension list --output json`);
      if (exts) {
        try {
          const list = JSON.parse(exts);
          extOk = Array.isArray(list) && list.some(e => e.name === 'azure-devops');
        } catch (e) { }
      }
    }
    console.log(`  az devops ext: ${extOk ? 'installed' : 'NOT installed'}`);

    const enabled = readEnabledSkills(statusFile);
    const statusOk = enabled.includes(SKILL_NAME);
    console.log(`  Status file  : ${fs.existsSync(statusFile) ? statusFile : '(missing)'}`);
    console.log(`  Skill enabled: ${statusOk ? 'yes' : 'no'}`);

    const manifest = readManifest(manifestFile);
    console.log(`  Manifest     : ${manifest ? `${manifest.target}, ${manifest.files ? manifest.files.length : 0} files, ${manifest.installedAt}` : 'NOT found'}`);

    const healthy = skillOk && !!azVersion && extOk && statusOk && !!manifest;
    console.log(`\n  Overall      : ${healthy ? 'HEALTHY' : 'INCOMPLETE'}`);
    return healthy ? 0 : 1;
  }
};