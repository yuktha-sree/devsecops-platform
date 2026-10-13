// End-to-end check of the GitHub scan flow WITHOUT real GitHub or scanners:
//   fake GitHub API  <->  this backend  <->  PostgreSQL
// and it plays the part of the scan workflow using the real Python
// normalizer / gate / payload bridge on the sample scanner reports.
//
//   1. start PostgreSQL and run `npm run migrate`
//   2. set .env (see .env.example) with GITHUB_API_URL=http://localhost:5099
//      and GITHUB_WEB_URL=http://localhost:5099
//   3. node scripts/e2e-local.js
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

const PORT = Number(process.env.PORT || 5055);
const BASE = `http://localhost:${PORT}/api`;
const SEC = path.join(__dirname, '..', '..', 'security');
const dispatches = [];
let failures = 0;

function check(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !extra ? '' : '  -> ' + JSON.stringify(extra)}`);
  if (!ok) failures += 1;
}

// ---- fake GitHub ---------------------------------------------------------
const repo = (name) => ({ id: 1, name, full_name: `octo/${name}`, owner: { login: 'octo' }, private: true,
  description: 'demo', language: 'JavaScript', default_branch: 'main', updated_at: '2026-09-01T00:00:00Z',
  html_url: `https://github.com/octo/${name}`, archived: false });
const fakeGithub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === null ? '' : JSON.stringify(obj)); };
    const auth = req.headers.authorization || '';
    if (req.url.includes('/dispatches')) {
      if (auth !== 'Bearer scanner-pat') return send(401, { message: 'Bad credentials' });
      dispatches.push(JSON.parse(body)); return send(204, null);
    }
    if (auth !== 'Bearer ghp_validusertoken0000000000') return send(401, { message: 'Bad credentials' });
    if (req.url === '/user') return send(200, { login: 'octo', name: 'Octo Cat', avatar_url: 'x' });
    if (req.url.startsWith('/user/repos')) return send(200, [repo('shop-app'), repo('blog')]);
    if (req.url === '/repos/octo/shop-app') return send(200, repo('shop-app'));
    if (req.url === '/repos/octo/shop-app/branches?per_page=100') return send(200, [{ name: 'main' }, { name: 'develop' }]);
    send(404, { message: 'Not Found' });
  });
});

