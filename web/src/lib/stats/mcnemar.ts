/**
 * McNemar's exact test for two labellers scored on the same items.
 *
 * Only the discordant pairs carry information: b = items labeller A gets
 * right and B gets wrong, c = the reverse. Under H0 (equal accuracy)
 * b ~ Binomial(b + c, 1/2). Matches `statsmodels ... mcnemar(table, exact=True)`.
 */
import { binomialCdf } from "./distributions";

export interface McNemarResult {
  /** A right, B wrong */
  b: number;
  /** A wrong, B right */
  c: number;
  bothRight: number;
  bothWrong: number;
  n: number;
  /** two-sided exact (binomial) p-value */
  exactP: number;
}

export function mcnemar(aCorrect: readonly boolean[], bCorrect: readonly boolean[]): McNemarResult {
  if (aCorrect.length !== bCorrect.length) {
    throw new Error("McNemar's test needs paired results of equal length.");
  }
  let b = 0;
  let c = 0;
  let both = 0;
  let neither = 0;
  for (let i = 0; i < aCorrect.length; i++) {
    if (aCorrect[i] && !bCorrect[i]) b++;
    else if (!aCorrect[i] && bCorrect[i]) c++;
    else if (aCorrect[i]) both++;
    else neither++;
  }
  const d = b + c;
  const exactP = d === 0 ? 1 : Math.min(1, 2 * binomialCdf(Math.min(b, c), d, 0.5));
  return { b, c, bothRight: both, bothWrong: neither, n: aCorrect.length, exactP };
}
