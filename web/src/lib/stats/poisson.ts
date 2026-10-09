/**
 * Exact (Garwood) confidence intervals for a Poisson count, and the gamma
 * functions they need. For an observed count k:
 *
 *   lower = Gamma^{-1}(alpha/2; k)        (0 when k = 0)
 *   upper = Gamma^{-1}(1 - alpha/2; k + 1)
 *
 * which equals chi2.ppf(alpha/2, 2k)/2 and chi2.ppf(1 - alpha/2, 2k+2)/2.
 * Checked against SciPy in poisson.test.ts.
 */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xx = x - 1;
  let a = 0.99999999999980993;
  const t = xx + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (xx + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lnPre = a * Math.log(x) - x - logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 10_000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return Math.exp(lnPre) * sum;
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return 1 - Math.exp(lnPre) * h;
}

/** Inverse of P(a, ·): the x with P(a, x) = p (scale 1). */
export function gammaQuantile(p: number, a: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  let lo = 0;
  let hi = Math.max(1, a);
  while (gammaP(a, hi) < p) hi *= 2;
  // Bisection to a tight bracket, then Newton polish.
  let x = (lo + hi) / 2;
  for (let i = 0; i < 200; i++) {
    x = (lo + hi) / 2;
    if (gammaP(a, x) < p) lo = x;
    else hi = x;
    if (hi - lo < 1e-12 * Math.max(1, x)) break;
  }
  for (let i = 0; i < 3; i++) {
    const f = gammaP(a, x) - p;
    const dens = Math.exp((a - 1) * Math.log(x) - x - logGamma(a));
    if (!(dens > 0)) break;
    const next = x - f / dens;
    if (!(next > lo && next < hi)) break;
    x = next;
  }
  return x;
}

export interface Interval {
  lower: number;
  upper: number;
}

/** Exact two-sided Poisson CI for a count k (default 95 %). */
export function poissonInterval(k: number, confidence = 0.95): Interval {
  const alpha = 1 - confidence;
  const lower = k === 0 ? 0 : gammaQuantile(alpha / 2, k);
  const upper = gammaQuantile(1 - alpha / 2, k + 1);
  return { lower, upper };
}

/** Rate per `per` words with its exact CI, given count k in `exposure` words. */
export function rateWithInterval(
  k: number,
  exposure: number,
  per = 10_000,
  confidence = 0.95,
): { rate: number; lower: number; upper: number } {
  if (exposure <= 0) return { rate: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  const { lower, upper } = poissonInterval(k, confidence);
  const f = per / exposure;
  return { rate: k * f, lower: lower * f, upper: upper * f };
}
