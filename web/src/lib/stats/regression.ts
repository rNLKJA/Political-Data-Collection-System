/** Ordinary least squares for one predictor (used for readability trends). */

export interface LineFit {
  slope: number;
  intercept: number;
  n: number;
}

/** OLS fit of y on x; NaN slope when x has no spread. */
export function olsLine(x: readonly number[], y: readonly number[]): LineFit {
  const n = Math.min(x.length, y.length);
  if (n === 0) return { slope: Number.NaN, intercept: Number.NaN, n };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : Number.NaN;
  return { slope, intercept: my - slope * mx, n };
}
