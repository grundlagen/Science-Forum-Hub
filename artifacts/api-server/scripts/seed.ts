import { and, eq } from "drizzle-orm";
import {
  db,
  profilesTable,
  papersTable,
  aiReportsTable,
  reviewsTable,
  commentsTable,
  focusProfilesTable,
  focusSessionsTable,
  focusEventsTable,
  type RigorReportJson,
  type AiSurveyJson,
  type PaperReferenceJson,
} from "@workspace/db";

type SeedProfile = { id: string; displayName: string; bio: string };

const PROFILES: SeedProfile[] = [
  { id: "seed_user_atlas", displayName: "Dr. Atlas Vega", bio: "Theoretical physicist, amateur philosopher of science." },
  { id: "seed_user_iris", displayName: "Iris Halberd", bio: "Neuroscientist studying memory consolidation." },
  { id: "seed_user_kepler", displayName: "Kepler Owusu", bio: "Independent researcher in computational economics." },
  { id: "seed_user_mira", displayName: "Mira Tannenbaum", bio: "Climate ecologist working on alpine systems." },
  { id: "seed_user_yusuf", displayName: "Yusuf Aoki", bio: "Methodologist; loves reproducibility and clean priors." },
];

type SeedPaper = {
  authorId: string;
  title: string;
  abstract: string;
  body: string;
  fields: string[];
  references: PaperReferenceJson[];
  rigor: RigorReportJson;
  survey: AiSurveyJson;
  reviews: { authorId: string; stance: "endorse" | "challenge" | "reject"; justification: string }[];
  comments: { authorId: string; body: string; replies?: { authorId: string; body: string }[] }[];
};

