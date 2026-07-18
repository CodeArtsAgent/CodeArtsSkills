/**
 * set-secrets.js - Automated GitHub Actions Secrets & Variables Setup
 *
 * This script sets GitHub repository secrets (encrypted) and variables
 * (plain text) required by the CI/CD pipeline. It uses the GitHub REST API
 * with libsodium encryption for secrets.
 *
 * PREREQUISITES:
 *   npm install libsodium-wrappers
 *
 * USAGE:
 *   1. Fill in the CONFIG section below with your actual values
 *   2. Run: node set-secrets.js
 *
 * VALUES SOURCE:
 *   - GITHUB_OWNER / GITHUB_REPO: from Step 0.1 (GitHub onboarding)
 *   - GITHUB_PAT: from Step 0.1 (GitHub Personal Access Token)
 *   - SONAR_TOKEN: from Step 0.3 (SonarCloud onboarding)
 *   - JFROG_* values: from Step 0.5 (JFrog Artifactory onboarding)
 */

const CONFIG = {
  // --- GitHub Repository ---
  GITHUB_OWNER: '<GITHUB_OWNER>',
  GITHUB_REPO: '<GITHUB_REPO>',
  GITHUB_PAT: '<GITHUB_PAT>',

  // --- GitHub Secrets (encrypted, sensitive data) ---
  SECRETS: {
    SONAR_TOKEN: '<SONAR_TOKEN>',
    JFROG_PASSWORD: '<JFROG_PASSWORD>',
  },

  // --- GitHub Variables (plain text, non-sensitive data) ---
  VARIABLES: {
    JFROG_PLATFORM_URL: '<JFROG_PLATFORM_URL>',
    JFROG_DOCKER_REGISTRY: '<JFROG_DOCKER_REGISTRY>',
    JFROG_USERNAME: '<JFROG_USERNAME>',
    JFROG_PROJECT: '<JFROG_PROJECT>',
    SONAR_PROJECT_KEY: '<SONAR_PROJECT_KEY>',
  },
};

// ---------------------------------------------------------------------------
// Implementation - do not modify below unless you know what you are doing
// ---------------------------------------------------------------------------

const sodium = require('libsodium-wrappers');
const https = require('https');

function apiCall(owner, repo, pat, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}${path}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        'User-Agent': 'set-secrets-script',
      },
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function setVariable(owner, repo, pat, name, value) {
  const body = { name, value };
  // Try PUT first (update), fall back to POST (create)
  let resp = await apiCall(owner, repo, pat, 'PUT', `/actions/variables/${name}`, body);
  if (resp.status === 404) {
    resp = await apiCall(owner, repo, pat, 'POST', '/actions/variables', body);
  }
  const ok = resp.status === 201 || resp.status === 204;
  console.log(`  VARIABLE ${name}: ${ok ? 'OK' : 'FAILED (' + resp.status + ')'}`);
  return ok;
}

async function setSecret(owner, repo, pat, name, value) {
  await sodium.ready;
  const keyResp = await apiCall(owner, repo, pat, 'GET', '/actions/secrets/public-key');
  if (keyResp.status !== 200) {
    console.log(`  SECRET ${name}: FAILED (could not fetch public key: ${keyResp.status})`);
    return false;
  }
  const binKey = sodium.from_base64(keyResp.data.key, sodium.base64_variants.ORIGINAL);
  const binSecret = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(binSecret, binKey);
  const b64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

  const resp = await apiCall(owner, repo, pat, 'PUT', `/actions/secrets/${name}`, {
    encrypted_value: b64,
    key_id: keyResp.data.key_id,
  });
  const ok = resp.status === 201 || resp.status === 204;
  console.log(`  SECRET  ${name}: ${ok ? 'OK' : 'FAILED (' + resp.status + ')'}`);
  return ok;
}

async function main() {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_PAT, SECRETS, VARIABLES } = CONFIG;

  // Validate placeholders
  const placeholders = Object.entries({ GITHUB_OWNER, GITHUB_REPO, GITHUB_PAT, ...SECRETS, ...VARIABLES })
    .filter(([, v]) => v.startsWith('<') && v.endsWith('>'));
  if (placeholders.length > 0) {
    console.error('ERROR: Please fill in all placeholder values in the CONFIG section:');
    placeholders.forEach(([k]) => console.error(`  - ${k}`));
    process.exit(1);
  }

  console.log(`\nSetting GitHub Actions secrets and variables for ${GITHUB_OWNER}/${GITHUB_REPO}\n`);

  console.log('Variables (plain text):');
  let failed = false;
  for (const [name, value] of Object.entries(VARIABLES)) {
    failed ||= !(await setVariable(GITHUB_OWNER, GITHUB_REPO, GITHUB_PAT, name, value));
  }

  console.log('\nSecrets (encrypted):');
  for (const [name, value] of Object.entries(SECRETS)) {
    failed ||= !(await setSecret(GITHUB_OWNER, GITHUB_REPO, GITHUB_PAT, name, value));
  }

  if (failed) {
    console.error('\nERROR: One or more secrets or variables failed to update.');
    process.exit(1);
  }
  console.log('\nDone. Verify at: https://github.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/settings/secrets/actions');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});