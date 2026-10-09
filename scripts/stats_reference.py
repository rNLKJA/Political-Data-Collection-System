# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy>=1.26",
#   "scipy>=1.11",
#   "statsmodels>=0.14",
#   "scikit-learn>=1.3",
# ]
# ///
"""Reference values for the web app's statistics (web/src/lib/stats and the
readability summaries), computed with the Python scientific stack.

* distributions: scipy.stats (norm, binom)
* Wilson intervals and McNemar's exact test: statsmodels
* Cohen's kappa and per-class precision / recall / F1: scikit-learn
* OLS slope: scipy.stats.linregress
* Student's t quantiles and t intervals: scipy.stats.t; the sign test:
  scipy.stats.binomtest
* percentile bootstrap: numpy.quantile on resamples drawn from a vectorised
  port of the same mulberry32 generator, so the TypeScript intervals can be
  compared digit for digit; the cluster bootstrap draws whole clusters (in
  ascending key order) from the same stream
* Fightin' Words bootstrap stability: an independent Python port of the
  procedure on a small synthetic corpus
* the /readability summaries, recomputed from web/data/analytics.db

Writes web/src/lib/__fixtures__/stats-reference.json. Run from the repository
root:

    uv run scripts/stats_reference.py
"""

from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path

import numpy as np
from scipy import stats
from sklearn.metrics import cohen_kappa_score, precision_recall_fscore_support
from statsmodels.stats.contingency_tables import mcnemar
from statsmodels.stats.proportion import proportion_confint

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "web" / "data" / "analytics.db"
OUT = ROOT / "web" / "src" / "lib" / "__fixtures__" / "stats-reference.json"

MASK = np.uint64(0xFFFFFFFF)
SEED = 20261010
RESAMPLES = 10_000
LEVEL = 0.95
ALPHA = 1 - LEVEL  # 0.050000000000000044, the same float the TypeScript code uses


# --------------------------------------------------------------------------- rng
def mulberry32_stream(seed: int, count: int) -> np.ndarray:
    """The first `count` outputs of mulberry32(seed), vectorised.

    mulberry32's state advances by a constant (a += 0x6D2B79F5), and each
    output depends only on the new state, so the k-th output can be computed
    directly from seed + (k + 1) * 0x6D2B79F5 (mod 2^32).
    """
    k = np.arange(1, count + 1, dtype=np.uint64)
    a = (np.uint64(seed & 0xFFFFFFFF) + k * np.uint64(0x6D2B79F5)) & MASK

    def imul(x, y):
        return (x * y) & MASK

    t = imul(a ^ (a >> np.uint64(15)), np.uint64(1) | a)
    t = ((t + imul(t ^ (t >> np.uint64(7)), np.uint64(61) | t)) & MASK) ^ t
    return ((t ^ (t >> np.uint64(14))) & MASK).astype(np.float64) / 4294967296.0