const PAPERS: SeedPaper[] = [
  {
    authorId: "seed_user_atlas",
    title: "On the Apparent Asymmetry of Time at Cosmological Scales",
    abstract:
      "We propose a thermodynamic framework in which the apparent forward arrow of time at cosmological scales emerges from coarse-grained entropy gradients between causally disconnected regions, rather than from a single low-entropy initial condition. We outline three falsifiable predictions and one near-term observational test using DESI Y3 data.",
    body:
      "## 1. Motivation\nThe puzzle of why time appears asymmetric at large scales is usually deferred to a 'past hypothesis' — an unexplained low-entropy boundary condition. We argue this framing obscures a more tractable question: how do *gradients* of coarse-grained entropy between causally disconnected horizon volumes generate the *appearance* of an arrow at the level of an embedded observer?\n\n## 2. Framework\nLet \\(\\Sigma_t\\) be a spacelike slice and partition it into Hubble-volume cells \\(C_i\\). Define a coarse-grained entropy \\(S_i(t)\\) using the BCH-restricted density matrix on \\(C_i\\). We claim that the observable arrow correlates not with \\(\\dot{S}_i\\) but with \\(\\nabla S\\) across neighbouring cells.\n\n## 3. Predictions\n(P1) The variance of CMB μ-distortions across causally disconnected patches should track the proposed gradient; (P2) the late-time matter power spectrum should exhibit a small (\\(\\sim 0.4\\%\\)) suppression at \\(k \\approx 0.08\\,h\\,\\mathrm{Mpc}^{-1}\\); (P3) entanglement entropy between adjacent horizon volumes, if measurable, should grow sub-linearly in conformal time.\n\n## 4. Observational test\nWe outline a DESI Y3 analysis pipeline that would detect or rule out P2 at \\(3\\sigma\\).\n\n## 5. Limitations\nThe framework assumes a particular factorisation of the Hilbert space which may not survive a full quantum-gravitational treatment.",
    fields: ["physics", "cosmology", "philosophy-of-science"],
    references: [
      { citation: "Penrose, R. (1989). The Emperor's New Mind. Oxford University Press.", url: null },
      { citation: "Carroll, S. & Chen, J. (2004). Spontaneous Inflation and the Origin of the Arrow of Time.", url: "https://arxiv.org/abs/hep-th/0410270" },
      { citation: "DESI Collaboration (2025). Year 3 BAO + Full-Shape Cosmology.", url: null },
    ],
    rigor: {
      overallScore: 7.6,
      logicScore: 8.2,
      methodologyScore: 7.4,
      citationsScore: 6.8,
      falsifiabilityScore: 9.0,
      noveltyScore: 6.6,
      critique:
        "The submission is structurally sound and admirably falsifiable — three concrete predictions, one near-term test. The Hilbert space factorisation assumption is doing significant load-bearing work and is not adequately defended against decoherence-based critiques. The literature engagement is competent but light: the author does not engage with Wallace's recent objections to gradient-based formulations, nor with the 2024 Boltzmann-brain refinements. Methodologically the proposed DESI pipeline is plausible but underspecified at the systematics level.",
      strengths: [
        "Three sharp, near-term falsifiable predictions",
        "Clear separation of framework, predictions, and test",
        "Honest about the Hilbert factorisation limitation",
      ],
      weaknesses: [
        "Insufficient engagement with decoherence literature",
        "DESI pipeline lacks systematics treatment",
        "Novelty claim relative to gradient-thermodynamic priors is overstated",
      ],
    },
    survey: {
      confidence: 0.72,
      consensus: "Personas largely endorse the submission, with some reservations.",
      passes: [
        { persona: "The Skeptic", verdict: "mixed", confidence: 0.7, rationale: "The falsifiability is genuine and rare. I am not yet sure the gradient framing escapes the past hypothesis rather than relocating it." },
        { persona: "Domain Expert", verdict: "endorse", confidence: 0.78, rationale: "The DESI Y3 prediction is the kind of thing that could move a panel. Engage Wallace 2024 in revision." },
        { persona: "The Generalist", verdict: "endorse", confidence: 0.65, rationale: "Readable for a non-specialist. The structure of motivation→framework→test is exemplary for a citizen-science venue." },
        { persona: "The Methodologist", verdict: "mixed", confidence: 0.7, rationale: "Predictions are crisp; the pipeline is hand-wavy. I would want a pre-registered analysis plan before P2 counts as a real test." },
        { persona: "The Outsider", verdict: "endorse", confidence: 0.8, rationale: "An unusually disciplined attempt to make a metaphysical-feeling question into a measurable one. I want to see this revised, not rejected." },
      ],
    },
    reviews: [
      { authorId: "seed_user_iris", stance: "endorse", justification: "Falsifiability alone makes this worth promoting; the DESI test is concrete." },
      { authorId: "seed_user_kepler", stance: "endorse", justification: "Methodologically more careful than most submissions in this lane. I'd like to see P2 pre-registered." },
      { authorId: "seed_user_yusuf", stance: "challenge", justification: "Strong scaffolding but the systematics treatment is a placeholder; I cannot endorse until the pipeline is specified." },
      { authorId: "seed_user_mira", stance: "endorse", justification: "Honest limitations section, sharp predictions. Promote." },
    ],
    comments: [
      {
        authorId: "seed_user_yusuf",
        body: "Could you add a pre-registration table for P1–P3? Without that, even strong predictions tend to fade into garden-of-forking-paths analyses.",
        replies: [
          { authorId: "seed_user_atlas", body: "Yes — drafting now. The table will pin down the redshift bins and the systematics envelope before we touch the data." },
        ],
      },
      {
        authorId: "seed_user_iris",
        body: "How sensitive is the gradient framing to the choice of horizon volume as the coarse-graining cell? Have you tried sound-horizon-sized cells?",
      },
      {
        authorId: "seed_user_mira",
        body: "I appreciate that the limitations section is real and not perfunctory. That is rare here.",
      },
    ],
  },
  {
    authorId: "seed_user_iris",
    title: "Sleep Spindle Density Predicts Next-Day Recall in Naturalistic Settings",
    abstract:
      "Across 412 participants wearing at-home EEG headbands for 28 nights each, we find that fast spindle density (12.5–15 Hz) during NREM2 predicts next-day recall on a free-text diary task with effect size d = 0.34, replicating laboratory findings outside the lab. Pre-registration: OSF: 4XKZQ.",
    body:
      "## Background\nLaboratory studies have linked sleep spindle density to overnight memory consolidation. It is unclear whether this effect survives outside controlled settings.\n\n## Methods\n412 participants (ages 22–61) wore Dreem 3 headbands for 28 consecutive nights. Each morning they completed a 10-minute free-text recall task scored by two blinded raters (κ = 0.81). Spindle detection used the Wamsley 2012 algorithm; analyses were pre-registered on OSF (4XKZQ).\n\n## Results\nFast spindle density (12.5–15 Hz) during NREM2 predicted same-night recall scores (β = 0.21, 95% CI [0.11, 0.31], d = 0.34). Slow spindle density did not (β = 0.04, [-0.05, 0.13]).\n\n## Discussion\nEffect size is roughly half of the typical lab-based estimate, consistent with naturalistic noise. Replicates the directional finding; questions the size of the lab-based estimate.\n\n## Limitations\nFree-text recall is noisy. Headband EEG misses some spindles. Selection bias toward people willing to wear a headband for 28 nights is real.",
    fields: ["neuroscience", "sleep", "psychology"],
    references: [
      { citation: "Wamsley, E. et al. (2012). Reduced sleep spindles and spindle coherence in schizophrenia.", url: null },
      { citation: "Mander, B. et al. (2017). Sleep and human aging.", url: null },
    ],
    rigor: {
      overallScore: 8.4,
      logicScore: 8.6,
      methodologyScore: 9.0,
      citationsScore: 7.5,
      falsifiabilityScore: 9.2,
      noveltyScore: 7.7,
      critique:
        "Pre-registered, properly powered, blinded scoring, honest limitations, and a directional replication that challenges the lab-based effect-size literature. This is what citizen-science submissions should look like. The headband validation literature deserves a paragraph rather than a single citation, and the selection-bias acknowledgement should be quantified rather than gestured at.",
      strengths: [
        "Pre-registered on OSF",
        "Blinded inter-rater scoring with κ = 0.81",
        "Explicitly compares effect size to lab estimates",
        "Honest, specific limitations",
      ],
      weaknesses: [
        "Headband validation literature under-cited",
        "Selection bias acknowledged but not quantified",
      ],
    },
    survey: {
      confidence: 0.86,
      consensus: "Personas largely endorse the submission, with some reservations.",
      passes: [
        { persona: "The Skeptic", verdict: "endorse", confidence: 0.82, rationale: "Pre-registration plus blinded scoring is the right combination. I want one more sentence on selection bias." },
        { persona: "Domain Expert", verdict: "endorse", confidence: 0.9, rationale: "This is a useful real-world replication. The half-sized effect is itself a finding." },
        { persona: "The Generalist", verdict: "endorse", confidence: 0.8, rationale: "Clearly written, the limitations are honest and not scary." },
        { persona: "The Methodologist", verdict: "endorse", confidence: 0.92, rationale: "Method section is exemplary. One nit: report exclusion counts." },
        { persona: "The Outsider", verdict: "mixed", confidence: 0.65, rationale: "I wonder how much the result depends on the Wamsley algorithm specifically. A sensitivity analysis would help." },
      ],
    },
    reviews: [
      { authorId: "seed_user_atlas", stance: "endorse", justification: "Pre-registered, blinded, replicates direction. Promote." },
      { authorId: "seed_user_kepler", stance: "endorse", justification: "Tightly executed; this should be the model for naturalistic replications." },
      { authorId: "seed_user_yusuf", stance: "endorse", justification: "Methodologically clean. Quantify selection bias in revision and this is publishable as-is." },
      { authorId: "seed_user_mira", stance: "endorse", justification: "Strong work. The half-sized effect is a real contribution." },
      { authorId: "seed_user_atlas", stance: "endorse", justification: "(duplicate to satisfy unique constraint will be ignored)" },
    ],
    comments: [
      {
        authorId: "seed_user_kepler",
        body: "Sensitivity analysis to spindle-detection algorithm would be the cherry on top. Yasa or Lacourse give meaningfully different counts.",
        replies: [
          { authorId: "seed_user_iris", body: "Agreed — I have Yasa results in the supplement; will surface them in the next revision." },
        ],
      },
      {
        authorId: "seed_user_yusuf",
        body: "Please report exclusion counts at each stage. I cannot reconstruct the n=412 from the methods alone.",
      },
    ],
  },
  {
    authorId: "seed_user_kepler",
    title: "A Bounded-Rationality Account of the Equity Premium Puzzle",
    abstract:
      "We argue that the long-standing equity premium puzzle dissolves under a bounded-rationality model in which agents discount equity returns by a perceived ambiguity penalty calibrated to a single survey parameter. The model fits 70 years of US data with one free parameter and makes a sharp out-of-sample prediction for emerging-market premia.",
    body:
      "## Setup\nMehra and Prescott's puzzle requires implausible risk aversion. We replace expected-utility maximisation with a Hansen-Sargent ambiguity penalty whose weight is *not* free but is fixed by the median response on the Michigan Survey of Consumer ambiguity-aversion question.\n\n## Calibration\nWith the survey-fixed ambiguity weight \\(\\theta = 1.7\\), the model reproduces the 6.1% historical equity premium with no further fitting.\n\n## Out-of-sample\nThe model predicts an emerging-market premium of 9.4 ± 1.1%; the realised post-2010 figure is 9.0%.\n\n## Caveats\nThe survey calibration is fragile: if the median response shifts by \\(\\pm 0.3\\), the predicted US premium moves by 1.4 percentage points.",
    fields: ["economics", "behavioral-economics", "finance"],
    references: [
      { citation: "Mehra, R. & Prescott, E. (1985). The equity premium: A puzzle.", url: null },
      { citation: "Hansen, L. & Sargent, T. (2008). Robustness.", url: null },
    ],
    rigor: {
      overallScore: 7.0,
      logicScore: 7.4,
      methodologyScore: 7.0,
      citationsScore: 6.6,
      falsifiabilityScore: 8.0,
      noveltyScore: 6.0,
      critique:
        "An attractively parsimonious story with an out-of-sample hit. The survey-calibration step is doing an enormous amount of work and the 0.3-shift sensitivity quietly admits the model is not quite as one-parameter as advertised. Engagement with Barberis-style narrative-economics alternatives is missing.",
      strengths: [
        "One-parameter calibration is genuinely elegant",
        "Out-of-sample emerging-market hit is non-trivial",
      ],
      weaknesses: [
        "Survey calibration is fragile in ways the abstract understates",
        "Ignores narrative-economics alternatives",
      ],
    },
    survey: {
      confidence: 0.6,
      consensus: "Personas are split — the submission has a real case to make and real holes to fill.",
      passes: [
        { persona: "The Skeptic", verdict: "mixed", confidence: 0.6, rationale: "The fragility under \\(\\pm 0.3\\) on the survey worries me. The abstract should not call this 'one parameter'." },
        { persona: "Domain Expert", verdict: "mixed", confidence: 0.65, rationale: "The Hansen-Sargent framing is well-chosen; the omission of narrative-economics alternatives is conspicuous." },
        { persona: "The Generalist", verdict: "endorse", confidence: 0.6, rationale: "Clear and brave to make a sharp prediction. I would like more on the survey instrument." },
        { persona: "The Methodologist", verdict: "mixed", confidence: 0.55, rationale: "The out-of-sample test is real but n=1 region. I want at least three regions before I am convinced." },
        { persona: "The Outsider", verdict: "endorse", confidence: 0.62, rationale: "I find the parsimony compelling even if fragile. A revision that owns the fragility could be very strong." },
      ],
    },
    reviews: [
      { authorId: "seed_user_atlas", stance: "endorse", justification: "Parsimonious and falsifiable; the fragility is acknowledged in the body." },
      { authorId: "seed_user_yusuf", stance: "challenge", justification: "Survey-calibration sensitivity is too high to call this one-parameter. Revise the abstract." },
      { authorId: "seed_user_mira", stance: "challenge", justification: "Need at least 2–3 region replications before promoting." },
    ],
    comments: [
      { authorId: "seed_user_yusuf", body: "The abstract framing oversells. The body is more honest." },
      { authorId: "seed_user_iris", body: "What does the Michigan question actually ask? The whole thing rides on it." },
    ],
  },
  {
    authorId: "seed_user_mira",
    title: "Alpine Treeline Advance Has Slowed in the European Alps Since 2015",
    abstract:
      "Combining 2.4 million Sentinel-2 pixels with 312 ground transects across the European Alps, we report a 41% deceleration in upward treeline advance since 2015 relative to 2000–2014, despite continued warming. We attribute the slowdown to a regime shift in winter precipitation variability.",
    body:
      "## Data\nSentinel-2 NDVI 2015–2024, ground transects 1998–2024 contributed by 18 alpine field stations, ERA5 winter precipitation reanalysis.\n\n## Analysis\nA Bayesian hierarchical model with station-level random effects, spatial Gaussian process, and regime-shift change-point prior. Code and posterior samples available at osf.io/6QH2K.\n\n## Result\nPosterior probability of a 2015 regime shift: 0.93. Median deceleration: 41% (89% CI: 28–55%). Effect is robust to leave-one-station-out cross-validation.\n\n## Mechanism\nIncreased winter precipitation variability appears to drive seedling mortality at the treeline edge during late frost events, despite warmer mean temperatures.\n\n## Caveats\nGround transect coverage is biased toward the western Alps.",
    fields: ["climate", "ecology", "earth-science"],
    references: [
      { citation: "Körner, C. (2012). Alpine Treelines.", url: null },
      { citation: "Harsch, M. et al. (2009). Are treelines advancing? A global meta-analysis.", url: null },
    ],
    rigor: {
      overallScore: 8.7,
      logicScore: 8.8,
      methodologyScore: 9.2,
      citationsScore: 8.0,
      falsifiabilityScore: 8.6,
      noveltyScore: 8.9,
      critique:
        "Excellent submission. The Bayesian hierarchical structure with station random effects is the right tool, the change-point posterior is reported honestly, and the open code/data plus LOSO cross-validation are exemplary. The mechanistic claim around late-frost seedling mortality is the only weak link — it is plausible but not directly evidenced in the dataset.",
      strengths: [
        "Open code and posterior samples",
        "Leave-one-station-out cross-validation",
        "Honest western-Alps coverage caveat",
        "Quantified posterior probability of the regime shift",
      ],
      weaknesses: [
        "Mechanistic claim is inferential rather than measured",
      ],
    },
    survey: {
      confidence: 0.9,
      consensus: "Personas largely endorse the submission, with some reservations.",
      passes: [
        { persona: "The Skeptic", verdict: "endorse", confidence: 0.88, rationale: "I came in skeptical of any change-point claim; the LOSO + posterior reporting addressed my concerns." },
        { persona: "Domain Expert", verdict: "endorse", confidence: 0.92, rationale: "This will reframe the treeline-advance literature." },
        { persona: "The Generalist", verdict: "endorse", confidence: 0.85, rationale: "Clear, honest, and the code is open. Model citizen-science work." },
        { persona: "The Methodologist", verdict: "endorse", confidence: 0.94, rationale: "The hierarchical model is correct; the LOSO is the right robustness check." },
        { persona: "The Outsider", verdict: "mixed", confidence: 0.7, rationale: "The mechanism story is the soft spot; I would label it as hypothesis rather than finding." },
      ],
    },
    reviews: [
      { authorId: "seed_user_atlas", stance: "endorse", justification: "Open code, LOSO, honest caveats. Publish." },
      { authorId: "seed_user_iris", stance: "endorse", justification: "The change-point treatment is methodologically correct." },
      { authorId: "seed_user_kepler", stance: "endorse", justification: "Strong work. Mechanism could be hedged more in the abstract." },
      { authorId: "seed_user_yusuf", stance: "endorse", justification: "Methodologically the cleanest submission I have reviewed this month." },
      { authorId: "seed_user_atlas", stance: "endorse", justification: "Confirmed endorse." },
    ],
    comments: [
      { authorId: "seed_user_iris", body: "Would the regime-shift posterior survive a horseshoe prior on the change-point location?", replies: [{ authorId: "seed_user_mira", body: "Yes — checked in the supplement; surfacing in the next revision." }] },
      { authorId: "seed_user_yusuf", body: "Consider hedging the mechanism in the abstract. The body already does this." },
    ],
  },
  {
    authorId: "seed_user_yusuf",
    title: "Pre-registration Compliance: A 12,000-Trial Audit",
    abstract:
      "We audit 12,043 OSF-pre-registered trials completed in 2023 and find that 38.2% diverge from their pre-registered analysis plan in ways that materially affect the headline result, with sub-discipline ranging from 19% (biostatistics) to 61% (social psychology). We release the audit dataset.",
    body:
      "## Why\nPre-registration is now common but compliance is rarely audited.\n\n## Method\nWe pulled all 12,043 OSF pre-registered trials marked complete in 2023 and compared each pre-registered analysis plan to the published or posted result using a structured 11-item rubric. Two raters per trial; inter-rater κ = 0.74.\n\n## Result\n38.2% (95% CI 37.3–39.1) of trials diverge from their pre-registered plan in ways that materially change the headline finding. Sub-discipline breakdown: biostatistics 19%, clinical trials 22%, ML 35%, cognitive 44%, social psych 61%.\n\n## Release\nFull audit dataset and rubric at osf.io/AU12K under CC0.\n\n## Limitations\nThe 11-item rubric is itself a methodological choice. We invite the field to challenge or replace it.",
    fields: ["meta-science", "statistics", "research-methods"],
    references: [
      { citation: "Nosek, B. et al. (2018). The preregistration revolution.", url: null },
    ],
    rigor: {
      overallScore: 8.0,
      logicScore: 8.2,
      methodologyScore: 8.4,
      citationsScore: 7.0,
      falsifiabilityScore: 8.0,
      noveltyScore: 8.4,
      critique:
        "A useful, slightly uncomfortable audit. The rubric is the load-bearing methodological choice and the authors are admirably upfront about it. Citation density is light for a meta-science piece — engage with Hardwicke et al. and the recent Cochrane meta-meta-analyses.",
      strengths: [
        "Open dataset and rubric",
        "Sub-discipline breakdown lets readers locate themselves",
        "Honest about the rubric being a choice",
      ],
      weaknesses: [
        "Citation density too low for a meta-science piece",
      ],
    },
    survey: {
      confidence: 0.78,
      consensus: "Personas largely endorse the submission, with some reservations.",
      passes: [
        { persona: "The Skeptic", verdict: "endorse", confidence: 0.8, rationale: "Open data and a transparent rubric. I can argue with the rubric, which is exactly what I want." },
        { persona: "Domain Expert", verdict: "endorse", confidence: 0.85, rationale: "This will be cited a lot. Add the Hardwicke and Cochrane references in revision." },
        { persona: "The Generalist", verdict: "endorse", confidence: 0.7, rationale: "Useful breakdown; the field-level numbers will travel." },
        { persona: "The Methodologist", verdict: "endorse", confidence: 0.82, rationale: "The κ = 0.74 is honest and not gamed. I would add a third rater for ambiguous cases." },
        { persona: "The Outsider", verdict: "mixed", confidence: 0.6, rationale: "The 'materially' threshold deserves a sharper definition. Otherwise the headline number is rhetorical." },
      ],
    },
    reviews: [
      { authorId: "seed_user_atlas", stance: "endorse", justification: "Open audit, honest rubric. Promote and publish." },
      { authorId: "seed_user_iris", stance: "endorse", justification: "The sub-discipline breakdown is what makes this useful." },
      { authorId: "seed_user_kepler", stance: "endorse", justification: "Strong meta-science contribution." },
      { authorId: "seed_user_mira", stance: "endorse", justification: "The transparency makes the discomfort productive." },
      { authorId: "seed_user_atlas", stance: "endorse", justification: "Re-confirming endorse." },
    ],
    comments: [
      { authorId: "seed_user_atlas", body: "Define 'materially' more sharply in the next revision — at the moment it carries the headline number." },
      { authorId: "seed_user_iris", body: "The 61% in social psych is going to make people unhappy. Good." },
    ],
  },
  {
    authorId: "seed_user_atlas",
    title: "Notes Toward a Citizen-Science Notion of 'Falsifiability-in-Context'",
    abstract:
      "A short philosophical note arguing that strict Popperian falsifiability is the wrong bar for citizen-science venues, and proposing a weaker but operational notion: a claim is falsifiable-in-context if a reader of average background can imagine a specific observation that would change their credence by at least 0.1.",
    body:
      "## Position\nStrict falsifiability rules out too much honest exploratory work. A citizen-science venue needs a softer, more usable bar.\n\n## Proposal\nA claim is *falsifiable-in-context* if a reader of average background, having read the submission, can imagine a specific (real or thought) observation that would change their credence in the central claim by at least 0.1.\n\n## Implications\nThis bar is achievable for theoretical work that strict Popperianism would reject, while still excluding genuinely empty claims.\n\n## Open question\nWho counts as 'average background' is contested and probably needs to be operationalised per-field.",
    fields: ["philosophy-of-science", "meta-science"],
    references: [
      { citation: "Popper, K. (1959). The Logic of Scientific Discovery.", url: null },
    ],
    rigor: {
      overallScore: 5.6,
      logicScore: 6.6,
      methodologyScore: 4.4,
      citationsScore: 4.0,
      falsifiabilityScore: 5.0,
      noveltyScore: 8.0,
      critique:
        "A genuinely interesting proposal but pitched as a working position rather than a defended argument. Two pages will not carry the weight of replacing Popper. Engagement with Hempel, Lakatos, and the recent Bayesian-falsificationism literature is needed.",
      strengths: ["Concrete operational definition", "Honest about the open question"],
      weaknesses: ["Insufficient defence", "Citation density is too thin"],
    },
    survey: {
      confidence: 0.45,
      consensus: "Personas are split — the submission has a real case to make and real holes to fill.",
      passes: [
        { persona: "The Skeptic", verdict: "reject", confidence: 0.6, rationale: "Two pages cannot displace Popper. Come back with the longer version." },
        { persona: "Domain Expert", verdict: "mixed", confidence: 0.55, rationale: "The 0.1-credence threshold is a real idea; it deserves a real defence." },
        { persona: "The Generalist", verdict: "endorse", confidence: 0.5, rationale: "I find this more useful than strict Popper for what I actually read here." },
        { persona: "The Methodologist", verdict: "mixed", confidence: 0.5, rationale: "The threshold is operational, which I like; 'average background' is doing too much work." },
        { persona: "The Outsider", verdict: "mixed", confidence: 0.5, rationale: "Worth keeping under review while the author expands it." },
      ],
    },
    reviews: [
      { authorId: "seed_user_yusuf", stance: "challenge", justification: "Interesting but undefended. Expand and resubmit." },
      { authorId: "seed_user_iris", stance: "endorse", justification: "I would rather have the soft bar than the strict one in this venue." },
    ],
    comments: [
      { authorId: "seed_user_kepler", body: "This is a good seed of a longer paper. Could you add a worked example showing a claim that passes your bar but fails strict falsifiability?" },
    ],
  },
];

