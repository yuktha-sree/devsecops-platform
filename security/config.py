"""Shared helper: loads config.json (scoring weights and gate rules)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "config.json"


def load_config(path=None):
    with open(path or DEFAULT_CONFIG, encoding="utf-8-sig") as f:
        return json.load(f)