class Mulberry32:
    """Sequential port (for procedures that interleave draws of different sizes)."""

    def __init__(self, seed: int):
        self.a = seed & 0xFFFFFFFF

    def __call__(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        a = self.a
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def resample_indices(n: int, resamples: int = RESAMPLES, seed: int = SEED) -> np.ndarray:
    u = mulberry32_stream(seed, n * resamples).reshape(resamples, n)
    return np.floor(u * n).astype(np.int64)


def interval(values: np.ndarray, estimate: float) -> dict:
    values = values[~np.isnan(values)]
    lo, hi = np.quantile(values, [ALPHA / 2, 1 - ALPHA / 2])
    return {
        "estimate": float(estimate),
        "lower": float(lo),
        "upper": float(hi),
        "se": float(np.std(values, ddof=1)),
    }


def boot_mean(x: np.ndarray, resamples: int = RESAMPLES, seed: int = SEED) -> dict:
    idx = resample_indices(len(x), resamples, seed)
    return interval(x[idx].mean(axis=1), x.mean())


def cluster_members(keys) -> list[np.ndarray]:
    """Row indices per cluster, clusters in ascending key order."""
    keys = list(keys)
    return [np.array([i for i, k in enumerate(keys) if k == c]) for c in sorted(set(keys))]


def boot_cluster_mean(x: np.ndarray, keys, resamples: int = RESAMPLES, seed: int = SEED) -> dict:
    """Mean over all rows of the drawn clusters, whole clusters resampled."""
    members = cluster_members(keys)
    sums = np.array([x[m].sum() for m in members])
    counts = np.array([len(m) for m in members])
    idx = resample_indices(len(members), resamples, seed)
    vals = sums[idx].sum(axis=1) / counts[idx].sum(axis=1)
    return {**interval(vals, x.mean()), "clusters": len(members)}


def t_interval(x: np.ndarray) -> dict:
    lo, hi = stats.t.interval(LEVEL, len(x) - 1, loc=x.mean(), scale=stats.sem(x))
    return {"estimate": float(x.mean()), "lower": float(lo), "upper": float(hi)}


def sign_test(x: np.ndarray) -> dict:
    neg, pos = int((x < 0).sum()), int((x > 0).sum())
    p = stats.binomtest(min(neg, pos), neg + pos, 0.5).pvalue if neg + pos else 1.0
    return {"negative": neg, "positive": pos, "p": float(p)}


def ols_slope(xs: np.ndarray, ys: np.ndarray) -> tuple[float, float]:
    mx, my = xs.mean(), ys.mean()
    sxx = ((xs - mx) ** 2).sum()
    slope = ((xs - mx) * (ys - my)).sum() / sxx if sxx > 0 else math.nan
    return slope, my - slope * mx


# ----------------------------------------------------------------- unit fixtures
def kappa(a, b) -> float:
    with np.errstate(divide="ignore", invalid="ignore"):
        v = cohen_kappa_score(a, b)
    return float(v)


def units() -> dict:
    out: dict = {}
    seq = Mulberry32(42)
    out["mulberry32"] = {
        str(s): mulberry32_stream(s, 8).tolist() for s in (0, 42, 20261010, 4294967295)
    }
    assert out["mulberry32"]["42"] == [seq() for _ in range(8)]

    rs = np.random.default_rng(11)
    xs = [rs.normal(size=7).round(6).tolist(), rs.uniform(size=50).round(6).tolist(), [1.0, 1.0, 2.0]]
    ps = [0.0, 0.025000000000000022, 0.1, 0.5, 0.9, 0.975, 1.0]
    out["quantile"] = [{"x": x, "p": ps, "expected": [float(np.quantile(x, p)) for p in ps]} for x in xs]

    out["normal_ppf"] = [
        [p, float(stats.norm.ppf(p))]
        for p in [1e-12, 1e-6, 0.001, 0.025, 0.2, 0.5, 0.7, 0.975, 0.999, 1 - 1e-9]
    ]
    out["binom_cdf"] = [
        [k, n, p, float(stats.binom.cdf(k, n, p))]
        for k, n, p in [(0, 5, 0.5), (3, 10, 0.5), (7, 20, 0.5), (2, 9, 0.3), (40, 120, 0.5)]
    ]
    out["wilson"] = []
    for k, n in [(0, 20), (1, 20), (10, 20), (19, 20), (20, 20), (91, 120), (27, 50)]:
        lo, hi = proportion_confint(k, n, alpha=ALPHA, method="wilson")
        out["wilson"].append({"k": k, "n": n, "lower": float(lo), "upper": float(hi)})

    out["mcnemar"] = []
    for b, c in [(0, 0), (3, 0), (5, 1), (10, 4), (12, 21), (1, 30)]:
        res = mcnemar([[7, b], [c, 9]], exact=True)
        out["mcnemar"].append({"b": b, "c": c, "exact_p": float(res.pvalue)})

    labels = ["none", "health", "defence", "labour", "civil-rights", "macroeconomics"]
    rs = np.random.default_rng(5)
    cases = []
    for n, k in [(30, 3), (120, 6), (12, 4)]:
        a = [labels[i] for i in rs.integers(0, k, size=n)]
        b = [x if rs.uniform() < 0.6 else labels[rs.integers(0, k)] for x in a]
        lab = sorted(set(a) | set(b))
        p, r, f, s = precision_recall_fscore_support(a, b, labels=lab, zero_division=0)
        cases.append(
            {
                "gold": a,
                "pred": b,
                "labels": lab,
                "kappa": kappa(a, b),
                "precision": p.tolist(),
                "recall": r.tolist(),
                "f1": f.tolist(),
                "support": s.tolist(),
            }
        )
    cases.append({"gold": ["none"] * 4, "pred": ["none"] * 4, "labels": ["none"], "kappa": None})
    out["classification"] = cases

    # bootstrap of kappa (the topic page's interval), same stream as the TypeScript
    g, p = np.array(cases[1]["gold"]), np.array(cases[1]["pred"])
    idx = resample_indices(len(g), 2000, 7)
    vals = np.array([kappa(g[row], p[row]) for row in idx])
    out["bootstrap_kappa"] = {"resamples": 2000, "seed": 7, **interval(vals, kappa(g, p))}

    x = np.random.default_rng(3).gamma(2.0, 1.5, size=40).round(6)
    out["bootstrap_mean"] = {"x": x.tolist(), "resamples": 2000, "seed": 99, **boot_mean(x, 2000, 99)}

    out["t_ppf"] = [
        [p, df, float(stats.t.ppf(p, df))]
        for p, df in [(0.975, 1), (0.975, 2), (0.975, 13), (0.995, 13), (0.9, 5), (0.025, 30), (0.975, 200)]
    ]
    tx = np.random.default_rng(14).normal(-5, 2.5, size=14).round(6)
    out["t_interval"] = {"x": tx.tolist(), **t_interval(tx)}
    sx = np.array([-1.2, -0.4, 0.0, -2.2, 0.3, -0.9, -1.1, -0.1, -3.0])
    out["sign_test"] = [
        {"x": sx.tolist(), **sign_test(sx)},
        {"x": [-1.0] * 14, **sign_test(np.array([-1.0] * 14))},
    ]

    # cluster bootstrap: 12 clusters of uneven size, mean and OLS slope
    rs = np.random.default_rng(21)
    keys = np.repeat(np.arange(12) * 4 + 1960, rs.integers(1, 9, size=12))
    cx = (keys + rs.uniform(0, 1, size=len(keys))).round(4)
    cy = (12 - 0.04 * (cx - 1960) + rs.normal(0, 1, size=len(keys)) + np.repeat(rs.normal(0, 1, size=12), np.bincount(np.searchsorted(np.unique(keys), keys)))).round(4)
    members = cluster_members(keys.tolist())
    idx = resample_indices(len(members), 2000, 5)
    slopes = []
    for row in idx:
        sel = np.concatenate([members[c] for c in row])
        slopes.append(ols_slope(cx[sel], cy[sel])[0])
    out["cluster_bootstrap"] = {
        "keys": keys.tolist(),
        "x": cx.tolist(),
        "y": cy.tolist(),
        "resamples": 2000,
        "seed": 5,
        "mean": boot_cluster_mean(cy, keys.tolist(), 2000, 5),
        "slope": {**interval(np.array(slopes), ols_slope(cx, cy)[0]), "clusters": len(members)},
    }

    xr = np.random.default_rng(8).uniform(1960, 2024, size=30).round(3)
    yr = (10 - 0.05 * (xr - 1960) + np.random.default_rng(9).normal(0, 0.8, size=30)).round(4)
    lr = stats.linregress(xr, yr)
    out["ols"] = {"x": xr.tolist(), "y": yr.tolist(), "slope": float(lr.slope), "intercept": float(lr.intercept)}
    return out


# ------------------------------------------------------- Fightin' Words stability
def fightin_words_z(ya, yb, prior, alpha0):
    n_prior = float(sum(prior))
    na = float(sum(ya))
    nb = float(sum(yb))
    z = []
    for w in range(len(prior)):
        a = alpha0 * prior[w] / n_prior
        if a <= 0:
            z.append(math.nan)
            continue
        ia, ib = ya[w], yb[w]
        la = math.log((ia + a) / (na + alpha0 - ia - a))
        lb = math.log((ib + a) / (nb + alpha0 - ib - a))
        d = la - lb
        z.append(d / math.sqrt(1.0 / (ia + a) + 1.0 / (ib + a)))
    return z


def fw_stability() -> dict:
    rs = np.random.default_rng(21)
    n_docs, n_terms = 80, 60
    offsets, docs, counts = [0], [], []
    for t in range(n_terms):
        present = sorted(rs.choice(n_docs, size=int(rs.integers(3, 30)), replace=False).tolist())
        for d in present:
            docs.append(d)
            # terms 0-9 lean towards the first half, 10-19 towards the second
            boost = 3 if (t < 10 and d < 40) or (10 <= t < 20 and d >= 40) else 1
            counts.append(int(rs.integers(1, 4)) * boost)
        offsets.append(len(docs))
    prior = [sum(counts[offsets[t] : offsets[t + 1]]) for t in range(n_terms)]
    docs_a = list(range(0, 40))
    docs_b = list(range(30, 80))  # overlapping groups on purpose
    alpha0, top, resamples, seed = 500.0, 8, 200, 1234

    def sums(weights):
        y = []
        for t in range(n_terms):
            s = 0.0
            for i in range(offsets[t], offsets[t + 1]):
                s += weights[docs[i]] * counts[i]
            y.append(s)
        return y

    one_a = [1.0 if d in docs_a else 0.0 for d in range(n_docs)]
    one_b = [1.0 if d in docs_b else 0.0 for d in range(n_docs)]
    ya0, yb0 = sums(one_a), sums(one_b)
    z0 = fightin_words_z(ya0, yb0, prior, alpha0)
    order = [t for t in range(n_terms) if ya0[t] + yb0[t] > 0 and not math.isnan(z0[t])]
    order.sort(key=lambda t: -z0[t])
    top_a = [t for t in order[:top] if z0[t] > 0]
    top_b = [t for t in reversed(order[-top:]) if z0[t] < 0]

    rng = Mulberry32(seed)
    za = [[] for _ in top_a]
    zb = [[] for _ in top_b]
    hits_a = [0] * len(top_a)
    hits_b = [0] * len(top_b)
    for _ in range(resamples):
        wa = [0.0] * n_docs
        wb = [0.0] * n_docs
        for _i in range(len(docs_a)):
            wa[docs_a[math.floor(rng() * len(docs_a))]] += 1
        for _i in range(len(docs_b)):
            wb[docs_b[math.floor(rng() * len(docs_b))]] += 1
        ya, yb = sums(wa), sums(wb)
        z = fightin_words_z(ya, yb, prior, alpha0)
        used = [ya[t] + yb[t] > 0 and not math.isnan(z[t]) for t in range(n_terms)]
        pos = sorted((z[t] for t in range(n_terms) if used[t]), reverse=True)
        neg = sorted((-z[t] for t in range(n_terms) if used[t]), reverse=True)
        thr_a = pos[top - 1] if len(pos) >= top else -math.inf
        thr_b = neg[top - 1] if len(neg) >= top else -math.inf
        for j, t in enumerate(top_a):
            za[j].append(z[t])
            if used[t] and z[t] > 0 and z[t] >= thr_a:
                hits_a[j] += 1
        for j, t in enumerate(top_b):
            zb[j].append(z[t])
            if used[t] and z[t] < 0 and -z[t] >= thr_b:
                hits_b[j] += 1

    def summary(terms, zs, hits):
        out = []
        for j, t in enumerate(terms):
            lo, hi = np.quantile(np.array(zs[j]), [ALPHA / 2, 1 - ALPHA / 2])
            out.append(
                {"term": t, "z": z0[t], "zLower": float(lo), "zUpper": float(hi), "stability": hits[j] / resamples}
            )
        return out

    return {
        "index": {"nDocs": n_docs, "offsets": offsets, "docs": docs, "counts": counts},
        "prior": prior,
        "docsA": docs_a,
        "docsB": docs_b,
        "topA": top_a,
        "topB": top_b,
        "options": {"alpha0": alpha0, "top": top, "resamples": resamples, "seed": seed},
        "a": summary(top_a, za, hits_a),
        "b": summary(top_b, zb, hits_b),
    }


# ---------------------------------------------------------------- readability
REGISTER = {
    "Document": "written",
    "Statement": "written",
    "Debate": "written",
    "Speech/Remarks": "transcribed",
    "Interview": "transcribed",
    "Address": "address",
}


def readability() -> dict:
    con = sqlite3.connect(DB)
    docs = con.execute(
        """SELECT d.id, d.speaker_id, d.cycle, d.doc_type, d.tokens, d.sentences, d.syllables,
                  d.fk_grade
             FROM documents d WHERE d.fk_grade IS NOT NULL ORDER BY d.id"""
    ).fetchall()
    cells = []
    for reg in ("written", "transcribed", "address"):
        for cyc in (2016, 2020, 2024):
            rows = [r for r in docs if r[2] == cyc and REGISTER[r[3]] == reg]
            g = np.array([r[7] for r in rows])
            keys = [r[1] for r in rows]
            cell = {
                "cycle": cyc,
                "register": reg,
                "n": int(len(g)),
                "speakers": len(set(keys)),
                "mean": float(g.mean()),
            }
            if len(g) >= 5 and len(set(keys)) >= 5:
                # speakers resampled: a speaker's documents move together
                cell["interval"] = boot_cluster_mean(g, keys)
                # documents resampled as if independent, for comparison only
                cell["documentInterval"] = boot_mean(g)
            cells.append(cell)

    by: dict[int, dict[str, list]] = {}
    for r in docs:
        reg = REGISTER[r[3]]
        if reg == "address":
            continue
        by.setdefault(r[1], {"written": [], "transcribed": []})[reg].append(r)
    gaps, sent, word, ids = [], [], [], []
    for sid in sorted(by):
        w, t = by[sid]["written"], by[sid]["transcribed"]
        if len(w) < 5 or len(t) < 5:
            continue

        def m(rows, f):
            return float(np.mean([f(r) for r in rows]))

        ids.append(sid)
        gaps.append(m(t, lambda r: r[7]) - m(w, lambda r: r[7]))
        sent.append(0.39 * (m(t, lambda r: r[4] / r[5]) - m(w, lambda r: r[4] / r[5])))
        word.append(11.8 * (m(t, lambda r: r[6] / r[4]) - m(w, lambda r: r[6] / r[4])))
    gaps, sent, word = map(np.array, (gaps, sent, word))
    gap = {
        "speakers": ids,
        "gap": boot_mean(gaps),
        "sentencePart": boot_mean(sent),
        "wordPart": boot_mean(word),
        "gapT": t_interval(gaps),
        "sentencePartT": t_interval(sent),
        "wordPartT": t_interval(word),
        "sign": sign_test(gaps),
        "wilcoxon_p": float(stats.wilcoxon(gaps).pvalue),
        "dz": float(gaps.mean() / gaps.std(ddof=1)),
    }

    deb = con.execute(
        "SELECT date, cycle, kind, fk_candidates FROM debates WHERE fk_candidates IS NOT NULL ORDER BY date, id"
    ).fetchall()

    def frac(iso: str) -> float:
        y, mo, d = map(int, iso.split("-"))
        import datetime as dt

        day = (dt.date(y, mo, d) - dt.date(y, 1, 1)).days
        return y + day / 365.25

    years = list(range(1960, 2025, 4))

    def trend(rows) -> dict:
        x = np.array([frac(r[0]) for r in rows])
        y = np.array([r[3] for r in rows])
        lr = stats.linregress(x, y)
        # cycles resampled (a cycle's debates move together)
        members = cluster_members([r[1] for r in rows])
        slopes, fits = [], []
        for row in resample_indices(len(members)):
            sel = np.concatenate([members[c] for c in row])
            slope, intercept = ols_slope(x[sel], y[sel])
            slopes.append(slope * 10)
            fits.append([intercept + slope * yr for yr in years])
        fits = np.array(fits)
        band = []
        for j, yr in enumerate(years):
            col = fits[:, j]
            col = col[~np.isnan(col)]
            lo, hi = np.quantile(col, [ALPHA / 2, 1 - ALPHA / 2])
            band.append({"year": yr, "lower": float(lo), "upper": float(hi)})
        # debates resampled as if independent, for comparison only
        deb_slopes = [ols_slope(x[row], y[row])[0] * 10 for row in resample_indices(len(x))]
        return {
            "n": len(x),
            "cycles": len(members),
            "perDecade": interval(np.array(slopes), lr.slope * 10),
            "perDecadeDebates": interval(np.array(deb_slopes), lr.slope * 10),
            "band": band,
        }

    def by_cycle(rows) -> list:
        out = []
        for cyc in sorted({r[1] for r in rows}):
            ys = np.array([r[3] for r in rows if r[1] == cyc])
            e = {"cycle": cyc, "n": int(len(ys)), "mean": float(ys.mean())}
            if len(ys) >= 5:
                e["interval"] = boot_mean(ys)
            out.append(e)
        return out

    general = [r for r in deb if r[2] != "primary"]
    primary = [r for r in deb if r[2] == "primary"]
    return {
        "cells": cells,
        "gap": gap,
        "general": {"trend": trend(general), "byCycle": by_cycle(general)},
        "primary": {"trend": trend(primary), "byCycle": by_cycle(primary)},
    }


def main() -> None:
    out = {
        "generated_by": "scripts/stats_reference.py",
        "seed": SEED,
        "resamples": RESAMPLES,
        "units": units(),
        "fw_stability": fw_stability(),
        "readability": readability(),
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    r = out["readability"]
    print("within-speaker gap:", json.dumps(r["gap"]["gap"]), "n =", len(r["gap"]["speakers"]))
    print("within-speaker gap (t):", json.dumps(r["gap"]["gapT"]), "sign:", json.dumps(r["gap"]["sign"]))
    for kind in ("general", "primary"):
        t = r[kind]["trend"]
        print(f"{kind} per decade (cycles):", json.dumps(t["perDecade"]), "cycles =", t["cycles"])
        print(f"{kind} per decade (debates):", json.dumps(t["perDecadeDebates"]))
    for c in r["cells"]:
        if "interval" in c:
            i, d = c["interval"], c["documentInterval"]
            print(c["cycle"], c["register"], c["n"], c["speakers"], f"{i['lower']:.2f}-{i['upper']:.2f}", f"(docs {d['lower']:.2f}-{d['upper']:.2f})")


if __name__ == "__main__":
    main()
