import type { GrayImage } from "../forensics/index";

/** Crop a sub-rectangle out of a GrayImage. */
export function crop(img: GrayImage, x: number, y: number, w: number, h: number): GrayImage {
  const data = new Uint8Array(w * h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      data[yy * w + xx] = img.data[(y + yy) * img.width + (x + xx)]!;
    }
  }
  return { width: w, height: h, data };
}

/** Estimate the background level as the modal-ish bright value (figures are usually on white). */
function backgroundLevel(img: GrayImage): number {
  // Use a high percentile as "paper white".
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(img.data.length / 4096));
  for (let i = 0; i < img.data.length; i += stride) sample.push(img.data[i]!);
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length * 0.9)] ?? 255;
}

/** Row/column indices that are "ink" (deviate from background) beyond a fraction. */
function inkProfile(img: GrayImage, axis: "row" | "col", bg: number): boolean[] {
  const n = axis === "row" ? img.height : img.width;
  const m = axis === "row" ? img.width : img.height;
  const out: boolean[] = new Array(n).fill(false);
  const inkThresh = 25; // luminance distance from background to count as ink
  for (let i = 0; i < n; i++) {
    let inked = 0;
    for (let j = 0; j < m; j++) {
      const v = axis === "row" ? img.data[i * img.width + j]! : img.data[j * img.width + i]!;
      if (Math.abs(v - bg) > inkThresh) inked++;
    }
    out[i] = inked / m > 0.02;
  }
  return out;
}

/** Contiguous [start,end) spans of `true` in a boolean profile, wider than `minRun`. */
function spans(profile: boolean[], minRun: number): [number, number][] {
  const res: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] && start < 0) start = i;
    if (!profile[i] && start >= 0) {
      if (i - start >= minRun) res.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0 && profile.length - start >= minRun) res.push([start, profile.length]);
  return res;
}

/**
 * Split a multi-panel figure into panels using ink projection profiles: find
 * vertical bands of content separated by gutters, then within each band find
 * horizontal blocks. Returns the parent unchanged when no clean split exists.
 *
 * v1 grid splitter — robust for gutter-separated montages (the common case for
 * western-blot / micrograph figures). Overlapping/irregular layouts are deferred.
 */
export function splitPanels(img: GrayImage, minPanel = 24): GrayImage[] {
  const bg = backgroundLevel(img);
  const colInk = inkProfile(img, "col", bg);
  const colSpans = spans(colInk, minPanel);
  const panels: GrayImage[] = [];

  for (const [x0, x1] of colSpans) {
    const w = x1 - x0;
    const strip = crop(img, x0, 0, w, img.height);
    const rowInk = inkProfile(strip, "row", bg);
    const rowSpans = spans(rowInk, minPanel);
    for (const [y0, y1] of rowSpans) {
      panels.push(crop(strip, 0, y0, w, y1 - y0));
    }
  }

  // Only treat as multi-panel when we actually found >1 region; else keep whole.
  if (panels.length <= 1) return [img];
  return panels;
}
