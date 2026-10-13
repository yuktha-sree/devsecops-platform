"""Security score (Task 7).

    Scan results -> Severity analysis -> Security score -> Security gate

Formula (weights live in config.json so the team can tune them):

    score = max(0, 100 - (Critical*20 + High*10 + Medium*4 + Low*1))

Only findings with status "Open" count. Suppressed (false-positive)
findings are ignored.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from severity.severity import SEVERITY_LEVELS  # noqa: E402


def count_by_severity(findings):
    counts = {level: 0 for level in SEVERITY_LEVELS}
    for f in findings:
        if f.get("status", "Open") == "Open" and f.get("severity") in counts:
            counts[f["severity"]] += 1
    return counts


def compute_score(counts, cfg):
    scoring = cfg["scoring"]
    deduction = sum(counts[level] * scoring["weights"][level] for level in SEVERITY_LEVELS)
    return max(scoring["min"], scoring["start"] - deduction)
