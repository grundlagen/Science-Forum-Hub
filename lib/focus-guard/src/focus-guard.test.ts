import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateHealth,
  buildNudge,
  deriveAnchor,
  detectSignals,
  evaluate,
  measureDrift,
  scoreEngagement,
  type Contribution,
  type FocusAnchor,
} from "./index";

const PAPER = {
  title: "Sleep deprivation impairs hippocampal memory consolidation in rats",
  abstract:
    "We show that 24 hours of sleep deprivation reduces hippocampal memory consolidation in rats. We measured spatial memory using the Morris water maze across 40 participants and found a significant deficit (p < 0.01).",
  fields: ["neuroscience", "memory"],
};

const ANCHOR: FocusAnchor = deriveAnchor(PAPER);

test("deriveAnchor extracts a claim, key terms, and an empirical claim type", () => {
  assert.ok(ANCHOR.centralClaim.toLowerCase().includes("sleep deprivation"));
  assert.equal(ANCHOR.claimType, "empirical");
  assert.ok(ANCHOR.keyTerms.length > 0);
  // Field terms are always retained.
  assert.ok(ANCHOR.inScope.includes("neuroscience"));
  const stems = ANCHOR.keyTerms.join(" ");
  assert.ok(/memor|hippocamp|sleep/.test(stems));
});

test("measureDrift: on-topic critique has low drift, off-topic has high", () => {
  const onTopic =
    "The hippocampal memory deficit is plausible, but the sleep deprivation protocol may confound stress with memory consolidation.";
  const offTopic =
    "I really enjoyed the conference in Vienna last spring; the coffee there is wonderful and the trains run on time.";

  const a = measureDrift(onTopic, ANCHOR);
  const b = measureDrift(offTopic, ANCHOR);

  assert.ok(a.topicalDrift < 0.6, `on-topic drift ${a.topicalDrift}`);
  assert.ok(b.topicalDrift > 0.8, `off-topic drift ${b.topicalDrift}`);
  assert.ok(a.topicalDrift < b.topicalDrift);
});

test("measureDrift: empty / contentless text is maximally drifted", () => {
  assert.equal(measureDrift("", ANCHOR).topicalDrift, 1);
  assert.equal(measureDrift("!!!", ANCHOR).topicalDrift, 1);
});

test("scoreEngagement rewards evidence and reasoning over bare assertion", () => {
  const substantive =
    "The effect is likely real because the sample size (n = 40) gives adequate power, and Figure 2 shows the deficit replicates.";
  const empty = "This is bad.";
  assert.ok(scoreEngagement(substantive) > scoreEngagement(empty));
  assert.ok(scoreEngagement("Nice!") <= 0.1);
});

test("detectSignals: ad hominem is caught", () => {
  const c: Contribution = {
    kind: "review",
    text: "The authors clearly don't understand statistics; this is amateur work.",
    stance: "reject",
  };
  const signals = detectSignals(c);
  assert.ok(signals.some((s) => s.code === "ad_hominem"));
});

test("detectSignals: vagueness is suppressed when the critique is grounded", () => {
  const vague = detectSignals({
    kind: "comment",
    text: "This is weak and unconvincing.",
  });
  const grounded = detectSignals({
    kind: "comment",
    text: "This is unconvincing because the control group is missing, so the effect could be regression to the mean.",
  });
  assert.ok(vague.some((s) => s.code === "vagueness"));
  assert.ok(!grounded.some((s) => s.code === "vagueness"));
});

test("detectSignals: overrides can add and suppress", () => {
  const base = detectSignals({
    kind: "comment",
    text: "what about other papers?",
  });
  assert.ok(base.some((s) => s.code === "whataboutism"));

  const suppressed = detectSignals(
    { kind: "comment", text: "what about other papers?" },
    { suppress: ["whataboutism"] },
  );
  assert.ok(!suppressed.some((s) => s.code === "whataboutism"));
});

