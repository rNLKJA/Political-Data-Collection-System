# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas>=2.2",
#   "beautifulsoup4>=4.12",
#   "scipy>=1.13",
# ]
# ///
"""Build ``web/data/analytics.db`` from the original CSVs.

Run from the repository root:  ``uv run scripts/build_analytics.py``

Inputs (read-only): ``original/campaign_documents.csv``,
``original/debates_data.csv`` and ``original/debates_data_processed.csv``.

The database holds derived data only: per-document metadata and statistics,
an inverted index of term counts (no running text), counts for a controlled
vocabulary, short keyword-in-context snippets (at most 25 words, each linked to
its source page), and per-turn word counts for the debates. No full text is
stored.

It also writes test fixtures for the TypeScript ports into
``web/src/lib/__fixtures__``.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from debatekit import (  # noqa: E402
    CANDIDATES,
    CLIP_KEY,
    cycle_of,
    named_in,
    party_of,
    is_interrupted,
    role_of,
    segment_transcript,
    speaker_readability,
    turn_words,
)
from textkit import (  # noqa: E402
    CONCEPTS,
    STOPWORDS,
    clean_document,
    flesch_kincaid,
    match_concepts,
    owner_surname,
    tokenize,
)

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "original"
DB_PATH = ROOT / "web" / "data" / "analytics.db"
FIXTURES = ROOT / "web" / "src" / "lib" / "__fixtures__"

APP = "https://www.presidency.ucsb.edu"
MIN_DF = 5  # a term must appear in at least this many documents to be indexed
DEFAULT_ALPHA0 = 10_000.0
SNIPPET_CONTEXT = 10  # tokens either side of a hit
SNIPPET_MAX_WORDS = 25
SNIPPETS_PER_GROUP = 2  # per (concept, speaker, cycle)

# Snippets are shown side by side for different candidates, so they should
# illustrate how a topic is talked about, not relay attacks. A quoted window is
# skipped (the next use, then the next document, is tried instead) if it names
# another candidate or uses one of these charged words. Entries ending in "*"
# match as prefixes; words that are themselves a topic's search terms (e.g.
# "criminal" for Crime) are allowed for that topic.
CHARGED_WORDS = """
racis* bigot* liar liars lie lies lied lying hitler* nazi* fascis* crook* criminal* corrupt*
traitor* treason* idiot* stupid* moron* loser* disgrac* pathetic incompeten* dishonest* fraud*
scam* sleaz* puppet* extremis* unhinged lunatic* derang* coward* clown* crazy senile rigged hoax*
slander* smear* communis* marxis* socialis* insurrection* dictator* tyrant* thug* demagog* hate
hatred hateful evil cheat* weak weakness attack*
""".split()
# Spouses quoted in support of their partner are not "another candidate".
SAME_CAMPAIGN = {"EMHOFF": {"HARRIS"}}
SCHEMA_VERSION = 1

# Every debate has a moderator or panel asking the questions. A moderator share
# of the words below this almost certainly means their speaker labels were not
# recognised, so the build fails unless the debate is listed below with a
# reason (APP page URL -> reason).
MIN_MODERATOR_SHARE = 0.02
LOW_MODERATOR_SHARE_OK: dict[str, str] = {}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub("[^a-z0-9]+", "-", s.lower()).strip("-")


def varint(n: int, out: bytearray) -> None:
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def encode_postings(postings: list[tuple[int, int]]) -> bytes:
    out = bytearray()
    prev = 0
    for doc, cnt in postings:
        varint(doc - prev, out)
        varint(cnt, out)
        prev = doc
    return bytes(out)


SPECIAL_NAMES = {
    "DESANTIS": "DeSantis", "MACCALLUM": "MacCallum", "BLASIO": "de Blasio",
    "VANDEHEI": "VanDeHei", "MCCAIN": "McCain", "THE PRESIDENT": "The President",
    "THE VICE PRESIDENT": "The Vice President", "AUDIENCE": "Audience", "UNKNOWN": "Unidentified",
    "QUESTIONER": "Questioners", "MODERATOR": "Moderator", CLIP_KEY: "Recorded clips",
}


def display_name(key: str) -> str:
    if key in SPECIAL_NAMES:
        return SPECIAL_NAMES[key]

    def cap(part: str) -> str:
        if part.startswith("MC") and len(part) > 2:
            return "Mc" + part[2:3] + part[3:].lower()
        if part.startswith("O'") and len(part) > 2:
            return "O'" + part[2:3] + part[3:].lower()
        return part[:1] + part[1:].lower()

    return "-".join(cap(p) for p in key.split("-"))


def debate_kind(title: str) -> tuple[str, str, str]:
    """(kind, party, format) from the listing title, as the APP titles them."""
    t = title.lower()
    fmt = "forum" if ("forum" in t or "town hall" in t) else "debate"
    if "vice presidential" in t or "vice-presidential" in t:
        return "vice-presidential", "", fmt
    if "republican" in t or "palmetto freedom" in t:
        return "primary", "Republican", fmt
    if "democratic" in t or "brown & black" in t:
        return "primary", "Democratic", fmt
    return "general", "", fmt


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def build_documents(con: sqlite3.Connection) -> dict:
    df = pd.read_csv(ORIGINAL / "campaign_documents.csv")
    rows_per_url = df.groupby("Document_Link").size().to_dict()
    df = df.drop_duplicates("Document_Link", keep="first").copy()
    df["Document_Content"] = df["Document_Content"].fillna("")
    df = df.sort_values(["Date", "Document_Link"]).reset_index(drop=True)

    speakers = sorted(df["Speaker"].unique())
    speaker_id = {name: i for i, name in enumerate(speakers)}
    speaker_title = df.groupby("Speaker")["Speaker_Title"].agg(lambda s: s.mode().iat[0]).to_dict()

    postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
    concept_hits: list[tuple[int, int, int]] = []
    concept_candidates: dict[
        tuple[int, int, int], list[tuple[int, str, int, list[tuple[int, int]]]]
    ] = defaultdict(list)
    doc_rows = []
    dropped_words = 0
    all_words = 0
    for doc_id, r in enumerate(df.itertuples()):
        res = clean_document(r.Document_Content, r.Speaker)
        toks = tokenize(res.text)
        words_lower = [t.text for t in toks]
        words_cased = [res.text[t.start : t.end] for t in toks]
        fk = flesch_kincaid(res.text)
        raw_words = len(tokenize(r.Document_Content.replace("\\n\\n", "\n")))
        all_words += raw_words
        dropped_words += max(0, raw_words - len(toks))
        counts = Counter(w for w in words_lower if len(w) >= 2 and w not in STOPWORDS)
        for w, c in counts.items():
            postings[w].append((doc_id, c))
        year = int(r.Date[:4])
        cyc = cycle_of(year)
        sid = speaker_id[r.Speaker]
        for ci, hits in match_concepts(words_lower, words_cased).items():
            concept_hits.append((ci, doc_id, len(hits)))
            concept_candidates[(ci, sid, cyc)].append((len(hits), r.Date, doc_id, hits))
        doc_rows.append(
            dict(
                id=doc_id,
                url=r.Document_Link,
                date=r.Date,
                month=r.Date[:7],
                year=year,
                cycle=cyc,
                title=r.Document_Title if isinstance(r.Document_Title, str) else r.Title,
                speaker_id=sid,
                doc_type=r.Document_Type,
                location=r.Location if isinstance(r.Location, str) else None,
                video=int(bool(r.Video_Available)),
                word_count=int(r.Word_Count),
                tokens=len(toks),
                raw_tokens=raw_words,
                sentences=fk.sentences,
                syllables=fk.syllables,
                fk_grade=fk.grade,
                listing_rows=int(rows_per_url[r.Document_Link]),
                _text=res.text,
                _toks=toks,
            )
        )

    # Snippets: for each (concept, speaker, cycle) take the documents that use the
    # concept most often and quote the first acceptable use (see CHARGED_WORDS)
    # with a few words either side.
    names = candidate_surnames(speakers)
    snippets = []
    skipped = Counter()
    for (ci, sid, _cyc), cands in concept_candidates.items():
        cands = sorted(cands, key=lambda c: (c[0], c[1]), reverse=True)
        own = owner_surname(speakers[sid])
        other_names = names - {own} - SAME_CAMPAIGN.get(own, set())
        allowed = concept_words(ci)
        taken = 0
        for _n, _date, doc_id, hits in cands:
            if taken == SNIPPETS_PER_GROUP:
                break
            d = doc_rows[doc_id]
            for ti, tl in hits:
                snippet = make_snippet(d["_text"], d["_toks"], ti, tl)
                problem = snippet_problem(snippet[0], other_names, allowed)
                if problem:
                    skipped[problem] += 1
                    continue
                snippets.append((ci, doc_id, *snippet))
                taken += 1
                break

    con.executemany(
        "INSERT INTO speakers(id, name, slug, surname, speaker_title) VALUES (?,?,?,?,?)",
        [
            (i, name, slugify(name), owner_surname(name), speaker_title.get(name))
            for name, i in speaker_id.items()
        ],
    )
    con.executemany(
        """INSERT INTO documents(id, url, date, month, year, cycle, title, speaker_id, doc_type,
        location, video, word_count, tokens, raw_tokens, sentences, syllables, fk_grade,
        listing_rows) VALUES (:id,:url,:date,:month,:year,:cycle,:title,:speaker_id,:doc_type,
        :location,:video,:word_count,:tokens,:raw_tokens,:sentences,:syllables,:fk_grade,
        :listing_rows)""",
        [{k: v for k, v in d.items() if not k.startswith("_")} for d in doc_rows],
    )
    con.execute(
        """UPDATE speakers SET
             docs = (SELECT COUNT(*) FROM documents d WHERE d.speaker_id = speakers.id),
             tokens = (SELECT SUM(tokens) FROM documents d WHERE d.speaker_id = speakers.id),
             first_date = (SELECT MIN(date) FROM documents d WHERE d.speaker_id = speakers.id),
             last_date = (SELECT MAX(date) FROM documents d WHERE d.speaker_id = speakers.id)"""
    )

    vocab = sorted(t for t, p in postings.items() if len(p) >= MIN_DF)
    term_rows = []
    for tid, term in enumerate(vocab):
        p = postings[term]
        term_rows.append((tid, term, sum(c for _, c in p), len(p), encode_postings(p)))
    con.executemany("INSERT INTO terms(id, term, cf, df, postings) VALUES (?,?,?,?,?)", term_rows)

    con.executemany(
        "INSERT INTO concepts(id, slug, label, patterns) VALUES (?,?,?,?)",
        [(i, slug, label, json.dumps(pats)) for i, (slug, label, pats) in enumerate(CONCEPTS)],
    )
    con.executemany("INSERT INTO concept_hits(concept_id, doc_id, n) VALUES (?,?,?)", concept_hits)
    con.executemany(
        "INSERT INTO concept_snippets(concept_id, doc_id, snippet, hl_start, hl_end) "
        "VALUES (?,?,?,?,?)",
        snippets,
    )

    return {
        "documents": len(doc_rows),
        "listing_rows": int(sum(rows_per_url.values())),
        "duplicate_listing_rows": int(sum(v - 1 for v in rows_per_url.values())),
        "speakers": len(speakers),
        "vocabulary": len(vocab),
        "tokens": int(sum(d["tokens"] for d in doc_rows)),
        "raw_tokens": int(all_words),
        "excluded_other_speaker_tokens": int(dropped_words),
        "snippets": len(snippets),
        "snippet_windows_skipped_names": skipped["name"],
        "snippet_windows_skipped_charged": skipped["charged"],
        "doc_rows": doc_rows,
        "postings": {t: postings[t] for t in vocab},
        "vocab": vocab,
        "speaker_id": speaker_id,
    }


def candidate_surnames(speakers: list[str]) -> set[str]:
    """Surnames of every candidate in the corpus or the curated debate lists."""
    out = {owner_surname(s) for s in speakers}
    for keys in CANDIDATES.values():
        out |= keys
    return {n for n in out if n}


def concept_words(ci: int) -> set[str]:
    return {w.lower() for pat in CONCEPTS[ci][2] for w in pat.split(" ")}


SNIPPET_WORD = re.compile(r"[A-Za-z\u00C0-\u024F]+(?:['\u2019][A-Za-z]+)*")


def snippet_problem(snippet: str, other_names: set[str], allowed: set[str]) -> str | None:
    """"name" if the snippet names another candidate, "charged" for a charged
    word (see CHARGED_WORDS), otherwise None."""
    for m in SNIPPET_WORD.finditer(snippet):
        w = m.group(0).replace("\u2019", "'")
        w = re.sub(r"'s$", "", w, flags=re.IGNORECASE)
        if w.upper() in other_names:
            return "name"
        lw = w.lower()
        if lw in allowed:
            continue
        for c in CHARGED_WORDS:
            if (lw.startswith(c[:-1]) if c.endswith("*") else lw == c):
                return "charged"
    return None


WORDISH = re.compile("[ \\t\\n\\r\\f\\v\\u00a0]+")


def make_snippet(text: str, toks, ti: int, tl: int):
    """Quote <= SNIPPET_MAX_WORDS words around tokens[ti:ti+tl].

    Returns (snippet, hl_start, hl_end) where the highlight offsets index the
    snippet string (UTF-16 safe: only BMP characters are expected here).
    """
    a = max(0, ti - SNIPPET_CONTEXT)
    b = min(len(toks), ti + tl + SNIPPET_CONTEXT)
    pre = WORDISH.sub(" ", text[toks[a].start : toks[ti].start]).lstrip()
    hit = WORDISH.sub(" ", text[toks[ti].start : toks[ti + tl - 1].end])
    post = WORDISH.sub(" ", text[toks[ti + tl - 1].end : toks[b - 1].end]).rstrip()

    def nwords(x: str) -> int:
        return len(x.split())

    cut_pre = a > 0
    cut_post = b < len(toks)
    while nwords(pre) + nwords(hit) + nwords(post) > SNIPPET_MAX_WORDS:
        if nwords(pre) >= nwords(post) and nwords(pre) > 0:
            s = pre.lstrip()
            i = s.find(" ")
            pre = s[i + 1 :] if i >= 0 else ""
            cut_pre = True
        elif nwords(post) > 0:
            s = post.rstrip()
            i = s.rfind(" ")
            post = s[:i] if i >= 0 else ""
            cut_post = True
        else:
            break
    lead = "\u2026 " if cut_pre else ""
    tail = " \u2026" if cut_post else ""
    snippet = lead + pre
    start = len(snippet)
    snippet += hit
    end = len(snippet)
    snippet += post + tail
    return snippet, start, end


# ---------------------------------------------------------------------------
# Debates
# ---------------------------------------------------------------------------


def build_debates(con: sqlite3.Connection) -> dict:
    processed = pd.read_csv(ORIGINAL / "debates_data_processed.csv")
    listing = pd.read_csv(ORIGINAL / "debates_data.csv")
    listing_by_url = listing.groupby("Debate_Link").agg(
        rows=("Title", "size"),
        title=("Title", "first"),
        date=("Date", "first"),
        related=("Related_Category", "first"),
    )
    processed = processed.sort_values(["Extracted_Date", "URL"]).reset_index(drop=True)

    debate_rows, speaker_rows, turn_rows = [], [], []
    totals = Counter()
    for did, r in enumerate(processed.itertuples()):
        date = r.Extracted_Date[:10]
        year = int(date[:4])
        lst = listing_by_url.loc[r.URL]
        kind, party, fmt = debate_kind(lst["title"])
        turns, stats = segment_transcript(r.Debate_Content_HTML, year)
        participants = r.Participants if isinstance(r.Participants, str) else None

        def role(key: str) -> str:
            return role_of(key, year, party, participants)
        speaker_order: dict[str, int] = {}
        per = defaultdict(lambda: {"turns": [], "texts": [], "interrupted": 0})
        for seq, t in enumerate(turns):
            if t.key not in speaker_order:
                speaker_order[t.key] = len(speaker_order)
            w = turn_words(t)
            intr = is_interrupted(t)
            per[t.key]["turns"].append(w)
            per[t.key]["texts"].append(t.text)
            per[t.key]["interrupted"] += int(intr)
            turn_rows.append((did, seq, speaker_order[t.key], w, int(intr)))
        role_words = Counter()
        role_texts = defaultdict(list)
        total_words = sum(sum(v["turns"]) for v in per.values())
        for key, idx in speaker_order.items():
            v = per[key]
            role_ = role(key)
            words_ = sum(v["turns"])
            role_words[role_] += words_
            role_texts[role_].extend(v["texts"])
            fk = speaker_readability(v["texts"])
            speaker_rows.append(
                (
                    did, idx, key, display_name(key), role_, len(v["turns"]), words_,
                    words_ / total_words if total_words else 0.0,
                    statistics.fmean(v["turns"]) if v["turns"] else 0.0,
                    float(statistics.median(v["turns"])) if v["turns"] else 0.0,
                    max(v["turns"]) if v["turns"] else 0, v["interrupted"], fk.grade,
                )
            )
        fk_c = speaker_readability(role_texts["candidate"])
        fk_m = speaker_readability(role_texts["moderator"])
        cands = [k for k in speaker_order if role(k) == "candidate"]
        n_cand = len(cands)
        # Every candidate must belong to the primary's party and be named in the
        # Participants block when the page has one.
        for k in cands:
            assert not party or party_of(k, cycle_of(year)) == party, (r.URL, k)
            assert named_in(k, participants), (r.URL, k)
        debate_rows.append(
            dict(
                id=did, url=r.URL, date=date, year=year, cycle=cycle_of(year),
                title=r.Extracted_Title, kind=kind, party=party, format=fmt,
                related_category=lst["related"] if isinstance(lst["related"], str) else None,
                participants=participants,
                moderators=r.Moderators if isinstance(r.Moderators, str) else None,
                listing_date=lst["date"], listing_rows=int(lst["rows"]),
                label_style=stats["label_style"], turns=len(turns), words=total_words,
                candidate_words=role_words["candidate"], moderator_words=role_words["moderator"],
                other_words=role_words["other"], unattributed_words=stats["unattributed_words"],
                crosstalk=stats["crosstalk"], stage_markers=stats["stage_markers"],
                interrupted_turns=sum(v["interrupted"] for v in per.values()),
                fk_candidates=fk_c.grade, fk_moderators=fk_m.grade, n_candidates=n_cand,
            )
        )
        totals["turns"] += len(turns)
        totals["words"] += total_words
        totals["unattributed"] += stats["unattributed_words"]
        totals["clip_words"] += stats["clip_words"]
        share = role_words["moderator"] / total_words if total_words else 0.0
        assert share >= MIN_MODERATOR_SHARE or r.URL in LOW_MODERATOR_SHARE_OK, (
            f"moderator share {share:.1%} in {r.URL}: check the speaker labels, or add the "
            "debate to LOW_MODERATOR_SHARE_OK with a reason"
        )

    con.executemany(
        """INSERT INTO debates(id, url, date, year, cycle, title, kind, party, format,
        related_category, participants, moderators, listing_date, listing_rows, label_style,
        turns, words, candidate_words, moderator_words, other_words, unattributed_words,
        crosstalk, stage_markers, interrupted_turns, fk_candidates, fk_moderators, n_candidates)
        VALUES (:id,:url,:date,:year,:cycle,:title,:kind,:party,:format,:related_category,
        :participants,:moderators,:listing_date,:listing_rows,:label_style,:turns,:words,
        :candidate_words,:moderator_words,:other_words,:unattributed_words,:crosstalk,
        :stage_markers,:interrupted_turns,:fk_candidates,:fk_moderators,:n_candidates)""",
        debate_rows,
    )
    con.executemany(
        """INSERT INTO debate_speakers(debate_id, idx, key, display, role, turns, words, share,
        mean_turn, median_turn, max_turn, interrupted, fk_grade) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        speaker_rows,
    )
    con.executemany(
        "INSERT INTO debate_turns(debate_id, seq, speaker_idx, words, interrupted) VALUES (?,?,?,?,?)",
        turn_rows,
    )
    return {
        "debates": len(debate_rows),
        "listing_rows": int(len(listing)),
        "turns": totals["turns"],
        "words": totals["words"],
        "unattributed_words": totals["unattributed"],
        "clip_words": totals["clip_words"],
    }


SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE speakers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, surname TEXT,
  speaker_title TEXT, docs INTEGER, tokens INTEGER, first_date TEXT, last_date TEXT
);
CREATE TABLE documents (
  id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, date TEXT NOT NULL, month TEXT NOT NULL,
  year INTEGER NOT NULL, cycle INTEGER NOT NULL, title TEXT NOT NULL,
  speaker_id INTEGER NOT NULL REFERENCES speakers(id), doc_type TEXT NOT NULL, location TEXT,
  video INTEGER NOT NULL, word_count INTEGER NOT NULL, tokens INTEGER NOT NULL,
  raw_tokens INTEGER NOT NULL, sentences INTEGER NOT NULL, syllables INTEGER NOT NULL,
  fk_grade REAL, listing_rows INTEGER NOT NULL
);
CREATE INDEX documents_speaker_date ON documents(speaker_id, date);
CREATE INDEX documents_date ON documents(date);
CREATE TABLE terms (
  id INTEGER PRIMARY KEY, term TEXT NOT NULL UNIQUE, cf INTEGER NOT NULL, df INTEGER NOT NULL,
  postings BLOB NOT NULL
);
CREATE TABLE concepts (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
  patterns TEXT NOT NULL);
CREATE TABLE concept_hits (concept_id INTEGER NOT NULL, doc_id INTEGER NOT NULL,
  n INTEGER NOT NULL, PRIMARY KEY (concept_id, doc_id)) WITHOUT ROWID;
