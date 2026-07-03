"""
The safety gate. Runs the full verification suite and returns a structured result the
orchestrator and self-editor use to decide whether to keep a change. NOTHING is kept
unless this passes.

Gate = typecheck + every TS verify-* suite + the Python image benchmarks + the
invariant guard. Any failure => not green => revert.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from guard import check_invariants

# The TS suites (kept in sync with lib/extrapolator/package.json).
VERIFY_SUITES = [
    "verify-certification", "verify-case-package", "verify-programs", "verify-debarred",
    "verify-excluded-provider", "verify-dedupe", "verify-debarred-sub", "verify-foreign-funding",
    "verify-corroborate", "verify-copied-test-data", "verify-bid-rigging", "verify-pass-through",
    "verify-fabrication", "verify-ppp", "verify-statcheck", "verify-peer-review",
    "verify-focus-gate", "verify-stress",
]


@dataclass
class GateResult:
    typecheck_pass: bool = False
    tests_pass: bool = False
    invariants_ok: bool = False
    failures: list[str] = field(default_factory=list)

    @property
    def green(self) -> bool:
        return self.typecheck_pass and self.tests_pass and self.invariants_ok

    def as_metrics(self) -> dict:
        return {
            "typecheck_pass": self.typecheck_pass,
            "tests_pass": self.tests_pass,
            "invariants_ok": self.invariants_ok,
        }


def _run(cmd: list[str], cwd: Path, timeout: int = 900) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout + p.stderr)[-4000:]
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def run_gate(repo_root: str | Path, run_python: bool = True, python_only: bool = False) -> GateResult:
    """Full gate. python_only=True skips the TS toolchain (pnpm/typecheck/verify suites)
    so the loop can run and self-edit the Python scan code on a box where Node/pnpm is
    unavailable or flaky — the source-level invariant guard still runs (it does not need
    pnpm), and Python benchmarks still run."""
    root = Path(repo_root)
    res = GateResult()

    # 1. invariants (source-level; cheap, run first — no pnpm needed)
    guard = check_invariants(root)
    res.invariants_ok = guard.ok
    res.failures += [f"invariant: {v}" for v in guard.violations]

    if python_only:
        res.typecheck_pass = True  # not evaluated in this mode
        all_ts_ok = True
    else:
        # 2. typecheck
        rc, out = _run(["pnpm", "run", "typecheck"], root)
        res.typecheck_pass = rc == 0
        if rc != 0:
            res.failures.append("typecheck failed")

        # 3. TS verify suites
        all_ts_ok = True
        for suite in VERIFY_SUITES:
            rc, out = _run(["pnpm", "--filter", "@workspace/extrapolator", "run", suite], root)
            if rc != 0 or "failed" in out and ", 0 failed" not in out:
                all_ts_ok = False
                res.failures.append(f"{suite} failed")

    # 4. Python image benchmarks
    py_ok = True
    if run_python:
        for script in ["index_test.py", "stress_test.py"]:
            rc, out = _run(["python", script], root / "services" / "image-forensics")
            if rc != 0:
                py_ok = False
                res.failures.append(f"{script} failed")

    res.tests_pass = all_ts_ok and py_ok
    return res


if __name__ == "__main__":
    import sys

    root = sys.argv[1] if len(sys.argv) > 1 else "."
    g = run_gate(root)
    print(json.dumps({"green": g.green, **g.as_metrics(), "failures": g.failures}, indent=2))
