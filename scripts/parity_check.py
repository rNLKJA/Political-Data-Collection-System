# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas>=2.2",
#   "beautifulsoup4>=4.12",
#   "requests>=2.31",
#   "tqdm>=4.66",
# ]
# ///
"""Offline parity check for the original August 2025 notebooks.

The parsing functions are loaded *verbatim* from ``original/*.ipynb`` (the code
cells are executed as-is), then the HTTP layer is replaced with a stub that
serves pages rebuilt from what the CSVs already store. No request ever leaves
this machine.

What is checked:

* debates.ipynb ``extract_debate_info``: for each of the 179 transcripts, the
  stored ``Debate_Content_HTML`` is wrapped in a minimal page and fed back
  through the original function. Participants, moderators, plain text, title
  and date must come out identical to ``debates_data_processed.csv``.
* debates.ipynb ``scrape_debates_data``: a listing page is rebuilt from the
  180 listing rows (ISO timestamps taken from the processed CSV) and the
  original date normalisation must reproduce the ``Date`` column of
  ``debates_data.csv``.
* documents.ipynb ``OptimizedDocumentExtractor.extract_document_info``: each of
  the 7,582 documents is rebuilt as a page (title, ISO date, speaker, byline and
  one ``<p>`` per stored paragraph) and the original classifier, location regex,
  word counter, date parser and paragraph join must reproduce the CSV row.
* documents.ipynb ``CampaignDocumentsScraper.parse_date``: listing dates.

Writes a small summary to ``web/src/data/parity-python.json`` that the Method
page displays.

Run from the repository root:  ``uv run scripts/parity_check.py``
"""

from __future__ import annotations

import html
import json
import os
import sys
import tempfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "original"
OUT = ROOT / "web" / "src" / "data" / "parity-python.json"
# The live pages declare UTF-8; without it BeautifulSoup would have to sniff the
# encoding of the stub bytes and can guess wrong on pages with soft hyphens.
HEAD = "<html><head><meta charset='utf-8'></head>"


def load_cells(notebook: Path, must_contain: str) -> list[str]:
    cells = json.loads(notebook.read_text())["cells"]
    return [
        "".join(c["source"])
        for c in cells
        if c["cell_type"] == "code" and must_contain in "".join(c["source"])
    ]


class FakeResponse:
    def __init__(self, body: str):
        self.content = body.encode("utf-8")
        self.status_code = 200

    def raise_for_status(self) -> None:
        return None


class FakeHTTP:
    """Stands in for both the ``requests`` module and a ``requests.Session``."""

    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        import requests  # only for the exception classes

        self.RequestException = requests.RequestException
        self.exceptions = requests.exceptions

    def get(self, url, headers=None, timeout=None):  # noqa: ARG002
        if url not in self.pages:
            raise self.RequestException(f"offline stub has no page for {url}")
        return FakeResponse(self.pages[url])


def nan_to_empty(v) -> str:
    return "" if (v is None or (isinstance(v, float) and pd.isna(v))) else str(v)


# ---------------------------------------------------------------------------
# Debates
# ---------------------------------------------------------------------------


