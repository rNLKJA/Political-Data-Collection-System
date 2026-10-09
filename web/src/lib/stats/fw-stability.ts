/**
 * Bootstrap stability of the Fightin' Words top lists.
 *
 * The Fightin' Words z-score treats every word token as an independent draw.
 * Campaign text is not like that: one press release can repeat a word thirty
 * times, so a word can top a list on the strength of a handful of documents.
 * To see which words would survive a different sample of documents, resample
 * the documents (not the tokens) of each group with replacement, recompute
 * every z-score with the same prior, and record for each of the original top
 * words:
 *
 * - stability: the share of resamples in which it is still among the top k on
 *   its side (k = the length of the list shown);
 * - a percentile interval for its z-score across resamples.
 *
 * Documents of group A are drawn first, then group B, from one mulberry32
 * stream, so a result is reproducible from its seed. `scripts/stats_reference.py`
 * re-implements the procedure in Python for the reference test.
 */
import { quantile } from "./bootstrap";
import { fightinWords } from "./fightin-words";
import { mulberry32 } from "./random";

/** Postings for term t live in docs/counts[offsets[t] .. offsets[t + 1]). */
export interface PostingsIndex {
  nDocs: number;
  offsets: Int32Array;
  docs: Int32Array;
  counts: Int32Array;
}

export interface StabilityOptions {
  resamples?: number;
  seed?: number;
  /** size of each top list (stability = share of resamples a word stays in it) */
  top?: number;
  alpha0?: number;
  level?: number;
}

export interface TermStability {
  term: number;
  /** z-score on the original sample */
  z: number;
  zLower: number;
  zUpper: number;
  /** share of resamples in which the term is in its side's top list */
  stability: number;
}

export interface StabilityResult {
  resamples: number;
  seed: number;
  top: number;
  level: number;
  a: TermStability[];
  b: TermStability[];
}

export const STABILITY_RESAMPLES = 200;

/** The k-th largest value of `score` over the indices where `use` is true (−∞ if fewer). */
export function kthLargest(score: ArrayLike<number>, k: number, use: (i: number) => boolean) {
  // A size-k min-heap: O(V log k).
  const heap: number[] = [];
  const up = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= heap[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const down = (i: number) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l] < heap[m]) m = l;
      if (r < heap.length && heap[r] < heap[m]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  };
  for (let i = 0; i < score.length; i++) {
    const v = score[i];
    if (Number.isNaN(v) || !use(i)) continue;
    if (heap.length < k) {
      heap.push(v);
      up(heap.length - 1);
    } else if (v > heap[0]) {
      heap[0] = v;
      down(0);
    }
  }
  return heap.length < k ? Number.NEGATIVE_INFINITY : heap[0];
}

/**
 * Resample documents within each group and report how stable the original top
 * words are. `docsA` and `docsB` list the document ids in each group; `topA`
 * and `topB` are the term ids of the original lists (largest z first, and most
 * negative z first).
 */
export function fightinWordsStability(
  ix: PostingsIndex,
  prior: ArrayLike<number>,
  docsA: ArrayLike<number>,
  docsB: ArrayLike<number>,
  topA: readonly number[],
  topB: readonly number[],
  {
    resamples = STABILITY_RESAMPLES,
    seed = 20261010,
    top = 30,
    alpha0 = 10_000,
    level = 0.95,
  }: StabilityOptions = {},
): StabilityResult {
  const V = ix.offsets.length - 1;
  const rng = mulberry32(seed);
  const wA = new Float64Array(ix.nDocs);
  const wB = new Float64Array(ix.nDocs);
  const yA = new Float64Array(V);
  const yB = new Float64Array(V);
  const zA = topA.map(() => new Float64Array(resamples));
  const zB = topB.map(() => new Float64Array(resamples));
  const inA = topA.map(() => 0);
  const inB = topB.map(() => 0);
  const nA = docsA.length;
  const nB = docsB.length;

  for (let r = 0; r < resamples; r++) {
    wA.fill(0);
    wB.fill(0);
    for (let i = 0; i < nA; i++) wA[docsA[Math.floor(rng() * nA)]] += 1;
    for (let i = 0; i < nB; i++) wB[docsB[Math.floor(rng() * nB)]] += 1;
    for (let t = 0; t < V; t++) {
      let sa = 0;
      let sb = 0;
      for (let i = ix.offsets[t]; i < ix.offsets[t + 1]; i++) {
        const d = ix.docs[i];
        const c = ix.counts[i];
        sa += wA[d] * c;
        sb += wB[d] * c;
      }
      yA[t] = sa;
      yB[t] = sb;
    }
    const { z } = fightinWords(yA, yB, prior, alpha0);
    const used = (t: number) => yA[t] + yB[t] > 0;
    const thrA = kthLargest(z, top, used);
    const neg = Float64Array.from(z, (v) => -v);
    const thrB = kthLargest(neg, top, used);
    topA.forEach((t, j) => {
      zA[j][r] = z[t];
      if (used(t) && z[t] > 0 && z[t] >= thrA) inA[j]++;
    });
    topB.forEach((t, j) => {
      zB[j][r] = z[t];
      if (used(t) && z[t] < 0 && neg[t] >= thrB) inB[j]++;
    });
  }

  const alpha = 1 - level;
  const original = fightinWords(sumCounts(ix, docsA, V), sumCounts(ix, docsB, V), prior, alpha0).z;
  const summarise = (terms: readonly number[], zs: Float64Array[], hits: number[]) =>
    terms.map((t, j) => {
      const vals = Array.from(zs[j]).filter((v) => !Number.isNaN(v));
      return {
        term: t,
        z: original[t],
        zLower: quantile(vals, alpha / 2),
        zUpper: quantile(vals, 1 - alpha / 2),
        stability: hits[j] / resamples,
      };
    });
  return {
    resamples,
    seed,
    top,
    level,
    a: summarise(topA, zA, inA),
    b: summarise(topB, zB, inB),
  };
}

/** Term counts summed over a list of documents (each counted once). */
export function sumCounts(ix: PostingsIndex, docs: ArrayLike<number>, V: number): Float64Array {
  const w = new Uint8Array(ix.nDocs);
  for (let i = 0; i < docs.length; i++) w[docs[i]] = 1;
  const y = new Float64Array(V);
  for (let t = 0; t < V; t++) {
    let s = 0;
    for (let i = ix.offsets[t]; i < ix.offsets[t + 1]; i++) if (w[ix.docs[i]]) s += ix.counts[i];
    y[t] = s;
  }
  return y;
}
