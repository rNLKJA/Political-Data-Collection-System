/**
 * Agreement between a labeller and gold labels, with scikit-learn's
 * conventions (checked against sklearn in `stats-extra.test.ts`):
 * accuracy, Cohen's kappa, per-class precision / recall / F1 with
 * `zero_division=0`, and macro-F1 over the labels present in either list.
 */

export function accuracy(gold: readonly string[], pred: readonly string[]): number {
  if (gold.length === 0) return Number.NaN;
  let k = 0;
  for (let i = 0; i < gold.length; i++) if (gold[i] === pred[i]) k++;
  return k / gold.length;
}

/**
 * Cohen's kappa: (p_o − p_e) / (1 − p_e), where p_e is the agreement expected
 * if both labellers assigned labels independently at their own observed
 * rates. 1 is perfect agreement, 0 is chance level. Undefined (NaN) when
 * p_e = 1, i.e. both lists use one and the same label throughout; sklearn's
 * `cohen_kappa_score` returns nan there too.
 */
export function cohensKappa(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  if (n === 0 || n !== b.length) return Number.NaN;
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  let agree = 0;
  for (let i = 0; i < n; i++) {
    ca.set(a[i], (ca.get(a[i]) ?? 0) + 1);
    cb.set(b[i], (cb.get(b[i]) ?? 0) + 1);
    if (a[i] === b[i]) agree++;
  }
  let pe = 0;
  for (const [label, k] of ca) pe += (k / n) * ((cb.get(label) ?? 0) / n);
  const po = agree / n;
  if (pe >= 1) return Number.NaN;
  return (po - pe) / (1 - pe);
}

export interface ClassMetrics {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  /** gold items with this label */
  support: number;
  /** items predicted as this label */
  predicted: number;
}

/** Labels present in gold or predictions, sorted like `numpy.unique`. */
export function presentLabels(gold: readonly string[], pred: readonly string[]): string[] {
  return [...new Set([...gold, ...pred])].sort();
}

export function perClassMetrics(
  gold: readonly string[],
  pred: readonly string[],
  labels: readonly string[] = presentLabels(gold, pred),
): ClassMetrics[] {
  return labels.map((label) => {
    let tp = 0;
    let support = 0;
    let predicted = 0;
    for (let i = 0; i < gold.length; i++) {
      const g = gold[i] === label;
      const p = pred[i] === label;
      if (g) support++;
      if (p) predicted++;
      if (g && p) tp++;
    }
    const precision = predicted === 0 ? 0 : tp / predicted;
    const recall = support === 0 ? 0 : tp / support;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { label, precision, recall, f1, support, predicted };
  });
}

/** Unweighted mean F1 over `labels` (default: labels present in gold or predictions). */
export function macroF1(
  gold: readonly string[],
  pred: readonly string[],
  labels: readonly string[] = presentLabels(gold, pred),
): number {
  if (labels.length === 0) return Number.NaN;
  const per = perClassMetrics(gold, pred, labels);
  return per.reduce((a, m) => a + m.f1, 0) / per.length;
}

/** Pick the entries of `xs` at `indices` (for bootstrapping label vectors). */
export function at<T>(xs: readonly T[], indices: readonly number[]): T[] {
  return indices.map((i) => xs[i]);
}
