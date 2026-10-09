/** Minimal scale and tick helpers for the hand-rolled SVG charts. */

export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = (v: number) => r0 + (v - d0) * k;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  return f;
}

/** "Nice" tick values covering [min, max] with roughly `count` steps. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Upper bound rounded up to a nice number (for y-axes starting at zero). */
export function niceMax(max: number, count = 4): number {
  if (max <= 0) return 1;
  const ticks = niceTicks(0, max, count);
  const last = ticks[ticks.length - 1];
  if (last >= max) return last;
  return last + (ticks[1] - ticks[0]);
}

export function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return new Intl.NumberFormat("en-AU").format(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/** Calendar position of "YYYY-MM-DD" (or "YYYY-MM") as a fractional year. */
export function fractionalYear(iso: string): number {
  const [y, m = 1, d = 15] = iso.split("-").map(Number);
  return y + (m - 1) / 12 + (d - 1) / 365;
}

export const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;
