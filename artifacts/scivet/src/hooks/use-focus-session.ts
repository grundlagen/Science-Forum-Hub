import { useCallback, useEffect, useRef, useState } from "react";
import {
  useHeartbeatFocusSession,
  useLogFocusEvent,
  useCompleteFocusSession,
  useAbandonFocusSession,
  type FocusSession,
  type FocusCompleteResult,
} from "@workspace/api-client-react";

/**
 * FocusGuard timer engine.
 *
 * Drives a live deep-focus session: ticks focused time, periodically reports it
 * to the server (so a refresh or device handoff resumes cleanly), logs
 * distractions, and manages the work→break cadence behind whatever technique the
 * session was started with. UI is intentionally kept in the components.
 *
 * Design choices grounded in the psychology of attention:
 *  - focused time only accrues while the work phase is *running* (honest signal);
 *  - distractions are logged, not blocked — naming the urge is the intervention;
 *  - breaks are first-class (Attention Restoration Theory), not stolen time.
 */

const HEARTBEAT_SECONDS = 15;

export type FocusPhase = "focus" | "break";

export function useFocusSession(
  session: FocusSession,
  opts: { onCompleted?: (result: FocusCompleteResult) => void } = {},
) {
  const plannedSeconds = session.plannedMinutes * 60;
  const breakSeconds = session.breakMinutes * 60;

  const [focusedSeconds, setFocusedSeconds] = useState(session.focusedSeconds);
  const [phase, setPhase] = useState<FocusPhase>("focus");
  const [isRunning, setIsRunning] = useState(session.status === "active");
  const [breakRemaining, setBreakRemaining] = useState(breakSeconds);
  const [distractionCount, setDistractionCount] = useState(session.distractionCount);
  const [reachedGoal, setReachedGoal] = useState(session.focusedSeconds >= plannedSeconds);

  const heartbeat = useHeartbeatFocusSession();
  const logEvent = useLogFocusEvent();
  const completeMut = useCompleteFocusSession();
  const abandonMut = useAbandonFocusSession();

  // Keep the latest focused count available to the unmount/heartbeat closures
  // without forcing those callbacks to re-create every tick.
  const focusedRef = useRef(focusedSeconds);
  focusedRef.current = focusedSeconds;
  const lastBeatRef = useRef(session.focusedSeconds);

  const sendHeartbeat = useCallback(
    (status?: FocusSession["status"]) => {
      lastBeatRef.current = focusedRef.current;
      heartbeat.mutate({
        id: session.id,
        data: { focusedSeconds: focusedRef.current, ...(status ? { status } : {}) },
      });
    },
    [heartbeat, session.id],
  );

  // The 1-second tick. Only the work phase accrues focused time.
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      if (phase === "focus") {
        setFocusedSeconds((s) => {
          const next = s + 1;
          if (next >= plannedSeconds) setReachedGoal(true);
          if (next - lastBeatRef.current >= HEARTBEAT_SECONDS) sendHeartbeat();
          return next;
        });
      } else {
        setBreakRemaining((r) => Math.max(0, r - 1));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, phase, plannedSeconds, sendHeartbeat]);

  // Best-effort flush on unmount so progress is never silently lost.
  useEffect(() => {
    return () => {
      if (focusedRef.current !== lastBeatRef.current) {
        heartbeat.mutate({ id: session.id, data: { focusedSeconds: focusedRef.current } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
    logEvent.mutate({ id: session.id, data: { kind: "pause" } });
    sendHeartbeat("paused");
  }, [logEvent, sendHeartbeat, session.id]);

  const resume = useCallback(() => {
    setIsRunning(true);
    logEvent.mutate({ id: session.id, data: { kind: "resume" } });
    sendHeartbeat("active");
  }, [logEvent, sendHeartbeat, session.id]);

  const logDistraction = useCallback(
    (note?: string) => {
      setDistractionCount((c) => c + 1);
      logEvent.mutate({ id: session.id, data: { kind: "distraction", note: note ?? null } });
    },
    [logEvent, session.id],
  );

  const startBreak = useCallback(() => {
    setPhase("break");
    setBreakRemaining(breakSeconds);
    setIsRunning(true);
    logEvent.mutate({ id: session.id, data: { kind: "break_start" } });
    sendHeartbeat("active");
  }, [breakSeconds, logEvent, sendHeartbeat, session.id]);

  const endBreak = useCallback(() => {
    setPhase("focus");
    logEvent.mutate({ id: session.id, data: { kind: "break_end" } });
  }, [logEvent, session.id]);

  const complete = useCallback(
    (reflection: { focusRating?: number | null; flowRating?: number | null; reflection?: string | null }) => {
      setIsRunning(false);
      completeMut.mutate(
        {
          id: session.id,
          data: {
            focusedSeconds: focusedRef.current,
            focusRating: reflection.focusRating ?? null,
            flowRating: reflection.flowRating ?? null,
            reflection: reflection.reflection ?? null,
          },
        },
        { onSuccess: (result) => opts.onCompleted?.(result) },
      );
    },
    [completeMut, opts, session.id],
  );

  const abandon = useCallback(
    (onDone?: () => void) => {
      setIsRunning(false);
      abandonMut.mutate({ id: session.id }, { onSuccess: () => onDone?.() });
    },
    [abandonMut, session.id],
  );

  return {
    focusedSeconds,
    plannedSeconds,
    phase,
    isRunning,
    breakRemaining,
    distractionCount,
    reachedGoal,
    isCompleting: completeMut.isPending,
    isAbandoning: abandonMut.isPending,
    pause,
    resume,
    logDistraction,
    startBreak,
    endBreak,
    complete,
    abandon,
  };
}
