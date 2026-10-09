import type { Interval } from "@/lib/stats/bootstrap";

/** A typographic minus sign (U+2212) for negative numbers. */
const minus = (s: string) => (/^-0(\.0*)?$/.test(s) ? s.slice(1) : s.replace("-", "\u2212"));

/** "75.8% (67.4 to 82.6)" */
export function pctInterval(ci: Interval, digits = 1): string {
  if (Number.isNaN(ci.estimate)) return "–";
  const f = (v: number) => (v * 100).toFixed(digits);
  if (Number.isNaN(ci.lower)) return `${f(ci.estimate)}%`;
  return `${f(ci.estimate)}% (${f(ci.lower)} to ${f(ci.upper)})`;
}

/** "0.59 (0.45 to 0.71)"; negatives get a true minus sign: "0.02 (−0.05 to 0.08)" */
export function numInterval(ci: Interval, digits = 2): string {
  if (Number.isNaN(ci.estimate)) return "–";
  const f = (v: number) => minus(v.toFixed(digits));
  if (Number.isNaN(ci.lower)) return f(ci.estimate);
  return `${f(ci.estimate)} (${f(ci.lower)} to ${f(ci.upper)})`;
}

/** "+12.5 points (−3.3 to +28.3)" for a difference of proportions */
export function pointsInterval(ci: Interval, digits = 1): string {
  if (Number.isNaN(ci.estimate)) return "–";
  const f = (v: number) => {
    const x = v * 100;
    const s = Math.abs(x).toFixed(digits);
    return x > 0 ? `+${s}` : x < 0 ? `−${s}` : s;
  };
  return `${f(ci.estimate)} points (${f(ci.lower)} to ${f(ci.upper)})`;
}

/** "+0.12 (−0.05 to +0.30)" */
export function signedInterval(ci: Interval, digits = 2): string {
  if (Number.isNaN(ci.estimate)) return "–";
  const f = (v: number) => {
    const s = Math.abs(v).toFixed(digits);
    return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
  };
  return `${f(ci.estimate)} (${f(ci.lower)} to ${f(ci.upper)})`;
}

/** "p = 0.189" or "p < 0.001" */
export function formatP(p: number): string {
  if (Number.isNaN(p)) return "p –";
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}
