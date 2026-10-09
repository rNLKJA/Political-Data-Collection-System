<div align="center">

# Campaign Text Lab

A descriptive reading room for US campaign documents (2016 to 2024) and presidential and
vice-presidential debate transcripts (1960 to 2024), built on a personal scraper of
[The American Presidency Project](https://www.presidency.ucsb.edu) at UC Santa Barbara.

**Live demo:** coming soon (Vercel project `campaign-text-lab`)

[![CI](https://github.com/rNLKJA/Political-Data-Collection-System/actions/workflows/ci.yml/badge.svg)](https://github.com/rNLKJA/Political-Data-Collection-System/actions/workflows/ci.yml)

</div>

---

## Overview

In August 2025 I wrote two Jupyter notebooks that collect public pages from The American
Presidency Project (APP): every document in its campaign-documents category, and every debate
transcript it holds. They wrote four CSV files. In 2026 the project was revived as a website that
reads those CSVs, without scraping anything again, and turns them into a small set of descriptive
tools.

| Tool                  | What it shows                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explorer**          | 7,556 documents filtered by candidate, document type, year and title; documents per month; links to every source page.                                                             |
| **Distinctive words** | Monroe, Colaresi and Quinn's (2008) weighted log-odds with an informative Dirichlet prior between any two candidates or election cycles, with a funnel plot and example documents. |
| **Debates**           | 179 transcripts split into 43,727 speaking turns: talk share, turn lengths, moderator share and reading grade from 1960 to 2024, and a turn-by-turn view of each debate.           |
| **Term timeline**     | Mentions per 10,000 words for 44 policy topics or any indexed word, with exact Poisson 95% intervals and short quoted passages.                                                    |
| **Method**            | The scraper design, the parity checks, and live playgrounds for the ported date normaliser, transcript splitter and readability code.                                              |

Key results carried over from the original collection: 7,582 listing rows (7,556 unique
documents, 2016-01-01 to 2024-11-06, all extracted successfully) under 54 speakers, and 179 debate
transcripts from Kennedy and Nixon in Chicago (26 September 1960) to the 2024 vice-presidential
debate.

### Ground rules

The subject is politically sensitive, so the site is strictly descriptive: every speaker goes
through the same code, colours identify the groups being compared and never parties, nothing is
scored for sentiment or quality, and nothing is predicted. Default views compare election cycles
rather than people.

## Tech stack

|             | Original (2025)                                                                        | Revived (2026)                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Collection  | Python, Jupyter, `requests` with retries, BeautifulSoup4, `ThreadPoolExecutor`, `tqdm` | none (the CSVs are read as they are)                                                                                   |
| Data        | CSV files                                                                              | A 9 MB read-only SQLite file built by Python scripts run with `uv`                                                     |
| App         | none                                                                                   | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4, shadcn config, `next-themes` |
| Server data | none                                                                                   | Node's built-in `node:sqlite`, queried from Server Components                                                          |
| Charts      | none                                                                                   | Hand-rolled SVG with a validated neutral palette                                                                       |
| Tests       | none                                                                                   | Vitest parity suites against the original CSVs; GitHub Actions CI                                                      |

## Repository structure

```
.
├── README.md
├── LICENSE                      MIT, code only (not the APP-sourced text)
├── .github/workflows/ci.yml     lint, format, typecheck, test, build; offline parity of the notebooks
├── original/                    the August 2025 project, moved with git mv, contents unchanged
│   ├── README.md                what is inside and how to run it
│   ├── documents.ipynb          campaign documents collector
│   ├── debates.ipynb            debate transcripts collector
│   ├── campaign_documents.csv   7,582 rows with full text
│   ├── debates_data.csv         180-row debate listing
│   ├── debates_data_processed.csv  179 transcripts with participants, moderators, text and HTML
│   ├── documents_processed_optimized.csv  2-row sample output
│   ├── pyproject.toml           black/isort settings
│   ├── README-2025.md           the README before the revival
│   └── _archive/                the first README
├── scripts/                     reproducible data build (uv, PEP 723 inline dependencies)
│   ├── parity_check.py          runs the notebook code offline against the stored HTML/CSV
│   ├── build_analytics.py       writes web/data/analytics.db and the test fixtures
│   ├── textkit.py               tokeniser, document cleaning, readability, topic list
│   └── debatekit.py             debate turn segmentation and roles
└── web/                         the Next.js app (Vercel root directory)
    ├── data/analytics.db        derived, read-only database (no running text)
    └── src/
        ├── app/                 routes: /, /explorer, /distinctive, /debates, /debates/[slug], /timeline, /method
        ├── components/          ui/ primitives, layout/, charts/, and one folder per tool
        ├── data/                generated JSON (parity summary, debate candidate list)
        ├── hooks/               element width, URL-driven filters
        ├── lib/                 framework-free logic and its tests
        │   ├── original/        TypeScript ports of the notebook code (dates, documents, splitter)
        │   ├── stats/           Fightin' Words and exact Poisson intervals
        │   └── textkit.ts       twin of scripts/textkit.py
        └── server/              server-only data access (node:sqlite)
```

## Local development

Requirements: Node 22.13 or newer (for `node:sqlite`; Node 24 recommended), pnpm 10, and
[uv](https://docs.astral.sh/uv/) if you want to rebuild the data.

```bash
cd web
pnpm install
pnpm dev            # http://localhost:3536
```

Quality gates (the same as CI):

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

`pnpm typecheck` runs `next typegen && tsc --noEmit`, because Next 16's global route types
(`PageProps`, `LayoutProps`) only exist after type generation.

## How the data artefacts are generated

Everything the site shows is derived from `original/*.csv` by two scripts, run from the repository
root:

```bash
uv run scripts/parity_check.py     # ~15 s: the notebooks' own code, offline, against the CSVs
uv run scripts/build_analytics.py  # ~1-4 min: writes web/data/analytics.db and fixtures
```

`build_analytics.py` de-duplicates the 26 repeated listing rows, keeps only text in each
candidate's own voice (interviewer, moderator and audience turns inside transcripts are dropped),
and stores per-document metadata and Flesch-Kincaid statistics, a compressed inverted index of
16,877 words (counts only), counts for a 44-topic controlled vocabulary with quotations of at most
25 words, and per-turn word counts for the debates. It also writes reference values for the
TypeScript tests (Fightin' Words z-scores, and Poisson intervals from SciPy).

### Parity with the original code

- `scripts/parity_check.py` executes the notebook cells verbatim with the HTTP layer replaced by a
  stub that serves pages rebuilt from the stored data: all 179 transcripts, 180 listing rows and
  7,582 documents come out field-for-field identical.
- The Vitest suites run the TypeScript ports (`web/src/lib/original`) over the same CSVs: date
  normalisation, document type, location, word count and paragraph join for all 7,582 documents,
  and participants, moderators and plain text for all 179 transcripts, all exact. The revival's
  own tokeniser and readability code are checked document by document against the Python build.

## Source, licence and provenance

Source texts: Gerhard Peters and John T. Woolley, The American Presidency Project, University of
California, Santa Barbara. Copyright © The American Presidency Project. The website does not
re-publish documents or transcripts: it shows counts, metadata and quotations of 25 words or fewer,
each linked to its source page.

The code is MIT-licensed; the licence does not cover the APP-sourced text. The original notebooks
and the CSVs they produced are preserved unchanged in [`original/`](original/) for reference.

## Credits

Personal project by Sunchuangyu (Rin) Huang ([@rNLKJA](https://github.com/rNLKJA)), collected
August 2025 and revived in 2026. Data courtesy of The American Presidency Project. Method:
Monroe, B. L., Colaresi, M. P. and Quinn, K. M. (2008), "Fightin' Words: Lexical Feature Selection
and Evaluation for Identifying the Content of Political Conflict", _Political Analysis_ 16(4).
