# The psychology behind Focus Guard

Focus Guard is not a content filter with a thesaurus of bad words. Every design
decision traces back to a finding about how human attention, reasoning, and
motivation actually work. This document is the "why". The "what" lives in
`lib/focus-guard/src/biases.ts` (the registry) and the code comments.

The thesis in one line: **the enemy of good scientific discourse is not malice,
it is drift** — of attention, of reasoning, and of tone — and drift responds far
better to a well-timed, autonomy-preserving nudge than to a wall.

---

## 1. Why an _anchor_ at all — attention is selective and leaky

Human attention is a bottleneck. Broadbent's filter model and Posner's work on
attentional networks describe attention as a limited resource that must be
_directed_ and that decays without an explicit target. A discussion thread is a
collective attention system with the same property: without a shared, salient
target it diffuses toward whatever is most available (see §4).

**Design consequence.** Focus Guard makes the target explicit and persistent: a
`FocusAnchor` — the paper's single central claim plus its key constructs.
Everything is measured _relative to the anchor_, not in the abstract.

- Broadbent, D. (1958). _Perception and Communication._
- Posner, M. I. & Petersen, S. E. (1990). The attention system of the human
  brain. _Annual Review of Neuroscience._

## 2. Why nudge, never block — autonomy and reactance

Two robust findings shape the intervention model:

- **Nudge theory / libertarian paternalism** (Thaler & Sunstein, 2008): you can
  improve decisions by _shaping choices_ while leaving all options open. The
  moment you remove an option, you stop nudging and start coercing.
- **Self-Determination Theory** (Deci & Ryan, 2000): controlling language
  ("you must", "not allowed") undermines intrinsic motivation and internalisation;
  autonomy-supportive language ("you might consider…") increases it. Psychological
  **reactance** (Brehm, 1966) predicts that heavy-handed correction produces the
  opposite of the intended behaviour.

