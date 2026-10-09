# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = [
#   "pandas>=2.2",
#   "beautifulsoup4>=4.12",
#   "requests>=2.31",
#   "tqdm>=4.66",
# ]
# ///
"""Differential fixtures for the TypeScript date ports.

The notebooks ran on Python 3.11, so this script must too (uv picks a 3.11
interpreter from the metadata above). It loads the two date functions of
``original/documents.ipynb`` verbatim, as ``parity_check.py`` does, runs them
and ``datetime.fromisoformat`` itself over a few hundred hand-picked strings
and a few thousand generated ones, and writes what Python returned to
``web/src/lib/__fixtures__/dates-differential.json``. ``dates.test.ts`` then
requires the TypeScript ports to return exactly the same.

Generate it on macOS, where the notebooks ran: ``strftime("%Y")`` comes from
the C library, and macOS pads years below 1000 to four digits ("0999") while
glibc does not ("999"), which changes a handful of cases.

Run from the repository root:  ``uv run scripts/date_fixtures.py``
"""

from __future__ import annotations

import json
import logging
import os
import random
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from parity_check import ORIGINAL, load_cells  # noqa: E402

OUT = ROOT / "web" / "src" / "lib" / "__fixtures__" / "dates-differential.json"
SEED = 20251009
N_RANDOM = 300
N_STRUCTURED = 1200
N_MUTATED = 800

CURATED = [
    # the formats the archive actually serves
    "2024-09-29T00:00:00+00:00", "2024-10-01T00:00:00Z", "2016-03-03T21:00:00-05:00",
    "2024-09-29", "September 29, 2024", "09/29/2024", "29 September 2024",
    # basic and week formats
    "20240929", "20240929T000000", "20240929T0000", "20240929T00", "2024-W39", "2024W39",
    "2024-W39-7", "2024W397", "2024-W39-7T00:00:00+00:00", "2024W397T12", "2020-W53-1",
    "2021-W53-1", "2024-W00-1", "2024-W01-0", "2024-W01-8", "2024-W1", "2024-W", "2024-W39-",
    "2024-W39-77", "2024-W39T1200", "9999-W52-5", "9999-W52-6", "0001-W01-1", "0000-W01-1",
    "2015-W53-7", "2004-W53-6",
    # times and fractions
    "2024-09-29T12", "2024-09-29T1230", "2024-09-29T123045", "2024-09-29T12:30",
    "2024-09-29T12:30:45", "2024-09-29T12:30:45.1", "2024-09-29T12:30:45,123",
    "2024-09-29T12:30:45.123456", "2024-09-29T12:30:45.1234567", "2024-09-29T12:30:45.123456789",
    "2024-09-29T12:30:45.12345x", "2024-09-29T12:30:45.", "2024-09-29T12:30:45:5",
    "2024-09-29T12:3045", "2024-09-29T1230:45", "2024-09-29T24:00", "2024-09-29T23:60",
    "2024-09-29T23:59:60", "2024-09-29T1", "2024-09-29T", "2024-09-29 12:00", "2024-09-29x12:00",
    "2024-09-29é12:00", "2024-09-29 12:00", "2024-09-2912:00",
    # offsets
    "2024-09-29T00+00", "2024-09-29T00:00+00", "2024-09-29T00:00+0530", "2024-09-29T00:00+05:30",
    "2024-09-29T00:00-05:30", "2024-09-29T00:00 +00:00", "2024-09-29T00:00x+00:00",
    "2024-09-29T00:00+24:00", "2024-09-29T00:00-24:00", "2024-09-29T00:00+23:59",
    "2024-09-29T00:00+23:59:59.999999", "2024-09-29T00:00+05:30:15", "2024-09-29T00:00+05:30:15.5",
    "2024-09-29T00:00+053015", "2024-09-29T00:00+5", "2024-09-29T00:00+053",
    "2024-09-29T00:00+05:3", "2024-09-29T00:00+", "2024-09-29T00:00-", "2024-09-29T00:00Z",
    "2024-09-29T00:00ZZ", "2024-09-29T00:00Z+00:00", "2024-09-29T00:00+00:00Z",
    "2024-09-29T12-05Z", "2024-09-29T12Z+05", "2024-09-29T00:00+00:00+00:00",
    "2024-09-29T00:00+-00:00", "2024-09-29T00:00-00:00", "2024-09-29T00:00+00:00:00.000001",
    # invalid dates
    "2023-02-29", "2024-02-29", "2024-02-30", "2024-13-01", "2024-00-10", "2024-09-31",
    "0000-01-01", "0001-01-01", "9999-12-31", "0999-01-01T00:00:00+00:00", "2024-9-29",
    "2024-09-9", "2024/09/29", "2024-0929", "202409-29", "24-09-29", "2024-09-29T00:00:00+00:00 ",
    " 2024-09-29T00:00:00+00:00", "٢٠٢٤-09-29", "２０２４-09-29",
    # strptime formats used by the notebooks
    "september 29, 2024", "SEPTEMBER 29, 2024", "Sept 29, 2024", "September 9, 2024",
    "September  29,  2024", "September 29,2024", "September 29, 24", "September 29, 2024 ",
    "9/29/2024", "09/9/2024", "13/29/2024", "09/29/24", "29 september 2024", "9 September 2024",
    "29  September\t2024", "29 Sept 2024", "2024-9-9", "2024-09-29 ", "Fall 2016", "",
    " ", "T", "TT", "2024", "2024-09", "2024T", "+2024-09-29", "2024-09-29T00:00:00+00:00\n",
]

