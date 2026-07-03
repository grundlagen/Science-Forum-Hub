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
import subprocess
import time
from pathlib import Path

from milestones import SpecState
from cost_benefit import CostInputs, BenefitInputs, cost_benefit, render_cost_benefit
from test_gate import run_gate
from self_edit import get_backend, apply_and_gate, build_prompt, EditProposal


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
                    gpu_hours: float) -> dict:
    gate = run_gate(root)
    metrics = gate.as_metrics()
    metrics["validated_detectors"] = 1  # foreign-funding has a validation harness
    metrics.update(run_pipeline(root, corpus, index, harvest, harvest_n))

    cb = cost_benefit(
        CostInputs(gpu_hours=gpu_hours, storage_tb_months=5.0, llm_api_calls=metrics.get("llm_calls", 0)),
        BenefitInputs(confirmed_leads=metrics.get("leads_orb_confirmed", 0)),
    )
    metrics["roi_ratio"] = cb.roi_ratio
    metrics["_cost_benefit"] = cb
    return metrics


def loop(root: Path, args: argparse.Namespace) -> None:
    spec = SpecState()
    backend = get_backend()
    runs_dir = root / "services" / "image-forensics" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    log = runs_dir / "autonomy_log.jsonl"

    best_met = -1
    stale = 0
    t_start = time.time()

    for it in range(args.max_iterations):
        gpu_hours = (time.time() - t_start) / 3600.0
        metrics = collect_metrics(root, args.corpus, args.index, args.harvest, args.harvest_n, gpu_hours)
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
        if backend.available() and current is not None:
            digest = _repo_digest(root)
            prompt = build_prompt(current.description, entry["metrics"], digest)
            proposal = backend.propose(prompt)
            if isinstance(proposal, EditProposal):
                kept, result = apply_and_gate(root, proposal)
                entry["edit_kept"] = kept
                if not kept:
                    entry["edit_failures"] = result.failures[:5]
        else:
            print(f"[iter {it}] no LLM backend configured — running metrics/report only")

        # push results so the human (or a watching editor) can see progress
        _sh(root, "git", "add", "-A")
        _sh(root, "git", "commit", "-m", f"autonomy iter {it}: {entry['focus']} ({met_count} met)")
        _sh(root, "git", "pull", "--rebase", "origin", args.branch)
        _sh(root, "git", "push", "origin", f"HEAD:{args.branch}")

    print(spec.report(collect_metrics(root, args.corpus, args.index, None, 0, (time.time() - t_start) / 3600.0)))


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
    args = ap.parse_args()
    loop(Path(__file__).resolve().parents[2], args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
