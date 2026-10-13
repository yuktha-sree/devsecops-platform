"""Run from the security/ folder:  python -m unittest discover -s tests -v"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import load_config  # noqa: E402
from normalizer.normalize import normalize, match_suppression  # noqa: E402
from scoring.score import compute_score, count_by_severity  # noqa: E402
from severity.severity import cvss_to_severity, from_label, semgrep_severity  # noqa: E402

# security-gate has a hyphen, so it cannot be imported normally
_spec = importlib.util.spec_from_file_location("gate", ROOT / "security-gate" / "gate.py")
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)

CFG = load_config()


class SeverityTests(unittest.TestCase):
    def test_cvss_bands(self):
        self.assertEqual(cvss_to_severity(10.0), "Critical")
        self.assertEqual(cvss_to_severity(9.0), "Critical")
        self.assertEqual(cvss_to_severity(8.9), "High")
        self.assertEqual(cvss_to_severity(5.0), "Medium")
        self.assertEqual(cvss_to_severity(2.0), "Low")

    def test_labels(self):
        self.assertEqual(from_label("HIGH"), "High")
        self.assertEqual(from_label("moderate"), "Medium")
        self.assertEqual(from_label("UNKNOWN"), "Low")

    def test_semgrep_promotes_injection_to_critical(self):
        self.assertEqual(semgrep_severity("x.sql-injection", "ERROR"), "Critical")
        self.assertEqual(semgrep_severity("x.other", "ERROR", ["CWE-78: OS Command Injection"]), "Critical")
        self.assertEqual(semgrep_severity("x.other", "ERROR"), "High")
        self.assertEqual(semgrep_severity("x.sql-injection", "WARNING"), "Medium")
        self.assertEqual(semgrep_severity("x", "INFO"), "Low")


class ScoreTests(unittest.TestCase):
    def test_score_formula(self):
        counts = {"Critical": 1, "High": 2, "Medium": 3, "Low": 4}
        self.assertEqual(compute_score(counts, CFG), 100 - (20 + 20 + 12 + 4))

    def test_score_never_below_zero(self):
        self.assertEqual(compute_score({"Critical": 50, "High": 0, "Medium": 0, "Low": 0}, CFG), 0)

    def test_suppressed_findings_not_counted(self):
        findings = [{"severity": "Critical", "status": "Suppressed"}, {"severity": "Low", "status": "Open"}]
        self.assertEqual(count_by_severity(findings)["Critical"], 0)


class PipelineTests(unittest.TestCase):
    def test_vulnerable_sample_fails_and_hides_secret(self):
        data = normalize(ROOT / "samples" / "vulnerable")
        self.assertNotIn("FAKE-SECRET-FOR-TESTING-ONLY", json.dumps(data))
        result = gate.evaluate(data, CFG)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["deployment"], "Blocked")

    def test_clean_sample_passes(self):
        result = gate.evaluate(normalize(ROOT / "samples" / "clean"), CFG)
        self.assertEqual(result["status"], "PASS")

    def test_missing_scanner_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "gitleaks.json").write_text("[]")
            result = gate.evaluate(normalize(tmp), CFG)
            self.assertEqual(result["status"], "FAIL")
            self.assertTrue(any("no usable report" in r for r in result["reasons"]))
            self.assertEqual(gate.evaluate(normalize(tmp), CFG, allow_missing=True)["status"], "PASS")

    def test_broken_report_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "semgrep.json").write_text("{not json")
            data = normalize(tmp)
            self.assertEqual(data["scanners"]["Semgrep"]["status"], "error")

    def test_suppression(self):
        finding = {"id": "abc", "rule_id": "r1", "cve": None, "file": "test/app.js"}
        self.assertEqual(match_suppression(finding, [{"rule_id": "r1", "file_contains": "test/", "reason": "test code"}]), "test code")
        self.assertIsNone(match_suppression(finding, [{"rule_id": "r1", "file_contains": "src/"}]))

    def test_gate_exit_codes(self):
        with tempfile.TemporaryDirectory() as tmp:
            for sample, expected in (("vulnerable", 1), ("clean", 0)):
                norm = Path(tmp) / (sample + ".json")
                subprocess.run([sys.executable, str(ROOT / "normalizer" / "normalize.py"),
                                "--reports", str(ROOT / "samples" / sample), "--output", str(norm)],
                               check=True, capture_output=True)
                rc = subprocess.run([sys.executable, str(ROOT / "security-gate" / "gate.py"),
                                     "--input", str(norm)], capture_output=True).returncode
                self.assertEqual(rc, expected, sample)


if __name__ == "__main__":
    unittest.main()
