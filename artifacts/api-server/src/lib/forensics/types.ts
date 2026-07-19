import type {
  MatchClass,
  RecoveredTransform,
  MatchRegions,
  RegionBox,
} from "@workspace/db";

export type { MatchClass, RecoveredTransform, MatchRegions, RegionBox };

/**
 * Single-channel image. `data` holds `width * height` luminance samples (0..255),
 * row-major. This is the substrate every detector operates on, so the core has
 * NO image-decode dependency — decoding (PNG/JPEG/PDF raster) is an adapter's job
 * and feeds this shape in.
 */
export type GrayImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

/**
 * Rendered on every candidate view and included in every API payload. Integrity
 * Mode flags regions to inspect; it never renders a determination of misconduct.
 * See docs/DUPLICATION_DETECTION_ONESHOT.md §0.
 */
export const INTEGRITY_DISCLAIMER =
  "Candidate for human review. A visual similarity is evidence to inspect, not a " +
  "finding. Figures can legitimately repeat (shared loading controls, disclosed " +
  "reuse, republished-with-permission figures). This is not a determination of " +
  "misconduct — only an institution, journal, ORI, or court can make that.";

/** Output of a single flagged pair, before it becomes a `figure_matches` row. */
export type MatchResult = {
  matchClass: MatchClass;
  /** 0..1; higher = more similar. */
  similarity: number;
  transform: RecoveredTransform | null;
  regions: MatchRegions | null;
  /** Whether either figure looks like a blot/gel (drives the higher gate). */
  blotLike: boolean;
  /** Human-readable, observation-only note (no intent language). */
  observation: string;
};
