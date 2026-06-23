import type { SignalCode, SignalFamily } from "./types";

/**
 * The Focus Guard bias registry.
 *
 * Every pattern Focus Guard recognises is documented here with (a) the
 * psychological literature that motivates treating it as a focus hazard, and
 * (b) the deterministic lexical markers used to detect it without a model.
 *
 * This is intentionally a *registry*, not a switch statement: detection,
 * scoring, nudging, and docs all read from it, so adding a new failure mode is
 * a single self-describing entry. (See PSYCHOLOGY.md for the long-form notes.)
 */
export interface BiasDefinition {
  code: SignalCode;
  family: SignalFamily;
  /** Human label for UI and docs. */
  label: string;
  /** What the pattern is, in one sentence. */
  description: string;
  /** Why it is a *focus* hazard — the psychological mechanism. */
  psychBasis: string;
  /** Short citations; full references live in PSYCHOLOGY.md. */
  citations: string[];
  /** Default severity contribution when detected, 0..1. */
  baseSeverity: number;
  /**
   * Lexical markers. Matching any marker is evidence; detection scales
   * confidence by how many distinct markers fire. These are deliberately
   * conservative (high precision over recall) — false nudges erode trust.
   */
  markers: RegExp[];
  /** When the contribution carries one of these stances, severity is amplified. */
  riskyWithStance?: Array<"endorse" | "challenge" | "reject">;
}

