import { useCallback, useEffect, useRef, useState } from "react";

/**
 * use-focus-timer — a local, persistent stopwatch for an active focus session.
 *
 * The server stores `focusedSeconds` as the source of truth at rest, but during
 * a live block we tick locally (once per second) and only sync on pause/complete.
 * Elapsed time is reconstructed from a wall-clock anchor in localStorage so a
 * refresh, tab sleep, or accidental navigation doesn't cost the user their block —
 * losing a streak to a reload is exactly the kind of needless punishment the
 * feature exists to avoid.
 */

// React's automatic JSX runtime doesn't need the import, but the hook file does
// not render anything, so we only pull the hooks we use above.

interface TimerState {
  /** Seconds already banked from previous run segments (paused time excluded). */
  banked: number;
  /** Epoch ms when the current run segment started, or null when paused. */
  runningSince: number | null;
}

const KEY = (sessionId: number) => `focusTimer:${sessionId}`;

function load(sessionId: number, initialBanked: number): TimerState {
  try {
    const raw = localStorage.getItem(KEY(sessionId));
    if (raw) return JSON.parse(raw) as TimerState;
  } catch {
    // ignore malformed storage
  }
  return { banked: initialBanked, runningSince: Date.now() };
}

function persist(sessionId: number, state: TimerState) {
  try {
    localStorage.setItem(KEY(sessionId), JSON.stringify(state));
  } catch {
    // storage full / unavailable — degrade to in-memory only
  }
}

function elapsed(state: TimerState): number {
  if (state.runningSince == null) return state.banked;
  return state.banked + Math.floor((Date.now() - state.runningSince) / 1000);
}

export interface FocusTimer {
  /** Total focused seconds so far (banked + current run). */
  seconds: number;
  running: boolean;
  start: () => void;
  pause: () => void;
  /** Stop ticking and return the final focused-seconds count for the server. */
  finalize: () => number;
  /** Drop persisted state once the session is closed. */
  clear: () => void;
}

export function useFocusTimer(sessionId: number, initialBanked: number): FocusTimer {
  const stateRef = useRef<TimerState>(load(sessionId, initialBanked));
  const [seconds, setSeconds] = useState<number>(() => elapsed(stateRef.current));
  const [running, setRunning] = useState<boolean>(stateRef.current.runningSince != null);

  const write = useCallback(
    (next: TimerState) => {
      stateRef.current = next;
      persist(sessionId, next);
      setSeconds(elapsed(next));
      setRunning(next.runningSince != null);
    },
    [sessionId],
  );

  // Tick once per second while running. We recompute from the wall-clock anchor
  // rather than incrementing a counter, so throttled/background tabs stay accurate.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds(elapsed(stateRef.current));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    if (stateRef.current.runningSince != null) return;
    write({ banked: stateRef.current.banked, runningSince: Date.now() });
  }, [write]);

  const pause = useCallback(() => {
    write({ banked: elapsed(stateRef.current), runningSince: null });
  }, [write]);

  const finalize = useCallback(() => {
    const total = elapsed(stateRef.current);
    write({ banked: total, runningSince: null });
    return total;
  }, [write]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(KEY(sessionId));
    } catch {
      // ignore
    }
  }, [sessionId]);

  return { seconds, running, start, pause, finalize, clear };
}
