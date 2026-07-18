const fs = require('fs');
const path = require('path');

function readEnabledSkills(statusFile) {
  if (!fs.existsSync(statusFile)) return [];
  const content = fs.readFileSync(statusFile, 'utf-8').replace(/\r\n/g, '\n');
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => l && l.includes('='))
    .map(l => l.split('=')[0]);
}

function enableSkills(statusFile, skillNames) {
  if (!fs.existsSync(statusFile)) {
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, '');
  }
  let content = fs.readFileSync(statusFile, 'utf-8').replace(/\r\n/g, '\n');
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
}

function disableSkills(statusFile, skillNames) {
  if (!fs.existsSync(statusFile)) return;
  const set = new Set(skillNames);
  const content = fs.readFileSync(statusFile, 'utf-8').replace(/\r\n/g, '\n');
  const lines = content.split('\n').filter(l => {
    const t = l.trim();
    if (!t) return false;
    const name = t.split('=')[0];
    return !set.has(name);
  });
  fs.writeFileSync(statusFile, lines.join('\n').trim() + '\n');
  console.log(`    Removed ${skillNames.length} skill(s) from ${path.basename(statusFile)}.`);
}

module.exports = { readEnabledSkills, enableSkills, disableSkills };