**Design consequence.** `InterventionLevel` tops out at `reframe` — an
_invitation_, never a block. Nudge copy is written in the second person,
presupposes competence and good faith, and offers rather than commands. The
tests assert the copy contains offering language ("consider", "might", "want
to") — coercive phrasing is a test failure.

## 3. Why nudges are short and singular — cognitive load

Sweller's Cognitive Load Theory (1988) distinguishes _germane_ load (useful) from
_extraneous_ load (noise). A long, multi-part correction adds extraneous load at
exactly the moment the user is trying to do something else, and follow-through
collapses. Gollwitzer's **implementation intentions** (1999) show that brief
"when X, then Y" plans transfer intentions into action far more reliably than
vague goals.

**Design consequence.** Every nudge is one ask, phrased where natural as
"when you…, it can help to…". No essays.

## 4. The bias registry — the recognised failure modes

Each entry in `biases.ts` is a documented way attention/reasoning/tone drifts,
with the literature that justifies treating it as a _focus_ hazard.

| Code                  | Mechanism                                                                                            | Key source                     |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `confirmation_bias`   | Seeking/weighting only confirming evidence; suppresses the disconfirmation review exists to provide. | Nickerson (1998); Wason (1960) |
| `motivated_reasoning` | Directional goals drive conclusion-first processing.                                                 | Kunda (1990)                   |
| `anchoring`           | One early figure drags the whole judgement.                                                          | Tversky & Kahneman (1974)      |
| `availability`        | Ease of recall mistaken for frequency; vivid anecdote beats base rate.                               | Tversky & Kahneman (1973)      |
| `halo_effect`         | A global impression (prestige) bleeds into specific judgements.                                      | Thorndike (1920)               |
| `ad_hominem`          | Attacking the source short-circuits evaluation of the argument.                                      | Walton (1998); Toulmin (1958)  |
| `straw_man`           | Refuting a distorted, weaker claim.                                                                  | Walton (1996)                  |
| `whataboutism`        | Tu quoque deflection relocates scrutiny off the claim.                                               | Walton (1998)                  |
| `scope_creep`         | Diffuse goals degrade performance; the specific target is lost.                                      | Locke & Latham (2002)          |
| `bikeshedding`        | Over-investment in trivial, accessible details.                                                      | Parkinson (1957)               |
| `vagueness`           | Non-falsifiable critique carries no information for revision.                                        | Popper (1959)                  |
| `hostility`           | Hostile affect narrows attention to threat and invites reciprocity.                                  | Gross (1998)                   |

These cluster into the `SignalFamily` taxonomy used throughout the engine:

- **cognitive_bias** — reasoning errors (confirmation, anchoring, …).
- **rhetorical_drift** — moves that pull _off the claim_ (scope creep, straw
  man, whataboutism, ad hominem). These, and only these, inflate the drift score.
- **epistemic_hygiene** — low-information contributions (bikeshedding, vagueness).
- **affect** — tone (hostility).

## 5. Why topic, reasoning, and tone are scored separately

A common mistake is to collapse "off-topic", "biased", and "rude" into one
"bad" score. They are different constructs with different remedies:

- A **hostile but on-topic** review (`driftScore` low, `hostility` high) needs a
  _reframe_, not a "stay on topic" note.
- A **polite but off-topic** comment needs a topical nudge that _shows the
  claim_, so the user sees the target they missed (goal specificity, §2/§1).

**Design consequence.** `evaluate()` keeps drift (topical + rhetorical) distinct
from tone/affect and reasoning bias. Tone problems take priority for the
intervention because an un-rephrased caustic comment suppresses others'
participation out of proportion to its topicality.

## 6. Why we reward evidence and calibrated hedging — argumentation & humility

Toulmin's argument model (1958) distinguishes _claims_ from the _grounds_ and
_warrants_ that support them. Contributions that include grounds (data, citations,
"because") do epistemic work; bare claims do not. Separately, well-calibrated
experts **hedge** ("may", "suggests") rather than asserting certainty
(epistemic humility; cf. overconfidence literature). The `engagementScore`
rewards grounds and gives a small bonus for calibrated hedging.

## 7. Why high precision matters — alarm fatigue

In signal-detection terms, a false alarm is not free: an automated coach that
nudges too often is learned-to-be-ignored (the literature on alert/alarm fatigue
in clinical decision support is unambiguous here). Focus Guard therefore tunes
its lexical markers for **precision over recall**, suppresses `vagueness` when a
critique is actually grounded, and stays silent on short, problem-free remarks.

---

## Full references

- Brehm, J. W. (1966). _A Theory of Psychological Reactance._
- Broadbent, D. (1958). _Perception and Communication._
- Deci, E. L., & Ryan, R. M. (2000). The "what" and "why" of goal pursuits:
  self-determination theory. _Psychological Inquiry._
- Gollwitzer, P. M. (1999). Implementation intentions. _American Psychologist._
- Gross, J. J. (1998). The emerging field of emotion regulation. _Review of
  General Psychology._
- Kunda, Z. (1990). The case for motivated reasoning. _Psychological Bulletin._
- Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of
  goal setting and task motivation. _American Psychologist._
- Nickerson, R. S. (1998). Confirmation bias. _Review of General Psychology._
- Parkinson, C. N. (1957). _Parkinson's Law_ (the law of triviality).
- Popper, K. (1959). _The Logic of Scientific Discovery._
- Posner, M. I., & Petersen, S. E. (1990). The attention system of the human
  brain. _Annual Review of Neuroscience._
- Sweller, J. (1988). Cognitive load during problem solving. _Cognitive Science._
- Thaler, R. H., & Sunstein, C. R. (2008). _Nudge._
- Thorndike, E. L. (1920). A constant error in psychological ratings. _Journal of
  Applied Psychology._
- Toulmin, S. (1958). _The Uses of Argument._
- Tversky, A., & Kahneman, D. (1973). Availability. _Cognitive Psychology._
- Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty. _Science._
- Walton, D. (1996). _Argumentation Schemes for Presumptive Reasoning._
- Walton, D. (1998). _Ad Hominem Arguments._
- Wason, P. C. (1960). On the failure to eliminate hypotheses. _Quarterly
  Journal of Experimental Psychology._
