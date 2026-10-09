import type { Interval } from "@/lib/stats/bootstrap";

/** "75.8% (67.4 to 82.6)" */
export function pctInterval(ci: Interval, digits = 1): string {
  if (Number.isNaN(ci.estimate)) return "–";
  const f = (v: number) => (v * 100).toFixed(digits);
  if (Number.isNaN(ci.lower)) return `${f(ci.estimate)}%`;
  return `${f(ci.estimate)}% (${f(ci.lower)} to ${f(ci.upper)})`;
}

/** "0.59 (0.45 to 0.71)" */
export function numInterval(ci: Interval, digits = 2): string {
  if (Number.isNaN(ci.estimate)) return "–";
  if (Number.isNaN(ci.lower)) return ci.estimate.toFixed(digits);
  return `${ci.estimate.toFixed(digits)} (${ci.lower.toFixed(digits)} to ${ci.upper.toFixed(digits)})`;
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

export function formatP(p: number): string {
  if (Number.isNaN(p)) return "–";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}
