const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFESTS_DIR = path.join(__dirname, '..', '..', 'assets', 'manifests');

function manifestsDir() {
  if (!fs.existsSync(MANIFESTS_DIR)) fs.mkdirSync(MANIFESTS_DIR, { recursive: true });
  return MANIFESTS_DIR;
}

function manifestFileFor(skillsDir) {
  const hash = crypto.createHash('md5').update(skillsDir).digest('hex').substring(0, 8);
  return path.join(manifestsDir(), `manifest-${hash}.json`);
}

function collectFiles(dir, result) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, result);
    else result.push(full);
  }
}

function writeManifest(manifestFile, data) {
  fs.writeFileSync(manifestFile, JSON.stringify(data, null, 2));
}

function readManifest(manifestFile) {
  if (!fs.existsSync(manifestFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function removeManifest(manifestFile) {
  if (fs.existsSync(manifestFile)) fs.rmSync(manifestFile, { force: true });
}

module.exports = {
  MANIFESTS_DIR,
  manifestsDir,
  manifestFileFor,
  collectFiles,
  writeManifest,
  readManifest,
  removeManifest
};