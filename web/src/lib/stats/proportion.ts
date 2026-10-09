/** Intervals for proportions (agreement rates, coverage). */
import type { Interval } from "./bootstrap";
import { normalQuantile } from "./distributions";

export interface ProportionInterval extends Interval {
  method: "Wilson score";
  successes: number;
  n: number;
}

/**
 * Wilson score interval for k successes in n trials. Unlike the Wald interval
 * it stays inside [0, 1] and behaves well for small n and proportions near 0
 * or 1, which is the situation for a 30-excerpt LLM run. Matches
 * `statsmodels.stats.proportion.proportion_confint(k, n, method="wilson")`.
 */
export function wilsonInterval(successes: number, n: number, level = 0.95): ProportionInterval {
  if (n === 0) {
    return {
      estimate: Number.NaN,
      lower: Number.NaN,
      upper: Number.NaN,
      level,
      method: "Wilson score",
      successes,
      n,
    };
  }
  const z = normalQuantile(1 - (1 - level) / 2);
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    estimate: p,
    lower: Math.max(0, centre - half),
    upper: Math.min(1, centre + half),
    level,
    method: "Wilson score",
    successes,
    n,
  };
}
