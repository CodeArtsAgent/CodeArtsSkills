// ============================================================================
// visual_test TEMPLATE — GENERATE/calibrate per round. The 3-viewport capture
// ENGINE is generic (cap.mjs covers the simple case); WHICH screens to capture
// and the login/nav flow are app-specific — fill from the target's routes.
//
// Output: $EVID_DIR/screens/vis-<project>-<viewport>-<screen>.png
// ============================================================================
import { launch, login, shot } from './lib/ui.mjs';

const PROJECT = process.argv[2] || 'target';
const FE = process.env.FRONTEND || process.env.FE_BASE || 'http://127.0.0.1:5173';
const DIR = (process.env.EVID_DIR || './evidence') + '/screens';
const viewports = [['desktop', 1280, 900], ['tablet', 768, 1024], ['mobile', 390, 844]];

// ---- GENERATE PER ROUND: the screens worth capturing for THIS app ----------
const screens = [ /* { name:'login', go: async(p)=>p.goto(FE+'/login') }, { name:'list', ... }, { name:'form', ... } */ ];

async function run() {
  const browser = await launch();
  for (const [vp, w, h] of viewports) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await login(page, FE, { username: 'admin', password: '123456' });
    for (const s of screens) { try { await s.go(page); await page.waitForTimeout(800); await shot(page, DIR, `vis-${PROJECT}-${vp}-${s.name}`); } catch {} }
    await ctx.close();
  }
  await browser.close();
  console.log('visual capture done →', DIR);
}
run();
