import type {
  FocusProfile,
  FocusSession,
  FocusGoalType,
  FocusTechnique,
  Chronotype,
} from "@workspace/db";

/**
 * FocusGuard domain logic.
 *
 * The rules here translate attention/behaviour research into concrete numbers
 * and copy. They are intentionally conservative: a "deep" session must reflect
 * genuine sustained attention, and streaks only advance on qualifying work so
 * the signal stays trustworthy. See `docs/focus-guard.md` for citations.
 */

/** A qualifying deep session must reach this fraction of its planned timebox… */
const QUALIFYING_FOCUS_RATIO = 0.7;
/** …and clear this absolute floor, so a tiny timebox can't trivially qualify.
 *  10 minutes ≈ the lower bound at which directed-attention reading shows
 *  measurable comprehension gains over skimming. */
const QUALIFYING_FLOOR_SECONDS = 10 * 60;
/** Only reading/reviewing produces a peer-review trust signal. */
const QUALIFYING_GOALS: FocusGoalType[] = ["read", "review"];

/**
 * Does a completed session represent enough sustained attention to (a) advance
 * the streak and (b) back a review with a "deep" provenance badge?
 */
export function isQualifyingSession(s: {
  status: FocusSession["status"];
  goalType: FocusGoalType;
  plannedMinutes: number;
  focusedSeconds: number;
}): boolean {
  if (s.status !== "completed") return false;
  if (!QUALIFYING_GOALS.includes(s.goalType)) return false;
  const target = s.plannedMinutes * 60 * QUALIFYING_FOCUS_RATIO;
  return s.focusedSeconds >= Math.max(target, QUALIFYING_FLOOR_SECONDS);
}

/** Local calendar date (YYYY-MM-DD) for streak continuity math. */
export function calendarDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function previousDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return calendarDate(dt);
}

export type StreakOutcome = {
  streakCount: number;
  longestStreak: number;
  lastQualifyingDate: string;
  changed: boolean;
};

/**
 * Goal-gradient streak update. A streak grows by completing a qualifying
 * session on consecutive calendar days; a second session the same day doesn't
 * inflate it (avoids gaming), and a missed day resets to 1 (not 0 — finishing
 * today still counts as a fresh day-one).
 */
export function advanceStreak(
  profile: Pick<FocusProfile, "streakCount" | "longestStreak" | "lastQualifyingDate">,
  today: string = calendarDate(),
): StreakOutcome {
  const last = profile.lastQualifyingDate;
  let streak: number;
  let changed: boolean;

  if (last === today) {
    streak = profile.streakCount;
    changed = false;
  } else if (last === previousDate(today)) {
    streak = profile.streakCount + 1;
    changed = true;
  } else {
    streak = 1;
    changed = true;
  }

  return {
    streakCount: streak,
    longestStreak: Math.max(streak, profile.longestStreak),
    lastQualifyingDate: today,
    changed,
  };
}

export type FocusRecommendation = {
  technique: FocusTechnique;
  focusMinutes: number;
  breakMinutes: number;
  suggestedWindow: string;
  rationale: string;
  intentTemplate: string;
};

const TECHNIQUE_CADENCE: Record<FocusTechnique, { focus: number; break: number; why: string }> = {
  pomodoro: {
    focus: 25,
    break: 5,
    why: "Short fixed intervals lower the activation cost of starting — the hardest moment for a distracted reader.",
  },
  deep_work: {
    focus: 50,
    break: 10,
    why: "Long uninterrupted blocks protect the 10–20 min ramp into flow that dense methods sections demand.",
  },
  flowtime: {
    focus: 45,
    break: 8,
    why: "Work until a natural break, then rest proportionally — keeps you from cutting flow short at an arbitrary buzzer.",
  },
  timeboxed: {
    focus: 30,
    break: 5,
    why: "A self-set deadline counters Parkinson's law: the read expands to fill whatever time you leave open.",
  },
};

const CHRONOTYPE_WINDOW: Record<Chronotype, string> = {
  morning: "08:00–11:00, while your directed-attention reserves are highest",
  evening: "16:00–20:00, your natural late-day alertness peak",
  flexible: "whenever you can secure ~1 uninterrupted hour today",
};

const INTENT_TEMPLATES: Record<FocusGoalType, string> = {
  read: "When I start, I will read for understanding and note one claim I'd want to test.",
  review: "When I start, I will judge the methodology before forming any verdict.",
  revise: "When I start, I will address the single weakest section reviewers flagged.",
  explore: "When I start, I will skim three papers and capture what surprises me.",
};

/**
 * Build a session plan tailored to the user's defaults, stated goal, and
 * chronotype. Pure function so it's trivially testable and reused by seeds.
 */
export function recommendSession(
  profile: Pick<FocusProfile, "defaultTechnique" | "defaultFocusMinutes" | "defaultBreakMinutes" | "chronotype">,
  goalType: FocusGoalType,
): FocusRecommendation {
  // Honour the user's chosen default, but let a hard "review" goal lean longer.
  const technique: FocusTechnique =
    goalType === "review" && profile.defaultTechnique === "pomodoro"
      ? "deep_work"
      : profile.defaultTechnique;
  const cadence = TECHNIQUE_CADENCE[technique];

  return {
    technique,
    focusMinutes: profile.defaultFocusMinutes || cadence.focus,
    breakMinutes: profile.defaultBreakMinutes || cadence.break,
    suggestedWindow: CHRONOTYPE_WINDOW[profile.chronotype],
    rationale: cadence.why,
    intentTemplate: INTENT_TEMPLATES[goalType],
  };
}

/** Warm, specific, non-gamified post-session copy (autonomy-supportive). */
export function encouragementFor(outcome: {
  qualifies: boolean;
  streakCount: number;
  streakChanged: boolean;
  dailyGoalMet: boolean;
  focusedMinutes: number;
  distractionCount: number;
}): string {
  if (!outcome.qualifies) {
    return outcome.focusedMinutes > 0
      ? `${outcome.focusedMinutes} focused minutes still count — partial attention beats none. Resume when you're ready.`
      : "No focused time logged this round. That's fine — naming the intent is itself a start.";
  }
  const parts: string[] = [];
  if (outcome.streakChanged && outcome.streakCount > 1) {
    parts.push(`${outcome.streakCount}-day focus streak.`);
  } else {
    parts.push("Deep session logged.");
  }
  if (outcome.dailyGoalMet) parts.push("You've met today's focus goal.");
  if (outcome.distractionCount === 0) {
    parts.push("Zero recorded distractions — that's rare and worth noticing.");
  } else {
    parts.push(`You caught and named ${outcome.distractionCount} distraction${outcome.distractionCount === 1 ? "" : "s"} instead of following them.`);
  }
  return parts.join(" ");
}
