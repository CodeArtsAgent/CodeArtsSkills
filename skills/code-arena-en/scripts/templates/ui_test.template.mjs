// ============================================================================
// ui_test TEMPLATE — DO NOT run as-is. GENERATE a per-round copy each round.
//
// COMPLETE end-to-end UI testing: drive EVERY screen + EVERY state-mutating
// action through the real browser (login, account CRUD, submit/cancel,
// approve/reject), asserting toast/table/persistence + console errors. Use the
// `playwright-cli` skill to record/inspect selectors while authoring this.
//
// Generate from: <round>_eval_cases.md + <round>_raw_prompt.md + the TARGET's
// frontend (routes, form fields, button labels, selectors). Write the filled
// copy to EvalSets/<round>/evidence/harness/ui_test.mjs (with ../lib copied in).
// Mechanics come from lib/ui.mjs (GENERIC); the FLOWS below are generated.
// ============================================================================
import { launch, trackErrors, login, waitToast, shot, rowCount, UIRecorder } from './lib/ui.mjs';

const PROJECT = process.argv[2] || 'target';
const EVID = process.env.EVID_DIR || './evidence/ui';
const FE = process.env.FE_BASE || 'http://localhost:5173';

// ---- GENERATE PER ROUND: routes, selectors, labels, test data --------------
const UI = {
  admin: { username: 'admin', password: '123456' },
  employee: { username: 'user1', password: '1234567', bankAccount: '4876876234' },
  routes: { /* users:'/users', reimbursements:'/reimbursements', newReimb:'/reimbursements/new' */ },
  createBtn: /create|add|new/i,
  dialogSubmit: /save|submit|ok|confirm/i,
  failToast: /error|fail|invalid/i,  // also detectable via .el-message--error class
};

async function run() {
  const browser = await launch();
  const page = await browser.newPage();
  const errs = trackErrors(page);
  const rec = new UIRecorder(PROJECT, FE);
  try {
    rec.add('admin-login', (await login(page, FE, UI.admin)) ? 'PASS' : 'FAIL', page.url());
    // TODO(generate): for EACH mutating flow in the eval-cases — open screen, fill, submit,
    // then assert via waitToast()/rowCount() and check errs. Every flow traces to a case ID.
    // e.g. create employee, edit/delete, submit reimbursement, cancel, approve, reject.
    await shot(page, EVID, `${PROJECT}-example`);
  } catch (e) { rec.add('runner', 'ERROR', e.message.slice(0, 200)); }
  finally { rec.save(EVID, errs); await browser.close(); }
}
run();
