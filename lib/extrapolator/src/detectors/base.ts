import type { SignalKind } from "@workspace/db/schema";

// Pluggable detector output. Every signal carries a human-readable reason + structured
// evidence + the detector name (explainability is a FOCUS requirement). Maps onto
// riSignalsTable.
export interface DetectorSignal {
  kind: SignalKind;
  detector: string;
  fired: boolean;
  score: number;
  reason: string;
  evidence: unknown;
}
