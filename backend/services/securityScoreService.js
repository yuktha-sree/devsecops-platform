// Turns a list of vulnerabilities into a 0-100 security score and a PASS/FAIL
// gate decision. It mirrors security/scoring/score.py and
// security/security-gate/gate.py rule for rule, using the same configuration
// shape (see config/gateDefaults.json, which CI checks against
// security/config.json so the two can never drift apart).
//
// The scan workflow runs the Python gate first (it also knows when a scanner
// crashed). The backend re-derives the verdict from the stored findings and the
// FINAL decision is FAIL if either side says FAIL (see mergeGateResults).

const DEFAULTS = require('../config/gateDefaults.json');

const LEVELS = ['Critical', 'High', 'Medium', 'Low'];

// Kept for backwards compatibility with older imports/tests.
const SEVERITY_WEIGHTS = DEFAULTS.scoring.weights;
const GATE_MIN_PASS_SCORE = DEFAULTS.gate.min_score;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Merge a (possibly partial) user config over the defaults and validate it.
// Only the gate rules are user-editable; scoring weights always come from the
// platform defaults.
function resolveConfig(custom) {
  const cfg = clone(DEFAULTS);
  const g = (custom && custom.gate) || {};

  if (g.min_score !== undefined) {
    const n = Number(g.min_score);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw badConfig('min_score must be between 0 and 100');
    cfg.gate.min_score = Math.round(n);
  }
  if (g.max_high !== undefined) {
    const n = Number(g.max_high);
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw badConfig('max_high must be 0 or more');
    cfg.gate.max_high = Math.round(n);
  }
  for (const flag of ['block_on_critical', 'block_on_secrets', 'require_all_scanners']) {
    if (g[flag] !== undefined) {
      if (typeof g[flag] !== 'boolean') throw badConfig(`${flag} must be true or false`);
      cfg.gate[flag] = g[flag];
    }
  }
  return cfg;
}

function badConfig(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function isOpen(v) {
  return String(v.status || 'open').toLowerCase() === 'open';
}

function calculateSecurityScore(vulnerabilities, config = DEFAULTS) {
  const weights = config.scoring.weights;
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  let deduction = 0;

  for (const v of vulnerabilities) {
    if (!isOpen(v)) continue; // suppressed / false positives never count
    if (counts[v.severity] !== undefined) {
      counts[v.severity] += 1;
      deduction += weights[v.severity];
    }
  }

  const score = Math.max(config.scoring.min, Math.min(config.scoring.start, config.scoring.start - deduction));
  return { score, counts };
}

// Returns 'PASS' | 'FAIL'. Use evaluateGateDetailed() when you need the reasons.
function evaluateGate(counts, score, vulnerabilities = [], config = DEFAULTS, scanners = null) {
  return evaluateGateDetailed(counts, score, vulnerabilities, config, scanners).status;
}

function evaluateGateDetailed(counts, score, vulnerabilities = [], config = DEFAULTS, scanners = null) {
  const rules = config.gate;
  const reasons = [];
  const secrets = vulnerabilities.filter((v) => isOpen(v) && v.type === 'secret').length;

  if (rules.require_all_scanners && scanners && typeof scanners === 'object') {
    for (const [name, info] of Object.entries(scanners)) {
      if (!info || info.status !== 'ok') {
        reasons.push(`${name} produced no usable report (${info && info.status}), so security could not be verified.`);
      }
    }
  }
  if (rules.block_on_critical && counts.Critical > 0) {
    reasons.push(`${counts.Critical} Critical finding(s): any Critical finding blocks deployment.`);
  }
  if (rules.block_on_secrets && secrets > 0) {
    reasons.push(`${secrets} exposed secret(s) found in the repository.`);
  }
  if (counts.High > rules.max_high) {
    reasons.push(`${counts.High} High finding(s); the limit is ${rules.max_high}.`);
  }
  if (score < rules.min_score) {
    reasons.push(`Security score ${score} is below the minimum of ${rules.min_score}.`);
  }

  return { status: reasons.length ? 'FAIL' : 'PASS', reasons, secrets };
}

// Combine the verdict computed here with the one produced by the Python gate
// in the workflow. Fail closed: a single FAIL is a FAIL.
function mergeGateResults(local, remote) {
  if (!remote || (remote.status !== 'PASS' && remote.status !== 'FAIL')) return local;
  const reasons = [...local.reasons];
  for (const r of remote.reasons || []) if (!reasons.includes(r)) reasons.push(r);
  const failed = local.status === 'FAIL' || remote.status === 'FAIL';
  return { status: failed ? 'FAIL' : 'PASS', reasons, secrets: local.secrets };
}

module.exports = {
  calculateSecurityScore,
  evaluateGate,
  evaluateGateDetailed,
  mergeGateResults,
  resolveConfig,
  LEVELS,
  DEFAULTS,
  SEVERITY_WEIGHTS,
  GATE_MIN_PASS_SCORE,
};
