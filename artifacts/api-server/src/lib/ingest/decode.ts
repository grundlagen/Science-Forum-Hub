import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { Buffer } from "node:buffer";
import type { GrayImage } from "../forensics/index";

export type ImageFormat = "png" | "jpeg";

/** Sniff format from magic bytes. Returns null for unsupported/unknown inputs. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return null;
}

function rgbaToGray(rgba: Uint8Array | Buffer, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    // Rec.601 luma. Ignores alpha (figures are opaque); premultiply not needed.
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    data[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { width, height, data };
}

/**
 * Decode PNG or JPEG bytes to a single-channel GrayImage — the substrate every
 * detector consumes. TIFF (common in PMC OA) is deferred; see docs §deferred.
 */
export function decodeToGray(bytes: Uint8Array): GrayImage {
  const fmt = sniffFormat(bytes);
  const buf = Buffer.from(bytes);
  if (fmt === "png") {
    const png = PNG.sync.read(buf);
    return rgbaToGray(png.data, png.width, png.height);
  }
  if (fmt === "jpeg") {
    const raw = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
    return rgbaToGray(raw.data, raw.width, raw.height);
  }
  throw new Error("Unsupported image format (expected PNG or JPEG)");
}

/** Encode a GrayImage back to PNG bytes (thumbnails, storage, round-trip tests). */
export function encodeGrayPng(img: GrayImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i]!;
    const p = i * 4;
    png.data[p] = v;
    png.data[p + 1] = v;
    png.data[p + 2] = v;
    png.data[p + 3] = 255;
  }
  return PNG.sync.write(png);
}
