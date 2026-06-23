import { z } from "zod/v4";

/**
 * Focus Guard — core type surface.
 *
 * The vocabulary here is deliberately small and stable. Everything downstream
 * (detection, scoring, nudging, persistence) is expressed in terms of these
 * types so the engine can evolve without churning the API boundary.
 */

/** The kind of contribution being guarded. */
export type ContributionKind = "review" | "comment";

/** Mirrors `ReviewStance` in @workspace/db without taking a dependency on it. */
export type ContributionStance = "endorse" | "challenge" | "reject";

/**
 * The classification of a paper's central claim. Different claim types attract
 * different failure modes (e.g. empirical claims invite methodology nitpicks;
 * theoretical claims invite scope creep), so detection can be tuned per type.
 */
export type ClaimType =
  | "empirical"
  | "theoretical"
  | "methodological"
  | "review"
  | "other";

/**
 * The epistemic centre of gravity for a paper. A discussion is "on focus" to
 * the extent that it engages this anchor. Derived once per paper (and refreshed
 * on major revision) rather than recomputed per contribution.
 */
export interface FocusAnchor {
  /** The single, ideally falsifiable, claim the paper is built around. */
  centralClaim: string;
  /** Salient constructs/terms that signal genuine engagement with the claim. */
  keyTerms: string[];
  /** Questions/topics that legitimately belong to this discussion. */
  inScope: string[];
  /** Topics explicitly out of bounds for this paper. */
  outScope: string[];
  claimType: ClaimType;
}

/** A contribution (review or comment) to be evaluated against an anchor. */
export interface Contribution {
  kind: ContributionKind;
  text: string;
  stance?: ContributionStance;
}

/**
 * The family a signal belongs to. Separating *topical* drift from *reasoning*
 * bias from *affect* lets us intervene proportionately: a hostile-but-on-topic
 * review needs a different nudge than a polite-but-off-topic one.
 */
export type SignalFamily =
  | "cognitive_bias"
  | "rhetorical_drift"
  | "epistemic_hygiene"
  | "affect";

/** Stable identifiers for every pattern Focus Guard can recognise. */
export type SignalCode =
  | "ad_hominem"
  | "scope_creep"
  | "confirmation_bias"
  | "anchoring"
  | "straw_man"
  | "whataboutism"
  | "bikeshedding"
  | "motivated_reasoning"
  | "halo_effect"
  | "availability"
  | "vagueness"
  | "hostility";

/** A single detected pattern in one contribution. */
export interface FocusSignal {
  code: SignalCode;
  family: SignalFamily;
  /** How strongly the pattern degrades focus, 0..1. */
  severity: number;
  /** How sure we are the pattern is present, 0..1. */
  confidence: number;
  /** The literal phrases/markers that triggered the signal. */
  evidence: string[];
}

/** Ordered from "all good" to "this contribution has left the building". */
export type FocusVerdict =
  | "on_focus"
  | "minor_drift"
  | "significant_drift"
  | "off_focus";

/**
 * How forcefully Focus Guard should respond. Crucially this tops out at
 * "reframe" — Focus Guard never blocks or deletes. (See PSYCHOLOGY.md: nudge
 * theory / libertarian paternalism — autonomy-preserving interventions.)
 */
export type InterventionLevel = "none" | "inform" | "nudge" | "reframe";

/** An autonomy-supportive prompt shown to the contributor. */
export interface Nudge {
  level: InterventionLevel;
  /** Second-person, non-coercive, implementation-intention phrasing. */
  message: string;
  /** Why this nudge fired — the dominant signal code. */
  rationaleCode: SignalCode | "topical_drift";
  /** Short references to the psychological basis, for the curious. */
  citations: string[];
}

/** The result of evaluating one contribution against one anchor. */
export interface FocusReport {
  /** 0 = perfectly on-anchor, 1 = fully adrift. */
  driftScore: number;
  /** Convenience boolean: drift below the "minor" threshold. */
  onFocus: boolean;
  verdict: FocusVerdict;
  /** Substance vs. noise: evidence/hedging markers minus empty assertion, 0..1. */
  engagementScore: number;
  signals: FocusSignal[];
  interventionLevel: InterventionLevel;
  nudge: Nudge | null;
  /** One-line, human-readable rationale. */
  summary: string;
}

/** Thread-level health band. */
export type HealthBand = "healthy" | "watch" | "fragmented";

/** Aggregate focus health across all contributions to a paper. */
export interface FocusHealth {
  contributions: number;
  meanDrift: number;
  onFocusRatio: number;
  meanEngagement: number;
  /** Count of each signal across the thread. */
  signalHistogram: Partial<Record<SignalCode, number>>;
  /** 0..100, higher is healthier. */
  healthScore: number;
  band: HealthBand;
  /** The most common distractions, worst first. */
  topDistractions: SignalCode[];
}

/* ------------------------------------------------------------------------- *
 * Zod schemas — runtime validation at the API/persistence boundary.
 * Kept in lockstep with the interfaces above.
 * ------------------------------------------------------------------------- */

export const claimTypeSchema = z.enum([
  "empirical",
  "theoretical",
  "methodological",
  "review",
  "other",
]);

export const focusAnchorSchema = z.object({
  centralClaim: z.string().min(1),
  keyTerms: z.array(z.string()),
  inScope: z.array(z.string()),
  outScope: z.array(z.string()),
  claimType: claimTypeSchema,
});

export const contributionSchema = z.object({
  kind: z.enum(["review", "comment"]),
  text: z.string(),
  stance: z.enum(["endorse", "challenge", "reject"]).optional(),
});

export const signalCodeSchema = z.enum([
  "ad_hominem",
  "scope_creep",
  "confirmation_bias",
  "anchoring",
  "straw_man",
  "whataboutism",
  "bikeshedding",
  "motivated_reasoning",
  "halo_effect",
  "availability",
  "vagueness",
  "hostility",
]);

export const focusSignalSchema = z.object({
  code: signalCodeSchema,
  family: z.enum([
    "cognitive_bias",
    "rhetorical_drift",
    "epistemic_hygiene",
    "affect",
  ]),
  severity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export const focusReportSchema = z.object({
  driftScore: z.number().min(0).max(1),
  onFocus: z.boolean(),
  verdict: z.enum([
    "on_focus",
    "minor_drift",
    "significant_drift",
    "off_focus",
  ]),
  engagementScore: z.number().min(0).max(1),
  signals: z.array(focusSignalSchema),
  interventionLevel: z.enum(["none", "inform", "nudge", "reframe"]),
  nudge: z
    .object({
      level: z.enum(["none", "inform", "nudge", "reframe"]),
      message: z.string(),
      rationaleCode: z.union([signalCodeSchema, z.literal("topical_drift")]),
      citations: z.array(z.string()),
    })
    .nullable(),
  summary: z.string(),
});
