/**
 * The evaluation and stability statistics, checked against the Python
 * scientific stack (reference values written by scripts/stats_reference.py).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { at, cohensKappa, perClassMetrics } from "./agreement";
import {
  bootstrap,
  bootstrapMean,
  clusterBootstrap,
  clusterBootstrapMean,
  groupRows,
  quantile,
} from "./bootstrap";
import { binomialCdf, normalQuantile, studentTCdf, studentTQuantile } from "./distributions";
import { fightinWordsStability, kthLargest } from "./fw-stability";
import { mcnemar } from "./mcnemar";
import { wilsonInterval } from "./proportion";
import { mulberry32, sampleWithoutReplacement } from "./random";
import { olsLine } from "./regression";
import { signTest, tIntervalMean } from "./small-sample";

const ref = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "src/lib/__fixtures__/stats-reference.json"), "utf8"),
);
const U = ref.units;

const close = (a: number, b: number, tol = 1e-9) =>
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("mulberry32 and sampling", () => {
  it("matches the Python port bit for bit", () => {
    for (const [seed, expected] of Object.entries(U.mulberry32) as [string, number[]][]) {
      const rng = mulberry32(Number(seed));
      expect(expected.map(() => rng())).toEqual(expected);
    }
  });

  it("samples without replacement, reproducibly and without repeats", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const a = sampleWithoutReplacement(items, 30, 7);
    expect(a).toEqual(sampleWithoutReplacement(items, 30, 7));
    expect(new Set(a).size).toBe(30);
    expect(sampleWithoutReplacement(items, 500, 7)).toHaveLength(120);
    expect(items[0]).toBe(0);
  });
});

describe("distributions", () => {
  it("normal quantile matches scipy", () => {
    for (const [p, q] of U.normal_ppf) close(normalQuantile(p), q, 1e-12);
  });
  it("Student's t quantile matches scipy, and the CDF inverts it", () => {
    for (const [p, df, q] of U.t_ppf) {
      close(studentTQuantile(p, df), q, 1e-10);
      close(studentTCdf(q, df), p, 1e-12);
    }
    expect(studentTQuantile(0.5, 7)).toBe(0);
    expect(Number.isNaN(studentTQuantile(0.9, 0))).toBe(true);
  });
  it("binomial CDF matches scipy", () => {
    for (const [k, n, p, c] of U.binom_cdf) close(binomialCdf(k, n, p), c, 1e-12);
  });
  it("quantile matches numpy's default", () => {
    for (const { x, p, expected } of U.quantile) {
      p.forEach((pp: number, i: number) => close(quantile(x, pp), expected[i], 1e-15));
    }
  });
});

describe("intervals and tests", () => {
  it("Wilson interval matches statsmodels", () => {
    for (const w of U.wilson) {
      const ci = wilsonInterval(w.k, w.n);
      close(ci.lower, w.lower, 1e-12);
      close(ci.upper, w.upper, 1e-12);
    }
    expect(Number.isNaN(wilsonInterval(0, 0).estimate)).toBe(true);
  });

  it("McNemar exact p matches statsmodels", () => {
    for (const { b, c, exact_p } of U.mcnemar) {
      const a = [
        ...Array(7).fill(true),
        ...Array(b).fill(true),
        ...Array(c).fill(false),
        ...Array(9).fill(false),
      ];
      const bb = [
        ...Array(7).fill(true),
        ...Array(b).fill(false),
        ...Array(c).fill(true),
        ...Array(9).fill(false),
      ];
      const r = mcnemar(a, bb);
      expect([r.b, r.c]).toEqual([b, c]);
      close(r.exactP, exact_p, 1e-12);
    }
    expect(() => mcnemar([true], [true, false])).toThrow();
  });

  it("Cohen's kappa and per-class metrics match scikit-learn", () => {
    for (const c of U.classification) {
      const k = cohensKappa(c.gold, c.pred);
      if (c.kappa === null) expect(Number.isNaN(k)).toBe(true);
      else close(k, c.kappa, 1e-12);
      if (!c.precision) continue;
      const per = perClassMetrics(c.gold, c.pred, c.labels);
      per.forEach((m, i) => {
        close(m.precision, c.precision[i], 1e-12);
        close(m.recall, c.recall[i], 1e-12);
        close(m.f1, c.f1[i], 1e-12);
        expect(m.support).toBe(c.support[i]);
      });
    }
  });

  it("bootstraps kappa and a mean exactly like the numpy reference", () => {
    const c = U.classification[1];
    const bk = bootstrap(c.gold.length, (idx) => cohensKappa(at(c.gold, idx), at(c.pred, idx)), {
      resamples: 2000,
      seed: 7,
    });
    close(bk.estimate, U.bootstrap_kappa.estimate);
    close(bk.lower, U.bootstrap_kappa.lower);
    close(bk.upper, U.bootstrap_kappa.upper);
    close(bk.se, U.bootstrap_kappa.se, 1e-8);
    const bm = bootstrapMean(U.bootstrap_mean.x, { resamples: 2000, seed: 99 });
    close(bm.lower, U.bootstrap_mean.lower);
    close(bm.upper, U.bootstrap_mean.upper);
  });

  it("drops resamples where the statistic is undefined, and counts them", () => {
    const r = bootstrap(3, (idx) => (idx[0] === 0 ? Number.NaN : 1), { resamples: 500, seed: 1 });
    expect(r.undefined).toBeGreaterThan(0);
    expect(r.lower).toBe(1);
  });

  it("OLS line matches scipy.stats.linregress", () => {
    const fit = olsLine(U.ols.x, U.ols.y);
    close(fit.slope, U.ols.slope, 1e-10);
    close(fit.intercept, U.ols.intercept, 1e-8);
    expect(Number.isNaN(olsLine([1, 1], [2, 3]).slope)).toBe(true);
  });

  it("t interval for a mean matches scipy.stats.t.interval", () => {
    const ci = tIntervalMean(U.t_interval.x);
    close(ci.estimate, U.t_interval.estimate, 1e-12);
    close(ci.lower, U.t_interval.lower, 1e-10);
    close(ci.upper, U.t_interval.upper, 1e-10);
    expect(ci.df).toBe(U.t_interval.x.length - 1);
    expect(Number.isNaN(tIntervalMean([1]).lower)).toBe(true);
  });

  it("sign test matches scipy.stats.binomtest and ignores ties", () => {
    for (const c of U.sign_test) {
      const s = signTest(c.x);
      expect([s.negative, s.positive]).toEqual([c.negative, c.positive]);
      close(s.p, c.p, 1e-12);
    }
    expect(signTest([0, 0]).p).toBe(1);
  });
});

describe("cluster bootstrap", () => {
  const C = U.cluster_bootstrap;
  const opts = { resamples: C.resamples, seed: C.seed };

  it("groups rows by key in ascending order", () => {
    expect(groupRows([5, 3, 5, 1])).toEqual({ keys: [1, 3, 5], members: [[3], [1], [0, 2]] });
  });

  it("resamples whole clusters exactly like the numpy reference", () => {
    const m = clusterBootstrapMean(C.y, C.keys, opts);
    expect(m.method).toBe("cluster bootstrap");
    expect(m.clusters).toBe(C.mean.clusters);
    close(m.estimate, C.mean.estimate, 1e-12);
    close(m.lower, C.mean.lower);
    close(m.upper, C.mean.upper);
    close(m.se, C.mean.se, 1e-8);

    const s = clusterBootstrap(
      C.keys,
      (rows) =>
        olsLine(
          rows.map((r) => C.x[r]),
          rows.map((r) => C.y[r]),
        ).slope,
      opts,
    );
    expect(s.clusters).toBe(C.slope.clusters);
    close(s.estimate, C.slope.estimate, 1e-9);
    close(s.lower, C.slope.lower, 1e-8);
    close(s.upper, C.slope.upper, 1e-8);
  });

  it("is wider than a row bootstrap when clusters share a level", () => {
    const keys = Array.from({ length: 60 }, (_, i) => Math.floor(i / 10));
    const values = keys.map((k, i) => k * 3 + (i % 10) * 0.01);
    const rowCi = bootstrapMean(values, opts);
    const clusterCi = clusterBootstrapMean(values, keys, opts);
    expect(clusterCi.upper - clusterCi.lower).toBeGreaterThan(2 * (rowCi.upper - rowCi.lower));
  });
});

describe("Fightin' Words bootstrap stability", () => {
  const f = ref.fw_stability;
  const ix = {
    nDocs: f.index.nDocs,
    offsets: Int32Array.from(f.index.offsets),
    docs: Int32Array.from(f.index.docs),
    counts: Int32Array.from(f.index.counts),
  };

  it("matches an independent Python port of the procedure", () => {
    const res = fightinWordsStability(ix, f.prior, f.docsA, f.docsB, f.topA, f.topB, f.options);
    expect(res.a.map((t) => t.term)).toEqual(f.topA);
    expect(res.b.map((t) => t.term)).toEqual(f.topB);
    for (const [mine, theirs] of [
      [res.a, f.a],
      [res.b, f.b],
    ] as const) {
      mine.forEach((t, i) => {
        expect(t.stability).toBe(theirs[i].stability);
        close(t.z, theirs[i].z);
        close(t.zLower, theirs[i].zLower);
        close(t.zUpper, theirs[i].zUpper);
      });
    }
  });

  it("is fully stable when every document in a group is identical", () => {
    // two terms; group A only uses term 0, group B only term 1
    const tiny = {
      nDocs: 4,
      offsets: Int32Array.from([0, 2, 4]),
      docs: Int32Array.from([0, 1, 2, 3]),
      counts: Int32Array.from([5, 5, 5, 5]),
    };
    const r = fightinWordsStability(tiny, [10, 10], [0, 1], [2, 3], [0], [1], {
      top: 1,
      alpha0: 10,
      resamples: 50,
    });
    expect(r.a[0].stability).toBe(1);
    expect(r.b[0].stability).toBe(1);
    expect(r.a[0].zLower).toBeCloseTo(r.a[0].z, 12);
  });

  it("finds the k-th largest value", () => {
    const v = [3, 9, Number.NaN, 1, 7, 5];
    expect(kthLargest(v, 2, () => true)).toBe(7);
    expect(kthLargest(v, 2, (i) => i !== 1)).toBe(5);
    expect(kthLargest(v, 9, () => true)).toBe(Number.NEGATIVE_INFINITY);
  });
});
