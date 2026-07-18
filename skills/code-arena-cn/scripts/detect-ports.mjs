// Port detection — derive backend/frontend ports from a project's README / config / code.
// Usage (CLI):   node detect-ports.mjs <projectDir>      -> prints "BACKEND=<p> FRONTEND=<p>"
// Usage (module): import { detectBackendPort, detectFrontendPort } from './detect-ports.mjs'
import fs from 'fs';
import path from 'path';

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const firstMatch = (text, re) => { const m = text.match(re); return m ? parseInt(m[1], 10) : null; };

function scan(files, regexes) {
  for (const f of files) {
    const t = read(f);
    if (!t) continue;
    for (const re of regexes) { const p = firstMatch(t, re); if (p) return p; }
  }
  return null;
}

export function detectBackendPort(dir = '.') {
  const be = path.join(dir, 'backend');
  return (
    // 1) README first
    scan(
      [path.join(dir, 'README.md'), path.join(be, 'README.md')],
      [/back[\s-]?end[^\n]*?localhost:(\d{2,5})/i, /listens?\s+on[^\n]*?localhost:(\d{2,5})/i, /:(\d{2,5})\/api/i, /PORT[`'"\s|=]*?(\d{2,5})/]
    ) ||
    // 2) then env / config / code
    scan([path.join(be, '.env'), path.join(be, '.env.example')], [/^\s*PORT\s*=\s*(\d{2,5})/m]) ||
    scan(
      [path.join(be, 'src/config/index.js'), path.join(be, 'src/config.js'), path.join(be, 'src/config/constants.js'), path.join(be, 'src/server.js'), path.join(be, 'src/app.js')],
      [/PORT[^\d]{0,20}\|\|\s*(\d{2,5})/, /port\s*:\s*[^\d]{0,20}\|\|\s*(\d{2,5})/, /listen\(\s*(\d{2,5})/]
    ) ||
    // 3) fallback
    3000
  );
}

export function detectFrontendPort(dir = '.') {
  const fe = path.join(dir, 'frontend');
  return (
    // 1) README first
    scan(
      [path.join(dir, 'README.md'), path.join(fe, 'README.md')],
      [/front[\s-]?end[^\n]*?localhost:(\d{2,5})/i, /:(\d{2,5})[^\n]*?(vite|frontend|dev server)/i]
    ) ||
    // 2) then vite config
    scan(
      [path.join(fe, 'vite.config.js'), path.join(fe, 'vite.config.ts'), path.join(fe, 'vite.config.mjs')],
      [/server\s*:\s*\{[^}]*?port\s*:\s*(\d{2,5})/s, /port\s*:\s*(\d{2,5})/]
    ) ||
    // 3) fallback
    5173
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || '.';
  console.log(`BACKEND=${detectBackendPort(dir)} FRONTEND=${detectFrontendPort(dir)}`);
}
