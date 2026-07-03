"""
Project spec as a measurable state machine. "Done" is not a vibe — it is a set of
milestones with numeric exit criteria evaluated against a metrics dict the orchestrator
collects each iteration. The loop advances milestone by milestone and stops when all
are met (project complete), the budget is exhausted, or progress plateaus.

Each milestone maps to the plan phases: data scale, detection quality, image corpus,
and pre-filing readiness. Thresholds are deliberately explicit so an LLM steering the
loop cannot quietly redefine success.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Milestone:
    id: str
    description: str
    # predicate over the metrics dict; True = met.
    met: Callable[[dict], bool]
    # human-readable target, shown in reports.
    target: str


def _get(m: dict, key: str, default=0.0):
    v = m.get(key, default)
    return v if isinstance(v, (int, float)) else default


# The default project spec. Order matters: the loop focuses on the first unmet one.
DEFAULT_MILESTONES: list[Milestone] = [
    Milestone(
        "build_green",
        "Whole workspace typechecks and every test suite passes.",
        lambda m: m.get("tests_pass") is True and m.get("typecheck_pass") is True,
        "typecheck_pass and tests_pass",
    ),
    Milestone(
        "invariants_intact",
        "Ethics/accuracy invariants hold (country/identity-neutral, signals-not-verdicts).",
        lambda m: m.get("invariants_ok") is True,
        "invariants_ok == True",
    ),
    Milestone(
        "detector_validated",
        "At least one detector has a measured precision/recall on the ground-truth set.",
        lambda m: _get(m, "validated_detectors") >= 1,
        "validated_detectors >= 1",
    ),
    Milestone(
        "corpus_scale",
        "Image corpus large enough to be a real cross-literature index.",
        lambda m: _get(m, "panels_indexed") >= 1_000_000,
        "panels_indexed >= 1,000,000",
    ),
    Milestone(
        "image_quality",
        "Duplication detector benchmarked on real ground truth (BioFors) at high recall, low FP.",
        lambda m: _get(m, "biofors_recall") >= 0.85 and _get(m, "biofors_fp_rate") <= 0.05,
        "biofors_recall >= 0.85 and biofors_fp_rate <= 0.05",
    ),
    Milestone(
        "leads_found",
        "At least one corroborated, ORB-confirmed cross-article duplication lead.",
        lambda m: _get(m, "leads_orb_confirmed") >= 1,
        "leads_orb_confirmed >= 1",
    ),
    Milestone(
        "filing_ready",
        "At least one candidate clears the FOCUS pre-filing readiness gate.",
        lambda m: _get(m, "focus_ready_cases") >= 1,
        "focus_ready_cases >= 1",
    ),
    Milestone(
        "positive_roi",
        "Expected value of the pipeline exceeds its run cost with margin.",
        lambda m: _get(m, "roi_ratio") >= 3.0,
        "roi_ratio >= 3.0",
    ),
]


@dataclass
class SpecState:
    milestones: list[Milestone] = field(default_factory=lambda: list(DEFAULT_MILESTONES))

    def status(self, metrics: dict) -> list[tuple[str, bool]]:
        return [(ms.id, ms.met(metrics)) for ms in self.milestones]

    def current(self, metrics: dict) -> Milestone | None:
        """The first unmet milestone — where the loop should focus effort."""
        for ms in self.milestones:
            if not ms.met(metrics):
                return ms
        return None

    def complete(self, metrics: dict) -> bool:
        return all(ms.met(metrics) for ms in self.milestones)

    def report(self, metrics: dict) -> str:
        lines = ["# Project spec status", ""]
        for ms in self.milestones:
            ok = ms.met(metrics)
            lines.append(f"- [{'x' if ok else ' '}] **{ms.id}** — {ms.description}  _(target: {ms.target})_")
        cur = self.current(metrics)
        lines.append("")
        lines.append(f"**{'COMPLETE' if cur is None else 'Focus: ' + cur.id}**")
        return "\n".join(lines)
