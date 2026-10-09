<div align="center">

# Campaign Text Lab

A descriptive reading room for US campaign documents (2016 to 2024) and 179 debate transcripts
(49 general-election and vice-presidential, 130 primary; 1960 to 2024), built on a personal scraper of
[The American Presidency Project](https://www.presidency.ucsb.edu) at UC Santa Barbara.

**Live demo:** [campaign-text-lab.vercel.app](https://campaign-text-lab.vercel.app)

[![CI](https://github.com/rNLKJA/Political-Data-Collection-System/actions/workflows/ci.yml/badge.svg)](https://github.com/rNLKJA/Political-Data-Collection-System/actions/workflows/ci.yml)

</div>

---

## Overview

In August 2025 I wrote two Jupyter notebooks that collect public pages from The American
Presidency Project (APP): every document in its campaign-documents category, and every debate
transcript it holds. They wrote four CSV files. In 2026 the project was revived as a website that
reads those CSVs, without scraping anything again, and turns them into a small set of descriptive
tools.

| Tool                  | What it shows                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explorer**          | 7,556 documents filtered by candidate, document type, year and title; documents per month; links to every source page.                                                                                                                              |
| **Distinctive words** | Monroe, Colaresi and Quinn's (2008) weighted log-odds with an informative Dirichlet prior between any two candidates or election cycles, with a funnel plot, example documents and a document-level bootstrap check of how stable each top word is. |
| **Debates**           | 179 transcripts split into 43,662 speaking turns: talk share, turn lengths, moderator share and reading grade from 1960 to 2024, and a turn-by-turn view of each debate.                                                                            |
| **Term timeline**     | Mentions per 10,000 words for 44 policy topics or any indexed word, with exact Poisson 95% intervals and short quoted passages.                                                                                                                     |
| **Readability**       | Flesch-Kincaid trends with bootstrap intervals: debates 1960 to 2024, documents by cycle and kind of text, a paired within-speaker comparison, and two debates held in two transcripts.                                                             |
| **Topic labels**      | An LLM against a frozen keyword dictionary on 120 labelled excerpts: agreement, Cohen's kappa, paired differences and McNemar's test. Bring your own key; a simulated run works without one.                                                        |
| **AI audit log**      | Every AI call from your browser, with prompt, answer, latency, tokens and your decision, exportable as JSON or CSV. Kept in your browser only.                                                                                                      |
| **Methods**           | The scraper design, parity checks, playgrounds, every statistic and interval, assumptions and limits, the AI use statement, the model card and the decision records.                                                                                |

Key results carried over from the original collection: 7,582 listing rows (7,556 unique
documents, 2016-01-01 to 2024-11-06, all extracted successfully) under 54 speakers, and 179 debate
transcripts from Kennedy and Nixon in Chicago (26 September 1960) to the 2024 vice-presidential
debate.

### What the 2026 upgrade added

The revival turned the CSVs into a reading room; the October 2026 upgrade adds the statistical
checks and the evaluation that a careful analyst would want next.

- **Uncertainty everywhere it matters.** Rates carry exact Poisson intervals, reading grades
  carry percentile-bootstrap intervals over the unit the claim is about (documents, debates or
  speakers), agreement scores carry Wilson intervals and kappa a bootstrap interval. Sample
  sizes, resample counts and the seed (20261010) are shown next to the numbers.
- **Word lists that admit their fragility.** Fightin' Words z-scores assume independent word
  tokens. Each comparison is re-run on 200 resamples of documents, and each top word shows how
  often it stays in the list, its z range, how many documents use it and how much of it comes
  from one document. In the default comparison, 21 of 30 words for 2016 and 19 of 30 for 2024
  stay in the top 30 in at least 90% of resamples; "county" (third for 2016) gets 30% of its
  uses from a single document.
- **Readability with the transcriber in view.** Candidates' grade in general-election and VP
  debates falls by 0.75 grade levels per decade (95% CI 0.58 to 0.94), but the same speakers'
  transcribed remarks grade 5.5 levels below their written releases (95% CI 4.2 to 6.7, 14
  speakers, paired), mostly through sentence length, and two transcripts of the same 2000
  debate differ by up to 1.4 levels for one speaker.
- **An honest LLM evaluation.** A CAP-style codebook of 21 policy topics plus "none", a keyword
  dictionary frozen before the gold set was drawn, and a seeded, keyword-blind gold set of 120
  one-sentence excerpts. The keyword rules agree with the gold labels on 75.8% of excerpts (95%
  CI 67.4% to 82.6%), Cohen's kappa 0.59 (0.45 to 0.71). The gold labels are a single-annotator
  draft prepared by the AI coding assistant that built the upgrade and not yet reviewed by a
  person; the page says so above every score.
- **Statistics checked against Python.** `scripts/stats_reference.py` recomputes the Wilson
  intervals (statsmodels), kappa and per-class metrics (scikit-learn), McNemar's test
  (statsmodels), OLS (SciPy), the bootstrap (numpy with a port of the same seeded generator),
  the word-list stability (an independent Python port) and every readability summary (from the
  database). The Vitest suite compares the TypeScript to these values.
- **Written decisions.** Decision records DR-001 to DR-004 and a model card, rendered under
  `/methods`.

### Ground rules

The subject is politically sensitive, so the site is strictly descriptive: every speaker goes
through the same code, colours identify the groups being compared and never parties, nothing is
scored for sentiment or quality, and nothing is predicted. Default views compare election cycles
rather than people.

## Bring your own key: the optional AI feature

The site works fully without AI. The one AI feature, on `/topics`, asks a language model to
label the policy topic of short excerpts so it can be compared with the keyword rules.

1. Open **AI settings** (the key icon in the header). Choose Anthropic (default, with Claude
   Haiku 4.5 or Claude Sonnet 5.5) or OpenAI (any Chat Completions model with JSON-schema
   output; `gpt-5-mini` by default) and paste your own API key. A key with a low spending limit
   is a good idea.
2. The key stays in your browser: sessionStorage by default (gone when the tab closes), or
   localStorage if you tick "remember on this device". **Forget key** removes it. It is never
   sent to this site's server, never logged and never written to the audit log.
3. On `/topics`, pick a sample size and a seed and select **Run with my key**. Requests go
   straight from your browser to `api.anthropic.com` (with the
   `anthropic-dangerous-direct-browser-access` header) or `api.openai.com`. Each request
   carries only the codebook, the coding rules and up to ten excerpts of 25 words or fewer with
   opaque ids: no speaker, date, link or gold label. The page estimates tokens and cost first.
4. Without a key, **Run the simulated demo** exercises the same harness, scoring, audit log and
   exports with a simulated labeller that calls nothing; its output is labelled "Simulated, not
   AI".

Every model output is labelled "AI-generated". You can accept, correct or reject each run;
corrections are logged as edits and never change the scores.

### Viewing the AI audit log

Open `/ai-log` (also linked from the footer and the AI settings dialog). Each call, failed call
and simulated run appears with its timestamp, provider, requested and served model, the exact
system prompt and user message, the validated answer (or the raw text when it failed), latency,
token usage, retries and your decision. **Export JSON** and **Export CSV** download the log;
**Clear log** deletes it. The log lives in your browser's IndexedDB (database
`campaign-text-lab`, store `ai_audit_log`); this site has no database to send it to.

## Methods, model card and decision records

- `/methods` describes data provenance, every calculation and interval, the topic evaluation
  design, assumptions and limitations, the AI use statement and what I would change.
- [`docs/model-card.md`](docs/model-card.md) covers the two topic labellers (rendered at
  `/methods/model-card`).
- [`docs/decisions/`](docs/decisions/) holds the decision records, each in the same order:
  decision first, context, options, why, what happened (weak numbers included) and what I'd
  change. They are rendered at `/methods/decisions/<slug>`. A past record is never edited; a
  new one supersedes it.

Because the deployment uploads `web/` only, the documents are mirrored into `web/content` by
`pnpm sync:docs`, and a test fails if the copies drift from `docs/`.

## Tech stack

|               | Original (2025)                                                                        | Revived (2026)                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Collection    | Python, Jupyter, `requests` with retries, BeautifulSoup4, `ThreadPoolExecutor`, `tqdm` | none (the CSVs are read as they are)                                                                                                   |
| Data          | CSV files                                                                              | A 9 MB read-only SQLite file built by Python scripts run with `uv`                                                                     |
| App           | none                                                                                   | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4, shadcn config, `next-themes`                 |
| Server data   | none                                                                                   | Node's built-in `node:sqlite`, queried from Server Components                                                                          |
| Charts        | none                                                                                   | Hand-rolled SVG with a validated neutral palette                                                                                       |
| AI (optional) | none                                                                                   | Browser-direct Anthropic or OpenAI calls with the visitor's key, zod-validated JSON, IndexedDB audit log                               |
| Tests         | none                                                                                   | Vitest parity suites against the original CSVs and reference values from numpy, SciPy, statsmodels and scikit-learn; GitHub Actions CI |

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
├── docs/
│   ├── model-card.md            the two topic labellers
│   └── decisions/               DR-001 to DR-004 and an index
├── scripts/                     reproducible data build (uv, PEP 723 inline dependencies)
│   ├── parity_check.py          runs the notebook code offline against the stored HTML/CSV
│   ├── build_analytics.py       writes web/data/analytics.db and the test fixtures
│   ├── build_topic_eval.py      draws the 120 seeded excerpts for the topic evaluation
│   ├── stats_reference.py       reference values from numpy, SciPy, statsmodels, scikit-learn
│   ├── date_fixtures.py         CPython 3.11 date results for the TypeScript differential test
│   ├── textkit.py               tokeniser, document cleaning, readability, topic list
│   └── debatekit.py             debate turn segmentation and roles
└── web/                         the Next.js app (Vercel root directory)
    ├── data/analytics.db        derived, read-only database (no running text)
    ├── content/                 copies of docs/ for rendering (pnpm sync:docs)
    └── src/
        ├── app/                 routes: /, /explorer, /distinctive, /debates, /debates/[slug], /timeline,
        │                        /readability, /topics, /ai-log, /methods (+ /decisions/[slug], /model-card)
        ├── components/          ui/ primitives, layout/, charts/, ai/, and one folder per tool
        ├── data/                generated JSON (parity summary, candidate list, topic items and gold labels)
        ├── hooks/               element width, URL-driven filters
        ├── lib/                 framework-free logic and its tests
        │   ├── ai/              provider adapters, settings store, audit log, topic-label client
        │   ├── original/        TypeScript ports of the notebook code (dates, documents, splitter)
        │   ├── stats/           Fightin' Words, Poisson, bootstrap, Wilson, kappa, McNemar, OLS, stability
        │   ├── topics/          codebook, keyword rules, gold set, scoring, simulated labeller
        │   ├── readability-stats.ts  grade by cycle, paired gap, debate trends
        │   └── textkit.ts       twin of scripts/textkit.py
        └── server/              server-only data access (node:sqlite) and the markdown docs
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
uv run scripts/date_fixtures.py    # ~10 s, Python 3.11 on macOS: date differential fixtures
uv run scripts/build_topic_eval.py # ~15 s: the 120 topic-evaluation excerpts (seed 20261010)
uv run scripts/stats_reference.py  # ~15 s: reference values for the statistics tests
```

`build_topic_eval.py` rewrites only `web/src/data/topic-eval-items.json`; the gold labels in
`web/src/data/topic-gold.json` are written by hand and never touched by a script. To review
them, edit the labels (the file records who labelled them and a `status`), set `status` to
`reviewed` and run the tests: the model card's baseline numbers are checked against the
computed scores, so update `docs/model-card.md` and run `pnpm sync:docs` if they change.

`build_analytics.py` de-duplicates the 26 repeated listing rows, keeps only text in each
candidate's own voice (interviewer, moderator and audience turns inside transcripts are dropped),
and stores per-document metadata and Flesch-Kincaid statistics, a compressed inverted index of
16,877 words (counts only), counts for a 44-topic controlled vocabulary with quotations of at most
25 words, and per-turn word counts for the debates. It also writes reference values for the
TypeScript tests (Fightin' Words z-scores, and Poisson intervals from SciPy).

Two rules keep the derived data neutral:

- **Debate roles.** A speaker counts as a candidate only if they are on the cycle's list of debate
  participants, belong to the party holding the debate when it is a primary, and are named in the
  page's Participants block when it has one. Recorded clips played during a debate ("[begin video
  clip]" ... "[end video clip]", "(from videotape.)", "VIDEO CLIP OF ...") are counted as "Recorded
  clips", not as anyone's live speech, so a president quoted in a clip at the other party's primary
  is not listed as taking part. The build asserts both rules for every debate.
- **Quotations.** Topic snippets illustrate how a topic is discussed. A quoted window is skipped
  (the next use, then the next document, is tried) if it names another candidate or uses a charged
  word such as "liar", "racist" or "Hitler" (`CHARGED_WORDS` in `build_analytics.py`).

### Looking at the data yourself

The site has no accounts and no writable database: everything it shows comes from
`web/data/analytics.db`, a read-only SQLite file committed to the repository and bundled with the
deployment. Open it with any SQLite browser, or from the command line:

```bash
sqlite3 web/data/analytics.db ".tables"
sqlite3 web/data/analytics.db "SELECT date, title, n_candidates FROM debates ORDER BY date DESC LIMIT 5"
sqlite3 web/data/analytics.db "SELECT key, value FROM meta"   # build provenance (source CSV hashes)
```

Tables: `speakers`, `documents` (metadata and statistics, no text), `terms` (compressed postings),
`concepts`, `concept_hits`, `concept_snippets` (quotations of 25 words or fewer), `debates`,
`debate_speakers` and `debate_turns`.

### Parity with the original code

- `scripts/parity_check.py` executes the notebook cells verbatim with the HTTP layer replaced by a
  stub that serves pages rebuilt from the stored data: all 179 transcripts, 180 listing rows and
  7,582 documents come out field-for-field identical.
- The Vitest suites run the TypeScript ports (`web/src/lib/original`) over the same CSVs: date
  normalisation, document type, location, word count and paragraph join for all 7,582 documents,
  and participants, moderators and plain text for all 179 transcripts, all exact. The revival's
  own tokeniser and readability code are checked document by document against the Python build.
- `datetime.fromisoformat` is ported in full from CPython 3.11 (basic and week formats, any
  separator, fractions, offsets). `scripts/date_fixtures.py` runs it and the notebook's two date
  functions over about 2,400 hand-picked and generated strings, and the TypeScript must return
  exactly the same for every one.

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
The topic codebook is modelled on the major topics of the Comparative Agendas Project
(comparativeagendas.net); it is an adaptation, not the official codebook. The AI feature is
informed by the Australian Government's policy for the responsible use of AI in government, the
EU AI Act's transparency principles and the NIST AI Risk Management Framework, without claiming
compliance with any of them.
