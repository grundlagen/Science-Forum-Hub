import type {
  Contribution,
  FocusAnchor,
  FocusReport,
  FocusSignal,
  FocusVerdict,
  InterventionLevel,
  SignalCode,
} from "./types";
import { measureDrift } from "./drift";
import {
  detectSignals,
  scoreEngagement,
  type EvidenceOverrides,
} from "./detect";
import { buildNudge } from "./nudge";

/**
 * Verdict thresholds on the combined drift score. Exposed so the API/UI and
 * tests share one source of truth and so a future routine can tune them in one
 * place. Boundaries chosen so a fully off-topic contribution (topicalDrift≈1,
 * no other signals) lands at the off_focus boundary.
 */
export const DRIFT_THRESHOLDS = {
  minor: 0.3,
  significant: 0.5,
  off: 0.72,
} as const;

/** Signals in this family literally move the discussion off the claim. */
const DRIFT_FAMILIES: ReadonlySet<string> = new Set(["rhetorical_drift"]);

/** Tone problems we always answer with an invitation to reframe. */
const REFRAME_CODES: ReadonlySet<SignalCode> = new Set([
  "hostility",
  "ad_hominem",
  "straw_man",
]);

export interface EvaluateOptions {
  /** Optional model-assisted signal overrides. */
  overrides?: EvidenceOverrides;
}

function strength(s: FocusSignal): number {
  return s.severity * s.confidence;
}

function verdictFor(drift: number): FocusVerdict {
  if (drift >= DRIFT_THRESHOLDS.off) return "off_focus";
  if (drift >= DRIFT_THRESHOLDS.significant) return "significant_drift";
  if (drift >= DRIFT_THRESHOLDS.minor) return "minor_drift";
  return "on_focus";
}

/**
 * Evaluate a single contribution against a paper's focus anchor.
 *
 * The combined drift score is mostly topical, nudged upward by any rhetorical
 * moves that pull off the claim (scope creep, whataboutism, straw man). Pure
 * reasoning biases and hostile affect do *not* inflate drift — a hostile review
 * can be perfectly on-topic — but they do drive the intervention level.
 */
export function evaluate(
  contribution: Contribution,
  anchor: FocusAnchor,
  options: EvaluateOptions = {},
): FocusReport {
  const drift = measureDrift(contribution.text, anchor);
  const signals = detectSignals(contribution, options.overrides);
  const engagementScore = scoreEngagement(contribution.text);

  const driftPressure = signals
    .filter((s) => DRIFT_FAMILIES.has(s.family))
    .reduce((max, s) => Math.max(max, strength(s)), 0);

  const driftScore = clamp01(0.75 * drift.topicalDrift + 0.45 * driftPressure);
  const verdict = verdictFor(driftScore);
  const onFocus = driftScore < DRIFT_THRESHOLDS.minor;

  const topSignal = signals[0];
  const topStrength = topSignal ? strength(topSignal) : 0;

  // Choose the dominant cause to address. Tone problems take priority because
  // an unrephrased hostile/ad hominem comment poisons the thread regardless of
  // topicality; otherwise the more urgent of (top signal) vs (topical drift).
  const reframeSignal = signals.find(
    (s) => REFRAME_CODES.has(s.code) && s.confidence >= 0.5,
  );
  let cause: SignalCode | "topical_drift";
  if (reframeSignal) {
    cause = reframeSignal.code;
  } else if (topSignal && topStrength >= drift.topicalDrift) {
    cause = topSignal.code;
  } else if (driftScore >= DRIFT_THRESHOLDS.minor) {
    cause = "topical_drift";
  } else if (topSignal) {
    cause = topSignal.code;
  } else {
    cause = "topical_drift";
  }

  const interventionLevel = chooseLevel({
    verdict,
    topStrength,
    hasReframe: Boolean(reframeSignal),
    signalCount: signals.length,
    tokenCount: drift.tokenCount,
  });

  const nudge = buildNudge(interventionLevel, cause, anchor);
  const summary = buildSummary(verdict, signals, engagementScore);

  return {
    driftScore: round2(driftScore),
    onFocus,
    verdict,
    engagementScore,
    signals,
    interventionLevel,
    nudge,
    summary,
  };
}

interface LevelInputs {
  verdict: FocusVerdict;
  topStrength: number;
  hasReframe: boolean;
  signalCount: number;
  tokenCount: number;
}

/**
 * Map evidence to how forcefully we respond. Conservative by design: when in
 * doubt we inform rather than nudge, and we stay silent on short, signal-free
 * pleasantries so the system doesn't become background noise (alarm fatigue).
 */
function chooseLevel(inputs: LevelInputs): InterventionLevel {
  const { verdict, topStrength, hasReframe, signalCount, tokenCount } = inputs;

  if (hasReframe) return "reframe";

  // Don't nag short remarks that carry no detected problem.
  if (signalCount === 0 && tokenCount < 6) return "none";

  if (verdict === "off_focus" || verdict === "significant_drift")
    return "nudge";
  if (topStrength >= 0.35) return "nudge";

  if (verdict === "minor_drift" || topStrength > 0 || signalCount > 0) {
    return "inform";
  }
  return "none";
}

function buildSummary(
  verdict: FocusVerdict,
  signals: FocusSignal[],
  engagement: number,
): string {
  const verdictText: Record<FocusVerdict, string> = {
    on_focus: "On focus",
    minor_drift: "Slightly off the central claim",
    significant_drift: "Drifting from the central claim",
    off_focus: "Off the central claim",
  };
  const parts = [verdictText[verdict]];
  if (signals.length > 0) {
    const top = signals.slice(0, 2).map((s) => s.code.replace(/_/g, " "));
    parts.push(`patterns: ${top.join(", ")}`);
  }
  parts.push(`engagement ${Math.round(engagement * 100)}%`);
  return parts.join(" · ");
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
