"""Severity classification (Task 6).

Every finding ends up as exactly one of: Critical, High, Medium, Low.
Each scanner speaks a different language, so we translate here.
"""
import re

SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"]
RANK = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}

# Generic labels used by Trivy / Dependency-Check / others -> our scale
_LABELS = {
    "CRITICAL": "Critical",
    "HIGH": "High",
    "MEDIUM": "Medium",
    "MODERATE": "Medium",
    "LOW": "Low",
    "INFO": "Low",
    "INFORMATIONAL": "Low",
    "NONE": "Low",
    "UNKNOWN": "Low",
}


def from_label(label, default="Low"):
    """Map a text label such as 'HIGH' or 'Moderate' to our four levels."""
    return _LABELS.get(str(label or "").strip().upper(), default)


def cvss_to_severity(score):
    """Standard CVSS v3 bands: 9-10 Critical, 7-8.9 High, 4-6.9 Medium, else Low."""
    if score is None:
        return None
    score = float(score)
    if score >= 9.0:
        return "Critical"
    if score >= 7.0:
        return "High"
    if score >= 4.0:
        return "Medium"
    return "Low"


# ---- SAST (Semgrep) ---------------------------------------------------
# Semgrep only says ERROR / WARNING / INFO, so we map it and then promote
# the most dangerous vulnerability classes (injection, RCE, deserialization)
# from High to Critical.
_SEMGREP_BASE = {"ERROR": "High", "WARNING": "Medium", "INFO": "Low"}

# CWE ids promoted to Critical when Semgrep already says ERROR
_CRITICAL_CWES = {89, 78, 94, 95, 502}  # SQLi, OS command, code injection, eval, deserialization
_CRITICAL_RULE_HINTS = (
    "sql-injection", "sqli", "command-injection", "os-command",
    "code-injection", "deserializ", "remote-code",
)


def _cwe_numbers(cwe):
    if not cwe:
        return set()
    items = cwe if isinstance(cwe, list) else [cwe]
    nums = set()
    for item in items:
        for m in re.findall(r"CWE-(\d+)", str(item), flags=re.IGNORECASE):
            nums.add(int(m))
    return nums


def semgrep_severity(check_id, level, cwe=None):
    base = _SEMGREP_BASE.get(str(level or "").upper(), "Low")
    if base == "High":
        rule = (check_id or "").lower()
        if _cwe_numbers(cwe) & _CRITICAL_CWES or any(h in rule for h in _CRITICAL_RULE_HINTS):
            return "Critical"
    return base


# ---- Secrets (Gitleaks) -----------------------------------------------
def secret_severity():
    """Gitleaks has no severity. A leaked credential is always Critical:
    anyone who can read the repo can use it."""
    return "Critical"
