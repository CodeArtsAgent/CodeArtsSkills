#!/usr/bin/env node
/**
 * Superpowers CodeArts Installer
 *
 * Usage:
 *   node installer.js init    [--project|--user]   Install Superpowers
 *   node installer.js update  [--project|--user]   Update Superpowers
 *   node installer.js delete  [--project|--user]   Uninstall Superpowers
 *
 * If --project/--user is omitted and .codeartsdoer/ exists in the current
 * directory, it defaults to that project. Otherwise defaults to user-level.
 *
 * Works on Windows, Linux, macOS — only dependency is Node.js (already required by CodeArts).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO = 'https://github.com/obra/superpowers.git';
// Manifest files live in assets/ inside the installer skill directory
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

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.codeartsdoer'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ─── parse CLI ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || !['init', 'update', 'delete'].includes(command)) {
    console.error('Usage: node installer.js <init|update|delete> [--project|--user]');
    console.error('');
    console.error('  init    Install Superpowers skills');
    console.error('  update  Update Superpowers skills to latest');
    console.error('  delete  Uninstall Superpowers skills completely');
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

  // Auto-detect: if .codeartsdoer/ exists in cwd, treat as project
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
  let skillsDir, statusFile, bootstrapFile;

  if (target === 'user') {
    skillsDir = path.join(home, '.codeartsdoer', 'skills');
    statusFile = path.join(skillsDir, 'UserSkillStatus.txt');
    bootstrapFile = path.join(home, '.codeartsdoer', 'rule', 'superpowers-bootstrap.md');
  } else {
    const root = findProjectRoot(process.env.INIT_CWD || process.cwd());
    if (!root) {
      console.error('Error: not inside a CodeArts project (no .codeartsdoer/ found).');
      console.error('Use --user to install at user level, or run from a project directory.');
      process.exit(1);
    }
    skillsDir = path.join(root, '.codeartsdoer', 'skills');
    statusFile = path.join(skillsDir, 'ProjectSkillStatus.txt');
    bootstrapFile = path.join(root, 'CODEARTS.md');
  }

  // Manifest stored in installer skill dir, keyed by hash of skillsDir path
  if (!fs.existsSync(MANIFESTS_DIR)) {
    fs.mkdirSync(MANIFESTS_DIR, { recursive: true });
  }
  const dirHash = crypto.createHash('md5').update(skillsDir).digest('hex').substring(0, 8);
  const manifestFile = path.join(MANIFESTS_DIR, `manifest-${dirHash}.json`);

  const label = target === 'user' ? 'user-level' : `project-level (${skillsDir})`;
  const scope = target === 'user' ? 'User' : 'Project';
  return { skillsDir, statusFile, bootstrapFile, manifestFile, label, scope };
}

// ─── manifest ───────────────────────────────────────────────────────────────

function writeManifest(manifestFile, skillsDir, skillNames, bootstrapInfo) {
  const files = [];
  for (const name of skillNames) {
    const dir = path.join(skillsDir, name);
    if (!fs.existsSync(dir)) continue;
    collectFiles(dir, files);
  }

  const manifest = {
    installedAt: new Date().toISOString(),
    skillsDir,
    bootstrap: bootstrapInfo || null,
    files
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`    Manifest saved: ${files.length} files tracked.`);
}

function collectFiles(dir, result) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, result);
    } else {
      result.push(fullPath);
    }
  }
}

function readManifest(manifestFile) {
  if (!fs.existsSync(manifestFile)) {
    console.error('Error: No manifest found. Cannot safely delete.');
    console.error(`Expected at: ${manifestFile}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
}

// ─── status file helpers ────────────────────────────────────────────────────

function updateStatusFile(statusFile, skillsDir, mode, skillNames) {
  if (!fs.existsSync(statusFile)) {
    console.log(`    Status file not found, creating: ${statusFile}`);
    fs.writeFileSync(statusFile, '');
  }
  // Normalize line endings for cross-platform safety (Windows writes \r\n)
  let content = fs.readFileSync(statusFile, 'utf-8').replace(/\r\n/g, '\n');

  if (mode === 'enable') {
    const currentSkills = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    let added = 0;
    for (const name of currentSkills) {
      if (!content.includes(`${name}=`)) {
        console.log(`    Enabling: ${name}`);
        content += `\n${name}=true`;
        added++;
      }
    }
    if (added > 0) {
      fs.writeFileSync(statusFile, content.trim() + '\n');
    } else {
      console.log('    All skills already registered.');
    }
  } else if (mode === 'disable') {
    // Use explicitly passed skill names (dirs may already be deleted)
    const superpowersSkills = new Set(skillNames || []);
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const name = trimmed.split('=')[0];
      return !superpowersSkills.has(name);
    });
    fs.writeFileSync(statusFile, lines.join('\n').trim() + '\n');
    console.log('    Removed Superpowers entries from status file.');
  }
}

// ─── bootstrap helpers ──────────────────────────────────────────────────────

function ensureUserBootstrap(bootstrapFile, skillsDir) {
  if (fs.existsSync(bootstrapFile)) {
    console.log('    superpowers-bootstrap.md exists — user-level bootstrap is configured.');
    return;
  }
  console.log('    Creating superpowers-bootstrap.md...');
  const ruleDir = path.dirname(bootstrapFile);
  if (!fs.existsSync(ruleDir)) fs.mkdirSync(ruleDir, { recursive: true });
  fs.writeFileSync(bootstrapFile, [
    '# Superpowers Bootstrap',
    '',
    'At the start of every task, check whether any installed Superpowers skill applies.',
    'If a Superpowers skill applies, load it with the CodeArts skill tool before responding or taking action.',
    '',
    `Registered Superpowers skills are installed in \`${skillsDir}\` and exposed as global`,
    'CodeArts skills by native names such as `using-superpowers`, `brainstorming`,',
    '`test-driven-development`, `systematic-debugging`, `writing-plans`, and',
    '`verification-before-completion`.',
    '',
    'Use `using-superpowers` as the bootstrap rule source for the complete workflow.',
    ''
  ].join('\n'));
  console.log('    Created.');
}

const SUPEROWERS_BEGIN = '<!-- SUPEROWERS_BEGIN -->';
const SUPEROWERS_END = '<!-- SUPEROWERS_END -->';

function wrapSuperpowersBlock(content) {
  return `${SUPEROWERS_BEGIN}\n${content}\n${SUPEROWERS_END}`;
}

function extractSuperpowersBlock(fileContent) {
  const beginIdx = fileContent.indexOf(SUPEROWERS_BEGIN);
  const endIdx = fileContent.indexOf(SUPEROWERS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return null;
  return fileContent.substring(beginIdx + SUPEROWERS_BEGIN.length + 1, endIdx);
}

function replaceSuperpowersBlock(fileContent, newContent) {
  const beginIdx = fileContent.indexOf(SUPEROWERS_BEGIN);
  const endIdx = fileContent.indexOf(SUPEROWERS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    // No existing block — append
    if (fileContent && !fileContent.endsWith('\n')) fileContent += '\n';
    return fileContent + '\n' + wrapSuperpowersBlock(newContent) + '\n';
  }
  const before = fileContent.substring(0, beginIdx);
  const after = fileContent.substring(endIdx + SUPEROWERS_END.length);
  return before + wrapSuperpowersBlock(newContent) + after;
}

function removeSuperpowersBlock(fileContent) {
  const beginIdx = fileContent.indexOf(SUPEROWERS_BEGIN);
  const endIdx = fileContent.indexOf(SUPEROWERS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return null;
  const before = fileContent.substring(0, beginIdx);
  const after = fileContent.substring(endIdx + SUPEROWERS_END.length);
  // Clean up extra blank lines left behind
  return (before.replace(/\n+$/, '\n') + after.replace(/^\n+/, '')).trimEnd() + '\n';
}

function checkProjectBootstrap(bootstrapFile, oldUsingSpContent, newUsingSpPath) {
  if (oldUsingSpContent !== null && fs.existsSync(newUsingSpPath)) {
    const newUsingSpContent = fs.readFileSync(newUsingSpPath, 'utf-8');
    if (oldUsingSpContent !== newUsingSpContent) {
      printDiff(oldUsingSpContent, newUsingSpContent);
      console.log('');
      if (fs.existsSync(bootstrapFile)) {
        let bootstrapContent = fs.readFileSync(bootstrapFile, 'utf-8');
        const oldBlock = extractSuperpowersBlock(bootstrapContent);
        if (oldBlock !== null) {
          bootstrapContent = replaceSuperpowersBlock(bootstrapContent, newUsingSpContent);
          fs.writeFileSync(bootstrapFile, bootstrapContent);
          console.log('  Updated CODEARTS.md with latest using-superpowers content.');
        } else {
          console.log('  ⚠️  Superpowers block not found in CODEARTS.md — update manually.');
        }
      } else {
        console.log('  ⚠️  CODEARTS.md not found — create it with the updated content.');
      }
    } else {
      console.log('    No changes to using-superpowers — CODEARTS.md is fine.');
    }
  } else if (!fs.existsSync(bootstrapFile)) {
    console.log('    ⚠️  CODEARTS.md not found. Create it with using-superpowers bootstrap content.');
  } else {
    // First install — write the delimited block
    const newUsingSpContent = fs.readFileSync(newUsingSpPath, 'utf-8');
    let bootstrapContent = fs.readFileSync(bootstrapFile, 'utf-8');
    bootstrapContent = replaceSuperpowersBlock(bootstrapContent, newUsingSpContent);
    fs.writeFileSync(bootstrapFile, bootstrapContent);
    console.log('    Appended Superpowers block to CODEARTS.md.');
  }
}

function printDiff(oldText, newText) {
  console.log('');
  console.log('  ⚠️  using-superpowers/SKILL.md has changed! Bootstrap needs updating.');
  console.log('  ─────────────────────────────────────────────────────');
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  let diffCount = 0;
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] || '(removed)';
    const newLine = newLines[i] || '(removed)';
    if (oldLine !== newLine) {
      diffCount++;
      if (diffCount <= 30) {
        console.log(`  L${i + 1}: - ${oldLine.substring(0, 80)}`);
        console.log(`  L${i + 1}: + ${newLine.substring(0, 80)}`);
      }
    }
  }
  if (diffCount > 30) {
    console.log(`  ... and ${diffCount - 30} more changes`);
  }
  console.log('  ─────────────────────────────────────────────────────');
}

// ─── commands ───────────────────────────────────────────────────────────────

function cmdInit(target, paths) {
  const { skillsDir, statusFile, bootstrapFile, manifestFile, label, scope } = paths;
  console.log(`\nSuperpowers Init — ${label}\n`);
  console.log(`  Skills dir   : ${skillsDir}`);
  console.log(`  Status file  : ${statusFile}`);
  console.log(`  Manifest     : ${manifestFile}\n`);

  // Ensure skills dir exists
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  // Clone
  const tmpDir = path.join(os.tmpdir(), `superpowers-init-${process.pid}`);
  console.log('==> Cloning Superpowers...');
  rmDir(tmpDir);
  run(`git clone --depth 1 "${REPO}" "${tmpDir}"`);

  // Copy skills
  console.log('\n==> Installing skills...');
  const srcSkillsDir = path.join(tmpDir, 'skills');
  const entries = fs.readdirSync(srcSkillsDir, { withFileTypes: true });
  const installedSkills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    console.log(`    Installing: ${name}`);
    cpDir(path.join(srcSkillsDir, name), path.join(skillsDir, name));
    installedSkills.push(name);
  }

  // Status file
  console.log('\n==> Registering skills...');
  updateStatusFile(statusFile, skillsDir, 'enable', installedSkills);

  // Bootstrap (before manifest so we can capture content)
  console.log('\n==> Checking bootstrap...');
  let bootstrapInfo = null;
  if (target === 'user') {
    ensureUserBootstrap(bootstrapFile, skillsDir);
    bootstrapInfo = { type: 'user', file: bootstrapFile };
  } else {
    const usingSpPath = path.join(skillsDir, 'using-superpowers', 'SKILL.md');
    if (fs.existsSync(usingSpPath)) {
      bootstrapInfo = { type: 'project', file: bootstrapFile, usingSpContent: fs.readFileSync(usingSpPath, 'utf-8') };
    }
    checkProjectBootstrap(bootstrapFile, null, usingSpPath);
  }

  // Manifest
  console.log('\n==> Writing manifest...');
  writeManifest(manifestFile, skillsDir, installedSkills, bootstrapInfo);

  // Cleanup
  rmDir(tmpDir);
  console.log('\n==> Done! Superpowers installed. Restart CodeArts to apply.');
}

function cmdUpdate(target, paths) {
  const { skillsDir, statusFile, bootstrapFile, manifestFile, label, scope } = paths;
  console.log(`\nSuperpowers Update — ${label}\n`);
  console.log(`  Skills dir   : ${skillsDir}`);
  console.log(`  Status file  : ${statusFile}`);
  console.log(`  Manifest     : ${manifestFile}\n`);

  // Clone
  const tmpDir = path.join(os.tmpdir(), `superpowers-update-${process.pid}`);
  console.log('==> Cloning latest Superpowers...');
  rmDir(tmpDir);
  run(`git clone --depth 1 "${REPO}" "${tmpDir}"`);

  // Backup old using-superpowers for diff
  console.log('\n==> Updating skills...');
  const oldUsingSp = path.join(skillsDir, 'using-superpowers', 'SKILL.md');
  let oldUsingSpContent = null;
  if (fs.existsSync(oldUsingSp)) {
    oldUsingSpContent = fs.readFileSync(oldUsingSp, 'utf-8');
  }

  // Copy skills
  const srcSkillsDir = path.join(tmpDir, 'skills');
  const entries = fs.readdirSync(srcSkillsDir, { withFileTypes: true });
  const updatedSkills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    console.log(`    Updating: ${name}`);
    cpDir(path.join(srcSkillsDir, name), path.join(skillsDir, name));
    updatedSkills.push(name);
  }

  // Status file
  console.log('\n==> Checking for new skills...');
  updateStatusFile(statusFile, skillsDir, 'enable', updatedSkills);

  // Bootstrap (before manifest so we can capture content)
  console.log('\n==> Checking bootstrap...');
  let bootstrapInfo = null;
  if (target === 'user') {
    ensureUserBootstrap(bootstrapFile, skillsDir);
    bootstrapInfo = { type: 'user', file: bootstrapFile };
    if (oldUsingSpContent !== null) {
      const newUsingSp = path.join(skillsDir, 'using-superpowers', 'SKILL.md');
      if (fs.existsSync(newUsingSp)) {
        const newContent = fs.readFileSync(newUsingSp, 'utf-8');
        if (oldUsingSpContent !== newContent) {
          console.log('    ℹ️  using-superpowers/SKILL.md was updated (dynamic loading, no sync needed).');
        } else {
          console.log('    No changes to using-superpowers.');
        }
      }
    }
  } else {
    const usingSpPath = path.join(skillsDir, 'using-superpowers', 'SKILL.md');
    if (fs.existsSync(usingSpPath)) {
      bootstrapInfo = { type: 'project', file: bootstrapFile, usingSpContent: fs.readFileSync(usingSpPath, 'utf-8') };
    }
    checkProjectBootstrap(bootstrapFile, oldUsingSpContent, usingSpPath);
  }

  // Manifest
  console.log('\n==> Updating manifest...');
  writeManifest(manifestFile, skillsDir, updatedSkills, bootstrapInfo);

  // Cleanup
  rmDir(tmpDir);
  console.log('\n==> Done! Superpowers updated. Restart CodeArts to apply.');
}

function cmdDelete(target, paths) {
  const { skillsDir, statusFile, bootstrapFile, manifestFile, label, scope } = paths;
  console.log(`\nSuperpowers Delete — ${label}\n`);
  console.log(`  Skills dir   : ${skillsDir}`);
  console.log(`  Manifest     : ${manifestFile}\n`);

  // Read manifest
  const manifest = readManifest(manifestFile);

  console.log(`==> Removing ${manifest.files.length} tracked files...`);
  let removed = 0;
  let errors = 0;

  // Remove files in reverse order (deepest first) so directories can be cleaned up
  const sortedFiles = [...manifest.files].sort((a, b) => b.length - a.length);
  for (const file of sortedFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch (e) {
      console.error(`    Failed to remove: ${file} (${e.message})`);
      errors++;
    }
  }

  // Remove empty directories that were part of Superpowers skills
  console.log('\n==> Cleaning up empty directories...');
  const superpowersSkillNames = new Set();
  for (const file of manifest.files) {
    const rel = path.relative(skillsDir, file);
    const topDir = rel.split(path.sep)[0];
    if (topDir) superpowersSkillNames.add(topDir);
  }
  for (const name of superpowersSkillNames) {
    const dir = path.join(skillsDir, name);
    if (fs.existsSync(dir)) {
      try {
        rmDir(dir);
        console.log(`    Removed: ${name}/`);
      } catch (e) {
        console.error(`    Failed to remove directory: ${name}/ (${e.message})`);
      }
    }
  }

  // Update status file — remove Superpowers entries
  console.log('\n==> Updating status file...');
  if (fs.existsSync(statusFile)) {
    updateStatusFile(statusFile, skillsDir, 'disable', [...superpowersSkillNames]);
  }

  // Clean up bootstrap
  if (manifest.bootstrap) {
    console.log('\n==> Cleaning up bootstrap...');
    const { type, file, usingSpContent } = manifest.bootstrap;
    if (type === 'user') {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`    Removed: ${file}`);
        } catch (e) {
          console.error(`    Failed to remove bootstrap: ${file} (${e.message})`);
        }
      }
    } else if (type === 'project') {
      if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf-8');
        const cleaned = removeSuperpowersBlock(content);
        if (cleaned !== null) {
          fs.writeFileSync(file, cleaned);
          console.log(`    Removed Superpowers block from ${file}`);
        } else {
          console.log(`    Superpowers block not found in ${file} — may have been removed already.`);
        }
      }
    }
  }

  // Remove manifest
  console.log('\n==> Removing manifest...');
  try {
    if (fs.existsSync(manifestFile)) fs.unlinkSync(manifestFile);
    console.log('    Manifest removed.');
  } catch (e) {
    console.error(`    Failed to remove manifest: ${e.message}`);
  }

  console.log(`\n==> Done! Removed ${removed} files, ${errors} errors.`);
  if (errors > 0) {
    console.log('    Some files could not be removed — check permissions.');
  }
  console.log('    Restart CodeArts to apply.');
}

// ─── main ───────────────────────────────────────────────────────────────────

const { command, args } = parseArgs();
const target = resolveTarget(args);
const paths = getPaths(target);

switch (command) {
  case 'init':
    cmdInit(target, paths);
    break;
  case 'update':
    cmdUpdate(target, paths);
    break;
  case 'delete':
    cmdDelete(target, paths);
    break;
}
