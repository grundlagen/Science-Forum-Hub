/**
 * Phase B/C fixture gate — ingestion + decode, fully offline (no network, no DB).
 * The PMC source is exercised through a MOCK fetcher so parsing is verified
 * without hitting NCBI. Run:
 *   pnpm --filter @workspace/api-server run test:ingest
 */
import jpeg from "jpeg-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import type { GrayImage } from "../src/lib/forensics/index";
import { pHash, hammingHex, scoreMatch, rotate180 } from "../src/lib/forensics/index";
import {
  decodeToGray,
  encodeGrayPng,
  sniffFormat,
  parseJatsFigures,
  pmcEfetchUrl,
  resolveGraphicUrl,
  pmcOaSource,
  uploadFigure,
  localFigureStore,
  splitPanels,
  prepareFigure,
  type Fetcher,
} from "../src/lib/ingest/index";

let failures = 0;
function check(name: string, pass: boolean, detail = ""): void {
  if (!pass) failures++;
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${pass ? "" : ` — ${detail}`}`);
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff;
}
function noise(w: number, h: number, seed: number): GrayImage {
  const rnd = lcg(seed);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
  return { width: w, height: h, data };
}
function grayToRgba(img: GrayImage): Uint8Array {
  const out = new Uint8Array(img.width * img.height * 4);
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i]!;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
function meanAbsDiff(a: GrayImage, b: GrayImage): number {
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i]! - b.data[i]!);
  return s / a.data.length;
}

console.log("Decode round-trips:");
{
  const src = noise(48, 48, 42);
  const png = encodeGrayPng(src);
  check("PNG magic sniffed", sniffFormat(png) === "png");
  const backPng = decodeToGray(png);
  check("PNG round-trip is lossless", backPng.width === 48 && backPng.height === 48 && meanAbsDiff(src, backPng) === 0, `mad=${meanAbsDiff(src, backPng)}`);

  const jpg = new Uint8Array(jpeg.encode({ data: Buffer.from(grayToRgba(src)), width: 48, height: 48 }, 92).data);
  check("JPEG magic sniffed", sniffFormat(jpg) === "jpeg");
  const backJpg = decodeToGray(jpg);
  const ham = hammingHex(pHash(src), pHash(backJpg));
  check("JPEG decode preserves structure", backJpg.width === 48 && ham <= 8, `hamming=${ham}, mad=${meanAbsDiff(src, backJpg).toFixed(1)}`);

  check("unknown bytes rejected", sniffFormat(new Uint8Array([1, 2, 3, 4])) === null);
}

console.log("JATS parsing + URL resolution:");
{
  const xml = `<article><body>
    <fig id="f1"><label>Figure 1</label><caption><title>Western blot</title><p>GAPDH loading control in treated vs control.</p></caption><graphic xlink:href="pone.0001-g001.tif"/></fig>
    <fig id="f2"><label>Figure 2</label><caption><p>Flow cytometry.</p></caption><graphic xlink:href="pone.0001-g002.tif"/></fig>
    <fig id="f3"><label>Figure 3</label><caption><p>No graphic here.</p></caption></fig>
  </body></article>`;
  const figs = parseJatsFigures(xml);
  check("parses all <fig> blocks", figs.length === 3, `got ${figs.length}`);
  check("extracts caption text without tags", figs[0]!.caption === "Western blot GAPDH loading control in treated vs control.", `got "${figs[0]!.caption}"`);
  check("extracts label", figs[0]!.panelLabel === "Figure 1");
  check("extracts graphic href", figs[1]!.href === "pone.0001-g002.tif");
  check("missing graphic -> null href", figs[2]!.href === null);
  check("efetch url targets pmc db", pmcEfetchUrl("PMC123").includes("db=pmc") && pmcEfetchUrl("PMC123").includes("id=123"));
  check("graphic url resolves to article bin", resolveGraphicUrl("PMC123", "g001.tif") === "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/bin/g001.jpg");
}

async function main(): Promise<void> {
  console.log("PMC source via mock fetcher:");
  {
    const xml = `<article><fig><label>Fig 1</label><caption><p>Blot.</p></caption><graphic xlink:href="g1.tif"/></fig></article>`;
    const graphic = encodeGrayPng(noise(16, 16, 5));
    const mockFetch: Fetcher = async (url: string) => {
      if (url.includes("efetch.fcgi")) return new Uint8Array(Buffer.from(xml, "utf8"));
      return new Uint8Array(graphic);
    };
    const raws = await pmcOaSource.fetchFigures("PMC777", mockFetch);
    check("fetches one figure", raws.length === 1, `got ${raws.length}`);
    check("carries caption + provenance", raws[0]!.caption === "Blot." && raws[0]!.sourceRef === "PMC777" && raws[0]!.sourceType === "pmc");
  }

  console.log("Storage round-trip:");
  {
    const dir = mkdtempSync(join(tmpdir(), "scivet-store-"));
    const store = localFigureStore(dir);
    const bytes = encodeGrayPng(noise(20, 20, 9));
    const key = store.put(bytes);
    check("key is content-addressed .png", /^[0-9a-f]{64}\.png$/.test(key), key);
    check("stored bytes read back identical", Buffer.from(store.get(key)).equals(Buffer.from(bytes)));
    check("idempotent put returns same key", store.put(bytes) === key);
  }

  console.log("Panel splitting:");
  {
    // Two ink columns separated by a white gutter.
    const w = 100, h = 40;
    const data = new Uint8Array(w * h).fill(255);
    for (let y = 6; y < 34; y++) {
      for (let x = 6; x < 40; x++) data[y * w + x] = 40 + ((x * y) % 60);
      for (let x = 60; x < 94; x++) data[y * w + x] = 40 + ((x * y) % 60);
    }
    const panels = splitPanels({ width: w, height: h, data });
    check("splits a 2-panel montage into 2", panels.length === 2, `got ${panels.length}`);

    const single = splitPanels(noise(64, 64, 3));
    check("dense single figure not over-split", single.length === 1, `got ${single.length}`);
  }

  console.log("Prepare figure (decode -> hash -> row):");
  {
    const dir = mkdtempSync(join(tmpdir(), "scivet-prep-"));
    const store = localFigureStore(dir);
    const raw = uploadFigure(encodeGrayPng(noise(32, 32, 77)), { caption: "test", sourceRef: "upload:1" });
    const prep = prepareFigure(raw, store);
    check("insert has 16-hex phash", typeof prep.insert.phash === "string" && /^[0-9a-f]{16}$/.test(prep.insert.phash!), prep.insert.phash ?? "null");
    check("insert carries dimensions + storageKey + source", prep.insert.width === 32 && prep.insert.height === 32 && !!prep.insert.storageKey && prep.insert.sourceType === "upload");
  }

  console.log("End-to-end (encoded bytes -> decode -> scoreMatch):");
  {
    const a = noise(64, 64, 2024);
    const aPng = encodeGrayPng(a);
    const aRotPng = encodeGrayPng(rotate180(a));
    const ga = decodeToGray(aPng);
    const gb = decodeToGray(aRotPng);
    const m = scoreMatch(ga, gb, null, null);
    check("rotated reuse survives PNG encode/decode and is flagged transformed", m !== null && m.matchClass === "transformed", `got ${JSON.stringify(m)}`);

    const distinct = scoreMatch(decodeToGray(encodeGrayPng(noise(64, 64, 1))), decodeToGray(encodeGrayPng(noise(64, 64, 2))), null, null);
    check("two distinct decoded figures not matched", distinct === null, `got ${JSON.stringify(distinct)}`);
  }

  console.log("");
  if (failures > 0) {
    console.error(`INGEST GATE FAILED: ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("INGEST GATE PASSED — decode, JATS parse, mock PMC fetch, storage, panels, and prepare all green.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
