// Lean visual capture — one admin login, then screenshot at 3 viewports (avoids login rate limiters).
// Usage: PROJECT_DIR=<path> node cap.mjs <project>   (frontend port detected from project, override with FRONTEND)
// Output dir: $EVID_DIR/screens (default ./evidence/screens). Playwright resolved from node_modules.
import pw from 'playwright';
import fs from 'fs';
import { detectFrontendPort } from './detect-ports.mjs';
const { chromium } = pw;
const proj = process.argv[2] || 'app';
const OUTDIR = process.env.EVID_DIR ? `${process.env.EVID_DIR}/screens` : './evidence/screens';
fs.mkdirSync(OUTDIR, { recursive: true });
const BASE = process.env.FRONTEND || `http://127.0.0.1:${detectFrontendPort(process.env.PROJECT_DIR || '.')}`;
const O = `${OUTDIR}/vis-${proj}`;

const run = async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.locator('input').first().fill(process.env.ADMIN_USER || 'admin');
  await p.locator('input[type=password]').first().fill(process.env.ADMIN_PASS || '123456');
  await p.getByRole('button').first().click();
  await p.waitForTimeout(2500);
  console.log('url after login:', p.url(), '| pageErrors:', errs.length);
  for (const v of [['desktop', 1280, 900], ['tablet', 768, 1024], ['mobile', 390, 844]]) {
    await p.setViewportSize({ width: v[1], height: v[2] });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${O}-${v[0]}.png`, fullPage: true });
  }
  await b.close();
  console.log('CAP DONE', proj, '->', OUTDIR);
};
run().catch((e) => { console.error('ERR', e.message); process.exit(1); });
