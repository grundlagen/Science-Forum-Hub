/**
 * Focus Guard — browser client.
 *
 * Thin fetch wrappers over the `/api/focus/*` endpoints. The server owns all
 * scoring and judgement (single source of truth); the client only ships raw
 * signals and renders what the server decides.
 */

export type FocusIntent = "read" | "review" | "skim";
export type FatigueState = "fresh" | "warming" | "optimal" | "tiring" | "depleted";

export interface FocusSession {
  id: number;
  paperId: number | null;
  intent: FocusIntent;
  activeMs: number;
  scrollDepth: number;
}

export interface ReviewEligibility {
  eligible: boolean;
  engagedSec: number;
  requiredSec: number;
  scrollDepth: number;
  requiredScrollDepth: number;
  reason: "ok" | "no_session" | "insufficient_time" | "insufficient_coverage" | "fatigued";
  blocking: boolean;
  message: string;
}

export interface FatigueAssessment {
  state: FatigueState;
  reviewsSinceBreak: number;
  minutesSinceBreak: number | null;
  reliability: number;
  shouldBreak: boolean;
}

export type NudgeKind =
  | "encourage"
  | "ultradian_break"
  | "fatigue_break"
  | "coverage"
  | "dwell"
  | "flow";

export interface Nudge {
  kind: NudgeKind;
  severity: 1 | 2 | 3;
  title: string;
  body: string;
}

export interface GuardState {
  fatigue: FatigueAssessment;
  eligibility: ReviewEligibility;
  nudge: Nudge | null;
  focusScore: number | null;
  settings: {
    enforcementEnabled: boolean;
    minReviewEngagementSec: number;
    ultradianRemindersEnabled: boolean;
    fatigueGuardEnabled: boolean;
  };
}

export interface HeartbeatPayload {
  activeMs: number;
  idleMs: number;
  scrollDepth: number;
  distractionEvents: number;
  breaksTaken: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`focus-guard ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export function startSession(paperId: number | null, intent: FocusIntent): Promise<FocusSession> {
  return api<FocusSession>("/focus/sessions", {
    method: "POST",
    body: JSON.stringify({ paperId, intent }),
  });
}

export function heartbeat(sessionId: number, payload: HeartbeatPayload): Promise<FocusSession> {
  return api<FocusSession>(`/focus/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getGuard(paperId: number): Promise<GuardState> {
  return api<GuardState>(`/focus/guard/${paperId}`);
}

export function takeBreak(): Promise<unknown> {
  return api("/focus/break", { method: "POST" });
}

/**
 * Best-effort end-of-session. Uses sendBeacon when available so the call
 * survives page unload; falls back to keepalive fetch.
 */
export function endSession(sessionId: number, abandoned = false): void {
  const url = `/api/focus/sessions/${sessionId}/end`;
  const body = JSON.stringify({ abandoned });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
