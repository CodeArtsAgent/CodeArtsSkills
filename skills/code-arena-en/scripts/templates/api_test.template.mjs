// ============================================================================
// api_test TEMPLATE — DO NOT run as-is. GENERATE a per-round copy each round.
//
// Generate from: this round's <round>_eval_cases.md (the case list) +
// <round>_raw_prompt.md (the requirement) + the TARGET's actual backend routes
// (endpoints/verbs/field names/auth shape). Write the filled copy to
//   EvalSets/<round>/evidence/harness/api_test.mjs
// and copy ../lib alongside as evidence/harness/lib (so the import below resolves).
//
// Mechanics (request/multipart/recorder) come from lib/http.mjs and are GENERIC.
// What you GENERATE per round = the CONTRACT block + the CASES block below.
// ============================================================================
import { client, multipart, extractToken, Recorder } from './lib/http.mjs';
import { detectBackendPort } from './lib/detect-ports.mjs'; // copy detect-ports.mjs into harness too, or inline the port

const PROJECT = process.argv[2] || 'target';
const EVID = process.env.EVID_DIR || './evidence';
const BASE = process.env.BASE || `http://127.0.0.1:${detectBackendPort(process.env.PROJECT_DIR || '.')}`;
const api = client(BASE);
const rec = new Recorder(PROJECT);

// ---- GENERATE PER ROUND: the target's API contract -------------------------
// Derive every value below from the target's real routes + the prompt's fields.
const C = {
  adminCreds: { username: 'admin', password: '123456' }, // from prompt's default admin
  login: '/api/auth/login',
  // accounts/reimbursement endpoints, verbs, field names, upload mode, auth on /files, etc.
  // e.g. accounts: '/api/accounts', acctBody: (u,p)=>({username:u,password:p,role:'Employee'}),
  //      reimb: '/api/reimbursements', fields:{title:'invoiceTitle',amount:'invoiceAmount',bank:'bankAccountNumber'},
  //      submitMode:'multipart', multipartField:'invoiceImage', actionMethod:'PUT', fileUrl:f=>`/api/files/${f}`
};

// ---- GENERATE PER ROUND: the assertions, one per eval-case ------------------
// Each case maps to a row in <round>_eval_cases.md. Use rec.expectStatus / rec.add.
async function run() {
  // login
  const login = await api.post(C.login, { json: C.adminCreds });
  rec.expectStatus('LOGIN-admin', login, [200, 201], 'default admin login');
  api.setToken(extractToken(login.body));

  // TODO(generate): account CRUD, privilege 403, N-field submit (multipart via multipart()),
  // required-field 400, ownership isolation, path traversal, JWT tamper, approve/reject, logout …
  // Every case here must trace to a specific eval-case ID; do not ship generic placeholders.

  rec.save(EVID);
}
run().catch(e => { console.error('ERR', e.message); rec.save(EVID); process.exit(1); });