ALPHABET = "0123456789" * 6 + "-:.,T WZ+" * 2 + "x/é \t"


def random_case(rng: random.Random) -> str:
    return "".join(rng.choice(ALPHABET) for _ in range(rng.randint(5, 32)))


def structured_case(rng: random.Random) -> str:
    """A random string built from the pieces of the ISO grammar (mostly valid)."""
    y = rng.choice(["2024", "2016", "2000", "1999", "0001", "9999", "0000", "2020", "2015"])
    m, d = f"{rng.randint(0, 13):02d}", f"{rng.randint(0, 32):02d}"
    w, wd = f"{rng.randint(0, 54):02d}", str(rng.randint(0, 8))
    date = rng.choice([f"{y}-{m}-{d}", f"{y}{m}{d}", f"{y}-W{w}", f"{y}W{w}", f"{y}-W{w}-{wd}",
                       f"{y}W{w}{wd}"])
    if rng.random() < 0.15:
        return date
    sep = rng.choice("T" * 6 + " x9-é")
    hh, mm, ss = (f"{rng.randint(0, 25):02d}", f"{rng.randint(0, 61):02d}",
                  f"{rng.randint(0, 61):02d}")
    frac = rng.choice(["", "", ".", ",", "."]) + "".join(
        rng.choice("0123456789") for _ in range(rng.randint(0, 9))
    )
    time = rng.choice([hh, f"{hh}:{mm}", f"{hh}{mm}", f"{hh}:{mm}:{ss}", f"{hh}{mm}{ss}",
                       f"{hh}:{mm}:{ss}{frac}", f"{hh}{mm}{ss}{frac}"])
    oh, om, os_ = (f"{rng.randint(0, 25):02d}", f"{rng.randint(0, 61):02d}",
                   f"{rng.randint(0, 61):02d}")
    off = rng.choice(["", "", "Z", f"+{oh}", f"-{oh}:{om}", f"+{oh}{om}", f"+{oh}:{om}:{os_}",
                      f"-{oh}:{om}:{os_}.{rng.randint(0, 999999)}", f" +{oh}:{om}"])
    return f"{date}{sep}{time}{off}"


def mutate(rng: random.Random, s: str) -> str:
    chars = list(s)
    for _ in range(rng.randint(1, 3)):
        op = rng.random()
        i = rng.randrange(len(chars) + 1)
        if op < 0.35 and chars:
            del chars[min(i, len(chars) - 1)]
        elif op < 0.7:
            chars.insert(i, rng.choice(ALPHABET))
        elif chars:
            chars[min(i, len(chars) - 1)] = rng.choice(ALPHABET)
    return "".join(chars)


def iso_result(s: str):
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        return None
    off = d.utcoffset()
    off_us = None if off is None else (off.days * 86400 + off.seconds) * 1_000_000 + off.microseconds
    return [d.year, d.month, d.day, d.hour, d.minute, d.second, d.microsecond, off_us]


def load_functions():
    ns: dict = {}
    workdir = tempfile.mkdtemp(prefix="ctl-dates-")
    cwd = os.getcwd()
    os.chdir(workdir)
    try:
        for src in load_cells(ORIGINAL / "documents.ipynb", "class "):
            exec(compile(src, "documents.ipynb", "exec"), ns)
        logging.getLogger().setLevel(logging.CRITICAL)
        extractor = ns["OptimizedDocumentExtractor"](
            max_workers=1,
            cache_file=str(Path(workdir) / "cache.pkl"),
            checkpoint_file=str(Path(workdir) / "checkpoint.json"),
        )
        scraper = ns["CampaignDocumentsScraper"]("offline://listing")
    finally:
        os.chdir(cwd)
    return scraper.parse_date, extractor._parse_date


def main() -> int:
    assert sys.version_info[:2] == (3, 11), "run with Python 3.11, like the notebooks"
    parse_listing, parse_document = load_functions()
    rng = random.Random(SEED)
    seen: set[str] = set()
    inputs: list[str] = []
    generated = [random_case(rng) for _ in range(N_RANDOM)]
    generated += [structured_case(rng) for _ in range(N_STRUCTURED)]
    for s in CURATED + generated:
        if s not in seen:
            seen.add(s)
            inputs.append(s)
    templates = [s for s in CURATED + generated if s]
    for _ in range(N_MUTATED):
        s = mutate(rng, rng.choice(templates))
        if s not in seen:
            seen.add(s)
            inputs.append(s)

    cases = []
    for s in inputs:
        iso = iso_result(s)
        # [input, fromisoformat fields or null, .isoformat(), .strftime("%B %d, %Y"),
        #  CampaignDocumentsScraper.parse_date, OptimizedDocumentExtractor._parse_date]
        cases.append(
            [
                s,
                iso,
                datetime.fromisoformat(s).isoformat() if iso else None,
                datetime.fromisoformat(s).strftime("%B %d, %Y") if iso else None,
                parse_listing(s),
                parse_document(s),
            ]
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "[\n" + ",\n".join(json.dumps(c, ensure_ascii=False) for c in cases) + "\n]\n"
    )
    ok = sum(1 for c in cases if c[1])
    print(f"wrote {OUT.relative_to(ROOT)}: {len(cases)} cases, {ok} valid for fromisoformat")
    return 0


if __name__ == "__main__":
    sys.exit(main())
