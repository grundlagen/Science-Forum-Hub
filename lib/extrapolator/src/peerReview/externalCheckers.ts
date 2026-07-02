// External-engine adapters — the "multiple wheels" layer. Each wraps an established
// open-source (or commercial) screening tool as a checker. They are unavailable until
// configured, so the pipeline runs offline and simply skips them; wire an endpoint or
// CLI path and they light up. This is how we adopt the ScreenIT/QUEST ensemble and the
// commercial image checkers WITHOUT reimplementing them.
//
// Each adapter documents: what it checks, the upstream project, and how to enable it.
import type { PeerReviewChecker, CheckResult, Manuscript, PeerReviewCategory } from "./checker";

// How an operator supplies access to each engine. All optional.
export interface ExternalConfig {
  sciScoreEndpoint?: string; // SciScore API (MDAR/ARRIVE/CONSORT rigor + RRIDs)
  oddPubCmd?: string; // ODDPub (open data/code detection) — R package / CLI
  rtransparentCmd?: string; // rtransparent (funding/COI/registration transparency)
  barzookaEndpoint?: string; // Barzooka (bar-graphs-of-continuous-data)
  jetFighterEndpoint?: string; // JetFighter (rainbow colour maps)
  seekBlastnEndpoint?: string; // seek & blastn (nucleotide-sequence verification)
  refCheckerCmd?: string; // RefChecker (citation existence via Crossref/OpenAlex/S2)
  imageTwinEndpoint?: string; // ImageTwin (cross-literature figure duplication)
  proofigEndpoint?: string; // Proofig (figure integrity)
  imageForensicsCmd?: string; // our own Python service (advanced_detector.py)
}

interface AdapterSpec {
  id: string;
  category: PeerReviewCategory;
  project: string; // upstream, for the "not configured" message
  configured: (c: ExternalConfig) => boolean;
}

// Adapters are declared once; each returns available:false with a hint until wired.
// The actual call is intentionally left as a single clearly-marked TODO per adapter so
// wiring is a one-function change and never a guess about a fake API shape.
const SPECS: AdapterSpec[] = [
  { id: "sciscore", category: "reporting", project: "SciScore (sciscore.com)", configured: (c) => !!c.sciScoreEndpoint },
  { id: "oddpub", category: "transparency", project: "ODDPub (github.com/quest-bih/oddpub)", configured: (c) => !!c.oddPubCmd },
  { id: "rtransparent", category: "transparency", project: "rtransparent (github.com/serghiou/rtransparent)", configured: (c) => !!c.rtransparentCmd },
  { id: "barzooka", category: "visualization", project: "Barzooka (github.com/quest-bih/barzooka)", configured: (c) => !!c.barzookaEndpoint },
  { id: "jetfighter", category: "visualization", project: "JetFighter", configured: (c) => !!c.jetFighterEndpoint },
  { id: "seek-blastn", category: "reagents", project: "seek & blastn (scibot / SciCrunch)", configured: (c) => !!c.seekBlastnEndpoint },
  { id: "refchecker", category: "references", project: "RefChecker (Crossref/OpenAlex/S2)", configured: (c) => !!c.refCheckerCmd },
  { id: "imagetwin", category: "image", project: "ImageTwin (imagetwin.ai)", configured: (c) => !!c.imageTwinEndpoint },
  { id: "proofig", category: "image", project: "Proofig (proofig.com)", configured: (c) => !!c.proofigEndpoint },
  { id: "image-forensics", category: "image", project: "in-repo services/image-forensics", configured: (c) => !!c.imageForensicsCmd },
];

function makeAdapter(spec: AdapterSpec, cfg: ExternalConfig): PeerReviewChecker {
  return {
    id: spec.id,
    category: spec.category,
    available: () => spec.configured(cfg),
    async run(_m: Manuscript): Promise<CheckResult> {
      // WIRING POINT: call the configured engine here and translate its output into
      // CheckFlag[]. Kept as a single explicit boundary so integrating a real engine is
      // one function, and so an unconfigured run can never silently fabricate a result.
      return {
        checker: spec.id,
        category: spec.category,
        available: true,
        ran: false,
        flags: [],
        detail: { note: `adapter for ${spec.project} is configured but the call is not wired in this build` },
      };
    },
  };
}

export function externalCheckers(cfg: ExternalConfig): PeerReviewChecker[] {
  return SPECS.map((s) => makeAdapter(s, cfg));
}

/** Every checker (native + external), for a full ScreenIT-style screen. */
export { SPECS as EXTERNAL_ADAPTER_SPECS };