export const BIAS_REGISTRY: Readonly<Record<SignalCode, BiasDefinition>> = {
  ad_hominem: {
    code: "ad_hominem",
    family: "rhetorical_drift",
    label: "Ad hominem",
    description:
      "Targets the author's competence or character rather than the claim or its evidence.",
    psychBasis:
      "Attacking the source short-circuits evaluation of the argument; argumentation theory classes it as a relevance fallacy, and it predictably escalates defensiveness rather than understanding.",
    citations: ["Walton (1998), Ad Hominem Arguments", "Toulmin (1958)"],
    baseSeverity: 0.8,
    markers: [
      /\byou (?:obviously|clearly|just) (?:don'?t|do not|can'?t|cannot)\b/i,
      /\bthe authors? (?:obviously|clearly) (?:don'?t|do not|lack)\b/i,
      /\b(?:amateur|incompetent|clueless|sloppy|lazy)\b/i,
      /\bdo you even\b/i,
      /\bwho (?:are you|do you think you are)\b/i,
    ],
  },
  scope_creep: {
    code: "scope_creep",
    family: "rhetorical_drift",
    label: "Scope creep",
    description:
      "Redirects the discussion to a broader or different question than the paper's central claim.",
    psychBasis:
      "Goal-setting theory shows that diffuse goals degrade performance; an unbounded discussion loses the specific, attainable target the review was meant to assess.",
    citations: ["Locke & Latham (2002), goal-setting theory"],
    baseSeverity: 0.5,
    markers: [
      /\bthe (?:real|bigger|deeper|actual) (?:issue|question|problem)\b/i,
      /\bmore importantly\b/i,
      /\bwhat this (?:paper )?(?:really |should )?(?:needs|misses)\b/i,
      /\bzoom(?:ing)? out\b/i,
      /\bentirely different\b/i,
    ],
  },
  confirmation_bias: {
    code: "confirmation_bias",
    family: "cognitive_bias",
    label: "Confirmation bias",
    description:
      "Treats the conclusion as settled and only acknowledges evidence that agrees with a prior position.",
    psychBasis:
      "The pervasive tendency to seek and weight confirming evidence; in peer review it suppresses disconfirmation, the very thing review exists to provide.",
    citations: [
      "Nickerson (1998), Review of General Psychology",
      "Wason (1960)",
    ],
    baseSeverity: 0.55,
    markers: [
      /\bas (?:everyone|we all) knows?\b/i,
      /\bobviously (?:true|correct|right)\b/i,
      /\bno serious (?:researcher|scientist)\b/i,
      /\bit'?s well[- ]established that\b/i,
      /\bgoes without saying\b/i,
    ],
  },
  anchoring: {
    code: "anchoring",
    family: "cognitive_bias",
    label: "Anchoring",
    description:
      "Fixates on a single early figure or claim and judges the whole paper relative to it.",
    psychBasis:
      "Anchoring-and-adjustment: an initial value disproportionately drags subsequent judgements, so one salient number can distort the entire assessment.",
    citations: ["Tversky & Kahneman (1974), Science 185"],
    baseSeverity: 0.4,
    markers: [
      /\bthat (?:one )?(?:number|figure|statistic|stat|value) alone\b/i,
      /\beverything (?:hinges|rests) on\b/i,
      /\bonce you see (?:the|that)\b.*\bcan'?t unsee\b/i,
    ],
  },
  straw_man: {
    code: "straw_man",
    family: "rhetorical_drift",
    label: "Straw man",
    description:
      "Argues against a distorted, weaker version of the paper's actual claim.",
    psychBasis:
      "Misrepresenting a position makes it easier to attack but evaluates a claim the author never made — a relevance failure that derails productive critique.",
    citations: ["Walton (1996), fallacy schemes"],
    baseSeverity: 0.6,
    markers: [
      /\bso (?:you'?re|the authors? (?:are|is)) (?:basically )?saying\b/i,
      /\bif i understand,? (?:you'?re|they'?re) claiming\b/i,
      /\bessentially (?:you|they) (?:argue|claim) that\b/i,
    ],
  },
  whataboutism: {
    code: "whataboutism",
    family: "rhetorical_drift",
    label: "Whataboutism",
    description:
      "Deflects from the claim by pointing at other work or other shortcomings.",
    psychBasis:
      "Tu quoque deflection relocates scrutiny away from the claim under review; the present paper's merits go unexamined.",
    citations: ["Walton (1998)"],
    baseSeverity: 0.45,
    markers: [
      /\bwhat about\b/i,
      /\bbut (?:other|previous) papers?\b/i,
      /\bwhereas (?:the )?(?:competing|rival)\b/i,
      /\byou didn'?t (?:even )?(?:mention|cite)\b/i,
    ],
  },
  bikeshedding: {
    code: "bikeshedding",
    family: "epistemic_hygiene",
    label: "Bikeshedding",
    description:
      "Spends disproportionate attention on trivial surface details while the central claim goes unaddressed.",
    psychBasis:
      "Parkinson's law of triviality: groups over-invest in easy, low-stakes details because they are accessible, crowding out the hard, important questions.",
    citations: ["Parkinson (1957), law of triviality"],
    baseSeverity: 0.35,
    markers: [
      /\b(?:typo|typos|spelling|grammar|formatting|font|margins?)\b/i,
      /\bcitation (?:style|format)\b/i,
      /\bmissing (?:comma|period|semicolon)\b/i,
      /\bfigure \d+ (?:is|looks) (?:slightly|a bit) (?:off|small)\b/i,
    ],
  },
  motivated_reasoning: {
    code: "motivated_reasoning",
    family: "cognitive_bias",
    label: "Motivated reasoning",
    description:
      "Reasons backward from a desired verdict rather than forward from the evidence.",
    psychBasis:
      "When a directional goal is active, the same evidence is processed to reach the preferred conclusion; in review this manifests as verdict-first justification.",
    citations: ["Kunda (1990), Psychological Bulletin"],
    baseSeverity: 0.55,
    markers: [
      /\bregardless of (?:the )?(?:evidence|data|results)\b/i,
      /\bi (?:just )?(?:don'?t|do not) (?:buy|believe) it\b/i,
      /\bthere'?s no way this (?:is|could be) (?:right|true)\b/i,
      /\bthis (?:has|must) (?:to )?be (?:wrong|flawed)\b/i,
    ],
  },
  halo_effect: {
    code: "halo_effect",
    family: "cognitive_bias",
    label: "Halo effect",
    description:
      "Lets the author's or institution's reputation stand in for evaluation of the work.",
    psychBasis:
      "A global impression (prestige, fame) bleeds into specific judgements, so the paper is graded on its pedigree rather than its content.",
    citations: ["Thorndike (1920), Journal of Applied Psychology"],
    baseSeverity: 0.4,
    markers: [
      /\b(?:famous|renowned|prestigious|top|elite) (?:lab|group|university|author)\b/i,
      /\bnobel\b/i,
      /\bcoming from this (?:group|lab|author)\b/i,
      /\bgiven (?:their|the authors'?) (?:track record|reputation)\b/i,
    ],
  },
  availability: {
    code: "availability",
    family: "cognitive_bias",
    label: "Availability heuristic",
    description:
      "Generalises from a single vivid anecdote or recent memory instead of base rates.",
    psychBasis:
      "Ease of recall is mistaken for frequency, so a memorable counter-example outweighs the systematic evidence the paper presents.",
    citations: ["Tversky & Kahneman (1973), Cognitive Psychology"],
    baseSeverity: 0.35,
    markers: [
      /\bin my experience\b/i,
      /\bi (?:once )?(?:saw|read|heard) (?:a|one) (?:paper|case|study)\b/i,
      /\bjust last (?:week|month|year)\b/i,
      /\banecdot(?:e|ally)\b/i,
    ],
  },
  vagueness: {
    code: "vagueness",
    family: "epistemic_hygiene",
    label: "Non-specific critique",
    description:
      "Asserts a judgement (weak, bad, unconvincing) without falsifiable, actionable detail.",
    psychBasis:
      "Feedback that cannot be acted on or checked carries no information for revision; falsifiability is the demarcation that makes critique scientific.",
    citations: ["Popper (1959), falsifiability"],
    baseSeverity: 0.3,
    markers: [
      /\b(?:this is|it'?s|that'?s) (?:just )?(?:bad|weak|poor|unconvincing|not good|garbage)\b/i,
      /\bnot (?:good|rigorous|convincing) enough\b/i,
      /\bneeds (?:more )?work\b/i,
      /\bi'?m not convinced\b/i,
    ],
  },
  hostility: {
    code: "hostility",
    family: "affect",
    label: "Hostile affect",
    description:
      "Carries contempt, sarcasm, or aggression that degrades the discourse climate.",
    psychBasis:
      "Hostile affect narrows others' attention to threat and invites reciprocal hostility; cognitive reappraisal (reframing) restores capacity for substantive engagement.",
    citations: ["Gross (1998), emotion regulation; reappraisal"],
    baseSeverity: 0.5,
    markers: [
      /\b(?:ridiculous|absurd|nonsense|laughable|pathetic|garbage|trash|joke)\b/i,
      /\bwaste of (?:time|everyone'?s time|paper)\b/i,
      /\bhow (?:was|did) this (?:get|even) (?:past|published)\b/i,
      /!{2,}/,
    ],
  },
};

/** All definitions, stable order, for iteration in detection and docs. */
export const BIAS_DEFINITIONS: readonly BiasDefinition[] =
  Object.values(BIAS_REGISTRY);
