"""Proves the Python security module and the Node backend agree on the verdict,
without needing a running backend server or database. Run from security/:
    python -m unittest tests.test_backend_bridge -v
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT.parent / "backend"


def run_node_scoring(payload_path):
    # json.dumps() turns the Windows/Linux path into a properly-escaped
    # JS string literal. Without this, a raw "%s" on Windows inserts
    # backslashes (e.g. C:\Users\...) straight into a JS string, and JS
    # silently eats them as (invalid) escape sequences, corrupting the path.
    service_path = json.dumps(str(BACKEND / "services" / "securityScoreService"))
    payload_js_path = json.dumps(str(payload_path))
    script = """
const { calculateSecurityScore, evaluateGate } = require(%s);
const payload = require(%s);
const { score, counts } = calculateSecurityScore(payload.vulnerabilities);
console.log(JSON.stringify({ score, counts, gate: evaluateGate(counts, score, payload.vulnerabilities) }));
""" % (service_path, payload_js_path)
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class BridgeAgreementTests(unittest.TestCase):
    def _check(self, sample):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            subprocess.run([sys.executable, str(ROOT / "normalizer" / "normalize.py"),
                            "--reports", str(ROOT / "samples" / sample),
                            "--output", str(tmp / "normalized.json")], check=True)
            subprocess.run([sys.executable, str(ROOT / "security-gate" / "gate.py"),
                            "--input", str(tmp / "normalized.json"),
                            "--output", str(tmp / "gate-result.json")], capture_output=True)
            subprocess.run([sys.executable, str(ROOT / "normalizer" / "to_backend_payload.py"),
                            "--input", str(tmp / "normalized.json"),
                            "--output", str(tmp / "backend_payload.json"),
                            "--project-id", "1"], check=True)

            gate_result = json.loads((tmp / "gate-result.json").read_text())
            backend_result = run_node_scoring(tmp / "backend_payload.json")

            self.assertEqual(gate_result["score"], backend_result["score"])
            self.assertEqual(gate_result["status"], backend_result["gate"])
            return gate_result, backend_result

    def test_vulnerable_sample_agrees_and_fails(self):
        gate_result, backend_result = self._check("vulnerable")
        self.assertEqual(gate_result["status"], "FAIL")

    def test_clean_sample_agrees_and_passes(self):
        gate_result, backend_result = self._check("clean")
        self.assertEqual(gate_result["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
