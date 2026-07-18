const fs = require('fs');
const path = require('path');
const os = require('os');
const { run, rmDir, cpDir } = require('../lib/exec');
const { enableSkills, disableSkills, readEnabledSkills } = require('../lib/status-file');

const REPO = 'https://github.com/claude-office-skills/skills.git';
const MCP_NAME = 'office-mcp';
const SERVER_SUBDIR = path.join('mcp-servers', 'office-mcp');
const SKILL_SUBDIR = 'office-mcp';
const KEEP_FILES = new Set(['dist', 'node_modules', 'package.json']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function getPaths(ctx) {
  const root = ctx.root;
  const mcpDir = path.join(root, '.codeartsdoer', 'mcp');
  const serverDir = path.join(mcpDir, MCP_NAME);
  const mcpConfig = path.join(mcpDir, 'mcp_settings.json');
  const skillDir = path.join(ctx.skillsDir, MCP_NAME);
  return { root, mcpDir, serverDir, mcpConfig, skillDir };
}

function readMcpConfig(mcpConfig) {
  if (!fs.existsSync(mcpConfig)) return { mcpServers: {} };
  try {
    const data = JSON.parse(fs.readFileSync(mcpConfig, 'utf-8'));
    if (!data.mcpServers || typeof data.mcpServers !== 'object') data.mcpServers = {};
    return data;
  } catch (e) {
    console.error(`Warning: ${mcpConfig} is malformed, resetting. (${e.message})`);
    return { mcpServers: {} };
  }
}

function writeMcpConfig(mcpConfig, config) {
  if (!fs.existsSync(path.dirname(mcpConfig))) {
    fs.mkdirSync(path.dirname(mcpConfig), { recursive: true });
  }
  fs.writeFileSync(mcpConfig, JSON.stringify(config, null, 2) + '\n');
}

function registerMcp(mcpConfig, serverDir) {
  const config = readMcpConfig(mcpConfig);
  const entrypoint = path.join(serverDir, 'dist', 'index.js');
  config.mcpServers[MCP_NAME] = {
    command: toPosix(process.execPath),
    args: [toPosix(entrypoint)]
  };
  writeMcpConfig(mcpConfig, config);
  console.log(`    Registered MCP server in ${path.basename(mcpConfig)}.`);
}

function unregisterMcp(mcpConfig) {
  const config = readMcpConfig(mcpConfig);
  if (config.mcpServers[MCP_NAME]) {
    delete config.mcpServers[MCP_NAME];
    writeMcpConfig(mcpConfig, config);
    console.log(`    Removed '${MCP_NAME}' from MCP config.`);
  } else {
    console.log(`    '${MCP_NAME}' not present in MCP config — skipping.`);
  }
}

function cleanServerDir(serverDir) {
  const entries = fs.readdirSync(serverDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (KEEP_FILES.has(entry.name)) continue;
    rmDir(path.join(serverDir, entry.name));
    removed++;
  }
  console.log(`    Cleaned ${removed} non-essential item(s); kept dist/, node_modules/, package.json.`);
}

function cloneAndBuild(tmpDir) {
  console.log('==> Cloning repository...');
  rmDir(tmpDir);
  run(`git clone --depth 1 "${REPO}" "${tmpDir}"`);
  const srcServerDir = path.join(tmpDir, SERVER_SUBDIR);
  if (!fs.existsSync(srcServerDir)) {
    console.error(`Error: expected MCP server source at ${SERVER_SUBDIR} in the repo.`);
    process.exit(1);
  }
  console.log('\n==> Installing dependencies...');
  run('npm install --no-audit --no-fund', { cwd: srcServerDir });
  console.log('\n==> Building MCP server...');
  run('npm run build', { cwd: srcServerDir });
  const distEntry = path.join(srcServerDir, 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) {
    console.error('Error: build did not produce dist/index.js.');
    process.exit(1);
  }
  return srcServerDir;
}

function installOrUpdate(ctx) {
  const { mcpConfig, serverDir, skillDir } = getPaths(ctx);
  console.log(`  Server dir   : ${serverDir}`);
  console.log(`  MCP config   : ${mcpConfig}`);
  console.log(`  Skill dir    : ${skillDir}\n`);

  const tmpDir = path.join(os.tmpdir(), `office-mcp-init-${process.pid}`);
  const srcServerDir = cloneAndBuild(tmpDir);
  const srcSkillFile = path.join(tmpDir, SKILL_SUBDIR, 'SKILL.md');

  console.log('\n==> Installing MCP server...');
  cpDir(srcServerDir, serverDir);
  cleanServerDir(serverDir);

  console.log('\n==> Installing skill definition...');
  if (!fs.existsSync(ctx.skillsDir)) fs.mkdirSync(ctx.skillsDir, { recursive: true });
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
  if (fs.existsSync(srcSkillFile)) {
    fs.copyFileSync(srcSkillFile, path.join(skillDir, 'SKILL.md'));
    console.log(`    Copied SKILL.md -> ${skillDir}`);
  } else {
    console.log('    Warning: SKILL.md not found in repo, skipping skill definition.');
  }

  console.log('\n==> Registering...');
  enableSkills(ctx.statusFile, [MCP_NAME]);
  registerMcp(mcpConfig, serverDir);

  rmDir(tmpDir);
  console.log('\n==> Done! office-mcp installed. Restart CodeArts to load the 39 Office tools.');
}

module.exports = {
  name: 'office-mcp',
  displayName: 'Office-MCP',
  description: 'MCP server with 39 tools for Word/Excel/PowerPoint/PDF/OCR (project-scope only).',
  scopes: ['project'],
  commands: ['init', 'update', 'delete', 'status'],

  init(ctx) {
    installOrUpdate(ctx);
  },

  update(ctx) {
    const { serverDir } = getPaths(ctx);
    if (!fs.existsSync(serverDir)) {
      console.error('Error: office-mcp is not installed. Run "init" first.');
      process.exit(1);
    }
    installOrUpdate(ctx);
  },

  delete(ctx) {
    const { serverDir, mcpConfig, skillDir } = getPaths(ctx);
    console.log('==> Removing MCP server...');
    if (fs.existsSync(serverDir)) {
      rmDir(serverDir);
      console.log(`    Removed ${serverDir}`);
    } else {
      console.log('    Server dir not found — skipping.');
    }
    console.log('\n==> Removing skill definition...');
    if (fs.existsSync(skillDir)) {
      rmDir(skillDir);
      console.log(`    Removed ${skillDir}`);
    } else {
      console.log('    Skill dir not found — skipping.');
    }
    console.log('\n==> Unregistering...');
    disableSkills(ctx.statusFile, [MCP_NAME]);
    unregisterMcp(mcpConfig);
    console.log('\n==> Done! office-mcp fully uninstalled from this project.');
  },

  status(ctx) {
    const { serverDir, mcpConfig, skillDir } = getPaths(ctx);
    const serverOk = fs.existsSync(path.join(serverDir, 'dist', 'index.js'));
    console.log(`  MCP server       : ${serverOk ? 'installed' : 'NOT installed'}`);
    if (serverOk) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf-8'));
        console.log(`  Server version   : ${pkg.version || 'unknown'}`);
      } catch (e) { /* ignore */ }
      console.log(`  Server path      : ${serverDir}`);
    }
    const config = readMcpConfig(mcpConfig);
    const cfgOk = !!config.mcpServers[MCP_NAME];
    console.log(`  MCP config entry : ${cfgOk ? 'registered' : 'NOT registered'}`);
    if (cfgOk) console.log(`  Config path      : ${mcpConfig}`);
    const skillOk = fs.existsSync(path.join(skillDir, 'SKILL.md'));
    console.log(`  Skill definition : ${skillOk ? 'installed' : 'NOT installed'}`);
    let statusOk = false;
    if (fs.existsSync(ctx.statusFile)) {
      statusOk = readEnabledSkills(ctx.statusFile).includes(MCP_NAME);
    }
    console.log(`  Status file      : ${statusOk ? 'enabled' : 'NOT enabled'}`);
    const healthy = serverOk && cfgOk && skillOk && statusOk;
    console.log(`\n  Overall          : ${healthy ? 'HEALTHY' : 'INCOMPLETE'}`);
    return healthy ? 0 : 1;
  }
};