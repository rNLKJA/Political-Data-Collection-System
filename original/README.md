# Original collection system (August 2025)

This folder holds the project exactly as it was built in August 2025: two Jupyter notebooks that
scrape [The American Presidency Project](https://www.presidency.ucsb.edu) (UC Santa Barbara) and
the CSV files they produced. Everything was moved here with `git mv`, so the history of every file
is preserved and the contents are unchanged. The revived web app in [`../web`](../web) and the
build scripts in [`../scripts`](../scripts) only ever read these files.

## What is inside

| File                                | What it is                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `documents.ipynb`                   | Campaign documents collector. Phase 1 pages through the category listing; phase 2 fetches each document's text.            |
| `debates.ipynb`                     | Debate collector. Phase 1 reads the debate listing; phase 2 splits each transcript into participants, moderators and text. |
| `campaign_documents.csv`            | 7,582 campaign documents (2016-01-01 to 2024-11-06) with metadata and full text.                                           |
| `debates_data.csv`                  | The debate listing: 180 rows (179 unique transcripts), date, title, links.                                                 |
| `debates_data_processed.csv`        | 179 transcripts (1960 to 2024) with participants, moderators, plain text and the original HTML.                            |
| `documents_processed_optimized.csv` | Two-row output of the notebook's sample-data cell (an unfinished step, kept as-is).                                        |
| `pyproject.toml`                    | Black and isort settings used to format the notebooks.                                                                     |
| `README-2025.md`                    | The project README as it stood before the revival.                                                                         |
| `_archive/README.original.md`       | The very first README.                                                                                                     |

Paths inside the notebooks are relative (`./campaign_documents.csv`, `./debates_data.csv`), and the
CSVs moved together with the notebooks, so the notebooks still run from this folder.

## Running the notebooks

The notebooks scrape a live website. Please do not re-run the collection cells casually: the data
is already here, and the source is a small academic project. If you do need to re-run them, keep the
built-in delays and worker limits.

```bash
cd original
uv run --with jupyter --with pandas --with requests --with beautifulsoup4 --with lxml --with tqdm \
  jupyter notebook
```

Run the cells top to bottom. `documents.ipynb` writes `campaign_documents.csv` and keeps resumable
progress in `document_cache.pkl` and `extraction_checkpoint.json` (both git-ignored).
`debates.ipynb` writes `debates_data.csv` and then `debates_data_processed.csv`.

## Checking the code without touching the network

`../scripts/parity_check.py` loads the parsing functions straight out of these notebooks, swaps the
HTTP layer for a stub that serves the HTML already stored in `debates_data_processed.csv`, and
confirms that the original code reproduces the CSVs offline:

```bash
uv run scripts/parity_check.py   # from the repository root
```

## Known quirks (kept on purpose)

- `Document_Content` joins paragraphs with a literal backslash-n pair (`\n\n` as four characters),
  because the notebook source escapes the newline twice. `Word_Count` is computed before the join,
  so it is still correct.
- The location regex also contains a doubled escape (`\\s`), so only the first word of a
  multi-word place is captured (`Las` for Las Vegas, `New` for New York).
- 26 documents appear twice in the listing (same URL, two rows); the analysis de-duplicates them.
- Participant and moderator lists keep a trailing `and` where the source page wrote
  `Name (Party) and`.

The revived TypeScript ports reproduce these behaviours exactly; see the parity tests in
`../web/src/lib`.
