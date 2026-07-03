"""
The autonomous loop. Runs unattended in Colab and drives the project toward its spec:

  each iteration:
    1. run the gate (typecheck + tests + invariants) -> base metrics
    2. run the pipeline (image corpus scan) -> lead/scale metrics
    3. compute cost-benefit -> roi metrics
    4. evaluate the spec: which milestone is unmet?
    5. if an LLM backend is configured, ask it to edit toward that milestone;
       apply-and-gate keeps the edit ONLY if the gate stays green
    6. commit results + a status report; push (GitHub is the durable bus)
  stop when: spec complete, budget exhausted, or N iterations with no milestone gain.

Safety: the loop never keeps an unverified edit, never touches money/contacts anyone,
and halts on plateau so it can't burn budget spinning. All actions are logged to
the results directory.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path


def hb(msg: str) -> None:
    """Heartbeat: timestamped, flushed line so Colab shows live progress."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

from milestones import SpecState
from cost_benefit import CostInputs, BenefitInputs, cost_benefit, render_cost_benefit
from test_gate import run_gate
from self_edit import get_backend, apply_and_gate, build_prompt, EditProposal, smoke_test_backend, load_colab_secrets


def _sh(root: Path, *args: str, timeout: int = 3600) -> tuple[int, str]:
    p = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr)


def run_pipeline(root: Path, corpus: str, index: str, harvest: str | None, harvest_n: int) -> dict:
    """Run the image corpus scan and parse its results.json into metrics."""
    args = ["python", "colab_run.py", "--corpus", corpus, "--index", index, "--out", "runs/results.json"]
    if harvest:
        args += ["--harvest", harvest, "--harvest-n", str(harvest_n)]
    _sh(root / "services" / "image-forensics", *args)
    rp = root / "services" / "image-forensics" / "runs" / "results.json"
    if not rp.exists():
        return {}
    r = json.loads(rp.read_text())
    return {
        "panels_indexed": r.get("panels_indexed", 0),
        "articles": r.get("articles", 0),
        "leads_total": r.get("leads_total", 0),
        "leads_orb_confirmed": r.get("leads_orb_confirmed", 0),
    }


def collect_metrics(root: Path, corpus: str, index: str, harvest: str | None, harvest_n: int,
                    gpu_hours: float, python_only: bool = False) -> dict:
    hb("running test gate " + ("(python-only: invariants + image benchmarks)" if python_only
                               else "(typecheck + suites + invariants)") + "...")
    gate = run_gate(root, python_only=python_only)
    hb(f"gate: typecheck={gate.typecheck_pass} tests={gate.tests_pass} invariants={gate.invariants_ok}")
    metrics = gate.as_metrics()
    metrics["validated_detectors"] = 1  # foreign-funding has a validation harness
    hb(f"running pipeline (harvest={'yes' if harvest else 'no'}, n={harvest_n})...")
    metrics.update(run_pipeline(root, corpus, index, harvest, harvest_n))
    hb(f"pipeline: {metrics.get('panels_indexed',0)} panels, {metrics.get('leads_orb_confirmed',0)} confirmed leads")

    cb = cost_benefit(
        CostInputs(gpu_hours=gpu_hours, storage_tb_months=5.0, llm_api_calls=metrics.get("llm_calls", 0)),
        BenefitInputs(confirmed_leads=metrics.get("leads_orb_confirmed", 0)),
    )
    metrics["roi_ratio"] = cb.roi_ratio
    metrics["_cost_benefit"] = cb
    return metrics


