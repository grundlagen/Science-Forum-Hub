import type { FocusLockMode, FocusOutcome } from "@workspace/db";

// Pure, dependency-free Focus Guard logic. Every constant here traces to a
// finding documented in docs/FOCUS_GUARD.md — change the doc before the number.

export const MIN_SESSION_MINUTES = 10;
export const MAX_SESSION_MINUTES = 90; // ultradian rhythm ceiling (BRAC)
export const DEFAULT_SESSION_MINUTES = 25;
// Grace period before an unattended session is swept to "expired".
export const EXPIRY_GRACE_MINUTES = 30;
export const COMPLETION_WINDOW_DAYS = 28;

export function clampPlannedMinutes(minutes: number | undefined): number {
  if (minutes === undefined || Number.isNaN(minutes)) return DEFAULT_SESSION_MINUTES;
  return Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, Math.round(minutes)));
}

export function elapsedSeconds(startedAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));
}

export function remainingSeconds(startedAt: Date, plannedMinutes: number, now: Date): number {
  return Math.max(0, plannedMinutes * 60 - elapsedSeconds(startedAt, now));
}

export function isExpired(startedAt: Date, plannedMinutes: number, now: Date): boolean {
  return elapsedSeconds(startedAt, now) > (plannedMinutes + EXPIRY_GRACE_MINUTES) * 60;
}

export function deriveOutcome(
  action: "complete" | "abandon",
  actualSeconds: number,
  plannedMinutes: number,
): FocusOutcome {
  if (action === "abandon") return "abandoned";
  // Honest accounting: finishing well past plan is its own outcome, not a
  // failure and not silently "completed".
  return actualSeconds >= plannedMinutes * 60 * 1.25 ? "overran" : "completed";
}

export function requiresAbandonReason(
  lockMode: FocusLockMode,
  action: "complete" | "abandon",
  actualSeconds: number,
  plannedMinutes: number,
): boolean {
  // Ulysses friction only applies to leaving *early* — abandoning after the
  // planned time elapsed is just closing the tab late.
  return lockMode === "ulysses" && action === "abandon" && actualSeconds < plannedMinutes * 60;
}

export function suggestBreakMinutes(actualSeconds: number): number {
  // Roughly a fifth of the session, floored at 5 and capped at 20 (ART:
  // restoration needs real time, but a break is not a second session).
  const minutes = Math.round(actualSeconds / 60 / 5);
  return Math.min(20, Math.max(5, minutes));
}

// Monday 00:00 UTC of the week containing `now` (fresh-start framing).
export function weekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Weekly cadence (NOT a daily streak): consecutive weeks with any focused
// minutes, counting back from the current week. The current week counts if it
// has activity but does not break the chain while still in progress.
export function weeksActive(activeWeekStarts: Date[], now: Date): number {
  const have = new Set(activeWeekStarts.map((d) => weekStart(d).getTime()));
  const thisWeek = weekStart(now).getTime();
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  let count = have.has(thisWeek) ? 1 : 0;
  let cursor = thisWeek - WEEK_MS;
  while (have.has(cursor)) {
    count += 1;
    cursor -= WEEK_MS;
  }
  return count;
}

// Closure copy: factual, warm, never shaming (Self-Determination Theory).
// The data speaks; the app does not editorialize about the user's character.
export function closureMessage(
  outcome: FocusOutcome,
  actualSeconds: number,
  plannedMinutes: number,
  captureCount: number,
): string {
  const actualMin = Math.max(1, Math.round(actualSeconds / 60));
  const parked =
    captureCount === 0
      ? "No thoughts needed parking."
      : captureCount === 1
        ? "You parked 1 thought instead of chasing it."
        : `You parked ${captureCount} thoughts instead of chasing them.`;
  switch (outcome) {
    case "completed":
      return `You did what you said you would: ${actualMin} of ${plannedMinutes} minutes on your intention. ${parked} Take your break away from the feed — a window beats a scroll.`;
    case "overran":
      return `You stayed ${actualMin} minutes on a ${plannedMinutes}-minute plan — absorption is a good sign, and so is stopping. ${parked} A real break now protects the next session.`;
    case "abandoned":
      return `You focused for ${actualMin} of ${plannedMinutes} minutes, then chose to stop. ${parked} That's data, not a verdict — shorter sessions are a fine next experiment.`;
    case "expired":
      return `This session was closed automatically after the planned ${plannedMinutes} minutes passed. If you finished and forgot to close it, it still counted.`;
  }
}
