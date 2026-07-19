import type { RawFigure, Fetcher, FigureSource } from "./types";

/**
 * A `<fig>` parsed out of a JATS article: its label, caption text, and the
 * href of its graphic. Only legitimately accessible open-access articles should
 * be passed here (PMC Open Access subset).
 */
export type JatsFigure = {
  panelLabel: string | null;
  caption: string | null;
  href: string | null;
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = re.exec(block);
  return m && m[1] !== undefined ? m[1] : null;
}

/**
 * Parse `<fig>` elements from JATS XML. Deliberately dependency-free and
 * tolerant (regex over well-formed OA XML) so it is unit-testable offline.
 */
export function parseJatsFigures(xml: string): JatsFigure[] {
  const figs: JatsFigure[] = [];
  const figRe = /<fig\b[^>]*>([\s\S]*?)<\/fig>/g;
  let m: RegExpExecArray | null;
  while ((m = figRe.exec(xml)) !== null) {
    const block = m[1]!;
    const label = firstMatch(block, /<label>([\s\S]*?)<\/label>/);
    const caption = firstMatch(block, /<caption>([\s\S]*?)<\/caption>/);
    // JATS graphics use xlink:href (or plain href in some exports).
    const href =
      firstMatch(block, /<graphic\b[^>]*?xlink:href="([^"]+)"/) ??
      firstMatch(block, /<graphic\b[^>]*?\bhref="([^"]+)"/);
    figs.push({
      panelLabel: label ? stripTags(label) : null,
      caption: caption ? stripTags(caption) : null,
      href,
    });
  }
  return figs;
}

/** NCBI E-utilities efetch endpoint for a PMC article's full-text JATS XML. */
export function pmcEfetchUrl(pmcid: string): string {
  const id = pmcid.replace(/^PMC/i, "");
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${encodeURIComponent(id)}&rettype=xml`;
}

/**
 * Resolve a graphic href to an image URL under the article's OA package.
 * Graphics in JATS are referenced by basename; PMC serves them as .jpg under
 * the article's blob path. Absolute hrefs are passed through.
 */
export function resolveGraphicUrl(pmcid: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const id = pmcid.replace(/^PMC/i, "");
  const base = href.replace(/\.[a-z0-9]+$/i, "");
  return `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id}/bin/${base}.jpg`;
}

/**
 * PMC Open Access figure source. Fetches JATS, parses `<fig>` blocks, and pulls
 * each graphic via the injected fetcher. Only for the OA subset — no paywalled
 * fetching. Figures without a resolvable graphic are skipped.
 */
export const pmcOaSource: FigureSource = {
  kind: "pmc",
  async fetchFigures(pmcid: string, fetch: Fetcher): Promise<RawFigure[]> {
    const xmlBytes = await fetch(pmcEfetchUrl(pmcid));
    const xml = Buffer.from(xmlBytes).toString("utf8");
    const parsed = parseJatsFigures(xml);
    const out: RawFigure[] = [];
    for (const fig of parsed) {
      if (!fig.href) continue;
      const url = resolveGraphicUrl(pmcid, fig.href);
      try {
        const bytes = await fetch(url);
        out.push({
          bytes,
          caption: fig.caption,
          panelLabel: fig.panelLabel,
          sourceRef: pmcid.toUpperCase().startsWith("PMC") ? pmcid.toUpperCase() : `PMC${pmcid}`,
          sourceType: "pmc",
        });
      } catch {
        // A single missing graphic shouldn't abort the whole article.
        continue;
      }
    }
    return out;
  },
};
