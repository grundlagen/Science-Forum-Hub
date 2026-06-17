/**
 * Flow & Ultradian Guard — sustained attention.
 *
 * Deep focus runs in ~90-minute ultradian cycles (Kleitman's Basic
 * Rest–Activity Cycle); a restorative break at the boundary resets attentional
 * resources. Flow itself (Csikszentmihalyi 1990) is fragile, so the
 * orchestrator suppresses non-urgent nudges while a reviewer is in the `flow`
 * state — this guard only decides *when* a break has genuinely become due.
 */
import { FLOW_WARMUP_MS, STRAIN_GRACE_MS, ULTRADIAN_MS } from "../constants";
import type { FlowAssessment, FlowState, FocusSession } from "../types";
import { continuousFocusMs } from "./fatigue";

export function assessFlow(
  session: FocusSession,
  now: number,
  enabled: boolean,
): FlowAssessment {
  const focusStreakMs = continuousFocusMs(session, now);
  const nextBreakInMs = Math.max(0, ULTRADIAN_MS - focusStreakMs);

  let state: FlowState;
  if (focusStreakMs < FLOW_WARMUP_MS) {
    state = "warmup";
  } else if (focusStreakMs < ULTRADIAN_MS) {
    state = "flow";
  } else if (focusStreakMs < ULTRADIAN_MS + STRAIN_GRACE_MS) {
    state = "strained";
  } else {
    state = "break_due";
  }

  const breakDue = enabled && focusStreakMs >= ULTRADIAN_MS;

  return { state, focusStreakMs, nextBreakInMs, breakDue };
}
