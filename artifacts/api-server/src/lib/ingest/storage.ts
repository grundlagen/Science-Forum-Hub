import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Buffer } from "node:buffer";
import { sniffFormat } from "./decode";

/**
 * Content-addressed byte store. Local disk to start; the interface is the seam
 * where an S3/GCS backend drops in. Keys are `<sha256>.<ext>` so identical
 * figures dedupe automatically.
 */
export interface FigureStore {
  put(bytes: Uint8Array): string;
  get(key: string): Uint8Array;
  has(key: string): boolean;
}

function extFor(bytes: Uint8Array): string {
  const fmt = sniffFormat(bytes);
  return fmt === "png" ? "png" : fmt === "jpeg" ? "jpg" : "bin";
}

export function localFigureStore(dir?: string): FigureStore {
  const root = dir ?? process.env.INTEGRITY_STORAGE_DIR ?? join(tmpdir(), "scivet-integrity-store");
  mkdirSync(root, { recursive: true });
  return {
    put(bytes: Uint8Array): string {
      const hash = createHash("sha256").update(bytes).digest("hex");
      const key = `${hash}.${extFor(bytes)}`;
      const path = join(root, key);
      if (!existsSync(path)) writeFileSync(path, Buffer.from(bytes));
      return key;
    },
    get(key: string): Uint8Array {
      return new Uint8Array(readFileSync(join(root, key)));
    },
    has(key: string): boolean {
      return existsSync(join(root, key));
    },
  };
}
