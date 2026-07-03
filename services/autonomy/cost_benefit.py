"""
Cost-benefit model for the pipeline. Turns a run's metrics into an expected-value
estimate the orchestrator uses as a milestone (positive_roi) and reports at the end.

Everything is a transparent, conservative estimate with the assumptions inlined — this
is a planning aid, not a promise. Reward figures are grounded in the public record
(Sholto David / Dana-Farber: $15M settlement, ~$2.625M relator share = ~17.5%).
"""
from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass
class CostInputs:
    gpu_hours: float = 0.0
    gpu_cost_per_hour: float = 0.5  # Colab Pro-ish effective rate
    storage_tb_months: float = 0.0
    storage_cost_per_tb_month: float = 20.0
    llm_api_calls: int = 0
    llm_cost_per_call: float = 0.02  # self-edit proposals
    analyst_hours: float = 0.0  # human review of leads
    analyst_cost_per_hour: float = 75.0


@dataclass
class BenefitInputs:
    confirmed_leads: int = 0
    # conservative funnel from a confirmed lead to a paid case:
    prob_lead_is_real: float = 0.30  # survives human verification
    prob_case_filed: float = 0.50  # counsel files it
    prob_recovery: float = 0.40  # DOJ intervenes / settles (data-mined cases are lower)
    avg_settlement_usd: float = 5_000_000.0  # conservative vs the $15M exemplar
    relator_share: float = 0.175  # 15-30%; use the low-govt-intervened end


@dataclass
class CostBenefit:
    total_cost_usd: float
    expected_value_usd: float
    roi_ratio: float
    expected_paid_cases: float
    assumptions: dict


def compute_cost(c: CostInputs) -> float:
    return (
        c.gpu_hours * c.gpu_cost_per_hour
        + c.storage_tb_months * c.storage_cost_per_tb_month
        + c.llm_api_calls * c.llm_cost_per_call
        + c.analyst_hours * c.analyst_cost_per_hour
    )


def compute_benefit(b: BenefitInputs) -> tuple[float, float]:
    per_lead_prob = b.prob_lead_is_real * b.prob_case_filed * b.prob_recovery
    expected_paid_cases = b.confirmed_leads * per_lead_prob
    ev = expected_paid_cases * b.avg_settlement_usd * b.relator_share
    return ev, expected_paid_cases


def cost_benefit(cost_in: CostInputs, benefit_in: BenefitInputs) -> CostBenefit:
    cost = compute_cost(cost_in)
    ev, cases = compute_benefit(benefit_in)
    roi = ev / cost if cost > 0 else (float("inf") if ev > 0 else 0.0)
    return CostBenefit(
        total_cost_usd=round(cost, 2),
        expected_value_usd=round(ev, 2),
        roi_ratio=round(roi, 2),
        expected_paid_cases=round(cases, 4),
        assumptions={"cost": asdict(cost_in), "benefit": asdict(benefit_in)},
    )


def render_cost_benefit(cb: CostBenefit) -> str:
    return "\n".join(
        [
            "# Cost-benefit",
            "",
            f"- total cost: ${cb.total_cost_usd:,.2f}",
            f"- expected value: ${cb.expected_value_usd:,.2f}",
            f"- expected paid cases: {cb.expected_paid_cases}",
            f"- ROI ratio: {cb.roi_ratio}",
            "",
            "_Conservative, transparent estimate — a planning aid, not a promise._",
        ]
    )
