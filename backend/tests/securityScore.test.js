const test = require('node:test');
const assert = require('node:assert');
const {
  calculateSecurityScore, evaluateGate, evaluateGateDetailed, mergeGateResults, resolveConfig, DEFAULTS,
} = require('../services/securityScoreService');

const v = (severity, type = 'sast', status = 'open') => ({ severity, type, status, title: 't' });

test('score uses the shared weights 20/10/4/1', () => {
  const { score, counts } = calculateSecurityScore([v('High'), v('Medium'), v('Low')]);
  assert.strictEqual(score, 100 - (10 + 4 + 1));
  assert.deepStrictEqual(counts, { Critical: 0, High: 1, Medium: 1, Low: 1 });
});

test('score never goes below 0', () => {
  const many = Array.from({ length: 20 }, () => v('Critical'));
  assert.strictEqual(calculateSecurityScore(many).score, 0);
});

test('suppressed findings are ignored', () => {
  const { score } = calculateSecurityScore([v('Critical', 'sast', 'suppressed')]);
  assert.strictEqual(score, 100);
});

test('any Critical finding fails the gate', () => {
  const vulns = [v('Critical')];
  const { score, counts } = calculateSecurityScore(vulns);
  assert.strictEqual(evaluateGate(counts, score, vulns), 'FAIL');
});

test('any exposed secret fails the gate even with a high score', () => {
  const vulns = [v('Low', 'secret')];
  const { score, counts } = calculateSecurityScore(vulns);
  assert.ok(score >= 70);
  assert.strictEqual(evaluateGate(counts, score, vulns), 'FAIL');
});

test('more than max_high High findings fails the gate', () => {
  const vulns = Array.from({ length: 6 }, () => v('High'));
  const { score, counts } = calculateSecurityScore(vulns);
  const r = evaluateGateDetailed(counts, 100, vulns); // ignore the score on purpose
  assert.strictEqual(r.status, 'FAIL');
  assert.ok(r.reasons.some((x) => /High finding/.test(x)));
  assert.ok(score < 70);
});

test('a scanner without a usable report fails closed', () => {
  const r = evaluateGateDetailed({ Critical: 0, High: 0, Medium: 0, Low: 0 }, 100, [], DEFAULTS, {
    Semgrep: { status: 'ok' }, Trivy: { status: 'missing' },
  });
  assert.strictEqual(r.status, 'FAIL');
});

test('custom gate rules are honoured and validated', () => {
  const cfg = resolveConfig({ gate: { min_score: 95, max_high: 0 } });
  assert.strictEqual(cfg.gate.min_score, 95);
  assert.strictEqual(cfg.gate.max_high, 0);
  assert.strictEqual(cfg.gate.block_on_critical, true);
  assert.throws(() => resolveConfig({ gate: { min_score: 500 } }));
  assert.throws(() => resolveConfig({ gate: { block_on_secrets: 'no' } }));
});

test('the final verdict is FAIL if either side says FAIL', () => {
  const local = { status: 'PASS', reasons: [], secrets: 0 };
  const remote = { status: 'FAIL', reasons: ['Trivy produced no usable report (missing), so security could not be verified.'] };
  const merged = mergeGateResults(local, remote);
  assert.strictEqual(merged.status, 'FAIL');
  assert.strictEqual(merged.reasons.length, 1);
  assert.strictEqual(mergeGateResults(local, null).status, 'PASS');
});
