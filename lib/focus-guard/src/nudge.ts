import type {
  FocusAnchor,
  InterventionLevel,
  Nudge,
  SignalCode,
} from "./types";
import { BIAS_REGISTRY } from "./biases";

/**
 * Nudge construction.
 *
 * Design rules, all psychologically motivated (see PSYCHOLOGY.md):
 *  - Autonomy-supportive, never controlling. We offer; we do not command.
 *    (Self-Determination Theory: controlling language reduces internalisation.)
 *  - Implementation-intention phrasing where natural: "when X, consider Y".
 *    (Gollwitzer: if-then plans transfer intentions into action.)
 *  - Brief. One ask. (Cognitive Load Theory: extraneous load kills follow-through.)
 *  - Presuppose good faith and competence. (Reduces defensiveness; preserves face.)
 *  - Focus Guard never blocks — the strongest move is to *invite a reframe*.
 */

type Cause = SignalCode | "topical_drift";

const NUDGE_TEXT: Record<Cause, string> = {
  topical_drift:
    "This discussion is anchored on one question. If it fits, you might connect your point back to that claim so it lands where reviewers are looking.",
  scope_creep:
    "That's a worthwhile larger question. To keep this thread actionable for the authors, consider whether it can be framed as a critique of the paper's specific claim — or raised as its own separate note.",
  ad_hominem:
    "There may be a sharp point here about the work itself. It usually lands better when aimed at the argument or the evidence rather than the author — want to take another pass at the wording?",
  straw_man:
    "Before responding, it can help to quote the exact claim you're addressing, so the authors can tell whether the objection targets what they actually argued.",
  whataboutism:
    "Comparisons to other work are useful context. The thread is most useful when it also says what *this* paper's claim gets right or wrong on its own terms.",
  bikeshedding:
    "Surface fixes like these are easy wins — noted. If you have a view on the paper's central claim too, that's where your attention will help the authors most.",
  confirmation_bias:
    "It's worth asking what evidence in the paper would change your mind. Naming that makes your endorsement (or objection) far more persuasive to others.",
  motivated_reasoning:
    "If a conclusion feels off, the most useful next step is to point at the specific step in the reasoning or data that fails — that turns a hunch into a critique the authors can act on.",
  anchoring:
    "One figure can dominate a first read. It can help to weigh it against the rest of the paper's evidence before settling on a verdict.",
  halo_effect:
    "Reputation is a weak predictor of any single result. The thread is strongest when the judgement rests on what this paper shows.",
  availability:
    "A vivid example is memorable but may not be representative. Where you can, relate it back to the paper's own evidence or base rates.",
  vagueness:
    "Saying *why* — a sentence on the specific weakness and what would fix it — turns this into feedback the authors can actually use.",
  hostility:
    "There's a real critique in here worth making. Stated plainly, without the heat, it's harder to dismiss and more likely to change minds — want to rephrase?",
};

/** Map a (level, cause) to a short, supportive lead-in matching the level. */
function leadIn(level: InterventionLevel): string {
  switch (level) {
    case "reframe":
      return "A small reframing could help: ";
    case "nudge":
      return "A suggestion: ";
    case "inform":
      return "Heads up — ";
    case "none":
      return "";
    default:
      return "";
  }
}

/** Citations for the cause, drawn from the registry (or the drift rationale). */
function citationsFor(cause: Cause): string[] {
  if (cause === "topical_drift") {
    return [
      "Locke & Latham (2002), goal specificity",
      "Thaler & Sunstein (2008), nudge",
    ];
  }
  return BIAS_REGISTRY[cause].citations;
}

/**
 * Build a nudge for the dominant cause at the given level. Returns null only
 * for level "none". The central claim is woven in for topical drift so the
 * contributor sees the target, not just the miss.
 */
export function buildNudge(
  level: InterventionLevel,
  cause: Cause,
  anchor?: FocusAnchor,
): Nudge | null {
  if (level === "none") return null;

  let body = NUDGE_TEXT[cause];
  if (cause === "topical_drift" && anchor) {
    body = `The claim under review is: "${truncate(anchor.centralClaim, 160)}". ${body}`;
  }

  return {
    level,
    message: `${leadIn(level)}${body}`,
    rationaleCode: cause,
    citations: citationsFor(cause),
  };
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
