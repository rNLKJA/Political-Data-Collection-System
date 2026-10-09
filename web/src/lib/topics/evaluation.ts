/**
 * Scoring a topic labeller against the gold set, and comparing two labellers
 * on the same excerpts (the paired design used on /topics).
 */
import {
  accuracy,
  at,
  cohensKappa,
  perClassMetrics,
  type ClassMetrics,
} from "@/lib/stats/agreement";
import { bootstrap, DEFAULT_SEED, type BootstrapInterval } from "@/lib/stats/bootstrap";
import { mcnemar, type McNemarResult } from "@/lib/stats/mcnemar";
import { wilsonInterval, type ProportionInterval } from "@/lib/stats/proportion";

import type { TopicId } from "./codebook";

export interface EvalOptions {
  resamples?: number;
  seed?: number;
}

export interface LabellerScore {
  n: number;
  /** share of excerpts where the labeller matches the gold label (Wilson 95% CI) */
  agreement: ProportionInterval;
  /** Cohen's kappa against gold (percentile bootstrap over excerpts) */
  kappa: BootstrapInterval;
  /** agreement on the excerpts whose gold label is a policy topic (not "none") */
  policyAgreement: ProportionInterval;
  /** how often the labeller says "none", against how often gold does */
  noneRate: { labeller: number; gold: number };
  perClass: ClassMetrics[];
}

export function scoreLabeller(
  gold: readonly TopicId[],
  pred: readonly TopicId[],
  { resamples = 10_000, seed = DEFAULT_SEED }: EvalOptions = {},
): LabellerScore {
  const n = gold.length;
  let correct = 0;
  let policyN = 0;
  let policyCorrect = 0;
  let predNone = 0;
  let goldNone = 0;
  for (let i = 0; i < n; i++) {
    const ok = gold[i] === pred[i];
    if (ok) correct++;
    if (gold[i] !== "none") {
      policyN++;
      if (ok) policyCorrect++;
    } else goldNone++;
    if (pred[i] === "none") predNone++;
  }
  return {
    n,
    agreement: wilsonInterval(correct, n),
    kappa: bootstrap(n, (idx) => cohensKappa(at(gold, idx), at(pred, idx)), { resamples, seed }),
    policyAgreement: wilsonInterval(policyCorrect, policyN),
    noneRate: { labeller: n ? predNone / n : Number.NaN, gold: n ? goldNone / n : Number.NaN },
    perClass: perClassMetrics(gold, pred),
  };
}

export interface PairedComparison {
  n: number;
  /** agreement of A minus agreement of B, both against gold (paired bootstrap) */
  agreementDiff: BootstrapInterval;
  /** kappa of A minus kappa of B (paired bootstrap) */
  kappaDiff: BootstrapInterval;
  mcnemar: McNemarResult;
  /** how often A and B give the same label, and their kappa with each other */
  between: { agreement: number; kappa: number };
}

/** Compare labellers A and B on the same excerpts; every resample is shared by both. */
export function comparePaired(
  gold: readonly TopicId[],
  predA: readonly TopicId[],
  predB: readonly TopicId[],
  { resamples = 10_000, seed = DEFAULT_SEED }: EvalOptions = {},
): PairedComparison {
  const n = gold.length;
  const okA = gold.map((g, i) => g === predA[i]);
  const okB = gold.map((g, i) => g === predB[i]);
  return {
    n,
    agreementDiff: bootstrap(
      n,
      (idx) => {
        let d = 0;
        for (const i of idx) d += Number(okA[i]) - Number(okB[i]);
        return d / idx.length;
      },
      { resamples, seed },
    ),
    kappaDiff: bootstrap(
      n,
      (idx) => {
        const g = at(gold, idx);
        return cohensKappa(g, at(predA, idx)) - cohensKappa(g, at(predB, idx));
      },
      { resamples, seed },
    ),
    mcnemar: mcnemar(okA, okB),
    between: { agreement: accuracy(predA, predB), kappa: cohensKappa(predA, predB) },
  };
}
