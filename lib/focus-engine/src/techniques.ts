/**
 * Technique presets and the rules that adapt them to a person and a moment.
 *
 * The presets are starting points, not prescriptions. The adaptation function
 * nudges block length by cognitive mode, momentary energy, and circadian fit,
 * because a fixed 25-minute timer ignores everything we know about how
 * attention actually rises and falls.
 */

import type { Chronotype, FocusMode, FocusTechnique } from "./types";

export interface TechniquePreset {
  technique: FocusTechnique;
  label: string;
  /** Minutes of focused work per block. */
  workMinutes: number;
  /** Minutes of rest after a normal block. */
  breakMinutes: number;
  /** Minutes of rest after a full set of blocks. */
  longBreakMinutes: number;
  /** Blocks completed before a long break is earned. */
  cyclesBeforeLongBreak: number;
  /** One-line description shown in the UI. */
  rationale: string;
  /** The psychology this rhythm draws on. */
  basis: string[];
}

export const TECHNIQUE_PRESETS: Record<FocusTechnique, TechniquePreset> = {
  pomodoro: {
    technique: "pomodoro",
    label: "Pomodoro",
    workMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 20,
    cyclesBeforeLongBreak: 4,
    rationale: "Short, repeatable sprints that lower the activation energy of starting.",
    basis: [
      "Cirillo, The Pomodoro Technique",
      "Implementation intentions reduce procrastination by making the start concrete (Gollwitzer 1999)",
    ],
  },
  ultradian: {
    technique: "ultradian",
    label: "Ultradian (90/20)",
    workMinutes: 90,
    breakMinutes: 20,
    longBreakMinutes: 30,
    cyclesBeforeLongBreak: 2,
    rationale: "Rides the body's natural ~90-minute rest-activity cycle, then truly rests.",
    basis: [
      "Kleitman, Basic Rest-Activity Cycle (BRAC)",
      "Attention Restoration Theory — directed attention fatigues and must recover (Kaplan & Kaplan 1989)",
    ],
  },
  flowtime: {
    technique: "flowtime",
    label: "Flowtime",
    workMinutes: 50,
    breakMinutes: 10,
    longBreakMinutes: 25,
    cyclesBeforeLongBreak: 3,
    rationale: "Work until focus naturally dips instead of cutting flow off at a fixed bell.",
    basis: [
      "Flow theory — interrupting deep concentration is costly (Csikszentmihalyi 1990)",
      "Attention residue from forced task-switching (Leroy 2009)",
    ],
  },
  deep_work: {
    technique: "deep_work",
    label: "Deep Work",
    workMinutes: 120,
    breakMinutes: 25,
    longBreakMinutes: 45,
    cyclesBeforeLongBreak: 2,
    rationale: "Long, single-task, distraction-free blocks for the hardest cognitive work.",
    basis: [
      "Newport, Deep Work",
      "Goal-setting theory — specific, difficult goals raise performance (Locke & Latham 2002)",
    ],
  },
  custom: {
    technique: "custom",
    label: "Custom",
    workMinutes: 45,
    breakMinutes: 10,
    longBreakMinutes: 20,
    cyclesBeforeLongBreak: 3,
    rationale: "Your own cadence. Autonomy over method sustains intrinsic motivation.",
    basis: ["Self-Determination Theory — autonomy supports intrinsic motivation (Deci & Ryan 2000)"],
  },
};

/** Multiplier applied to block length by cognitive mode. */
const MODE_BLOCK_MULTIPLIER: Record<FocusMode, number> = {
  reading: 0.85, // consumptive; shorter cycles keep comprehension sharp
  reviewing: 0.8, // bounded, decision-oriented work
  commenting: 0.75, // short, conversational
  writing: 1.2, // generative; a long runway is worth protecting
  synthesizing: 1.25, // the most working-memory-intensive mode
  exploring: 0.7, // browsing; not meant to be a marathon
};

/** Energy 1-5 → block multiplier. Low energy shortens; high energy lengthens. */
function energyMultiplier(energy: number): number {
  const clamped = Math.max(1, Math.min(5, energy));
  // 1 -> 0.7, 3 -> 1.0, 5 -> 1.2
  return 0.7 + (clamped - 1) * 0.125;
}

/**
 * Is `localHour` (0-23) within this chronotype's analytic peak window?
 * Peaks are approximate and deliberately generous.
 */
export function isPeakWindow(chronotype: Chronotype, localHour: number): boolean {
  const h = ((localHour % 24) + 24) % 24;
  switch (chronotype) {
    case "lark":
      return h >= 7 && h < 12;
    case "third_bird":
      return h >= 9 && h < 14;
    case "owl":
      return h >= 16 && h < 22;
    default:
      return false;
  }
}

export interface BlockRecommendation {
  /** Recommended focused-work minutes for the next block. */
  workMinutes: number;
  /** Recommended break minutes after it. */
  breakMinutes: number;
  /** Whether the current hour is a good circadian fit for analytic work. */
  atPeak: boolean;
  /** Plain-language guidance to show the user. */
  guidance: string;
}

export interface RecommendBlockInput {
  technique: FocusTechnique;
  mode: FocusMode;
  /** Self-reported energy, 1 (depleted) to 5 (sharp). */
  energy: number;
  chronotype: Chronotype;
  /** Local hour 0-23. */
  localHour: number;
}

/**
 * Adapt a technique preset to the person and the moment. We scale by mode and
 * energy, then clamp to a humane range so the guard never recommends an
 * unsustainable block. If the hour is off-peak for analytic work, we say so —
 * scheduling demanding work into your peak is a bigger lever than any timer.
 */
export function recommendBlock(input: RecommendBlockInput): BlockRecommendation {
  const preset = TECHNIQUE_PRESETS[input.technique];
  const raw =
    preset.workMinutes * MODE_BLOCK_MULTIPLIER[input.mode] * energyMultiplier(input.energy);

  // When energy is low, hold the block short regardless of technique/mode —
  // pushing a depleted person into a 2-hour block invites a shallow,
  // distraction-riddled session. The guidance says "go shorter"; the number
  // must agree. (A low energy ceiling overrides an ambitious preset.)
  const energyCeiling = input.energy <= 2 ? 45 : input.energy === 3 ? 90 : 120;
  const workMinutes = Math.max(15, Math.min(energyCeiling, Math.round(raw / 5) * 5));

  // Keep the break proportional to the (possibly adapted) block, ~20%.
  const breakMinutes = Math.max(5, Math.min(30, Math.round((workMinutes * 0.2) / 5) * 5));

  const atPeak = isPeakWindow(input.chronotype, input.localHour);

  let guidance: string;
  if (input.energy <= 2) {
    guidance =
      "Energy is low — a shorter block protects comprehension. Consider an easier mode (reading over writing) or a real break first.";
  } else if (!atPeak && (input.mode === "writing" || input.mode === "synthesizing")) {
    guidance =
      "This is demanding, generative work but you're outside your analytic peak. It's workable — just expect more friction, and save the very hardest call for your peak window.";
  } else if (atPeak) {
    guidance = "You're in your peak window — spend it on the hardest thinking, not on email.";
  } else {
    guidance = "Solid conditions. Set one concrete target and protect the block.";
  }

  return { workMinutes, breakMinutes, atPeak, guidance };
}