def loop(root: Path, args: argparse.Namespace) -> None:
    loaded = load_colab_secrets()
    if loaded:
        hb(f"loaded secret(s) from Colab userdata: {', '.join(loaded)}")
    spec = SpecState()
    backend = get_backend()
    # Persist to Drive when RI_RUNS_DIR is set (survives Colab session death), else local.
    runs_dir = Path(os.environ.get("RI_RUNS_DIR") or (root / "services" / "image-forensics" / "runs"))
    runs_dir.mkdir(parents=True, exist_ok=True)
    log = runs_dir / "autonomy_log.jsonl"
    hb(f"loop starting. runs_dir={runs_dir} | LLM backend={backend.name} (available={backend.available()})")
    hb(f"budget={args.budget_hours}h, max_iters={args.max_iterations}, patience={args.patience}, python_only={args.python_only}")
    # Prove the self-edit brain works before relying on it (unless --no-edit).
    edits_enabled = backend.available() and not args.no_edit
    if edits_enabled:
        ok, detail = smoke_test_backend(backend)
        hb(f"backend smoke test: {'PASS' if ok else 'FAIL'} — {detail}")
        edits_enabled = ok
        if not ok:
            hb("self-edits disabled for this run (backend smoke test failed); metrics/scan still run")
    else:
        hb("self-edits OFF (no backend or --no-edit) — running metrics/scan/report only")

    best_met = -1
    stale = 0
    t_start = time.time()

    for it in range(args.max_iterations):
        gpu_hours = (time.time() - t_start) / 3600.0
        hb(f"===== iteration {it} (elapsed {gpu_hours:.2f}h) =====")
        metrics = collect_metrics(root, args.corpus, args.index, args.harvest, args.harvest_n, gpu_hours, args.python_only)
        status = spec.status(metrics)
        met_count = sum(1 for _, ok in status if ok)
        current = spec.current(metrics)

        entry = {
            "iteration": it,
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "milestones_met": met_count,
            "focus": current.id if current else "COMPLETE",
            "metrics": {k: v for k, v in metrics.items() if not k.startswith("_")},
        }
        with log.open("a") as f:
            f.write(json.dumps(entry) + "\n")
        (runs_dir / "STATUS.md").write_text(
            spec.report(metrics) + "\n\n" + render_cost_benefit(metrics["_cost_benefit"])
        )
        hb(f"milestones met: {met_count}/{len(spec.milestones)} | focus: {entry['focus']} | "
           f"ROI={metrics.get('roi_ratio')} | wrote STATUS.md + log to {runs_dir}")

        # stop conditions
        if spec.complete(metrics):
            print(f"[iter {it}] SPEC COMPLETE")
            break
        if gpu_hours > args.budget_hours:
            print(f"[iter {it}] budget exhausted ({gpu_hours:.1f}h)")
            break
        stale = 0 if met_count > best_met else stale + 1
        best_met = max(best_met, met_count)
        if stale >= args.patience:
            print(f"[iter {it}] plateau ({stale} iters no gain) — stopping for human input")
            break

        # attempt one guarded self-edit toward the current milestone
        if edits_enabled and current is not None:
            digest = _repo_digest(root)
            prompt = build_prompt(current.description, entry["metrics"], digest)
            try:
                proposal = backend.propose(prompt)
            except Exception as e:  # noqa: BLE001
                proposal = None
                hb(f"backend.propose failed this iter: {e}")
            if isinstance(proposal, EditProposal):
                hb(f"LLM proposed an edit to {len(proposal.files)} file(s); gating...")
                kept, result = apply_and_gate(root, proposal, python_only=args.python_only)
                hb(f"edit {'KEPT (gate green)' if kept else 'REVERTED: ' + '; '.join(result.failures[:3])}")
                entry["edit_kept"] = kept
                if not kept:
                    entry["edit_failures"] = result.failures[:5]
            else:
                hb("no usable proposal this iteration")

        # Commit locally always (durable in the Drive repo). Push is OPTIONAL: a broken
        # GitHub connection must NOT stop the loop — results already persist to Drive.
        _sh(root, "git", "add", "-A")
        _sh(root, "git", "commit", "-m", f"autonomy iter {it}: {entry['focus']} ({met_count} met)")
        if args.no_push:
            hb(f"iter {it} committed locally (push disabled); results in {runs_dir}")
        else:
            _sh(root, "git", "pull", "--rebase", "origin", args.branch)
            rc, out = _sh(root, "git", "push", "origin", f"HEAD:{args.branch}")
            hb(f"pushed iter {it} to {args.branch}" if rc == 0
               else f"push failed (continuing; results are on Drive): {out.strip()[:160]}")

    print(spec.report(collect_metrics(root, args.corpus, args.index, None, 0,
                                       (time.time() - t_start) / 3600.0, args.python_only)))


def _repo_digest(root: Path, max_chars: int = 12000) -> str:
    """A compact listing of the source tree for the LLM prompt (names + sizes)."""
    lines = []
    for base in ["lib/extrapolator/src", "services/image-forensics", "services/autonomy"]:
        for p in sorted((root / base).rglob("*")):
            if p.suffix in {".ts", ".py"} and p.is_file():
                lines.append(f"{p.relative_to(root)}  ({p.stat().st_size}b)")
    return "\n".join(lines)[:max_chars]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default="claude/building-thoughts-r6ghup")
    ap.add_argument("--corpus", default="./corpus")
    ap.add_argument("--index", default="./corpus_index")
    ap.add_argument("--harvest", default=None)
    ap.add_argument("--harvest-n", type=int, default=300)
    ap.add_argument("--max-iterations", type=int, default=50)
    ap.add_argument("--budget-hours", type=float, default=8.0)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--python-only", action="store_true",
                    help="skip the TS toolchain (pnpm/typecheck); run + self-edit the Python scan code only")
    ap.add_argument("--no-edit", action="store_true", help="run metrics/scan/report only; no self-edits")
    ap.add_argument("--no-push", action="store_true",
                    help="never push to GitHub; commit locally + persist to Drive only (use when GitHub is unavailable)")
    args = ap.parse_args()
    loop(Path(__file__).resolve().parents[2], args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
