// Duplication-recognition agent (record-level analogue of the image duplication
// detector). Two recognizers over funding records:
//   - duplicate awards: same recipient + same amount across different award IDs
//     (possible double-funding / duplicate billing)
//   - near-duplicate recipients: highly similar names (possible shell / affiliated
//     entities used to split or disguise awards)
// Pure functions; output is probable cause for human review, not proof. Not legal advice.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { DetectorSignal } from "./detectors/base";

const DOMAIN: FraudDomain = "general_federal_award";

export interface AwardLike {
  awardId: string | null;
  recipientName: string | null;
  amount: number | null;
  startDate?: string | null;
  awardingAgency?: string | null;
}

export interface RecipientLike {
  name: string;
  uei?: string | null;
  address?: string | null;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter(Boolean));
}

/** Jaccard similarity over normalized token sets (0..1). */
export function nameSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Duplicate awards: same normalized recipient + same amount across >=2 distinct award IDs. */
export function findDuplicateAwards(awards: AwardLike[]): DetectorSignal[] {
  const groups = new Map<string, AwardLike[]>();
  for (const a of awards) {
    if (!a.recipientName || a.amount == null || !a.awardId) continue;
    const key = `${normalizeName(a.recipientName)}|${Math.round(a.amount)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
  }
  const signals: DetectorSignal[] = [];
  for (const group of groups.values()) {
    const ids = [...new Set(group.map((g) => g.awardId))];
    if (ids.length < 2) continue;
    const amount = group[0].amount ?? 0;
    const score = Math.min(100, 40 + 10 * (ids.length - 1) + (amount > 1_000_000 ? 10 : 0));
    signals.push({
      kind: "duplicate_award" as SignalKind,
      detector: "dedupe/duplicate-award/v1",
      fired: true,
      score,
      domain: DOMAIN,
      subjectName: group[0].recipientName ?? undefined,
      reason:
        `${ids.length} awards to "${group[0].recipientName}" at the same amount ` +
        `($${Math.round(amount).toLocaleString()}): ${ids.join(", ")}. Possible double-funding / ` +
        `duplicate billing — verify these are distinct legitimate awards before any action.`,
      evidence: { awardIds: ids, amount, agency: group[0].awardingAgency ?? null },
    });
  }
  return signals;
}

/** Near-duplicate recipients: highly similar names (possible shell / affiliated entities). */
export function findNearDuplicateRecipients(
  recipients: RecipientLike[],
  threshold = 0.8,
): DetectorSignal[] {
  const signals: DetectorSignal[] = [];
  for (let i = 0; i < recipients.length; i++) {
    for (let j = i + 1; j < recipients.length; j++) {
      const a = recipients[i];
      const b = recipients[j];
      const sim = nameSimilarity(a.name, b.name);
      const sharedAddress =
        !!a.address && !!b.address && a.address.trim().toLowerCase() === b.address.trim().toLowerCase();
      if (sim < threshold && !sharedAddress) continue;
      const score = Math.min(100, Math.round(sim * 60) + (sharedAddress ? 25 : 0));
      signals.push({
        kind: "shell_recipient" as SignalKind,
        detector: "dedupe/near-duplicate-recipient/v1",
        fired: true,
        score,
        domain: DOMAIN,
        subjectName: a.name,
        reason:
          `"${a.name}" and "${b.name}" are highly similar (name sim ${sim.toFixed(2)}` +
          `${sharedAddress ? ", shared address" : ""}). Possible shell / affiliated entities — ` +
          `confirm ownership (e.g., via registry) before any action.`,
        evidence: { a, b, similarity: sim, sharedAddress },
      });
    }
  }
  return signals;
}

/** Run both recognizers. The "duplication recognition agent" entry point. */
export function recognizeDuplicates(input: {
  awards?: AwardLike[];
  recipients?: RecipientLike[];
  recipientThreshold?: number;
}): DetectorSignal[] {
  const out: DetectorSignal[] = [];
  if (input.awards) out.push(...findDuplicateAwards(input.awards));
  if (input.recipients) out.push(...findNearDuplicateRecipients(input.recipients, input.recipientThreshold));
  return out.sort((a, b) => b.score - a.score);
}