async function main() {
  // wipe (in dependency order)
  await db.delete(focusEventsTable);
  await db.delete(focusSessionsTable);
  await db.delete(focusProfilesTable);
  await db.delete(commentsTable);
  await db.delete(reviewsTable);
  await db.delete(aiReportsTable);
  await db.delete(papersTable);
  await db.delete(profilesTable);

  for (const p of PROFILES) {
    await db.insert(profilesTable).values({
      id: p.id,
      displayName: p.displayName,
      bio: p.bio,
      avatarUrl: null,
    });
  }

  for (const sp of PAPERS) {
    const [paper] = await db
      .insert(papersTable)
      .values({
        authorId: sp.authorId,
        title: sp.title,
        abstract: sp.abstract,
        body: sp.body,
        fields: sp.fields,
        references: sp.references,
        stage: "draft",
        rigorScore: sp.rigor.overallScore,
        aiConfidence: sp.survey.confidence,
      })
      .returning();

    await db.insert(aiReportsTable).values({
      paperId: paper.id,
      revisionNumber: 0,
      rigor: sp.rigor,
      survey: sp.survey,
      rigorScore: sp.rigor.overallScore,
      surveyConfidence: sp.survey.confidence,
      model: "seed-data",
    });

    const seenReviewers = new Set<string>();
    for (const r of sp.reviews) {
      if (seenReviewers.has(r.authorId)) continue;
      seenReviewers.add(r.authorId);
      await db.insert(reviewsTable).values({
        paperId: paper.id,
        authorId: r.authorId,
        stance: r.stance,
        justification: r.justification,
      });
    }

    for (const c of sp.comments) {
      const [parent] = await db
        .insert(commentsTable)
        .values({
          paperId: paper.id,
          authorId: c.authorId,
          parentId: null,
          body: c.body,
        })
        .returning();
      for (const reply of c.replies ?? []) {
        await db.insert(commentsTable).values({
          paperId: paper.id,
          authorId: reply.authorId,
          parentId: parent.id,
          body: reply.body,
        });
      }
    }

    // recompute stage based on counts + scores
    const reviews = sp.reviews.filter((r, i, arr) => arr.findIndex((x) => x.authorId === r.authorId) === i);
    const endorse = reviews.filter((r) => r.stance === "endorse").length;
    const challenge = reviews.filter((r) => r.stance === "challenge").length;
    const reject = reviews.filter((r) => r.stance === "reject").length;
    const total = endorse + challenge + reject;
    const community = total === 0 ? 0 : (endorse * 10 + challenge * 4) / total;
    const combined =
      total < 3
        ? 0.55 * sp.rigor.overallScore + 0.35 * sp.survey.confidence * 10 + 0.1 * community
        : 0.4 * sp.rigor.overallScore + 0.25 * sp.survey.confidence * 10 + 0.35 * community;
    let stage: "draft" | "under_review" | "promoted" | "published" = "draft";
    if (combined >= 8.0 && endorse >= 5 && endorse > reject * 2) stage = "published";
    else if (combined >= 7.5 && total >= 3 && endorse >= reject) stage = "promoted";
    else if (combined >= 6.5 || total >= 1 || sp.rigor.overallScore >= 6.5) stage = "under_review";
    await db.update(papersTable).set({ stage }).where(eq(papersTable.id, paper.id));
  }

  await seedFocus();

  console.log("Seed complete:", PAPERS.length, "papers,", PROFILES.length, "profiles");
}

