/**
 * restoration.ts — prescribe a break that actually restores attention.
 *
 * Attention Restoration Theory: directed attention is a fatigable resource,
 * and it recovers best in environments of "soft fascination" — above all,
 * nature — that hold attention effortlessly while leaving room to reflect.
 * Scrolling a feed is "hard fascination": engaging but not restorative.
 * We scale break length and type to how depleted the person is.
 * @see CITATIONS.ATTENTION_RESTORATION
 */

import { RESTORATION } from "./constants";
import { clamp01 } from "./math";
import type { BreakPlan, BreakType } from "./types";

const PROMPTS: Record<BreakType, string> = {
  none: "Keep rolling — you're not depleted enough to need a break yet.",
  micro:
    "Stand, look at the furthest thing you can see for 20 seconds, breathe. No screens.",
  movement:
    "Walk for a few minutes — ideally outside. Movement clears directed-attention fatigue faster than sitting.",
  social:
    "Step away and have a low-stakes chat. Relatedness recharges motivation without taxing focus.",
  nature:
    "Get to a window, balcony, or green space. Soft fascination (trees, sky, water) is the strongest restorer we know.",
  rest:
    "You're running low. Take a real rest: lie down, close your eyes, or nap ~20 min. Don't 'rest' on a feed.",
};

/**
 * Recommend a break for a given depletion level (0 = fresh, 1 = spent).
 * @param depletion 0..1 self-reported/derived cognitive depletion.
 * @param outdoorsAvailable whether a green/outdoor space is realistically reachable.
 */
export function recommendBreak(
  depletion: number,
  outdoorsAvailable = false,
): BreakPlan {
  const d = clamp01(depletion);

  if (d < RESTORATION.MICRO_THRESHOLD) {
    return d < 0.08
      ? { type: "none", minutes: 0, prompt: PROMPTS.none }
      : { type: "micro", minutes: RESTORATION.MICRO_MINUTES, prompt: PROMPTS.micro };
  }

  if (d < RESTORATION.NATURE_THRESHOLD) {
    // Moderate depletion: movement is the reliable default; nature if handy.
    const type: BreakType = outdoorsAvailable ? "nature" : "movement";
    return {
      type,
      minutes: RESTORATION.STANDARD_MINUTES,
      prompt: PROMPTS[type],
    };
  }

  // High depletion: prefer the strongest restorer available; fall back to rest.
  if (d >= 0.8) {
    return { type: "rest", minutes: RESTORATION.DEEP_MINUTES, prompt: PROMPTS.rest };
  }
  const type: BreakType = outdoorsAvailable ? "nature" : "rest";
  return { type, minutes: RESTORATION.DEEP_MINUTES, prompt: PROMPTS[type] };
}