test("evaluate: substantive on-topic review stays quiet (no nudge)", () => {
  const c: Contribution = {
    kind: "review",
    text: "The hippocampal memory deficit after sleep deprivation is convincing because the Morris water maze data show a clear effect, though I would like to see the stress hormone controls.",
    stance: "endorse",
  };
  const r = evaluate(c, ANCHOR);
  assert.equal(r.onFocus, true);
  assert.equal(r.verdict, "on_focus");
  assert.equal(r.interventionLevel, "none");
  assert.equal(r.nudge, null);
});

test("evaluate: hostile / ad hominem review triggers a reframe invitation", () => {
  const c: Contribution = {
    kind: "review",
    text: "This is absolute garbage!! The authors clearly don't understand memory research at all. Ridiculous.",
    stance: "reject",
  };
  const r = evaluate(c, ANCHOR);
  assert.equal(r.interventionLevel, "reframe");
  assert.ok(r.nudge);
  assert.ok(
    ["hostility", "ad_hominem"].includes(r.nudge!.rationaleCode as string),
  );
  // Never controlling: the nudge invites, it does not command.
  assert.match(r.nudge!.message, /want to|consider|might|could|usually/i);
});

test("evaluate: off-topic comment drifts and gets a topical nudge", () => {
  const c: Contribution = {
    kind: "comment",
    text: "Has anyone tried the new espresso place near the train station in Vienna? Lovely atmosphere and great pastries.",
  };
  const r = evaluate(c, ANCHOR);
  assert.ok(r.driftScore >= 0.5, `drift ${r.driftScore}`);
  assert.notEqual(r.interventionLevel, "none");
  assert.ok(r.nudge);
  // Topical nudge surfaces the actual claim so the user sees the target.
  if (r.nudge!.rationaleCode === "topical_drift") {
    assert.match(r.nudge!.message, /claim under review/i);
  }
});

test("evaluate: scope creep raises drift even when partly on-topic", () => {
  const c: Contribution = {
    kind: "comment",
    text: "Forget the memory results — the real issue is whether sleep research deserves funding at all, which is a much bigger question.",
  };
  const r = evaluate(c, ANCHOR);
  assert.ok(r.signals.some((s) => s.code === "scope_creep"));
  assert.notEqual(r.interventionLevel, "none");
});

test("evaluate: short pleasantry is not nagged", () => {
  const r = evaluate({ kind: "comment", text: "Nice work!" }, ANCHOR);
  assert.equal(r.interventionLevel, "none");
});

test("buildNudge: 'none' yields null; others carry citations", () => {
  assert.equal(buildNudge("none", "topical_drift"), null);
  const n = buildNudge("nudge", "scope_creep", ANCHOR);
  assert.ok(n);
  assert.ok(n!.citations.length > 0);
});

test("aggregateHealth: healthy thread scores high, hostile thread low", () => {
  const good = [
    "The Morris water maze data convincingly show a hippocampal memory deficit because the effect size is large.",
    "I agree the sleep deprivation effect is real, though the stress controls in memory consolidation need work.",
  ].map((t) =>
    evaluate({ kind: "review", text: t, stance: "endorse" }, ANCHOR),
  );

  const bad = [
    "This is garbage!! The authors are clearly incompetent amateurs. Ridiculous.",
    "What about the coffee in Vienna though? Totally unrelated but I loved it.",
  ].map((t) => evaluate({ kind: "comment", text: t }, ANCHOR));

  const healthy = aggregateHealth(good);
  const fragmented = aggregateHealth(bad);

  assert.ok(healthy.healthScore > fragmented.healthScore);
  assert.equal(healthy.band, "healthy");
  assert.ok(fragmented.healthScore < 70);
  assert.ok(fragmented.topDistractions.length > 0);
});

test("aggregateHealth: empty thread is healthy by default", () => {
  const h = aggregateHealth([]);
  assert.equal(h.contributions, 0);
  assert.equal(h.band, "healthy");
  assert.equal(h.healthScore, 100);
});