/**
 * Seed FocusGuard so the feature is demoable: a methodologist with a focus
 * habit, a couple of completed deep sessions (one linked to a real review so
 * its "deep review" badge shows), plus an in-progress session to resume.
 */
async function seedFocus() {
  const userId = "seed_user_yusuf"; // the reproducibility-loving methodologist
  const today = new Date();
  const dateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  await db.insert(focusProfilesTable).values({
    userId,
    defaultTechnique: "deep_work",
    defaultFocusMinutes: 50,
    defaultBreakMinutes: 10,
    dailyGoalMinutes: 90,
    chronotype: "morning",
    pledge: "I read the methods before I form an opinion. No tabs, no shortcuts.",
    distractionBlocklist: ["email", "chat", "social"],
    streakCount: 4,
    longestStreak: 9,
    lastQualifyingDate: dateStr(today),
  });

  // A paper this user reviewed — link a deep session to that verdict.
  const [paper] = await db.select().from(papersTable).limit(1);
  if (paper) {
    const [review] = await db
      .select()
      .from(reviewsTable)
      .where(and(eq(reviewsTable.paperId, paper.id), eq(reviewsTable.authorId, userId)))
      .limit(1);

    const startedAt = new Date(today.getTime() - 1000 * 60 * 60 * 3);
    const [deepSession] = await db
      .insert(focusSessionsTable)
      .values({
        userId,
        paperId: paper.id,
        goalType: "review",
        technique: "deep_work",
        intent: "When I start, I will judge the methodology before forming any verdict.",
        plannedMinutes: 50,
        breakMinutes: 10,
        status: "completed",
        startedAt,
        endedAt: new Date(startedAt.getTime() + 1000 * 60 * 52),
        focusedSeconds: 52 * 60,
        distractionCount: 2,
        breaksTaken: 1,
        focusRating: 4,
        flowRating: 5,
        reflection: "Lost the thread once at the stats section but caught it. Strong methods.",
        resultReviewId: review?.id ?? null,
      })
      .returning();

    await db.insert(focusEventsTable).values([
      { sessionId: deepSession.id, kind: "distraction", note: "phone buzzed", occurredAt: new Date(startedAt.getTime() + 1000 * 60 * 12) },
      { sessionId: deepSession.id, kind: "break_start", occurredAt: new Date(startedAt.getTime() + 1000 * 60 * 25) },
      { sessionId: deepSession.id, kind: "break_end", occurredAt: new Date(startedAt.getTime() + 1000 * 60 * 35) },
      { sessionId: deepSession.id, kind: "distraction", note: "urge to check email", occurredAt: new Date(startedAt.getTime() + 1000 * 60 * 44) },
      { sessionId: deepSession.id, kind: "milestone", note: "reached planned 50m", occurredAt: new Date(startedAt.getTime() + 1000 * 60 * 50) },
    ]);
  }

  // An earlier reading session, and one still in progress to resume.
  const yesterday = new Date(today.getTime() - 1000 * 60 * 60 * 24);
  await db.insert(focusSessionsTable).values({
    userId,
    paperId: paper?.id ?? null,
    goalType: "read",
    technique: "pomodoro",
    intent: "When I start, I will read for understanding and note one claim to test.",
    plannedMinutes: 25,
    breakMinutes: 5,
    status: "completed",
    startedAt: yesterday,
    endedAt: new Date(yesterday.getTime() + 1000 * 60 * 26),
    focusedSeconds: 25 * 60,
    distractionCount: 0,
    focusRating: 5,
    flowRating: 4,
  });

  await db.insert(focusSessionsTable).values({
    userId,
    paperId: null,
    goalType: "explore",
    technique: "flowtime",
    intent: "When I start, I will skim three papers and capture what surprises me.",
    plannedMinutes: 30,
    breakMinutes: 5,
    status: "active",
    focusedSeconds: 8 * 60,
  });
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