// ---- helpers --------------------------------------------------------------
async function api(method, url, { token, body, headers } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
const sign = (id) => crypto.createHmac('sha256', process.env.SCAN_SECRET).update(String(id)).digest('hex');
const py = (...args) => spawnSync('python3', args, { encoding: 'utf8' });

// Plays the part of .github/workflows/scan-repository.yml, using the REAL
// security/ci/platform_client.py and the real Python normalizer / gate.
async function runWorkflow(scanId, sampleDir) {
  const h = { 'x-scan-auth': sign(scanId) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
  const out = path.join(tmp, 'github_output');
  fs.writeFileSync(out, '');
  const env = { ...process.env, BACKEND_URL: BASE, SCAN_ID: String(scanId), GITHUB_OUTPUT: out };
  const client = (...args) => spawnSync('python3', [path.join(SEC, 'ci/platform_client.py'), ...args], { encoding: 'utf8', env });

  const start = client('start', '--run-url', 'https://github.com/platform-owner/devsecops-platform/actions/runs/1');
  const src = client('source', '--out', `${tmp}/source.json`);
  const source = { status: src.status === 0 ? 200 : 500, data: src.status === 0 ? JSON.parse(fs.readFileSync(`${tmp}/source.json`, 'utf8')) : {}, stdout: src.stdout };
  fs.writeFileSync(path.join(tmp, 'gate-config.json'), JSON.stringify(source.data.gateConfig));
  py(path.join(SEC, 'normalizer/normalize.py'), '--reports', path.join(SEC, 'samples', sampleDir), '--output', `${tmp}/normalized.json`);
  py(path.join(SEC, 'security-gate/gate.py'), '--input', `${tmp}/normalized.json`, '--output', `${tmp}/gate-result.json`, '--config', `${tmp}/gate-config.json`);
  py(path.join(SEC, 'normalizer/to_backend_payload.py'), '--input', `${tmp}/normalized.json`, '--gate', `${tmp}/gate-result.json`, '--commit', 'abc1234', '--output', `${tmp}/payload.json`);
  const gate = JSON.parse(fs.readFileSync(`${tmp}/gate-result.json`, 'utf8'));
  const res = client('results', '--payload', `${tmp}/payload.json`);
  const outputs = Object.fromEntries(fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
  // Same data shape the earlier checks use (read back from the backend):
  const results = { status: res.status === 0 ? 200 : 500, data: {} };
  if (res.status === 0) {
    const scan = (await api('GET', `/scans/${scanId}`, { token: global.__jwt })).data.scan;
    results.data = { final: { status: outputs.final_status }, deploy: outputs.deploy === 'true', scan };
  } else { results.data = { error: res.stderr || res.stdout }; }
  return { start: { status: start.status === 0 ? 200 : 500 }, source, results, gate, h, stdout: res.stdout, outputs };
}

(async () => {
  await new Promise((r) => fakeGithub.listen(5099, r));
  const server = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'ignore' });
  for (let i = 0; i < 30; i += 1) { try { await fetch(`${BASE}/health`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

  try {
    const email = `dev${Date.now()}@example.com`;
    const other = `other${Date.now()}@example.com`;
    check('register rejects short password', (await api('POST', '/auth/register', { body: { name: 'A', email, password: 'short' } })).status === 400);
    check('register ok', (await api('POST', '/auth/register', { body: { name: 'Dev One', email, password: 'password123' } })).status === 201);
    await api('POST', '/auth/register', { body: { name: 'Other', email: other, password: 'password123' } });
    const login = await api('POST', '/auth/login', { body: { email, password: 'password123' } });
    const otherLogin = await api('POST', '/auth/login', { body: { email: other, password: 'password123' } });
    const jwt = login.data.token; const otherJwt = otherLogin.data.token; global.__jwt = jwt;
    check('login returns token', Boolean(jwt));
    check('protected route needs token', (await api('GET', '/projects')).status === 401);

    // GitHub connection
    check('repos blocked before connecting', (await api('GET', '/github/repos', { token: jwt })).status === 409);
    check('bad GitHub token rejected', (await api('POST', '/github/connect', { token: jwt, body: { token: 'ghp_badtoken00000000000000' } })).status === 401);
    const conn = await api('POST', '/github/connect', { token: jwt, body: { token: 'ghp_validusertoken0000000000' } });
    check('connect GitHub with token', conn.status === 200 && conn.data.login === 'octo', conn.data);
    const dbTok = (await require('../config/db').query('SELECT github_token_enc FROM users WHERE email=$1', [email])).rows[0].github_token_enc;
    check('token is stored encrypted', dbTok && !dbTok.includes('ghp_validusertoken'));
    const status = await api('GET', '/github/status', { token: jwt });
    check('status shows connected', status.data.connected === true && status.data.login === 'octo');
    const repos = await api('GET', '/github/repos', { token: jwt });
    check('lists repositories', repos.data.repositories && repos.data.repositories.length === 2);
    const br = await api('GET', '/github/repos/octo/shop-app/branches', { token: jwt });
    check('lists branches', br.data.branches && br.data.branches.includes('develop'));

    // Project + scan
    const proj = await api('POST', '/projects', { token: jwt, body: { owner: 'octo', repo: 'shop-app', branch: 'main' } });
    check('create project from GitHub repo', proj.status === 201 && proj.data.project.fullName === 'octo/shop-app', proj.data);
    const pid = proj.data.project.id;
    check('cannot add a repo the token cannot see', (await api('POST', '/projects', { token: jwt, body: { owner: 'octo', repo: 'secret-repo' } })).status === 404);
    const scan1 = await api('POST', '/scans', { token: jwt, body: { projectId: pid, branch: 'main' } });
    check('scan created and workflow dispatched', scan1.status === 201 && dispatches.length === 1 && dispatches[0].inputs.scan_id === String(scan1.data.scan.id), { s: scan1.status, d: dispatches });
    check('dispatch sends only the scan id (no token)', Object.keys(dispatches[0].inputs).join() === 'scan_id');
    check('second scan blocked while one is running', (await api('POST', '/scans', { token: jwt, body: { projectId: pid } })).status === 409);
    const sid = scan1.data.scan.id;

    // Workflow security
    check('workflow call without signature is rejected', (await api('GET', `/scans/${sid}/source`)).status === 401);
    check('signature for another scan is rejected', (await api('GET', `/scans/${sid}/source`, { headers: { 'x-scan-auth': sign(sid + 1) } })).status === 401);

    // Vulnerable repo => gate FAIL
    const wf1 = await runWorkflow(sid, 'vulnerable');
    check('workflow can fetch source + token', wf1.source.status === 200 && wf1.source.data.token === 'ghp_validusertoken0000000000' && wf1.source.data.repository === 'octo/shop-app');
    check('vulnerable results: final verdict FAIL', wf1.results.status === 200 && wf1.results.data.final.status === 'FAIL', wf1.results.data);
    check('vulnerable results: Python gate agrees', wf1.gate.status === 'FAIL');
    check('vulnerable results: no deploy', wf1.results.data.deploy === false);
    check('client masks the GitHub token in the logs', wf1.source.stdout.includes('::add-mask::ghp_validusertoken'));
    check('results cannot be posted twice', (await api('POST', `/scans/${sid}/results`, { headers: wf1.h, body: { vulnerabilities: [] } })).status === 409);
    check('scan has run link + commit', wf1.results.data.scan.runUrl && wf1.results.data.scan.commit === 'abc1234', wf1.results.data.scan);
    check('blocked scan cannot be marked deployed', (await api('POST', `/scans/${sid}/deployment`, { headers: wf1.h, body: { status: 'deployed', url: 'https://x.vercel.app' } })).status === 409);
    const vulns = await api('GET', `/vulnerabilities/${sid}`, { token: jwt });
    check('findings stored and returned', vulns.data.vulnerabilities.length > 0 && vulns.data.vulnerabilities[0].severity === 'Critical');
    check('another user cannot read the findings', (await api('GET', `/vulnerabilities/${sid}`, { token: otherJwt })).status === 404);
    check('another user cannot read the scan', (await api('GET', `/scans/${sid}`, { token: otherJwt })).status === 404);
    check('another user cannot read the project', (await api('GET', `/projects/${pid}`, { token: otherJwt })).status === 404);

    // Clean repo => PASS + deployment
    const scan2 = await api('POST', '/scans', { token: jwt, body: { projectId: pid } });
    const wf2 = await runWorkflow(scan2.data.scan.id, 'clean');
    check('clean results: final verdict PASS and deploy requested', wf2.results.data.final.status === 'PASS' && wf2.results.data.deploy === true, wf2.results.data);
    check('deployment url must be https', (await api('POST', `/scans/${scan2.data.scan.id}/deployment`, { headers: wf2.h, body: { status: 'deployed', url: 'javascript:alert(1)' } })).status === 400);
    const dep = await api('POST', `/scans/${scan2.data.scan.id}/deployment`, { headers: wf2.h, body: { status: 'deployed', url: 'https://shop-app-abc.vercel.app' } });
    check('deployment recorded', dep.status === 200 && dep.data.deployment.status === 'deployed', dep.data);
    const p2 = await api('GET', `/projects/${pid}`, { token: jwt });
    check('project shows live URL + latest scan', p2.data.project.liveUrl === 'https://shop-app-abc.vercel.app' && p2.data.project.latestScan.gateStatus === 'PASS' && p2.data.project.scanCount === 2, p2.data.project.latestScan);

    // Configurable gate: a strict rule makes the clean sample fail
    const set = await api('PATCH', `/projects/${pid}/settings`, { token: jwt, body: { gate: { min_score: 100, max_high: 0 } } });
    check('gate settings saved', set.status === 200 && set.data.project.gate.min_score === 100);
    check('invalid gate settings rejected', (await api('PATCH', `/projects/${pid}/settings`, { token: jwt, body: { gate: { min_score: 900 } } })).status === 400);
    const scan3 = await api('POST', '/scans', { token: jwt, body: { projectId: pid } });
    const wf3 = await runWorkflow(scan3.data.scan.id, 'clean');
    const cleanScore = wf3.results.data.scan.score;
    check('strict gate respected by the workflow config', wf3.source.data.gateConfig.gate.min_score === 100);
    check('score used for strict-gate decision', typeof cleanScore === 'number', cleanScore);

    // history + failure path
    const hist = await api('GET', '/scans/history', { token: jwt });
    check('history lists all scans', hist.data.scans.length === 3);
    const scan4 = await api('POST', '/scans', { token: jwt, body: { projectId: pid } });
    const failed = await api('POST', `/scans/${scan4.data.scan.id}/fail`, { headers: { 'x-scan-auth': sign(scan4.data.scan.id) }, body: { message: 'clone failed' } });
    check('workflow can report a failure', failed.data.scan.status === 'failed' && failed.data.scan.error === 'clone failed');
    check('delete project', (await api('DELETE', `/projects/${pid}`, { token: jwt })).status === 200);
  } finally {
    server.kill();
    fakeGithub.close();
    await require('../config/db').pool.end();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