CREATE TABLE concept_snippets (concept_id INTEGER NOT NULL, doc_id INTEGER NOT NULL,
  snippet TEXT NOT NULL, hl_start INTEGER NOT NULL, hl_end INTEGER NOT NULL,
  PRIMARY KEY (concept_id, doc_id)) WITHOUT ROWID;
CREATE TABLE debates (
  id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, date TEXT NOT NULL, year INTEGER NOT NULL,
  cycle INTEGER NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, party TEXT NOT NULL,
  format TEXT NOT NULL, related_category TEXT, participants TEXT, moderators TEXT,
  listing_date TEXT NOT NULL, listing_rows INTEGER NOT NULL, label_style TEXT NOT NULL,
  turns INTEGER NOT NULL, words INTEGER NOT NULL, candidate_words INTEGER NOT NULL,
  moderator_words INTEGER NOT NULL, other_words INTEGER NOT NULL,
  unattributed_words INTEGER NOT NULL, crosstalk INTEGER NOT NULL, stage_markers INTEGER NOT NULL,
  interrupted_turns INTEGER NOT NULL, fk_candidates REAL, fk_moderators REAL,
  n_candidates INTEGER NOT NULL
);
CREATE TABLE debate_speakers (
  debate_id INTEGER NOT NULL, idx INTEGER NOT NULL, key TEXT NOT NULL, display TEXT NOT NULL,
  role TEXT NOT NULL, turns INTEGER NOT NULL, words INTEGER NOT NULL, share REAL NOT NULL,
  mean_turn REAL NOT NULL, median_turn REAL NOT NULL, max_turn INTEGER NOT NULL,
  interrupted INTEGER NOT NULL, fk_grade REAL, PRIMARY KEY (debate_id, idx)
) WITHOUT ROWID;
CREATE TABLE debate_turns (
  debate_id INTEGER NOT NULL, seq INTEGER NOT NULL, speaker_idx INTEGER NOT NULL,
  words INTEGER NOT NULL, interrupted INTEGER NOT NULL, PRIMARY KEY (debate_id, seq)
) WITHOUT ROWID;
"""


# ---------------------------------------------------------------------------
# Reference fixtures for the TypeScript ports
# ---------------------------------------------------------------------------


def fightin_words(ya: dict, yb: dict, prior: dict, alpha0: float):
    """Monroe, Colaresi & Quinn (2008) log-odds with informative Dirichlet prior."""
    n_prior = sum(prior.values())
    na = sum(ya.values())
    nb = sum(yb.values())
    out = {}
    for w, pc in prior.items():
        a = alpha0 * pc / n_prior
        if a <= 0:
            continue
        ia, ib = ya.get(w, 0), yb.get(w, 0)
        la = math.log((ia + a) / (na + alpha0 - ia - a))
        lb = math.log((ib + a) / (nb + alpha0 - ib - a))
        delta = la - lb
        var = 1.0 / (ia + a) + 1.0 / (ib + a)
        out[w] = (ia, ib, delta, delta / math.sqrt(var))
    return out


def write_fixtures(doc_info: dict) -> None:
    from scipy import stats as st

    FIXTURES.mkdir(parents=True, exist_ok=True)
    rows = doc_info["doc_rows"]
    postings = doc_info["postings"]
    prior = {t: sum(c for _, c in p) for t, p in postings.items()}

    def group_counts(pred) -> dict:
        members = {d["id"] for d in rows if pred(d)}
        out = {}
        for t, p in postings.items():
            c = sum(cnt for doc, cnt in p if doc in members)
            if c:
                out[t] = c
        return out

    sid = doc_info["speaker_id"]
    cases = [
        ("cycle-2016-vs-2024", {"cycle": 2016}, {"cycle": 2024}),
        (
            "speaker-vs-speaker",
            {"speaker": "Bernie Sanders"},
            {"speaker": "Ted Cruz"},
        ),
    ]
    fw = []
    for name, ga, gb in cases:
        def pred_of(g):
            if "cycle" in g:
                return lambda d: d["cycle"] == g["cycle"]
            return lambda d: d["speaker_id"] == sid[g["speaker"]]

        ya, yb = group_counts(pred_of(ga)), group_counts(pred_of(gb))
        res = fightin_words(ya, yb, prior, DEFAULT_ALPHA0)
        ranked = sorted(res.items(), key=lambda kv: kv[1][3], reverse=True)
        pick = ranked[:15] + ranked[-15:] + [kv for kv in res.items() if kv[0] in ("economy", "jobs", "america")]
        fw.append(
            {
                "name": name,
                "a": ga,
                "b": gb,
                "alpha0": DEFAULT_ALPHA0,
                "nA": sum(ya.values()),
                "nB": sum(yb.values()),
                "terms": [
                    {"term": t, "yA": v[0], "yB": v[1], "delta": v[2], "z": v[3]} for t, v in pick
                ],
            }
        )
    (FIXTURES / "fightin-words.json").write_text(json.dumps(fw, indent=1) + "\n")

    ci = []
    for k in [0, 1, 2, 3, 5, 10, 17, 42, 100, 365, 1000, 25000]:
        lo = 0.0 if k == 0 else float(st.chi2.ppf(0.025, 2 * k) / 2)
        hi = float(st.chi2.ppf(0.975, 2 * k + 2) / 2)
        ci.append({"k": k, "lower": lo, "upper": hi})
    (FIXTURES / "poisson-ci.json").write_text(json.dumps(ci, indent=1) + "\n")


def write_candidate_list() -> None:
    """The curated candidate list, for display on the Method page."""
    out = ROOT / "web" / "src" / "data" / "debate-candidates.json"
    data = {str(c): sorted(display_name(k) for k in keys) for c, keys in sorted(CANDIDATES.items())}
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")


def main() -> int:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=DELETE")
    con.execute("PRAGMA page_size=4096")
    con.executescript(SCHEMA)

    docs = build_documents(con)
    debates = build_debates(con)

    meta = {
        "schema_version": SCHEMA_VERSION,
        "source_campaign_documents_sha256": sha256(ORIGINAL / "campaign_documents.csv"),
        "source_debates_data_sha256": sha256(ORIGINAL / "debates_data.csv"),
        "source_debates_processed_sha256": sha256(ORIGINAL / "debates_data_processed.csv"),
        "min_df": MIN_DF,
        "default_alpha0": DEFAULT_ALPHA0,
        "snippet_max_words": SNIPPET_MAX_WORDS,
        **{f"documents_{k}": v for k, v in docs.items() if not isinstance(v, (list, dict))},
        **{f"debates_{k}": v for k, v in debates.items()},
    }
    con.executemany("INSERT INTO meta(key, value) VALUES (?, ?)", [(k, str(v)) for k, v in meta.items()])
    con.commit()
    con.execute("VACUUM")
    con.close()

    write_fixtures(docs)
    write_candidate_list()
    size = DB_PATH.stat().st_size
    print(json.dumps(meta, indent=2))
    print(f"wrote {DB_PATH.relative_to(ROOT)} ({size / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
