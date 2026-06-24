import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusSession, FocusPreferences } from "@workspace/api-client-react";
import { getTechnique } from "@/lib/focus-config";

const HEARTBEAT_MS = 15_000;
const MIN_FLOW_BREAK_SECONDS = 60;

export type Phase = "focus" | "break";

export interface FocusTimer {
  phase: Phase;
  paused: boolean;
  /** Total focused seconds this session (server base + this run). */
  elapsedFocus: number;
  /** The number to render on the ring (counts down, or up for flowmodoro). */
  phaseClock: number;
  /** 0..1 fill for the ring. */
  phaseProgress: number;
  /** Completed focus blocks this run. */
  cycle: number;
  /** True once a countdown focus block (incl. single timebox) hits its target. */
  goalReached: boolean;
  togglePause: () => void;
  takeBreak: () => void;
  endBreak: () => void;
}

interface TimerState {
  phase: Phase;
  phaseElapsed: number; // seconds in the current phase
  blockFocus: number; // focus seconds in the current focus block
  breakLength: number; // seconds for the current break
  cycle: number; // completed focus blocks this run
  elapsedFocus: number; // total focused seconds (base + run)
}

interface Hooks {
  onHeartbeat: (addSeconds: number) => void;
  onBreaksChange: (totalBreaks: number) => void;
}

/**
 * Drives a live focus session: ticks the clock, schedules technique-appropriate
 * breaks, and periodically syncs focused time to the server. Side effects
 * (heartbeats, break counts) are kept out of the state updater and run from
 * effects reading mirrored refs, so the per-second updater stays pure.
 */
export function useFocusSession(
  session: FocusSession,
  prefs: FocusPreferences,
  hooks: Hooks,
): FocusTimer {
  const preset = getTechnique(session.technique);
  const countsUp = preset.countsUp;
  const hasBreaks = preset.hasBreaks;

  const focusLen =
    (session.technique === "timeboxed"
      ? session.plannedMinutes
      : prefs.focusMinutes) * 60;
  const shortBreak = prefs.breakMinutes * 60;
  const longBreak = prefs.longBreakMinutes * 60;
  const cyclesBeforeLong = prefs.cyclesBeforeLongBreak;
  const flowTargetSeconds = prefs.focusMinutes * 60;

  const [state, setState] = useState<TimerState>(() => ({
    phase: "focus",
    phaseElapsed: 0,
    blockFocus: 0,
    breakLength: shortBreak,
    cycle: 0,
    elapsedFocus: session.focusSeconds,
  }));
  const [paused, setPaused] = useState(false);

  // Refs mirror the latest values for use inside long-lived interval closures.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const elapsedRef = useRef(state.elapsedFocus);
  elapsedRef.current = state.elapsedFocus;

  const baseBreaks = useRef(session.breaksTaken).current;
  const lastSyncedRef = useRef(session.focusSeconds);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  const breakLengthFor = useCallback(
    (nextCycle: number): number =>
      nextCycle % cyclesBeforeLong === 0 ? longBreak : shortBreak,
    [cyclesBeforeLong, longBreak, shortBreak],
  );

  // --- the 1s tick ---------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setState((prev) => {
        if (prev.phase === "break") {
          const phaseElapsed = prev.phaseElapsed + 1;
          if (phaseElapsed >= prev.breakLength) {
            return { ...prev, phase: "focus", phaseElapsed: 0, blockFocus: 0 };
          }
          return { ...prev, phaseElapsed };
        }

        // focus phase
        const elapsedFocus = prev.elapsedFocus + 1;
        const phaseElapsed = prev.phaseElapsed + 1;
        const blockFocus = prev.blockFocus + 1;

        // Countdown techniques with auto-breaks roll into a break at the target.
        if (!countsUp && hasBreaks && phaseElapsed >= focusLen) {
          const cycle = prev.cycle + 1;
          return {
            phase: "break",
            phaseElapsed: 0,
            blockFocus: 0,
            breakLength: breakLengthFor(cycle),
            cycle,
            elapsedFocus,
          };
        }

        // Timeboxed / flowmodoro keep counting; transitions are user-driven.
        return { ...prev, elapsedFocus, phaseElapsed, blockFocus };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countsUp, hasBreaks, focusLen, breakLengthFor]);

  // --- heartbeat sync ------------------------------------------------------
  const flush = useCallback(() => {
    const delta = elapsedRef.current - lastSyncedRef.current;
    if (delta > 0) {
      hooksRef.current.onHeartbeat(delta);
      lastSyncedRef.current = elapsedRef.current;
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) flush();
    }, HEARTBEAT_MS);
    return () => {
      flush();
      clearInterval(id);
    };
  }, [flush]);

  // --- break-count sync ----------------------------------------------------
  const prevCycleRef = useRef(state.cycle);
  useEffect(() => {
    if (state.cycle !== prevCycleRef.current) {
      prevCycleRef.current = state.cycle;
      hooksRef.current.onBreaksChange(baseBreaks + state.cycle);
    }
  }, [state.cycle, baseBreaks]);

  // --- user actions --------------------------------------------------------
  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      if (next) flush(); // sync immediately when pausing
      return next;
    });
  }, [flush]);

  const takeBreak = useCallback(() => {
    flush();
    setState((prev) => {
      if (prev.phase === "break") return prev;
      const cycle = prev.cycle + 1;
      const length = countsUp
        ? Math.max(MIN_FLOW_BREAK_SECONDS, Math.round(prev.blockFocus / 5))
        : breakLengthFor(cycle);
      return {
        ...prev,
        phase: "break",
        phaseElapsed: 0,
        blockFocus: 0,
        breakLength: length,
        cycle,
      };
    });
  }, [countsUp, breakLengthFor, flush]);

  const endBreak = useCallback(() => {
    setState((prev) =>
      prev.phase === "break"
        ? { ...prev, phase: "focus", phaseElapsed: 0, blockFocus: 0 }
        : prev,
    );
  }, []);

  // --- derived display values ---------------------------------------------
  let phaseClock: number;
  let phaseProgress: number;
  let goalReached = false;

  if (state.phase === "break") {
    phaseClock = Math.max(0, state.breakLength - state.phaseElapsed);
    phaseProgress =
      state.breakLength > 0 ? state.phaseElapsed / state.breakLength : 1;
  } else if (countsUp) {
    phaseClock = state.blockFocus;
    phaseProgress =
      flowTargetSeconds > 0
        ? Math.min(1, state.blockFocus / flowTargetSeconds)
        : 0;
  } else {
    const remaining = focusLen - state.phaseElapsed;
    goalReached = remaining <= 0;
    phaseClock = Math.max(0, remaining);
    phaseProgress = focusLen > 0 ? Math.min(1, state.phaseElapsed / focusLen) : 1;
  }

  return {
    phase: state.phase,
    paused,
    elapsedFocus: state.elapsedFocus,
    phaseClock,
    phaseProgress,
    cycle: state.cycle,
    goalReached,
    togglePause,
    takeBreak,
    endBreak,
  };
}
