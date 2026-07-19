import type { GrayImage } from "./types";

/** Sample a pixel with edge clamping. */
export function at(img: GrayImage, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= img.width ? img.width - 1 : x;
  const cy = y < 0 ? 0 : y >= img.height ? img.height - 1 : y;
  return img.data[cy * img.width + cx]!;
}

/** Box-filter resize to an exact target size. Deterministic, dependency-free. */
export function resizeGray(img: GrayImage, tw: number, th: number): GrayImage {
  const out = new Uint8Array(tw * th);
  const sx = img.width / tw;
  const sy = img.height / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += at(img, xx, yy);
          n++;
        }
      }
      out[y * tw + x] = Math.round(sum / Math.max(n, 1));
    }
  }
  return { width: tw, height: th, data: out };
}

/** Global variance of luminance — a cheap proxy for how much texture an image has. */
export function variance(img: GrayImage): number {
  let mean = 0;
  for (let i = 0; i < img.data.length; i++) mean += img.data[i]!;
  mean /= img.data.length;
  let v = 0;
  for (let i = 0; i < img.data.length; i++) {
    const d = img.data[i]! - mean;
    v += d * d;
  }
  return v / img.data.length;
}

export function rotate180(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  const n = img.data.length;
  for (let i = 0; i < n; i++) out[i] = img.data[n - 1 - i]!;
  return { width: img.width, height: img.height, data: out };
}

export function flipH(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      out[y * img.width + x] = img.data[y * img.width + (img.width - 1 - x)]!;
    }
  }
  return { width: img.width, height: img.height, data: out };
}

export function flipV(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    const src = (img.height - 1 - y) * img.width;
    const dst = y * img.width;
    for (let x = 0; x < img.width; x++) out[dst + x] = img.data[src + x]!;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Rotate 90° clockwise. */
export function rotate90(img: GrayImage): GrayImage {
  const { width: w, height: h } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // dst is h wide (= old height), new (x',y') = (h-1-y, x)
      out[x * h + (h - 1 - y)] = img.data[y * w + x]!;
    }
  }
  return { width: h, height: w, data: out };
}

export function rotate270(img: GrayImage): GrayImage {
  return rotate90(rotate90(rotate90(img)));
}
