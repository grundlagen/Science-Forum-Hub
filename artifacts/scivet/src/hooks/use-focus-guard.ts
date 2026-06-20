import { useCallback, useEffect, useRef, useState } from "react";
import {
  endSession as endSessionApi,
  getGuard,
  heartbeat,
  startSession,
  takeBreak as takeBreakApi,
  type FocusIntent,
  type GuardState,
} from "@/lib/focus-guard-client";

const IDLE_THRESHOLD_MS = 30_000;
const TICK_MS = 1_000;
const HEARTBEAT_EVERY_TICKS = 10; // ~10s
const GUARD_REFRESH_EVERY_TICKS = 15; // ~15s

export interface UseFocusGuard {
  /** Session has been created and signals are being tracked. */
  ready: boolean;
  /** Live engaged (active, non-idle) seconds this session. */
  engagedSec: number;
  /** Live deepest scroll fraction reached, 0..1. */
  scrollDepth: number;
  /** Latest server-computed guard state, or null until first fetch. */
  guard: GuardState | null;
  /** Record a deliberate restorative break and refresh guard state. */
  takeBreak: () => Promise<void>;
  /** Force an immediate guard-state refresh (e.g. just before reviewing). */
  refresh: () => void;
}

/**
 * Track a user's attention on a paper: accumulate active vs. idle time, scroll
 * coverage and context-switches, stream them to the server as heartbeats, and
 * surface the server's guard verdict. All scoring lives on the server; this hook
 * only measures and reports.
 */
export function useFocusGuard(
  paperId: number,
  intent: FocusIntent,
  enabled = true,
): UseFocusGuard {
  const [ready, setReady] = useState(false);
  const [engagedSec, setEngagedSec] = useState(0);
  const [scrollDepth, setScrollDepth] = useState(0);
  const [guard, setGuard] = useState<GuardState | null>(null);

  const sessionIdRef = useRef<number | null>(null);
  const activeMsRef = useRef(0);
  const idleMsRef = useRef(0);
  const scrollDepthRef = useRef(0);
  const distractionRef = useRef(0);
  const breaksRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const lastTickRef = useRef(Date.now());

  const refresh = useCallback(() => {
    if (!paperId) return;
    getGuard(paperId)
      .then(setGuard)
      .catch(() => {});
  }, [paperId]);

  const takeBreak = useCallback(async () => {
    breaksRef.current += 1;
    lastActivityRef.current = Date.now();
    try {
      await takeBreakApi();
    } catch {
      /* advisory; ignore */
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !paperId || Number.isNaN(paperId)) return;
    let cancelled = false;
    let tickCount = 0;

    // reset accumulators for a fresh session
    activeMsRef.current = 0;
    idleMsRef.current = 0;
    scrollDepthRef.current = 0;
    distractionRef.current = 0;
    breaksRef.current = 0;
    lastActivityRef.current = Date.now();
    lastTickRef.current = Date.now();

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const updateScroll = () => {
      const doc = document.documentElement;
      const viewportBottom = window.scrollY + window.innerHeight;
      const full = Math.max(doc.scrollHeight, 1);
      const depth = Math.min(1, viewportBottom / full);
      if (depth > scrollDepthRef.current) {
        scrollDepthRef.current = depth;
        setScrollDepth(depth);
      }
      markActivity();
    };
    const onVisibility = () => {
      if (document.hidden) distractionRef.current += 1;
      else markActivity();
    };

    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("mousemove", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("pointerdown", markActivity);
    document.addEventListener("visibilitychange", onVisibility);

    const sendHeartbeat = () => {
      const id = sessionIdRef.current;
      if (id == null) return;
      heartbeat(id, {
        activeMs: Math.floor(activeMsRef.current),
        idleMs: Math.floor(idleMsRef.current),
        scrollDepth: scrollDepthRef.current,
        distractionEvents: distractionRef.current,
        breaksTaken: breaksRef.current,
      }).catch(() => {});
    };

    const tick = () => {
      const now = Date.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      const idle = document.hidden || now - lastActivityRef.current > IDLE_THRESHOLD_MS;
      if (idle) idleMsRef.current += dt;
      else activeMsRef.current += dt;
      setEngagedSec(Math.floor(activeMsRef.current / 1000));

      tickCount += 1;
      if (sessionIdRef.current != null && tickCount % HEARTBEAT_EVERY_TICKS === 0) {
        sendHeartbeat();
      }
      if (sessionIdRef.current != null && tickCount % GUARD_REFRESH_EVERY_TICKS === 0) {
        refresh();
      }
    };
    const ticker = window.setInterval(tick, TICK_MS);

    startSession(paperId, intent)
      .then((s) => {
        if (cancelled) {
          // unmounted before the session resolved — close it immediately
          endSessionApi(s.id, true);
          return;
        }
        sessionIdRef.current = s.id;
        setReady(true);
        refresh();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.clearInterval(ticker);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      const id = sessionIdRef.current;
      if (id != null) {
        // flush final signals, then end
        heartbeat(id, {
          activeMs: Math.floor(activeMsRef.current),
          idleMs: Math.floor(idleMsRef.current),
          scrollDepth: scrollDepthRef.current,
          distractionEvents: distractionRef.current,
          breaksTaken: breaksRef.current,
        }).finally(() => endSessionApi(id));
        sessionIdRef.current = null;
      }
      setReady(false);
    };
  }, [enabled, paperId, intent, refresh]);

  return { ready, engagedSec, scrollDepth, guard, takeBreak, refresh };
}
