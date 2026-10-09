# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy>=1.26",
#   "scikit-learn>=1.3",
#   "statsmodels>=0.14",
# ]
# ///
"""Score a blind relabel of the topic gold set (DR-007).

Each coder downloads the coding sheet from /topics/blind-relabel.csv (ids and
excerpts only), fills in the ``topic`` column with codebook ids and saves it.
Then, from the repository root:

    uv run scripts/score_relabel.py coder-a.csv coder-b.csv

For the two coders, and for each coder against the current AI draft in
web/src/data/topic-gold.json, it prints the agreement with a Wilson 95%
interval, Cohen's kappa with a percentile bootstrap 95% interval (10,000
resamples of excerpts, seed 20261010) and Krippendorff's alpha (nominal), then
lists the excerpts the two coders disagree on, for resolution against the
codebook. It reads files only and writes nothing.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import cohen_kappa_score
from statsmodels.stats.proportion import proportion_confint

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "web" / "src" / "data" / "topic-gold.json"
CODEBOOK = ROOT / "web" / "src" / "lib" / "topics" / "codebook.ts"
RESAMPLES = 10_000
SEED = 20261010


def topic_ids() -> set[str]:
    return set(re.findall(r'^\s+id: "([a-z-]+)",$', CODEBOOK.read_text(), flags=re.M))


def read_sheet(path: Path, valid: set[str]) -> dict[str, str]:
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    labels: dict[str, str] = {}
    problems = []
    for r in rows:
        topic = (r.get("topic") or "").strip()
        if topic not in valid:
            problems.append(f"{r.get('id')}: {topic!r}")
        labels[r["id"]] = topic
    if problems:
        sys.exit(f"{path}: {len(problems)} labels are not codebook ids, e.g. {problems[:5]}")
    return labels


def kappa(a: list[str], b: list[str]) -> float:
    if len(set(a) | set(b)) == 1:
        return 1.0
    return float(cohen_kappa_score(a, b))


def boot_kappa(a: list[str], b: list[str]) -> tuple[float, float]:
    rng = np.random.default_rng(SEED)
    n = len(a)
    xa, xb = np.array(a), np.array(b)
    vals = []
    for _ in range(RESAMPLES):
        i = rng.integers(0, n, n)
        vals.append(kappa(list(xa[i]), list(xb[i])))
    lo, hi = np.quantile(vals, [0.025, 0.975])
    return float(lo), float(hi)


def krippendorff_alpha_nominal(a: list[str], b: list[str]) -> float:
    """Two coders, every unit coded by both, nominal labels."""
    cats = sorted(set(a) | set(b))
    idx = {c: i for i, c in enumerate(cats)}
    o = np.zeros((len(cats), len(cats)))
    for x, y in zip(a, b):
        o[idx[x], idx[y]] += 1
        o[idx[y], idx[x]] += 1
    n_c = o.sum(axis=1)
    total = n_c.sum()
    observed = o.sum() - np.trace(o)
    expected = (total**2 - (n_c**2).sum()) / (total - 1)
    return 1.0 if expected == 0 else float(1 - observed / expected)


def report(name: str, a: list[str], b: list[str]) -> None:
    n = len(a)
    agree = sum(x == y for x, y in zip(a, b))
    lo, hi = proportion_confint(agree, n, alpha=0.05, method="wilson")
    k = kappa(a, b)
    klo, khi = boot_kappa(a, b)
    alpha = krippendorff_alpha_nominal(a, b)
    print(f"{name}: n = {n}")
    print(f"  agreement      {agree}/{n} = {agree / n:.1%} (95% CI {lo:.1%} to {hi:.1%}, Wilson)")
    print(f"  Cohen's kappa  {k:.3f} (95% CI {klo:.3f} to {khi:.3f}, bootstrap, seed {SEED})")
    print(f"  Krippendorff's alpha (nominal)  {alpha:.3f}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("sheets", nargs="+", type=Path, help="one or two completed coding sheets")
    args = ap.parse_args()
    if len(args.sheets) > 2:
        sys.exit("give one or two sheets")
    valid = topic_ids()
    draft = json.loads(GOLD.read_text())["labels"]
    sheets = [read_sheet(p, valid) for p in args.sheets]
    ids = sorted(draft)
    for p, s in zip(args.sheets, sheets):
        if sorted(s) != ids:
            sys.exit(f"{p}: the ids do not match the gold set ({len(s)} rows)")

    if len(sheets) == 2:
        a, b = ([s[i] for i in ids] for s in sheets)
        report(f"{args.sheets[0].name} vs {args.sheets[1].name} (between coders)", a, b)
    for p, s in zip(args.sheets, sheets):
        report(f"{p.name} vs the AI draft", [s[i] for i in ids], [draft[i] for i in ids])

    if len(sheets) == 2:
        diff = [i for i in ids if sheets[0][i] != sheets[1][i]]
        print(f"\nTo resolve ({len(diff)} excerpts):")
        for i in diff:
            print(f"  {i}: {sheets[0][i]} / {sheets[1][i]}")


if __name__ == "__main__":
    main()
