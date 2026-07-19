import type { InsertFigure } from "@workspace/db";
import type { GrayImage } from "../forensics/index";
import { pHash } from "../forensics/index";
import { decodeToGray } from "./decode";
import { splitPanels } from "./panels";
import type { RawFigure } from "./types";
import type { FigureStore } from "./storage";

/** A decoded figure plus the row we'd persist for it. */
export type PreparedFigure = {
  gray: GrayImage;
  insert: InsertFigure;
};

/**
 * Decode a raw figure, store its bytes, compute its perceptual hash, and build
 * the `figures` row. Pure aside from the store write, so it's easy to test and
 * the DB insert stays in the route layer (Phase F).
 */
export function prepareFigure(
  raw: RawFigure,
  store: FigureStore,
  opts: { paperId?: number | null } = {},
): PreparedFigure {
  const gray = decodeToGray(raw.bytes);
  const storageKey = store.put(raw.bytes);
  const insert: InsertFigure = {
    paperId: opts.paperId ?? null,
    parentFigureId: null,
    sourceType: raw.sourceType,
    sourceRef: raw.sourceRef,
    panelLabel: raw.panelLabel,
    caption: raw.caption,
    storageKey,
    width: gray.width,
    height: gray.height,
    phash: pHash(gray),
    embedding: null,
  };
  return { gray, insert };
}

/**
 * Prepare a figure and its split panels. Panels inherit the parent's caption
 * (so the blot gate still fires) and are re-stored as their own PNG-less rows;
 * their `storageKey` reuses the parent's bytes (panels are croppable from it),
 * and `parentFigureId` is stitched by the caller after the parent row is
 * assigned an id.
 */
export function prepareFigureWithPanels(
  raw: RawFigure,
  store: FigureStore,
  opts: { paperId?: number | null } = {},
): { parent: PreparedFigure; panels: PreparedFigure[] } {
  const parent = prepareFigure(raw, store, opts);
  const panelImgs = splitPanels(parent.gray);
  const panels: PreparedFigure[] =
    panelImgs.length <= 1
      ? []
      : panelImgs.map((gray, i) => ({
          gray,
          insert: {
            paperId: opts.paperId ?? null,
            parentFigureId: null, // set by caller once parent id is known
            sourceType: raw.sourceType,
            sourceRef: raw.sourceRef,
            panelLabel: raw.panelLabel ? `${raw.panelLabel}.${i + 1}` : `panel ${i + 1}`,
            caption: raw.caption,
            storageKey: parent.insert.storageKey,
            width: gray.width,
            height: gray.height,
            phash: pHash(gray),
            embedding: null,
          },
        }));
  return { parent, panels };
}
