export * from "./checker";
export * from "./statcheck";
export * from "./nativeCheckers";
export * from "./externalCheckers";

import type { PeerReviewChecker } from "./checker";
import { NATIVE_CHECKERS } from "./nativeCheckers";
import { externalCheckers, type ExternalConfig } from "./externalCheckers";

/** The full ScreenIT-style ensemble: native checkers + configured external engines. */
export function allCheckers(cfg: ExternalConfig = {}): PeerReviewChecker[] {
  return [...NATIVE_CHECKERS, ...externalCheckers(cfg)];
}
