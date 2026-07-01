// Validation harness: run the detector over a labelled set of PIs and report a
// confusion matrix + precision/recall. This IS the "reliable correlation to fraud"
// evidence the DOJ FOCUS initiative asks data miners to demonstrate.
//
// Expand LABELED with confirmed PI names from the ground-truth set (and clean controls).
//   pnpm --filter @workspace/extrapolator run validate-foreign-funding
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";

interface LabeledPi {
  name: string;
  label: "positive" | "control";
  note?: string;
}

// Seed set. Positives are known undisclosed-foreign-funding cases; add Van Andel /
// Stanford PIs and clean controls as names are confirmed. Placeholder entries ("<...>")
// are skipped until filled in.
const LABELED: LabeledPi[] = [
  { name: "Qing Wang", label: "positive", note: "Cleveland Clinic; undisclosed foreign support" },
  { name: "<add a Van Andel PI>", label: "positive" },
  { name: "<add a clean control PI>", label: "control" },
];

async function main(): Promise<void> {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const p of LABELED) {
    if (p.name.startsWith("<")) continue;
    const d = await buildDossier(p.name, { resolveFunderCountries: true });
    const sig = detectForeignFunding(d.nihAwards, d.foreignEvidence, {
      matchConfidence: d.matchConfidence,
    });
    const predicted = sig.fired;
    const actual = p.label === "positive";
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
    else tn++;
    console.log(
      `${actual ? "POS" : "CTL"}  ${p.name}: ${predicted ? `FLAG(score=${sig.score})` : "clear"}` +
        ` [conf=${d.matchConfidence.toFixed(2)} ${d.matchMethod}, awards=${d.nihAwards.length}, foreign=${d.foreignEvidence.length}]`,
    );
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  console.log(
    `\nTP=${tp} FP=${fp} TN=${tn} FN=${fn} | precision=${precision.toFixed(2)} recall=${recall.toFixed(2)}`,
  );
  console.log("Expand LABELED with confirmed PI names to make this metric meaningful.");
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
