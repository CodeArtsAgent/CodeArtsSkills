// lib/http.mjs — GENERIC, reusable HTTP test helpers. Pre-written; not round-specific.
// Round harnesses import these; the round-specific CASES live in the generated harness.
import fs from 'fs';

// Minimal client. base e.g. http://127.0.0.1:3000
export function client(base) {
  let token = null;
  const hdr = (extra = {}) => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra });
  const call = async (method, path, { json, headers, raw } = {}) => {
    const opt = { method, headers: hdr(headers || (json !== undefined ? { 'Content-Type': 'application/json' } : {})) };
    if (json !== undefined) opt.body = JSON.stringify(json);
    if (raw !== undefined) opt.body = raw;
    const res = await fetch(base + path, opt);
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, body, headers: res.headers };
  };
  return {
    get base() { return base; },
    setToken(t) { token = t; },
    getToken() { return token; },
    get: (p, o) => call('GET', p, o),
    post: (p, o) => call('POST', p, o),
    put: (p, o) => call('PUT', p, o),
    patch: (p, o) => call('PATCH', p, o),
    del: (p, o) => call('DELETE', p, o),
  };
}

// Build a multipart/form-data body (Node 18+ FormData/Blob) for file-upload cases.
export function multipart(fields = {}, fileField, fileBuf, filename = 'f.png', mime = 'image/png') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (fileField && fileBuf) fd.append(fileField, new Blob([fileBuf], { type: mime }), filename);
  return fd; // pass as { raw: fd } — fetch sets the boundary header itself
}

// Pull a token out of a login response regardless of shape.
export function extractToken(body) {
  if (!body || typeof body !== 'object') return null;
  return body.token || body.accessToken || (body.data && (body.data.token || body.data.accessToken)) || null;
}

// Result recorder → evidence JSON. Each assertion: id, expected, actual, pass, note.
export class Recorder {
  constructor(project) { this.project = project; this.results = []; }
  add(id, ok, expected, actual, note = '') {
    this.results.push({ id, pass: ok === true, expected, actual, note });
    console.log(`[${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'}] ${id} exp=${JSON.stringify(expected)} act=${JSON.stringify(actual)} ${note}`);
  }
  // convenience: assert status is in the allowed set
  expectStatus(id, res, allowed, note = '') {
    const ok = (Array.isArray(allowed) ? allowed : [allowed]).includes(res.status);
    this.add(id, ok, allowed, res.status, note);
    return ok;
  }
  save(evidDir = './evidence') {
    fs.mkdirSync(evidDir, { recursive: true });
    const f = `${evidDir}/${this.project}-api-results.json`;
    fs.writeFileSync(f, JSON.stringify(this.results, null, 2));
    const pass = this.results.filter(r => r.pass).length;
    console.log(`\n=== ${this.project}: ${pass}/${this.results.length} PASS → ${f}`);
    return f;
  }
}
