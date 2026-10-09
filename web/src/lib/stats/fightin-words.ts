/**
 * Weighted log-odds ratio with an informative Dirichlet prior
 * (Monroe, Colaresi & Quinn 2008, "Fightin' Words", Political Analysis 16(4)).
 *
 * For word w, groups i and j with counts y_w^i, totals n^i, and prior
 * pseudo-counts a_w = alpha0 * (corpus count of w / corpus total):
 *
 *   delta_w = log((y_w^i + a_w) / (n^i + alpha0 - y_w^i - a_w))
 *           - log((y_w^j + a_w) / (n^j + alpha0 - y_w^j - a_w))
 *   var_w  ~= 1 / (y_w^i + a_w) + 1 / (y_w^j + a_w)
 *   z_w     = delta_w / sqrt(var_w)
 *
 * Positive z: more characteristic of group i (A); negative: of group j (B).
 * The arithmetic is ordered exactly like `fightin_words` in
 * scripts/build_analytics.py so the parity test can compare to 1e-9.
 */

export interface FightinWordsResult {
  delta: Float64Array;
  z: Float64Array;
  nA: number;
  nB: number;
}

export const DEFAULT_ALPHA0 = 10_000;
/** |z| above this is conventionally read as "clearly distinctive" (two-sided p < 0.05). */
export const Z_THRESHOLD = 1.96;

export function fightinWords(
  yA: ArrayLike<number>,
  yB: ArrayLike<number>,
  prior: ArrayLike<number>,
  alpha0: number = DEFAULT_ALPHA0,
): FightinWordsResult {
  const V = prior.length;
  let nPrior = 0;
  let nA = 0;
  let nB = 0;
  for (let w = 0; w < V; w++) {
    nPrior += prior[w];
    nA += yA[w];
    nB += yB[w];
  }
  const delta = new Float64Array(V);
  const z = new Float64Array(V);
  for (let w = 0; w < V; w++) {
    const a = (alpha0 * prior[w]) / nPrior;
    if (a <= 0) {
      delta[w] = Number.NaN;
      z[w] = Number.NaN;
      continue;
    }
    const ia = yA[w];
    const ib = yB[w];
    const la = Math.log((ia + a) / (nA + alpha0 - ia - a));
    const lb = Math.log((ib + a) / (nB + alpha0 - ib - a));
    const d = la - lb;
    const variance = 1.0 / (ia + a) + 1.0 / (ib + a);
    delta[w] = d;
    z[w] = d / Math.sqrt(variance);
  }
  return { delta, z, nA, nB };
}

/** Indices of the `k` largest values of `score` (descending), ignoring NaN. */
export function topIndices(
  score: ArrayLike<number>,
  k: number,
  filter?: (i: number) => boolean,
): number[] {
  const idx: number[] = [];
  for (let i = 0; i < score.length; i++) {
    if (!Number.isNaN(score[i]) && (!filter || filter(i))) idx.push(i);
  }
  idx.sort((a, b) => score[b] - score[a]);
  return idx.slice(0, k);
}
