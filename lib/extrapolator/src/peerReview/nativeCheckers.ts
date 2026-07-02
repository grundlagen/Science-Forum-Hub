// Native checkers — pure logic we implement directly (no external service needed).
import type { PeerReviewChecker, CheckResult, CheckFlag, Manuscript } from "./checker";
import { statcheck } from "./statcheck";
import { detectFabricatedStats } from "../stats/fabrication";

// statcheck: recompute reported p-values, flag (decision) inconsistencies.
export const statcheckChecker: PeerReviewChecker = {
  id: "statcheck",
  category: "statistics",
  available: () => true,
  run(m: Manuscript): CheckResult {
    const results = m.nhstResults ?? [];
    const rep = statcheck(results);
    const flags: CheckFlag[] = [];
    for (const f of rep.results) {
      if (f.decisionInconsistent) flags.push({ severity: "major", message: f.note });
      else if (f.inconsistent) flags.push({ severity: "minor", message: f.note });
    }
    return { checker: "statcheck", category: "statistics", available: true, ran: true, flags, detail: rep };
  },
};

// GRIM / Benford / terminal-digit: impossible or improbable reported values.
export const fabricationChecker: PeerReviewChecker = {
  id: "fabrication-stats",
  category: "fabrication",
  available: () => true,
  run(m: Manuscript): CheckResult {
    const stats = m.reportedStats ?? [];
    const sig = detectFabricatedStats(m.title ?? m.id, "research_grants", stats);
    const flags: CheckFlag[] = sig.fired
      ? [{ severity: "major", message: sig.reason.split(". ")[0] + "." }]
      : [];
    return { checker: "fabrication-stats", category: "fabrication", available: true, ran: true, flags, detail: sig.evidence };
  },
};

// Reference sanity (native, offline): duplicate DOIs, malformed DOIs, and references
// with neither DOI nor title. A full existence check is the RefChecker adapter (network).
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
export const referenceSanityChecker: PeerReviewChecker = {
  id: "reference-sanity",
  category: "references",
  available: () => true,
  run(m: Manuscript): CheckResult {
    const refs = m.references ?? [];
    const flags: CheckFlag[] = [];
    const seen = new Map<string, number>();
    for (const r of refs) {
      if (r.doi) {
        const key = r.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, "");
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if (!DOI_RE.test(key)) flags.push({ severity: "minor", message: `malformed DOI: ${r.doi}` });
      } else if (!r.title) {
        flags.push({ severity: "minor", message: `reference has neither DOI nor title: "${r.raw.slice(0, 60)}"` });
      }
    }
    for (const [doi, n] of seen) if (n > 1) flags.push({ severity: "minor", message: `duplicate citation (${n}x): ${doi}` });
    return { checker: "reference-sanity", category: "references", available: true, ran: true, flags, detail: { count: refs.length } };
  },
};

export const NATIVE_CHECKERS: PeerReviewChecker[] = [
  statcheckChecker,
  fabricationChecker,
  referenceSanityChecker,
];
