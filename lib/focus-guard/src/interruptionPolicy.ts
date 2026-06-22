/**
 * interruptionPolicy.ts — THE GUARD.
 *
 * This is the decision core of Focus Guard: given a live session and an
 * incoming interruption, decide whether to ALLOW it, DEFER it to a safer
 * moment, or SHIELD (intercept) it.
 *
 * Three principles shape the policy:
 *  - Protect flow. Breaking a flow/near-flow state is disproportionately
 *    costly, so we guard it hardest. @see CITATIONS.FLOW
 *  - Beat the Zeigarnik effect, don't fight it. Intrusive thoughts and task-
 *    switch urges are *captured* to an open-loop list rather than suppressed;
 *    writing the plan down releases the intrusion. @see CITATIONS.ZEIGARNIK
 *  - Stay autonomy-supportive. Every message gives a rationale and leaves the
 *    final choice with the user. We never shame or hard-block; coercion erodes
 *    the intrinsic motivation we depend on. @see CITATIONS.SELF_DETERMINATION
 *
 * Bodily needs and genuine emergencies always pass — guarding focus must never
 * override a person's wellbeing.
 */

import { clamp01 } from "./math";
import type {
  GuardVerdict,
  InterruptionKind,
  InterruptionSource,
  InterruptionUrgency,
  SessionPhase,
} from "./types";

export interface SessionState {
  readonly elapsedMinutes: number;
  readonly plannedMinutes: number;
  /** Is the user currently in or near flow? From assessFlow().inFlow. */
  readonly inFlow: boolean;
}

export interface IncomingInterruption {
  readonly source: InterruptionSource;
  readonly kind: InterruptionKind;
  readonly urgency: InterruptionUrgency;
  /** Optional free-text so the open-loop capture can echo it back. */
  readonly note?: string;
}

/** Classify where the session sits along its planned arc. */
export function sessionPhase(
  elapsedMinutes: number,
  plannedMinutes: number,
): SessionPhase {
  if (plannedMinutes <= 0) return "deep";
  if (elapsedMinutes > plannedMinutes) return "overrun";
  const frac = clamp01(elapsedMinutes / plannedMinutes);
  const warmup = Math.min(0.18, 8 / plannedMinutes); // first ~8 min or 18%
  if (frac < warmup) return "warmup";
  if (frac > 0.85) return "wind_down";
  return "deep";
}

function defer(
  reason: string,
  message: string,
  deferUntil: SessionPhase,
  parkThought = false,
): GuardVerdict {
  return { decision: "defer", reason, message, parkThought, deferUntil };
}

function shield(reason: string, message: string, parkThought = false): GuardVerdict {
  return { decision: "shield", reason, message, parkThought };
}

function allow(reason: string, message: string): GuardVerdict {
  return { decision: "allow", reason, message, parkThought: false };
}

const PARK = (note?: string) =>
  note
    ? `Captured "${note}" to your open-loop list — it's safe there, you can stop holding it.`
    : "Captured to your open-loop list — it's safe there, you can stop holding it.";

/**
 * The guard. Pure function: same inputs → same verdict.
 */
export function evaluateInterruption(
  session: SessionState,
  interruption: IncomingInterruption,
): GuardVerdict {
  const phase = sessionPhase(session.elapsedMinutes, session.plannedMinutes);
  const { source, kind, urgency } = interruption;

  // 1) Wellbeing first — emergencies and bodily needs always pass.
  if (urgency === "emergency") {
    return allow(
      "Emergency overrides focus protection.",
      "This is flagged as an emergency — go. Focus never comes before safety.",
    );
  }
  if (kind === "physical") {
    return allow(
      "Bodily needs are not negotiable.",
      "Take care of it — discomfort just drags your attention back anyway. Resume when you're settled.",
    );
  }

  // 2) Past the plan: you've honoured your commitment. Be permissive.
  if (phase === "overrun") {
    return allow(
      "Session has exceeded its planned length.",
      "You're already past your planned block — a clean stopping point is fine. Handle it, then decide whether to start a fresh block.",
    );
  }

  // 3) Internal thoughts & task-switch urges: capture, don't obey. This is the
  //    Zeigarnik move — writing it down releases the intrusion without a switch.
  if (source === "internal" && (kind === "thought" || kind === "task")) {
    if (urgency === "important") {
      return defer(
        "Important internal thought parked to protect the session.",
        `Noted as important. ${PARK(interruption.note)} It's first up at your break.`,
        phase === "wind_down" ? "wind_down" : "deep",
        true,
      );
    }
    return shield(
      "Internal intrusion captured rather than acted on (Zeigarnik release).",
      `${PARK(interruption.note)} Back to it.`,
      true,
    );
  }

  // 4) Protect flow hard: a near-flow state is expensive to rebuild.
  if (session.inFlow) {
    if (urgency === "important") {
      return defer(
        "Important external interruption deferred to defend flow.",
        "You're in flow — that's rare and worth protecting. I'll resurface this the moment you wind down.",
        "wind_down",
      );
    }
    return shield(
      "Non-urgent interruption shielded to defend flow.",
      "You're in flow; this can wait. I'll hold it for your break.",
    );
  }

  // 5) Warmup: engagement is still forming; shield low-value noise so it can build.
  if (phase === "warmup" && urgency !== "important") {
    return shield(
      "Shielded during warmup so engagement can build.",
      "You're just getting in — let me hold this for a few minutes while you settle.",
    );
  }

  // 6) External notifications: the classic distraction. Defer to the break.
  if (source === "external" && kind === "notification") {
    return defer(
      "External notification batched to the next break.",
      "Batched for your break — notifications are designed to fragment attention, and almost none are truly time-critical.",
      "wind_down",
    );
  }

  // 7) A person needs you: honour relatedness, but time it well.
  if (kind === "person") {
    if (urgency === "important") {
      return defer(
        "Important person deferred to the nearest break.",
        "People matter — I'll bring this back at your break in a few minutes, so you can give them full attention rather than half.",
        "wind_down",
      );
    }
    return defer(
      "Routine person-interruption deferred to the next break.",
      "I'll hold this for your break so you can respond properly instead of context-switching twice.",
      "wind_down",
    );
  }

  // 8) Remaining external/routine cases: defer to wind-down by default.
  return defer(
    "Deferred to the next natural stopping point.",
    "Holding this for your break — that's the cheapest moment to switch.",
    "wind_down",
  );
}
