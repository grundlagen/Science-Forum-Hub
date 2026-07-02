// Statistical fabrication tests, portable across domains: reported statistics in
// papers (Heathers/Brown "data thug" toolkit) and numeric ledgers in billing or QC
// data (forensic-accounting screens).
//
//   GRIM            — Granularity-Related Inconsistency of Means (Brown & Heathers
//                     2016): with integer item data, mean*N must round back to the
//                     reported mean. An impossible mean cannot come from real data.
//   Benford         — first-digit law for naturally occurring amounts; chi-square
//                     deviation flags invented ledgers. Only meaningful on >= ~100
//                     values spanning orders of magnitude.
//   Terminal digit  — last digits of measured values should be ~uniform; humans
//                     inventing numbers over/under-use digits (used against the
//                     fabricated asphalt QC data pattern and in Carlisle-style RCT
//                     audits). Chi-square against uniform.
//
// These are screens, not proof: every hit needs the underlying document pulled and a
// human check for benign explanations (rounding conventions, price points, protocols).
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { DetectorSignal } from "../detectors/base";

const KIND: SignalKind = "impossible_statistic";
const DETECTOR = "fabrication-stats/v1";

// ---------------------------------------------------------------- GRIM

export interface GrimResult {
  consistent: boolean;
  reportedMean: number;
  n: number;
  nearestPossibleMean: number;
}

/**
 * GRIM test: can `reportedMean` (given to `decimals` places) arise from `n` integer
 * observations? Checks whether any integer total yields the reported rounded mean.
 */
export function grimTest(reportedMean: number, n: number, decimals: number): GrimResult {
  const scale = 10 ** decimals;
  // The candidate totals nearest to mean*n.
  const target = reportedMean * n;
  let nearest = Math.round(target) / n;
  let consistent = false;
  for (const total of [Math.floor(target), Math.ceil(target)]) {
    const mean = total / n;
    if (Math.round(mean * scale) / scale === reportedMean) {
      consistent = true;
      nearest = mean;
      break;
    }
    if (Math.abs(mean - reportedMean) < Math.abs(nearest - reportedMean)) nearest = mean;
  }
  return { consistent, reportedMean, n, nearestPossibleMean: nearest };
}

// ---------------------------------------------------------------- Benford

const BENFORD_P = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];

export interface BenfordResult {
  n: number;
  chiSquare: number; // 8 degrees of freedom; > 20.09 = p < 0.01
  observed: number[]; // counts for first digit 1..9
  suspicious: boolean;
  applicable: boolean; // enough data to say anything
}

export const BENFORD_MIN_N = 100;
export const BENFORD_CHI2_CRIT = 20.09; // chi-square(8), p = 0.01

export function benfordTest(values: number[]): BenfordResult {
  const observed = new Array(9).fill(0) as number[];
  let n = 0;
  for (const v of values) {
    const a = Math.abs(v);
    if (!Number.isFinite(a) || a === 0) continue;
    // First significant digit via string form — toExponential(0) would ROUND the
    // mantissa (9.7 -> "1e+4") and misclassify nines as ones.
    const d = Number(/[1-9]/.exec(String(a))?.[0] ?? "0");
    if (d >= 1 && d <= 9) {
      observed[d - 1]++;
      n++;
    }
  }
  let chi = 0;
  if (n > 0) {
    for (let i = 0; i < 9; i++) {
      const exp = BENFORD_P[i] * n;
      chi += (observed[i] - exp) ** 2 / exp;
    }
  }
  const applicable = n >= BENFORD_MIN_N;
  return { n, chiSquare: chi, observed, suspicious: applicable && chi > BENFORD_CHI2_CRIT, applicable };
}

// ---------------------------------------------------------------- terminal digits

export interface TerminalDigitResult {
  n: number;
  chiSquare: number; // 9 degrees of freedom; > 21.67 = p < 0.01
  observed: number[]; // counts for last digit 0..9
  suspicious: boolean;
  applicable: boolean;
}

export const TERMINAL_MIN_N = 50;
export const TERMINAL_CHI2_CRIT = 21.67; // chi-square(9), p = 0.01

/** Last-digit uniformity over the given decimal place (0 = integer last digit). */
export function terminalDigitTest(values: number[], decimals = 0): TerminalDigitResult {
  const observed = new Array(10).fill(0) as number[];
  let n = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const scaled = Math.round(Math.abs(v) * 10 ** decimals);
    observed[scaled % 10]++;
    n++;
  }
  let chi = 0;
  if (n > 0) {
    const exp = n / 10;
    for (let i = 0; i < 10; i++) chi += (observed[i] - exp) ** 2 / exp;
  }
  const applicable = n >= TERMINAL_MIN_N;
  return { n, chiSquare: chi, observed, suspicious: applicable && chi > TERMINAL_CHI2_CRIT, applicable };
}

// ---------------------------------------------------------------- detector wrapper

export interface ReportedStat {
  label: string;
  mean: number;
  n: number;
  decimals: number;
}

export function detectFabricatedStats(
  subjectName: string,
  domain: FraudDomain,
  stats: ReportedStat[],
  ledger?: { label: string; values: number[]; decimals?: number },
): DetectorSignal {
  const grimFails = stats
    .map((s) => ({ ...s, result: grimTest(s.mean, s.n, s.decimals) }))
    .filter((s) => !s.result.consistent);
  const benford = ledger ? benfordTest(ledger.values) : null;
  const terminal = ledger ? terminalDigitTest(ledger.values, ledger.decimals ?? 0) : null;

  const hits =
    (grimFails.length > 0 ? 1 : 0) +
    (benford?.suspicious ? 1 : 0) +
    (terminal?.suspicious ? 1 : 0);
  const fired = hits > 0;

  let score = 0;
  if (fired) {
    // GRIM failures are arithmetic impossibilities, not statistics — they carry more.
    score = grimFails.length > 0 ? 40 : 25;
    score += Math.min(20, 10 * (grimFails.length - 1 > 0 ? grimFails.length - 1 : 0));
    score += 15 * ((benford?.suspicious ? 1 : 0) + (terminal?.suspicious ? 1 : 0));
    score = Math.min(100, score);
  }

  const parts: string[] = [];
  if (grimFails.length > 0)
    parts.push(`${grimFails.length} reported mean(s) arithmetically impossible for their N (GRIM)`);
  if (benford?.suspicious) parts.push(`first-digit distribution deviates from Benford (chi2=${benford.chiSquare.toFixed(1)})`);
  if (terminal?.suspicious) parts.push(`terminal digits non-uniform (chi2=${terminal.chiSquare.toFixed(1)})`);

  return {
    kind: KIND,
    detector: DETECTOR,
    fired,
    score,
    domain,
    subjectName,
    reason: fired
      ? `Statistical screens flag "${subjectName}": ${parts.join("; ")}. Screens are ` +
        `probable cause only — check rounding conventions, price points, and protocols ` +
        `for benign explanations before escalating.`
      : `No statistical anomalies across ${stats.length} reported stat(s)` +
        `${ledger ? ` and ${ledger.values.length} ledger values` : ""}.`,
    evidence: { grimFails, benford, terminal },
  };
}
