/**
 * Small, dependency-free numeric helpers shared by the guards.
 * Kept separate so the psychological curves stay readable.
 */

/** Clamp `x` into [lo, hi]. */
export function clamp(x: number, lo = 0, hi = 1): number {
  if (Number.isNaN(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Saturating "knee" curve `1 - exp(-x / tau)`, rising from 0 toward 1.
 * Models diminishing accumulation: the first units of load matter most.
 */
export function saturate(x: number, tau: number): number {
  if (tau <= 0) return x > 0 ? 1 : 0;
  return clamp(1 - Math.exp(-Math.max(0, x) / tau));
}

/**
 * A smooth bump centred at `center` with the given half-width, peaking at
 * `depth`. Used to model the post-lunch circadian dip as a function of hour.
 * Falls to ~0 by roughly `2 * halfWidth` away from the centre.
 */
export function bump(x: number, center: number, halfWidth: number, depth: number): number {
  const z = (x - center) / halfWidth;
  return depth * Math.exp(-(z * z));
}

/** Round to `places` decimals — keeps assessment payloads tidy. */
export function round(x: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}
