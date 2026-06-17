/**
 * Executable specification for the Focus Guard engine.
 *
 * A pure battery of invariants — no clock, no console, no process — that
 * encodes the *expected psychology* as assertions and returns structured
 * results. Because the engine is deterministic, these double as regression
 * tests: a thin runner (see test/run.ts) prints them, and any harness can call
 * `selfCheck()` and assert `failed === 0`.
 *
 * Future routines: add cases here when you add behaviour. This file is the
 * living contract for what Focus Guard promises.
 */
import { circadianLoad } from "./engine/circadian";
import { assessFatigue } from "./engine/fatigue";
import { assessFocus } from "./engine/assess";
import type { FocusSession, PaperEngagement } from "./types";

export interface SelfCheckResult {
  passed: number;
  failed: number;
  failures: { name: string; detail: string }[];
}

const MIN = 60_000;
const T0 = 1_000_000_000_000;

function session(over: Partial<FocusSession> = {}): FocusSession {
  return {
    startedAt: T0,
    reviewsCompleted: 0,
    breaksTaken: 0,
    lastBreakEndedAt: null,
    lastPaperClosedAt: null,
    ...over,
  };
}

function paper(over: Partial<PaperEngagement> = {}): PaperEngagement {
  return {
    paperId: 1,
    openedAt: T0,
    wordCount: 4000,
    scrollCoverage: 0.2,
    dwellMs: 5_000,
    stanceCommitted: false,
    ...over,
  };
}

export function selfCheck(): SelfCheckResult {
  const failures: { name: string; detail: string }[] = [];
  let passed = 0;

  const ok = (name: string, cond: boolean, detail: unknown = "") => {
    if (cond) passed++;
    else failures.push({ name, detail: JSON.stringify(detail) });
  };

  // Fatigue — fresh start.
  const fresh = assessFatigue(session(), T0, { localHour: 10 });
  ok("fresh reviewer is in the 'fresh' band", fresh.band === "fresh", fresh);
  ok("fresh reviewer keeps high verdict trust", fresh.verdictTrust > 0.85, fresh.verdictTrust);

  // Fatigue — depletion late at night after a long, busy sitting.
  const depleted = assessFatigue(session({ reviewsCompleted: 9 }), T0 + 120 * MIN, { localHour: 2.5 });
  ok("long busy night sitting is 'depleted'", depleted.band === "depleted", depleted);
  ok("depletion recommends a break", depleted.recommendBreak, depleted);
  ok("verdict trust never falls below the floor", depleted.verdictTrust >= 0.4, depleted.verdictTrust);

  // Fatigue — breaks aid recovery.
  const noBreak = assessFatigue(session({ reviewsCompleted: 6 }), T0 + 80 * MIN);
  const withBreak = assessFatigue(
    session({ reviewsCompleted: 6, breaksTaken: 2, lastBreakEndedAt: T0 + 75 * MIN }),
    T0 + 80 * MIN,
  );
  ok("breaks reduce fatigue", withBreak.score < noBreak.score, { noBreak: noBreak.score, withBreak: withBreak.score });

  // Circadian troughs.
  ok("nocturnal trough is worse than mid-morning", circadianLoad(2.5) > circadianLoad(10));
  ok("post-lunch dip exceeds late morning", circadianLoad(14.5) > circadianLoad(10.5));

  // Blind-First guard.
  const preCommit = assessFocus({ now: T0 + 10_000, session: session(), engagement: paper() });
  ok("all signals hidden before an independent stance", preCommit.blind.hidden.length === 4, preCommit.blind);
  ok("verdict is blocked while the paper is unread", !preCommit.canCommitVerdict, preCommit.blockers);

  const postCommit = assessFocus({
    now: T0 + 11 * MIN,
    session: session(),
    engagement: paper({ stanceCommitted: true, scrollCoverage: 0.9, dwellMs: 10 * MIN }),
  });
  ok("all signals revealed once a stance is committed", postCommit.blind.revealed.length === 4, postCommit.blind);
  ok("verdict unlocks once read & committed", postCommit.canCommitVerdict, postCommit.blockers);

  // Reading commitment — short papers still demand the dwell floor.
  const shortRead = assessFocus({
    now: T0 + 11_000,
    session: session(),
    engagement: paper({ wordCount: 50, scrollCoverage: 1, dwellMs: 10_000 }),
  });
  ok("short paper still enforces the 45s dwell floor", shortRead.reading.requiredDwellMs === 45_000, shortRead.reading);
  ok("short paper verdict stays locked under the floor", !shortRead.reading.unlocked, shortRead.reading);

  // Residue cooldown.
  const closed = session({ reviewsCompleted: 1, lastPaperClosedAt: T0 + 5_000 });
  const duringResidue = assessFocus({
    now: T0 + 10_000,
    session: closed,
    engagement: paper({ stanceCommitted: true, scrollCoverage: 0.9, dwellMs: 10 * MIN }),
  });
  ok("residue blocks a verdict right after a close", !duringResidue.residue.clean, duringResidue.residue);
  const afterResidue = assessFocus({
    now: T0 + 30_000,
    session: closed,
    engagement: paper({ stanceCommitted: true, scrollCoverage: 0.9, dwellMs: 10 * MIN }),
  });
  ok("residue clears after the cooldown", afterResidue.residue.clean, afterResidue.residue);

  // Flow protection.
  const inFlow = assessFocus({ now: T0 + 30 * MIN, session: session({ reviewsCompleted: 1 }), engagement: paper({ dwellMs: 1_000 }) });
  ok("sustained focus is the 'flow' state", inFlow.flow.state === "flow", inFlow.flow);
  ok("flow suppresses all non-urgent nudges", inFlow.nudges.every((n) => n.severity === "urgent"), inFlow.nudges);

  // Ultradian break.
  const overdue = assessFocus({ now: T0 + 110 * MIN, session: session({ reviewsCompleted: 1 }), engagement: null });
  ok("focus past the ultradian boundary is 'break_due'", overdue.flow.state === "break_due", overdue.flow);
  ok("an urgent break nudge fires when overdue", overdue.nudges.some((n) => n.id === "flow.break_due"), overdue.nudges);

  // Opt-out.
  const optOut = assessFocus({
    now: T0 + 10_000,
    session: session(),
    engagement: paper(),
    guardsEnabled: { reading: false, blind: false },
  });
  ok("disabling reading unlocks the verdict", optOut.reading.unlocked, optOut.reading);
  ok("disabling blind reveals all signals", optOut.blind.revealed.length === 4, optOut.blind);

  return { passed, failed: failures.length, failures };
}
