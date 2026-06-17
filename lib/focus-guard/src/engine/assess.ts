/**
 * Focus Guard orchestrator.
 *
 * Runs all five guards over a single immutable snapshot and folds them into one
 * `FocusAssessment`: whether a verdict may be committed, which signals are safe
 * to reveal, the reviewer's fatigue, and a prioritised, flow-aware set of
 * nudges. Pure and deterministic — the caller supplies `now`.
 */
import { assessInputSchema } from "../types";
import type {
  AssessInput,
  FocusAssessment,
  GuardName,
  Nudge,
} from "../types";
import { assessBlind } from "./blind";
import { assessFatigue } from "./fatigue";
import { assessFlow } from "./flow";
import { clamp, round } from "./math";
import { assessReading } from "./reading";
import { assessResidue } from "./residue";

function isEnabled(
  guardsEnabled: AssessInput["guardsEnabled"],
  guard: GuardName,
): boolean {
  return guardsEnabled?.[guard] !== false;
}

const SEVERITY_RANK = { urgent: 0, suggest: 1, info: 2 } as const;

function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return `${m} min`;
}

export function assessFocus(input: AssessInput): FocusAssessment {
  const parsed = assessInputSchema.parse(input);
  const { now, session, engagement, localHour, chronotype, guardsEnabled } = parsed;

  const blind = assessBlind(engagement, isEnabled(guardsEnabled, "blind"));
  const reading = assessReading(engagement, isEnabled(guardsEnabled, "reading"));
  const residue = assessResidue(session, now, isEnabled(guardsEnabled, "residue"));
  const flow = assessFlow(session, now, isEnabled(guardsEnabled, "flow"));
  const fatigue = assessFatigue(session, now, {
    localHour,
    chronotype,
  });

  // ── Can a verdict be committed right now? ────────────────────────────────
  const blockers: string[] = [];
  if (!engagement) {
    blockers.push("No paper is open for review.");
  } else {
    if (!reading.unlocked) {
      blockers.push(
        `Read more first — ${Math.round(reading.progress * 100)}% of the required engagement so far.`,
      );
    }
    if (!residue.clean) {
      blockers.push(
        `Clean break in progress — ${formatMs(residue.cooldownRemainingMs)} before the next verdict unlocks.`,
      );
    }
  }
  const canCommitVerdict = blockers.length === 0;

  // ── Composite verdict integrity ──────────────────────────────────────────
  const readingFactor = reading.unlocked ? 1 : 0.5;
  const focusFactor =
    flow.state === "break_due" ? 0.8 : flow.state === "strained" ? 0.9 : 1;
  const verdictIntegrity = round(
    clamp(fatigue.verdictTrust * readingFactor * focusFactor),
  );

  // ── Nudges (prioritised; non-urgent ones suppressed while in flow) ────────
  const nudges: Nudge[] = [];

  if (flow.breakDue) {
    nudges.push({
      id: "flow.break_due",
      guard: "flow",
      severity: "urgent",
      title: "Time for a restorative break",
      body: `You've held focus for ${formatMs(flow.focusStreakMs)}. Stepping away now protects the quality of your next reviews.`,
    });
  }
  if (fatigue.band === "depleted") {
    nudges.push({
      id: "fatigue.depleted",
      guard: "fatigue",
      severity: "urgent",
      title: "Running low on judgment fuel",
      body: "Decision fatigue is high. Verdicts cast now carry less weight — consider pausing before the next call.",
    });
  } else if (fatigue.recommendBreak) {
    nudges.push({
      id: "fatigue.tiring",
      guard: "fatigue",
      severity: "suggest",
      title: "A short break would help",
      body: "Your focus is starting to tire. A few minutes away will sharpen the reviews that follow.",
    });
  }

  if (engagement && !reading.unlocked) {
    nudges.push({
      id: "reading.locked",
      guard: "reading",
      severity: "suggest",
      title: "Verdict locked until you've read enough",
      body: `Engagement ${Math.round(reading.progress * 100)}%. Keep reading to unlock your independent stance.`,
    });
  }

  if (!residue.clean) {
    nudges.push({
      id: "residue.cooldown",
      guard: "residue",
      severity: "suggest",
      title: "Let the last paper settle",
      body: `Switching cleanly avoids carrying attention residue. ${formatMs(residue.cooldownRemainingMs)} to go.`,
    });
  }

  if (blind.hidden.length > 0) {
    nudges.push({
      id: "blind.active",
      guard: "blind",
      severity: "info",
      title: "Judging blind",
      body: "AI verdict, scores and other reviews stay hidden until you commit your own stance — this keeps your judgment your own.",
    });
  }

  if (flow.state === "warmup") {
    nudges.push({
      id: "flow.warmup",
      guard: "flow",
      severity: "info",
      title: "Settling in",
      body: "Give yourself a minute to drop into the work before reaching for a verdict.",
    });
  }

  // Protect flow: while genuinely in flow, only urgent prompts get through.
  const filtered =
    flow.state === "flow" ? nudges.filter((n) => n.severity === "urgent") : nudges;
  filtered.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    canCommitVerdict,
    blockers,
    blind,
    reading,
    fatigue,
    residue,
    flow,
    verdictIntegrity,
    nudges: filtered,
  };
}
