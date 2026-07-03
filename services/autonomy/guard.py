"""
Invariant guard. These checks encode the non-negotiable ethics/accuracy properties of
the project. They run every iteration; if a self-edit breaks one, the edit is reverted.
An LLM steering the loop must not be able to "optimize" recall by, say, reintroducing a
nationality signal or removing the identity gate.

Checks are deliberately simple and source-level so they can't be gamed by mocking a
runtime value: they read the actual code.
"""
from __future__ import annotations

import re
from pathlib import Path


class GuardResult:
    def __init__(self) -> None:
        self.violations: list[str] = []

    @property
    def ok(self) -> bool:
        return not self.violations

    def add(self, msg: str) -> None:
        self.violations.append(msg)


def _read(root: Path, rel: str) -> str:
    p = root / rel
    return p.read_text() if p.exists() else ""


def check_invariants(repo_root: str | Path) -> GuardResult:
    root = Path(repo_root)
    r = GuardResult()
    ff = _read(root, "lib/extrapolator/src/detectors/foreignFunding.ts")

    # 1. Country/nationality must never be a scoring input. The de-biased detector says
    #    so in words; guard against a HIGH_RISK_COUNTRIES-style list creeping back.
    if re.search(r"HIGH_RISK_COUNTR", ff) or re.search(r"score\s*\+=.*countr", ff, re.I):
        r.add("foreignFunding.ts appears to score on country/nationality — forbidden")
    if "COUNTRY-NEUTRAL" not in ff and ff:
        r.add("foreignFunding.ts lost its COUNTRY-NEUTRAL contract comment")

    # 2. The identity gate must remain (common-name conflation protection).
    if ff and ("isIdentityConfirmed" not in ff or "IDENTITY_UNCONFIRMED_CAP" not in ff):
        r.add("foreignFunding.ts identity gate (isIdentityConfirmed / cap) is missing")

    # 3. Outputs are probable cause, not verdicts: the corroboration cap must survive.
    corr = _read(root, "lib/extrapolator/src/corroborate.ts")
    if corr and "SINGLE_SOURCE_CAP" not in corr:
        r.add("corroborate.ts lost the single-source cap")

    # 4. No hard-coded secrets committed (a self-edit must never bake in a token).
    for rel in ["services/autonomy/orchestrator.py", "services/autonomy/self_edit.py"]:
        txt = _read(root, rel)
        if re.search(r"(gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9]{20,})", txt):
            r.add(f"{rel} appears to contain a hard-coded secret")

    return r
