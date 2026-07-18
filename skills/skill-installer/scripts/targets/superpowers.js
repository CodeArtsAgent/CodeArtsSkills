const fs = require('fs');
const path = require('path');
const os = require('os');
const { run, rmDir, cpDir } = require('../lib/exec');
const { enableSkills, disableSkills } = require('../lib/status-file');
const { manifestFileFor, collectFiles, writeManifest, readManifest, removeManifest } = require('../lib/manifest');

const REPO = 'https://github.com/obra/superpowers.git';

const SUPEROWERS_BEGIN = '<!-- SUPEROWERS_BEGIN -->';
const SUPEROWERS_END = '<!-- SUPEROWERS_END -->';

function getBootstrapFile(ctx) {
  if (ctx.scope === 'user') {
    return path.join(os.homedir(), '.codeartsdoer', 'rule', 'superpowers-bootstrap.md');
  }
  return path.join(ctx.root, 'CODEARTS.md');
}

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

function wrapBlock(content) {
  return `${SUPEROWERS_BEGIN}\n${content}\n${SUPEROWERS_END}`;
}

function extractBlock(fileContent) {
  const beginIdx = fileContent.indexOf(SUPEROWERS_BEGIN);
  const endIdx = fileContent.indexOf(SUPEROWERS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return null;
  return fileContent.substring(beginIdx + SUPEROWERS_BEGIN.length + 1, endIdx);
}

function replaceBlock(fileContent, newContent) {
  const beginIdx = fileContent.indexOf(SUPEROWERS_BEGIN);
  const endIdx = fileContent.indexOf(SUPEROWERS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    if (fileContent && !fileContent.endsWith('\n')) fileContent += '\n';
    return fileContent + '\n' + wrapBlock(newContent) + '\n';
  }
  const before = fileContent.substring(0, beginIdx);
  const after = fileContent.substring(endIdx + SUPEROWERS_END.length);
  return before + wrapBlock(newContent) + after;
}

function removeBlock(fileContent) {
  const beginIdx = fileContent.indexOf(SUPEROWERS_BEGIN);
  const endIdx = fileContent.indexOf(SUPEROWERS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return null;
  const before = fileContent.substring(0, beginIdx);
  const after = fileContent.substring(endIdx + SUPEROWERS_END.length);
  return (before.replace(/\n+$/, '\n') + after.replace(/^\n+/, '')).trimEnd() + '\n';
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
  if (diffCount > 30) console.log(`  ... and ${diffCount - 30} more changes`);
  console.log('  ─────────────────────────────────────────────────────');
}

function checkProjectBootstrap(bootstrapFile, oldUsingSpContent, newUsingSpPath) {
  if (oldUsingSpContent !== null && fs.existsSync(newUsingSpPath)) {
    const newUsingSpContent = fs.readFileSync(newUsingSpPath, 'utf-8');
    if (oldUsingSpContent !== newUsingSpContent) {
      printDiff(oldUsingSpContent, newUsingSpContent);
      console.log('');
      if (fs.existsSync(bootstrapFile)) {
        let bootstrapContent = fs.readFileSync(bootstrapFile, 'utf-8');
        if (extractBlock(bootstrapContent) !== null) {
          bootstrapContent = replaceBlock(bootstrapContent, newUsingSpContent);
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
    const newUsingSpContent = fs.readFileSync(newUsingSpPath, 'utf-8');
    let bootstrapContent = fs.readFileSync(bootstrapFile, 'utf-8');
    bootstrapContent = replaceBlock(bootstrapContent, newUsingSpContent);
    fs.writeFileSync(bootstrapFile, bootstrapContent);
    console.log('    Appended Superpowers block to CODEARTS.md.');
  }
}

function cloneAndCopy(ctx, action) {
  const { skillsDir } = ctx;
  const tmpDir = path.join(os.tmpdir(), `superpowers-${action}-${process.pid}`);
  console.log(`==> Cloning Superpowers...`);
  rmDir(tmpDir);
  run(`git clone --depth 1 "${REPO}" "${tmpDir}"`);

  const oldUsingSp = path.join(skillsDir, 'using-superpowers', 'SKILL.md');
  let oldUsingSpContent = null;
  if (fs.existsSync(oldUsingSp)) oldUsingSpContent = fs.readFileSync(oldUsingSp, 'utf-8');

  console.log(`\n==> ${action === 'update' ? 'Updating' : 'Installing'} skills...`);
  const srcSkillsDir = path.join(tmpDir, 'skills');
  const installedSkills = [];
  for (const entry of fs.readdirSync(srcSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    console.log(`    ${action === 'update' ? 'Updating' : 'Installing'}: ${entry.name}`);
    cpDir(path.join(srcSkillsDir, entry.name), path.join(skillsDir, entry.name));
    installedSkills.push(entry.name);
  }

  console.log('\n==> Registering skills...');
  enableSkills(ctx.statusFile, installedSkills);

  console.log('\n==> Checking bootstrap...');
  const bootstrapFile = getBootstrapFile(ctx);
  let bootstrapInfo = null;
  if (ctx.scope === 'user') {
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

  console.log('\n==> Writing manifest...');
  const manifestFile = manifestFileFor(skillsDir);
  const files = [];
  for (const name of installedSkills) {
    const dir = path.join(skillsDir, name);
    if (fs.existsSync(dir)) collectFiles(dir, files);
  }
  writeManifest(manifestFile, {
    installedAt: new Date().toISOString(),
    target: 'superpowers',
    skillsDir,
    skillNames: installedSkills,
    bootstrap: bootstrapInfo,
    files
  });
  console.log(`    Manifest saved: ${files.length} files tracked.`);

  rmDir(tmpDir);
  console.log(`\n==> Done! Superpowers ${action === 'update' ? 'updated' : 'installed'}. Restart CodeArts to apply.`);
}

module.exports = {
  name: 'superpowers',
  displayName: 'Superpowers',
  description: 'The Superpowers skills framework (14 skills: brainstorming, TDD, debugging, plans, etc.).',
  scopes: ['project', 'user'],
  commands: ['init', 'update', 'delete'],

  init(ctx) {
    if (!fs.existsSync(ctx.skillsDir)) fs.mkdirSync(ctx.skillsDir, { recursive: true });
    cloneAndCopy(ctx, 'init');
  },

  update(ctx) {
    if (!fs.existsSync(ctx.skillsDir)) fs.mkdirSync(ctx.skillsDir, { recursive: true });
    cloneAndCopy(ctx, 'update');
  },

  delete(ctx) {
    const { skillsDir, statusFile } = ctx;
    const manifestFile = manifestFileFor(skillsDir);
    const manifest = readManifest(manifestFile);

    if (!manifest) {
      console.log('==> No manifest found — nothing to remove. Run "init" first.');
      return;
    }

    console.log(`==> Removing ${manifest.files.length} tracked files...`);
    let removed = 0;
    let errors = 0;
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

    console.log('\n==> Cleaning up empty directories...');
    const skillNames = manifest.skillNames || [];
    for (const name of skillNames) {
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

    console.log('\n==> Updating status file...');
    if (fs.existsSync(statusFile)) {
      disableSkills(statusFile, skillNames);
    }

    if (manifest.bootstrap) {
      console.log('\n==> Cleaning up bootstrap...');
      const { type, file } = manifest.bootstrap;
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
          const content = fs.readFileSync(file, 'utf-8');
          const cleaned = removeBlock(content);
          if (cleaned !== null) {
            fs.writeFileSync(file, cleaned);
            console.log(`    Removed Superpowers block from ${file}`);
          } else {
            console.log('    Superpowers block not found in CODEARTS.md — may have been removed already.');
          }
        }
      }
    }

    removeManifest(manifestFile);
    console.log('\n==> Removing manifest...');
    console.log('    Manifest removed.');

    console.log(`\n==> Done! Removed ${removed} files, ${errors} errors.`);
    console.log('    Restart CodeArts to apply.');
  }
};