import type { GrayImage } from "./types";
import { variance } from "./image";

const BLOT_KEYWORDS = [
  "western blot",
  "immunoblot",
  "blot",
  "gel",
  "electrophoresis",
  "sds-page",
  "band",
  "lane",
  "loading control",
  "gapdh",
  "actin",
  "tubulin",
];

/** Low-texture threshold below which an image reads as blot/gel-like. */
const LOW_TEXTURE_VARIANCE = 900;

/**
 * Blots and gels are low-texture and self-similar, which inflates false
 * positives — so we detect them (from caption keywords and/or low texture) and
 * gate their matches harder. See docs/DUPLICATION_DETECTION_ONESHOT.md §2.
 */
export function blotLikeness(img: GrayImage | null, caption: string | null): number {
  let score = 0;
  if (caption) {
    const lc = caption.toLowerCase();
    for (const kw of BLOT_KEYWORDS) {
      if (lc.includes(kw)) {
        score = Math.max(score, 0.7);
        break;
      }
    }
  }
  if (img && variance(img) < LOW_TEXTURE_VARIANCE) {
    score = Math.max(score, 0.6);
  }
  return score;
}

export function isBlotLike(img: GrayImage | null, caption: string | null): boolean {
  return blotLikeness(img, caption) >= 0.6;
}
