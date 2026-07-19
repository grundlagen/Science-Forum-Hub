import type { RawFigure } from "./types";

/** Wrap user-supplied image bytes as a RawFigure (multipart upload path). */
export function uploadFigure(
  bytes: Uint8Array,
  opts: { caption?: string | null; panelLabel?: string | null; sourceRef?: string | null } = {},
): RawFigure {
  return {
    bytes,
    caption: opts.caption ?? null,
    panelLabel: opts.panelLabel ?? null,
    sourceRef: opts.sourceRef ?? null,
    sourceType: "upload",
  };
}
