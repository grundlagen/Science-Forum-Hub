/**
 * Focus Guard — public types.
 *
 * The engine is pure: callers pass plain data (timestamps as epoch
 * milliseconds, counts as numbers) and receive a plain assessment back. No
 * clock, database or environment is read inside the engine, which keeps every
 * function deterministic and trivially testable.
 *
 * Zod schemas are provided for the inputs because they cross the
 * network/database boundary; outputs are plain inferred types.
 */
import { z } from "zod/v4";

/** The five independent guards Focus Guard composes. */
export type GuardName = "blind" | "reading" | "fatigue" | "residue" | "flow";

export const GUARD_NAMES: readonly GuardName[] = [
  "blind",
  "reading",
  "fatigue",
  "residue",
  "flow",
] as const;

/** Signals that can bias an independent judgment if revealed too early. */
export type Signal = "ai_verdict" | "rigor_score" | "vote_tally" | "peer_reviews";

export const ALL_SIGNALS: readonly Signal[] = [
  "ai_verdict",
  "rigor_score",
  "vote_tally",
  "peer_reviews",
] as const;

export type Chronotype = "early" | "neutral" | "late";

/** A reviewer's live focus session, derived from the focus_sessions row + events. */
export const focusSessionSchema = z.object({
  /** Epoch ms the session began. */
  startedAt: z.number().int().nonnegative(),
  /** Independent verdicts committed during this session. */
  reviewsCompleted: z.number().int().nonnegative().default(0),
  /** Restorative breaks taken this session. */
  breaksTaken: z.number().int().nonnegative().default(0),
  /** Epoch ms the most recent break ended, or null if none taken. */
  lastBreakEndedAt: z.number().int().nonnegative().nullable().default(null),
  /** Epoch ms the reviewer last closed a paper, or null. Drives residue. */
  lastPaperClosedAt: z.number().int().nonnegative().nullable().default(null),
});
export type FocusSession = z.infer<typeof focusSessionSchema>;

/** Engagement with the paper currently open for review. */
export const paperEngagementSchema = z.object({
  paperId: z.number().int().positive(),
  /** Epoch ms the paper was opened for this review. */
  openedAt: z.number().int().nonnegative(),
  /** Word count of the paper body — sets the reading-time target. */
  wordCount: z.number().int().nonnegative(),
  /** Maximum fraction of the paper scrolled into view, 0..1. */
  scrollCoverage: z.number().min(0).max(1).default(0),
  /** Active (focused, non-idle) time spent on this paper, ms. */
  dwellMs: z.number().nonnegative().default(0),
  /** Whether the reviewer has committed an independent stance yet. */
  stanceCommitted: z.boolean().default(false),
});
export type PaperEngagement = z.infer<typeof paperEngagementSchema>;

export const assessInputSchema = z.object({
  /** Caller-supplied "now" (epoch ms) — the engine never reads the clock. */
  now: z.number().int().nonnegative(),
  session: focusSessionSchema,
  /** The open paper, or null when the reviewer is between papers. */
  engagement: paperEngagementSchema.nullable().default(null),
  /** Local fractional hour 0..24 for circadian math; omit to skip it. */
  localHour: z.number().min(0).max(24).optional(),
  chronotype: z.enum(["early", "neutral", "late"]).default("neutral"),
  /** Per-guard opt-outs; a guard absent here (or set true) is enabled. */
  guardsEnabled: z
    .object({
      blind: z.boolean().optional(),
      reading: z.boolean().optional(),
      fatigue: z.boolean().optional(),
      residue: z.boolean().optional(),
      flow: z.boolean().optional(),
    })
    .optional(),
});
export type AssessInput = z.input<typeof assessInputSchema>;
export type AssessInputParsed = z.infer<typeof assessInputSchema>;

// ── Output types (plain, inferred from the engine) ──────────────────────────

export type FatigueBand = "fresh" | "steady" | "tiring" | "depleted";

export interface FatigueAssessment {
  /** Composite fatigue, 0 (fresh) .. 1 (depleted). */
  score: number;
  band: FatigueBand;
  /** Trust to apply to a verdict cast right now, VERDICT_TRUST_FLOOR..1. */
  verdictTrust: number;
  /** Whether a restorative break is advised on fatigue grounds. */
  recommendBreak: boolean;
  contributors: {
    time: number;
    quantity: number;
    circadian: number;
  };
}

export interface BlindAssessment {
  /** Signals safe to show right now. */
  revealed: Signal[];
  /** Signals withheld to protect an independent judgment. */
  hidden: Signal[];
  reason: string;
}

export interface ReadingAssessment {
  /** Whether the verdict control is unlocked by sufficient engagement. */
  unlocked: boolean;
  /** Composite engagement progress, 0..1. */
  progress: number;
  estimatedReadingMs: number;
  requiredDwellMs: number;
  dwellMs: number;
  coverage: number;
}

export interface ResidueAssessment {
  /** True when the reviewer has taken a clean break from the previous paper. */
  clean: boolean;
  cooldownRemainingMs: number;
}

export type FlowState = "warmup" | "flow" | "strained" | "break_due";

export interface FlowAssessment {
  state: FlowState;
  focusStreakMs: number;
  nextBreakInMs: number;
  breakDue: boolean;
}

export type NudgeSeverity = "info" | "suggest" | "urgent";

export interface Nudge {
  id: string;
  guard: GuardName;
  severity: NudgeSeverity;
  title: string;
  body: string;
}

export interface FocusAssessment {
  /** May an independent verdict be committed right now? */
  canCommitVerdict: boolean;
  /** Human-readable reasons a verdict is blocked (empty when allowed). */
  blockers: string[];
  blind: BlindAssessment;
  reading: ReadingAssessment;
  fatigue: FatigueAssessment;
  residue: ResidueAssessment;
  flow: FlowAssessment;
  /** Composite trust in a verdict cast now, 0..1 (reading × fatigue × focus). */
  verdictIntegrity: number;
  /** Prioritised, flow-aware prompts for the reviewer. */
  nudges: Nudge[];
}
