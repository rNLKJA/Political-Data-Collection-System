/**
 * Small-sample summaries of a mean of paired differences (the within-speaker
 * gap on /readability has n = 14). A percentile bootstrap runs narrow at that
 * size, so the page reports the t interval, and the exact sign test as a
 * check that does not assume normality.
 */
import type { Interval } from "./bootstrap";
import { binomialCdf, studentTQuantile } from "./distributions";

export interface TInterval extends Interval {
  method: "t interval";
  n: number;
  df: number;
  /** standard error of the mean, s / sqrt(n) */
  se: number;
}

/** mean ± t(1 − α/2, n − 1) · s / √n. Matches `scipy.stats.t.interval(level, n − 1, mean, sem)`. */
export function tIntervalMean(values: readonly number[], level = 0.95): TInterval {
  const n = values.length;
  const mean = n ? values.reduce((a, v) => a + v, 0) / n : Number.NaN;
  if (n < 2) {
    return {
      estimate: mean,
      lower: Number.NaN,
      upper: Number.NaN,
      level,
      method: "t interval",
      n,
      df: Math.max(0, n - 1),
      se: Number.NaN,
    };
  }
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const t = studentTQuantile(1 - (1 - level) / 2, n - 1);
  return {
    estimate: mean,
    lower: mean - t * se,
    upper: mean + t * se,
    level,
    method: "t interval",
    n,
    df: n - 1,
    se,
  };
}

export interface SignTest {
  /** values below zero */
  negative: number;
  /** values above zero */
  positive: number;
  /** values equal to zero, which the test leaves out */
  ties: number;
  /** two-sided exact p-value; matches `scipy.stats.binomtest(k, n, 0.5).pvalue` */
  p: number;
}

/** Exact two-sided sign test of H0: the median difference is zero. */
export function signTest(values: readonly number[]): SignTest {
  let negative = 0;
  let positive = 0;
  let ties = 0;
  for (const v of values) {
    if (v < 0) negative++;
    else if (v > 0) positive++;
    else ties++;
  }
  const n = negative + positive;
  const p = n === 0 ? 1 : Math.min(1, 2 * binomialCdf(Math.min(negative, positive), n, 0.5));
  return { negative, positive, ties, p };
}