def check_debates() -> dict:
    ns: dict = {}
    for src in load_cells(ORIGINAL / "debates.ipynb", "def "):
        exec(compile(src, "debates.ipynb", "exec"), ns)

    processed = pd.read_csv(ORIGINAL / "debates_data_processed.csv")
    listing = pd.read_csv(ORIGINAL / "debates_data.csv")

    pages = {}
    for row in processed.itertuples():
        pages[row.URL] = (
            HEAD + "<body><div class='col-sm-8'>"
            f"<h1>{html.escape(nan_to_empty(row.Extracted_Title))}</h1>"
            f"<span property='dc:date' content='{row.Extracted_Date}'>x</span>"
            "</div>"
            f"<div class='field-docs-content'>{row.Debate_Content_HTML}</div>"
            "</body></html>"
        )
    stub = FakeHTTP(pages)
    ns["requests"] = stub

    fields = [
        "Extracted_Title",
        "Extracted_Date",
        "Participants",
        "Moderators",
        "Debate_Content_Text",
    ]
    mismatches: dict[str, int] = {f: 0 for f in fields}
    list_mismatch = 0
    examples: list[str] = []
    for row in processed.itertuples():
        got = ns["extract_debate_info"](row.URL)
        for f in fields:
            if nan_to_empty(got[f]) != nan_to_empty(getattr(row, f)):
                mismatches[f] += 1
                if len(examples) < 5:
                    examples.append(f"{row.URL} :: {f}")
        if str(got["Participants_List"]) != nan_to_empty(row.Participants_List) and not (
            got["Participants_List"] == [] and pd.isna(row.Participants_List)
        ):
            list_mismatch += 1

    # Listing: rebuild a listing page and run scrape_debates_data on it.
    iso_by_url = dict(zip(processed.URL, processed.Extracted_Date))
    rows_html = []
    for r in listing.itertuples():
        href = r.Debate_Link.replace("https://www.presidency.ucsb.edu", "")
        rel_href = nan_to_empty(r.Related_Link).replace("https://www.presidency.ucsb.edu", "")
        rows_html.append(
            "<div class='row'><div class='col-sm-8'>"
            f"<span property='dc:date' content='{iso_by_url[r.Debate_Link]}'>x</span>"
            f"<div class='field-title'><a href='{href}'>{html.escape(r.Title)}</a></div>"
            "</div><div class='col-sm-4'><div class='label-above'>Related</div>"
            f"<a href='{rel_href}'>{html.escape(nan_to_empty(r.Related_Category))}</a>"
            "</div></div>"
        )
    listing_url = "offline://debates-listing"
    stub.pages[listing_url] = HEAD + "<body>" + "".join(rows_html) + "</body></html>"
    rebuilt = ns["scrape_debates_data"](listing_url)
    date_matches = int((rebuilt["Date"].values == listing["Date"].values).sum())
    title_matches = int((rebuilt["Title"].values == listing["Title"].values).sum())

    return {
        "transcripts": int(len(processed)),
        "fieldsChecked": fields + ["Participants_List"],
        "mismatches": {**mismatches, "Participants_List": list_mismatch},
        "exampleMismatches": examples,
        "listingRows": int(len(listing)),
        "listingDateMatches": date_matches,
        "listingTitleMatches": title_matches,
    }


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def check_documents() -> dict:
    ns: dict = {}
    workdir = tempfile.mkdtemp(prefix="ctl-parity-")
    cwd = os.getcwd()
    os.chdir(workdir)  # cell 9 writes ./sample_documents.csv; keep it out of the repo
    try:
        for src in load_cells(ORIGINAL / "documents.ipynb", "class "):
            exec(compile(src, "documents.ipynb", "exec"), ns)
        import logging

        logging.getLogger().setLevel(logging.ERROR)
        extractor = ns["OptimizedDocumentExtractor"](
            max_workers=1,
            cache_file=str(Path(workdir) / "cache.pkl"),
            checkpoint_file=str(Path(workdir) / "checkpoint.json"),
        )
        scraper = ns["CampaignDocumentsScraper"]("offline://listing")
    finally:
        os.chdir(cwd)

    df = pd.read_csv(ORIGINAL / "campaign_documents.csv")
    pages = {}
    for i, row in enumerate(df.itertuples()):
        content = nan_to_empty(row.Document_Content)
        parts = content.split("\\n\\n") if content else []
        paras = "".join(f"<p>{html.escape(p)}</p>" for p in parts)
        video = "<iframe src='https://www.youtube.com/embed/x'></iframe>" if row.Video_Available else ""
        pages[f"offline://doc/{i}"] = (
            HEAD + "<body>"
            f"<div class='field-ds-doc-title'><h1>{html.escape(nan_to_empty(row.Document_Title))}</h1></div>"
            f"<span property='dc:date' content='{row.Document_Date}'>x</span>"
            f"<div class='field-title'><a href='/p'>{html.escape(nan_to_empty(row.Speaker))}</a></div>"
            f"<div class='diet-by-line'>{html.escape(nan_to_empty(row.Speaker_Title))}</div>"
            f"<div class='field-docs-content'>{paras}</div>{video}"
            "</body></html>"
        )
    extractor.session = FakeHTTP(pages)

    fields = [
        "Document_Title",
        "Document_Date",
        "Document_Content",
        "Speaker",
        "Speaker_Title",
        "Document_Type",
        "Location",
        "Video_Available",
        "Word_Count",
    ]
    mismatches = {f: 0 for f in fields}
    examples: list[str] = []
    for i, row in enumerate(df.itertuples()):
        got = extractor.extract_document_info(f"offline://doc/{i}")
        for f in fields:
            want = getattr(row, f)
            have = got[f]
            if f in ("Video_Available", "Word_Count"):
                same = have == want
            else:
                same = nan_to_empty(have) == nan_to_empty(want)
            if not same:
                mismatches[f] += 1
                if len(examples) < 5:
                    examples.append(f"{row.Document_Link} :: {f}: {str(have)[:80]!r} vs {str(want)[:80]!r}")

    # Listing-date normalisation (phase 1): ISO content attribute -> "%B %d, %Y",
    # which pandas later read back as the YYYY-MM-DD Date column.
    listing_dates = [scraper.parse_date(d) for d in df.Document_Date]
    back = pd.to_datetime(pd.Series(listing_dates), format="%B %d, %Y").dt.strftime("%Y-%m-%d")
    listing_matches = int((back.values == df.Date.values).sum())

    sample = pd.read_csv(ORIGINAL / "documents_processed_optimized.csv")
    sample_ok = all(
        scraper.parse_date(r.Document_Date) == r.Date for r in sample.itertuples()
    )

    return {
        "documents": int(len(df)),
        "fieldsChecked": fields,
        "mismatches": mismatches,
        "exampleMismatches": examples,
        "listingDateMatches": listing_matches,
        "sampleListingDatesMatch": bool(sample_ok),
    }


def main() -> int:
    deb = check_debates()
    doc = check_documents()
    result = {
        "generatedBy": "scripts/parity_check.py",
        "note": "Original notebook functions executed offline against the stored CSV/HTML.",
        "debates": deb,
        "documents": doc,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    bad = sum(deb["mismatches"].values()) + sum(doc["mismatches"].values())
    bad += deb["listingRows"] - deb["listingDateMatches"]
    bad += doc["documents"] - doc["listingDateMatches"]
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
