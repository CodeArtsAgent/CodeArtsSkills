// lib/ui.mjs — GENERIC, reusable Playwright UI helpers. Pre-written; not round-specific.
// The round-specific FLOWS (which screens/buttons) live in the generated ui harness.
import fs from 'fs';

let _pw = null;
async function pw() { if (!_pw) _pw = await import('playwright'); return _pw; }

// Launch chromium honoring sandbox constraints (PW_EXEC headless-shell path if set).
export async function launch() {
  const { chromium } = await pw();
  return chromium.launch({
    executablePath: process.env.PW_EXEC || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

// Attach console/page error capture to a page; returns a live array.
export function trackErrors(page) {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  return errs;
}

// Generic Element-Plus / common login. cfg: {userSel, passSel, submitName}.
export async function login(page, feBase, creds, cfg = {}) {
  const userSel = cfg.userSel || 'input[placeholder*="username" i],input[name="username"],input[type="text"]:not([type="password"])';
  const passSel = cfg.passSel || 'input[type="password"]';
  const submit = cfg.submitName || /sign in|log ?in|login|submit/i;
  await page.goto(`${feBase}/login`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.fill(userSel, creds.username).catch(() => {});
  await page.fill(passSel, creds.password).catch(() => {});
  await page.getByRole('button', { name: submit }).first().click({ timeout: 8000 }).catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(2200);
  return !/\/login\b/.test(page.url());
}

// Poll briefly for a toast/notification; returns its text (or '').
export async function waitToast(page, sel = '.el-message,.el-notification,[role="alert"]') {
  for (let i = 0; i < 10; i++) {
    const t = await page.$$eval(sel, els => els.map(e => e.textContent.trim())).catch(() => []);
    if (t.length) return t.join(' | ');
    await page.waitForTimeout(180);
  }
  return '';
}

export async function shot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  try { await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true }); } catch {}
}

export async function rowCount(page, sel = '.el-table__row') {
  return page.$$eval(sel, r => r.length).catch(() => -1);
}

// UI flow recorder → evidence JSON.
export class UIRecorder {
  constructor(project, feBase) { this.project = project; this.feBase = feBase; this.flows = []; this.errorsSample = []; }
  add(flow, status, detail = '') { this.flows.push({ flow, status, detail }); console.log(`[${status}] ${flow} — ${detail}`); }
  save(evidDir, consoleErrors = []) {
    fs.mkdirSync(evidDir, { recursive: true });
    const summary = { project: this.project, frontend: this.feBase, flows: this.flows, consoleErrorsSample: [...new Set(consoleErrors)].slice(0, 6) };
    const f = `${evidDir}/${this.project}-ui-results.json`;
    fs.writeFileSync(f, JSON.stringify(summary, null, 2));
    console.log(`\n=== UI RESULTS → ${f}\n` + JSON.stringify(summary, null, 2));
    return f;
  }
}
