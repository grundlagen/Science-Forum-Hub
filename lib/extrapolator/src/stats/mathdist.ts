// Minimal, dependency-free statistical distribution functions (CDF tails) needed to
// recompute p-values for statcheck-style NHST checking. Standard Numerical-Recipes
// algorithms: Lanczos log-gamma, regularized incomplete gamma (series + continued
// fraction), regularized incomplete beta (continued fraction). Accurate to ~1e-9,
// which is far tighter than the 2-3 significant figures reported in papers.

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    // reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(a, x) via series expansion.
function gser(a: number, x: number): number {
  const gln = lgamma(a);
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 500; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

// Regularized upper incomplete gamma Q(a, x) via continued fraction.
function gcf(a: number, x: number): number {
  const gln = lgamma(a);
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
}

// Continued fraction for the incomplete beta function.
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// --- error function + normal CDF ---
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  return s * gammp(0.5, x * x);
}
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// --- two-tailed / upper-tail p-values for the NHST families statcheck handles ---
/** Two-tailed p for a t statistic. */
export function tTwoTailedP(t: number, df: number): number {
  return betai(df / 2, 0.5, df / (df + t * t));
}
/** Upper-tail p for a chi-square statistic. */
export function chiSquareUpperP(x: number, df: number): number {
  return 1 - gammp(df / 2, x / 2);
}
/** Upper-tail p for an F statistic. */
export function fUpperP(f: number, df1: number, df2: number): number {
  return betai(df2 / 2, df1 / 2, df2 / (df2 + df1 * f));
}
/** Two-tailed p for a z statistic. */
export function zTwoTailedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}
/** Two-tailed p for a Pearson correlation r with n observations (df = n - 2). */
export function rTwoTailedP(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0 || Math.abs(r) >= 1) return NaN;
  const t = (r * Math.sqrt(df)) / Math.sqrt(1 - r * r);
  return tTwoTailedP(t, df);
}
