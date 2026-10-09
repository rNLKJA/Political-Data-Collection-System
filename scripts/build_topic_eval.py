# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas>=2.2",
#   "beautifulsoup4>=4.12",
#   "scipy>=1.13",
# ]
# ///
"""Draw the passages for the topic-label evaluation (/topics).

Run from the repository root:  ``uv run scripts/build_topic_eval.py``

Writes ``web/src/data/topic-eval-items.json``: a fixed, seeded sample of
one-sentence excerpts from the campaign documents, 40 per election cycle.
Each excerpt is a single sentence of 12 to 25 words from the document's own
text (``clean_document``; press round-ups can still quote others), so it stays
within the site's 25-word quotation limit (DR-001). The gold labels live in a
separate file (``topic-gold.json``), edited directly and never written by a
script, so that re-running this script never touches them.

Sampling, in order:

1. Documents are de-duplicated and numbered exactly as in ``analytics.db``.
2. Each document's own-voice text (``clean_document``) is split into
   sentences. A sentence is eligible if it has 12 to 25 words, starts with a
   capital letter or a quotation mark, ends with . ! or ?, has no web address,
   e-mail or "paid for by" disclaimer, is not mostly upper case, and passes the
   site's quotation rules (it does not name another candidate and uses none of
   the charged words in ``build_analytics.CHARGED_WORDS``).
3. For each cycle (2016, 2020, 2024) the documents with at least one eligible
   sentence are shuffled with ``random.Random(SEED)``; the first 40 are taken
   and one eligible sentence is drawn from each, uniformly.

Documents are sampled uniformly, so the sample mirrors the archive: mostly
press releases, some transcribed remarks.
"""

from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_analytics import (  # noqa: E402
    candidate_surnames,
    sha256,
    snippet_problem,
)
from debatekit import cycle_of  # noqa: E402
from textkit import clean_document, owner_surname, words  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "original" / "campaign_documents.csv"
OUT = ROOT / "web" / "src" / "data" / "topic-eval-items.json"

SEED = 20261010
PER_CYCLE = 40
MIN_WORDS, MAX_WORDS = 12, 25
CYCLES = (2016, 2020, 2024)

# Abbreviations whose full stop does not end a sentence (same list as textkit).
ABBREV = re.compile(
    r"(?<![A-Za-z])(Mr|Mrs|Ms|Dr|Jr|Sr|St|Sen|Gov|Rep|Gen|Lt|Col|Sgt|Capt|Mt|Ft|vs|etc|No|Inc|"
    r"Co|Corp|Ltd|Messrs|Rev|Hon|Prof)\."
)
INITIALS = re.compile(r"(?<![A-Za-z])((?:[A-Za-z]\.){2,})")
SINGLE_INITIAL = re.compile(r"(?<![A-Za-z])([A-Z])\.(?=[ \t]+[A-Z])")
SENTENCE_END = re.compile(r"[.!?]+[\"'”’)\]]*(?=[ \t]|$)")
HOLD = "․"  # one-dot leader: stands in for protected full stops, same length
BAD = re.compile(r"https?:|www\.|@|paid for by|\|", re.IGNORECASE)


def split_sentences(paragraph: str) -> list[str]:
    """Split one paragraph into sentences, protecting titles and initials."""
    t = ABBREV.sub(lambda m: m.group(1) + HOLD, paragraph)
    t = INITIALS.sub(lambda m: m.group(1).replace(".", HOLD), t)
    t = SINGLE_INITIAL.sub(lambda m: m.group(1) + HOLD, t)
    out, start = [], 0
    for m in SENTENCE_END.finditer(t):
        out.append(t[start : m.end()])
        start = m.end()
    if start < len(t):
        out.append(t[start:])
    return [s.replace(HOLD, ".").strip() for s in out if s.strip()]


def eligible(sentence: str, other_names: set[str]) -> bool:
    n = len(words(sentence))
    if not (MIN_WORDS <= n <= MAX_WORDS):
        return False
    if not re.match(r"^[\"'“‘A-Z]", sentence):
        return False
    if not re.search(r"[.!?][\"'”’)\]]*$", sentence):
        return False
    if BAD.search(sentence):
        return False
    letters = [c for c in sentence if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.5:
        return False
    return snippet_problem(sentence, other_names, set()) is None


def main() -> int:
    df = pd.read_csv(CSV)
    df = df.drop_duplicates("Document_Link", keep="first").copy()
    df["Document_Content"] = df["Document_Content"].fillna("")
    df = df.sort_values(["Date", "Document_Link"]).reset_index(drop=True)
    speakers = sorted(df["Speaker"].unique())
    names = candidate_surnames(speakers)

    pools: dict[int, list[tuple[int, list[str]]]] = {c: [] for c in CYCLES}
    for doc_id, r in enumerate(df.itertuples()):
        own = owner_surname(r.Speaker)
        others = names - {own}
        res = clean_document(r.Document_Content, r.Speaker)
        sents = [
            s
            for para in res.text.split("\n")
            for s in split_sentences(para)
            if eligible(s, others)
        ]
        if sents:
            pools[cycle_of(int(r.Date[:4]))].append((doc_id, sents))

    rng = random.Random(SEED)
    items = []
    for cyc in CYCLES:
        pool = pools[cyc]
        order = list(range(len(pool)))
        rng.shuffle(order)
        for k in order[:PER_CYCLE]:
            doc_id, sents = pool[k]
            s = sents[rng.randrange(len(sents))]
            r = df.iloc[doc_id]
            items.append(
                {
                    "doc_id": doc_id,
                    "url": r.Document_Link,
                    "date": r.Date,
                    "cycle": cyc,
                    "speaker": r.Speaker,
                    "doc_type": r.Document_Type,
                    "excerpt": s,
                    "words": len(words(s)),
                }
            )
    for i, it in enumerate(items, 1):
        it["id"] = f"T{i:03d}"
    out = {
        "version": 1,
        "seed": SEED,
        "per_cycle": PER_CYCLE,
        "words": [MIN_WORDS, MAX_WORDS],
        "source_sha256": sha256(CSV),
        "eligible_documents": {str(c): len(pools[c]) for c in CYCLES},
        "items": [{"id": it.pop("id"), **it} for it in items],
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(items)} items")
    print(json.dumps(out["eligible_documents"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
