import type {
  FocusTechnique,
  FocusIntent,
  FocusGoalType,
  FocusSoundscape,
  DistractionKind,
} from "@workspace/api-client-react";

/**
 * Static, psychology-grounded configuration for Focus Guard. Kept out of the
 * components so copy, presets, and citations live in one auditable place.
 */

export interface TechniquePreset {
  value: FocusTechnique;
  label: string;
  blurb: string;
  /** Default focus/break minutes this technique implies. */
  focusMinutes: number;
  breakMinutes: number;
  /** Focus phase counts up (no fixed length) instead of down. */
  countsUp: boolean;
  /** Whether the technique schedules automatic restorative breaks. */
  hasBreaks: boolean;
  citation: string;
}

export const TECHNIQUES: TechniquePreset[] = [
  {
    value: "pomodoro",
    label: "Pomodoro",
    blurb: "25 minutes on, 5 off. A reliable timebox you can almost always finish.",
    focusMinutes: 25,
    breakMinutes: 5,
    countsUp: false,
    hasBreaks: true,
    citation: "Cirillo, The Pomodoro Technique",
  },
  {
    value: "ultradian",
    label: "Ultradian",
    blurb: "~90 minutes of deep work tracking the brain's natural rest-activity cycle, then a real break.",
    focusMinutes: 90,
    breakMinutes: 20,
    countsUp: false,
    hasBreaks: true,
    citation: "Kleitman, Basic Rest-Activity Cycle (BRAC)",
  },
  {
    value: "flowmodoro",
    label: "Flowmodoro",
    blurb: "Focus until concentration breaks, then rest for a fifth of however long you lasted. Protects flow.",
    focusMinutes: 50,
    breakMinutes: 10,
    countsUp: true,
    hasBreaks: false,
    citation: "Csikszentmihalyi, Flow (1990)",
  },
  {
    value: "timeboxed",
    label: "Single timebox",
    blurb: "One uninterrupted block of your chosen length. No breaks, no cycles.",
    focusMinutes: 45,
    breakMinutes: 0,
    countsUp: false,
    hasBreaks: false,
    citation: "Locke & Latham, Goal-Setting Theory (2002)",
  },
];

export function getTechnique(value: FocusTechnique): TechniquePreset {
  return TECHNIQUES.find((t) => t.value === value) ?? TECHNIQUES[0];
}

export interface IntentOption {
  value: FocusIntent;
  label: string;
  /** Sensible default goal type for this intent. */
  goalType: FocusGoalType;
}

export const INTENTS: IntentOption[] = [
  { value: "read", label: "Deep-read papers", goalType: "papers" },
  { value: "review", label: "Cast rigorous reviews", goalType: "reviews" },
  { value: "write", label: "Draft / revise a submission", goalType: "minutes" },
  { value: "replicate", label: "Work through methods", goalType: "minutes" },
  { value: "explore", label: "Bounded, intentional exploring", goalType: "papers" },
];

export function getIntent(value: FocusIntent): IntentOption {
  return INTENTS.find((i) => i.value === value) ?? INTENTS[0];
}

export const GOAL_UNIT: Record<FocusGoalType, string> = {
  papers: "papers",
  reviews: "reviews",
  minutes: "minutes",
  custom: "steps",
};

export const SOUNDSCAPES: { value: FocusSoundscape; label: string }[] = [
  { value: "none", label: "Silence" },
  { value: "rain", label: "Rain" },
  { value: "cafe", label: "Café murmur" },
  { value: "brown_noise", label: "Brown noise" },
  { value: "library", label: "Library hush" },
];

export const DISTRACTION_KINDS: { value: DistractionKind; label: string }[] = [
  { value: "thought", label: "Stray thought" },
  { value: "task", label: "Unrelated to-do" },
  { value: "urge", label: "Urge / impulse" },
  { value: "external", label: "Interruption" },
];

/**
 * Implementation-intention scaffolds (Gollwitzer, 1999). A concrete if-then
 * plan roughly doubles follow-through versus a vague goal, so we seed the
 * intention field with editable, situation-anchored templates.
 */
export const INTENTION_TEMPLATES: string[] = [
  "When I open SciVet, I will read one paper fully before scrolling the feed.",
  "When I feel the urge to check something, I will park it and stay on this paper.",
  "When I finish this review, I will write one concrete, falsifiable critique.",
  "When my mind wanders, I will reread the last paragraph rather than switch tasks.",
  "When the timer ends, I will note one thing I learned before stopping.",
];

/**
 * Pre-session micro-coaching, one card per technique-agnostic principle.
 * Surfaced on the start screen so the ritual itself teaches the psychology.
 */
export interface FocusPrinciple {
  title: string;
  body: string;
  citation: string;
}

export const FOCUS_PRINCIPLES: FocusPrinciple[] = [
  {
    title: "Name the if-then",
    body: "Decide in advance what you'll do when a distraction hits. Pre-committed plans fire automatically, so you spend willpower on the work, not the decision.",
    citation: "Gollwitzer, Implementation Intentions (1999)",
  },
  {
    title: "One paper at a time",
    body: "Flow needs a clear goal and no task-switching. Single-tasking isn't slower — context-switching is what's expensive.",
    citation: "Csikszentmihalyi, Flow (1990)",
  },
  {
    title: "Park, don't chase",
    body: "An unfinished thought nags because your mind keeps it open (the Zeigarnik effect). Writing it down closes the loop and frees working memory.",
    citation: "Zeigarnik (1927); Masicampo & Baumeister (2011)",
  },
  {
    title: "Rest is part of the work",
    body: "Directed attention is a depletable resource that recovers when you step away. A planned break is restoration, not slacking.",
    citation: "Kaplan, Attention Restoration Theory (1995)",
  },
];

export const ENERGY_LABELS = ["Depleted", "Low", "Okay", "Good", "Sharp"];
export const FLOW_LABELS = [
  "Scattered",
  "Choppy",
  "Steady",
  "Absorbed",
  "Deep flow",
];

export const MOODS = ["energized", "calm", "satisfied", "drained", "frustrated"];

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
