/**
 * Small, dependency-free numeric helpers used throughout the engine.
 * Everything here is pure and deterministic so the focus engine stays
 * trivially unit-testable.
 */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp into the unit interval [0, 1]. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Linear interpolation between `a` and `b` by `t` (t is clamped to [0,1]). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Re-map `value` from the range [inMin, inMax] onto [outMin, outMax].
 * Returns `outMin` if the input range is degenerate.
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, t);
}

/** Round to a fixed number of decimal places (default 2). */
export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Round to the nearest multiple of `step` (e.g. nearest 5 minutes). */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Arithmetic mean of a non-empty list; returns `fallback` for an empty list. */
export function mean(values: readonly number[], fallback = 0): number {
  if (values.length === 0) return fallback;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * A saturating accumulator: maps an unbounded non-negative `total` onto
 * [0, 1) via 1 - e^(-total/scale). Useful for "more events => closer to 1
 * but never quite there" quantities like attention residue.
 */
export function saturate(total: number, scale: number): number {
  if (scale <= 0) return total > 0 ? 1 : 0;
  return clamp01(1 - Math.exp(-Math.max(0, total) / scale));
}

/** Exponential decay factor in [0,1]: e^(-elapsed/halfLifeish). */
export function decay(elapsed: number, constant: number): number {
  if (constant <= 0) return 0;
  return Math.exp(-Math.max(0, elapsed) / constant);
}
