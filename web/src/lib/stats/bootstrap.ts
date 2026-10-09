/**
 * Percentile bootstrap confidence intervals over a resampled unit (documents,
 * debates, speakers or labelled excerpts, depending on the page).
 *
 * Each of `B` resamples draws n indices with replacement from a mulberry32
 * stream seeded with `seed`, evaluates the statistic on those indices and keeps
 * the value. The interval is the (α/2, 1 − α/2) quantiles of the B values,
 * interpolated like `numpy.quantile` (its default "linear" method).
 *
 * Paired comparisons pass a statistic that reads two systems' results at the
 * same indices, so both systems see the same resampled items.
 */
import { mulberry32 } from "./random";

export interface Interval {
  /** the statistic on the original sample */
  estimate: number;
  lower: number;
  upper: number;
  /** confidence level, e.g. 0.95 */
  level: number;
}

export interface BootstrapInterval extends Interval {
  method: "percentile bootstrap";
  resamples: number;
  seed: number;
  /** bootstrap standard error (sample SD of the resampled statistics) */
  se: number;
  /** resamples whose statistic was undefined (NaN) and were left out */
  undefined: number;
}

/**
 * `numpy.quantile(x, p)` with the default linear interpolation (Hyndman-Fan
 * type 7), including numpy's two-sided lerp so results agree to the last bit.
 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const t = h - lo;
  const a = sorted[lo];
  const b = sorted[hi];
  const diff = b - a;
  return t >= 0.5 ? b - diff * (1 - t) : a + diff * t;
}

export interface BootstrapOptions {
  resamples?: number;
  seed?: number;
  level?: number;
}

export const DEFAULT_RESAMPLES = 10_000;
/** The site's default seed (the date the upgrade was built), shown next to every interval. */
export const DEFAULT_SEED = 20261010;

/**
 * Bootstrap the statistic `stat(indices)` over n units. `stat` receives the
 * identity indices 0..n-1 for the point estimate, then each resample.
 * Resamples where the statistic is undefined (NaN, e.g. kappa when every
 * resampled item has the same label) are dropped and counted.
 */
export function bootstrap(
  n: number,
  stat: (indices: readonly number[]) => number,
  { resamples = DEFAULT_RESAMPLES, seed = DEFAULT_SEED, level = 0.95 }: BootstrapOptions = {},
): BootstrapInterval {
  const identity = Array.from({ length: n }, (_, i) => i);
  const estimate = stat(identity);
  const empty = {
    estimate,
    lower: Number.NaN,
    upper: Number.NaN,
    level,
    method: "percentile bootstrap" as const,
    resamples,
    seed,
    se: Number.NaN,
    undefined: 0,
  };
  if (n === 0) return empty;
  const rng = mulberry32(seed);
  const values: number[] = [];
  const idx = new Array<number>(n);
  let undef = 0;
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n);
    const v = stat(idx);
    if (Number.isNaN(v)) undef++;
    else values.push(v);
  }
  if (values.length === 0) return { ...empty, undefined: undef };
  const alpha = 1 - level;
  const m = values.reduce((a, v) => a + v, 0) / values.length;
  const se = Math.sqrt(
    values.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, values.length - 1),
  );
  return {
    estimate,
    lower: quantile(values, alpha / 2),
    upper: quantile(values, 1 - alpha / 2),
    level,
    method: "percentile bootstrap",
    resamples,
    seed,
    se,
    undefined: undef,
  };
}

/** Mean of `values` at the given indices. */
export function meanAt(values: readonly number[], indices: readonly number[]): number {
  if (indices.length === 0) return Number.NaN;
  let s = 0;
  for (const i of indices) s += values[i];
  return s / indices.length;
}

/** Bootstrap CI for the mean of a per-unit quantity. */
export function bootstrapMean(values: readonly number[], options?: BootstrapOptions) {
  return bootstrap(values.length, (idx) => meanAt(values, idx), options);
}
