const fs = require('fs');
const path = require('path');
const os = require('os');

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.codeartsdoer'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveScope(extraArgs) {
  const explicitUser = extraArgs.includes('--user');
  const explicitProject = extraArgs.includes('--project');
  if (explicitUser && explicitProject) {
    console.error('Error: cannot use both --user and --project.');
    process.exit(1);
  }
  if (explicitUser) return { scope: 'user', root: null, explicit: true };
  if (explicitProject) {
    const root = findProjectRoot(process.env.INIT_CWD || process.cwd());
    if (!root) {
      console.error('Error: not inside a CodeArts project (no .codeartsdoer/ found).');
      console.error('Use --user to install at user level, or run from a project directory.');
      process.exit(1);
    }
    return { scope: 'project', root, explicit: true };
  }
  const cwd = process.env.INIT_CWD || process.cwd();
  const root = findProjectRoot(cwd);
  if (root) {
    console.log(`Auto-detected project at: ${root}`);
    return { scope: 'project', root, explicit: false };
  }
  console.log('No .codeartsdoer/ in current directory, defaulting to user-level.');
  return { scope: 'user', root: null, explicit: false };
}

function getSkillsDir(scope, root) {
  if (scope === 'user') return path.join(os.homedir(), '.codeartsdoer', 'skills');
  return path.join(root, '.codeartsdoer', 'skills');
}

function getStatusFile(scope, skillsDir) {
  return scope === 'user'
    ? path.join(skillsDir, 'UserSkillStatus.txt')
    : path.join(skillsDir, 'ProjectSkillStatus.txt');
}

function resolvePaths(scope, root) {
  const skillsDir = getSkillsDir(scope, root);
  const statusFile = getStatusFile(scope, skillsDir);
  return { scope, root, skillsDir, statusFile };
}

module.exports = { findProjectRoot, resolveScope, getSkillsDir, getStatusFile, resolvePaths };