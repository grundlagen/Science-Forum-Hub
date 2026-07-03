"""
Offline tests for the autonomy logic that does NOT need network/LLM/GPU: the milestone
state machine, the cost-benefit model, and the invariant guard against the real repo.
    python services/autonomy/selftest.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from milestones import SpecState  # noqa: E402
from cost_benefit import CostInputs, BenefitInputs, cost_benefit  # noqa: E402
from guard import check_invariants  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool) -> None:
    global PASS, FAIL
    print(f"{'PASS' if cond else 'FAIL'}  {name}")
    PASS += cond
    FAIL += not cond


# --- milestones ---
spec = SpecState()
empty = spec.current({})
check("empty metrics -> focus is the first milestone (build_green)", empty is not None and empty.id == "build_green")
check("empty metrics -> not complete", spec.complete({}) is False)

partial = {"typecheck_pass": True, "tests_pass": True, "invariants_ok": True, "validated_detectors": 1}
cur = spec.current(partial)
check("with build+invariants+validated met, focus moves to corpus_scale", cur is not None and cur.id == "corpus_scale")

full = {
    "typecheck_pass": True, "tests_pass": True, "invariants_ok": True, "validated_detectors": 2,
    "panels_indexed": 2_000_000, "biofors_recall": 0.9, "biofors_fp_rate": 0.02,
    "leads_orb_confirmed": 3, "focus_ready_cases": 1, "roi_ratio": 5.0,
}
check("all thresholds met -> spec complete", spec.complete(full) is True)
check("complete -> current() is None", spec.current(full) is None)

# a high recall but high FP must NOT satisfy image_quality
bad_fp = dict(full); bad_fp["biofors_fp_rate"] = 0.2
check("high false-positive rate blocks completion", spec.complete(bad_fp) is False)

# --- cost-benefit ---
cb = cost_benefit(
    CostInputs(gpu_hours=10, storage_tb_months=5, llm_api_calls=100, analyst_hours=4),
    BenefitInputs(confirmed_leads=20),
)
check("cost is positive", cb.total_cost_usd > 0)
check("expected value is positive with leads", cb.expected_value_usd > 0)
check("roi ratio computed", cb.roi_ratio > 0)
zero = cost_benefit(CostInputs(gpu_hours=1), BenefitInputs(confirmed_leads=0))
check("no leads -> zero expected value", zero.expected_value_usd == 0)

# --- guard against the real repo ---
root = Path(__file__).resolve().parents[2]
g = check_invariants(root)
check("real repo passes all invariant guards", g.ok)
if not g.ok:
    for v in g.violations:
        print("   violation:", v)

# guard must CATCH a reintroduced country score (simulate on a string via temp file)
tmp = root / "services" / "autonomy" / "_guard_probe.ts"
try:
    # write a fake foreignFunding with a country boost into a temp path the guard reads
    ff_path = root / "lib/extrapolator/src/detectors/foreignFunding.ts"
    original = ff_path.read_text()
    ff_path.write_text(original.replace("let score = 0;", "let score = 0;\n  const HIGH_RISK_COUNTRIES = ['CN'];"))
    g2 = check_invariants(root)
    check("guard catches a reintroduced HIGH_RISK_COUNTRIES list", not g2.ok)
finally:
    ff_path.write_text(original)  # restore

# --- self-edit plumbing (parsing + path allowlist), no LLM/network ---
from self_edit import parse_proposal, path_allowed  # noqa: E402

good = parse_proposal('noise before {"rationale":"x","files":[{"path":"services/autonomy/foo.py","content":"print(1)"}]} after')
check("parse_proposal extracts JSON from noisy text", good is not None and len(good.files) == 1)
check("parse_proposal rejects junk", parse_proposal("no json here") is None)
check("parse_proposal rejects files without content", parse_proposal('{"files":[{"path":"a.py"}]}') is None)

check("allow: python file under services in python_only", path_allowed("services/autonomy/x.py", True))
check("deny: TS file in python_only mode", not path_allowed("lib/extrapolator/src/x.ts", True))
check("allow: TS file when not python_only", path_allowed("lib/extrapolator/src/x.ts", False))
check("deny: path outside the allowlist", not path_allowed("package.json", False))
check("deny: path traversal", not path_allowed("services/autonomy/../../etc/passwd", True))

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
