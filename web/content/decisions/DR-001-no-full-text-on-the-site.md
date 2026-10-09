# DR-001: Show derived statistics and short linked quotations, never the full texts

**Decision:** The website publishes counts, metadata, derived statistics and quotations of 25 words or fewer, each linked to its page on The American Presidency Project. It never serves the full text of a document or a transcript.

| Status   | Decided        | Recorded        | Owner                   |
| -------- | -------------- | --------------- | ----------------------- |
| Accepted | 2026 (revival) | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

The 2025 scrapers saved the full text of 7,582 campaign documents and 179 debate transcripts from The American Presidency Project (APP) at UC Santa Barbara. The texts are public, but the archive is a curated academic collection under its own copyright, and its value to readers depends on people citing and visiting it. A reading room still needs some text: a number that cannot be checked against a passage is hard to trust.

## Decision

- `scripts/build_analytics.py` writes a read-only SQLite file of derived data: per-document metadata and readability counts, an inverted index of word counts, topic counts, per-turn word counts for debates, and short keyword-in-context quotations. No running text.
- Every quotation is at most 25 words and every document, transcript and quotation links to its source page.
- The topic-label evaluation follows the same limit: its excerpts are single sentences of 12 to 25 words, and those excerpts are the only text ever sent to an AI provider.
- The original notebooks and CSVs stay in the repository's `original/` folder, unchanged, as the record of what the 2025 collection produced. The website does not read them at run time.

## Options considered

| Option                                             | Why not                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Full-text search and reading on the site           | Republishes the archive's compilation and takes readers away from the source.           |
| Counts only, no quotations                         | Readers could not see what a number refers to without leaving the site for every check. |
| Longer excerpts behind a click                     | Still republishing in practice, and harder to keep within a stated limit.               |
| Derived data plus short linked quotations (chosen) | Every number can be checked at the source; the archive stays the place to read.         |

## Why

It keeps the project on the right side of a simple test: the site adds analysis that the archive does not have, and sends readers to the archive for the texts. It also kept the deployed database small (9 MB), which matters for serverless hosting.

## What happened

- `analytics.db` holds 3,216 quotations, each of 25 words or fewer. While choosing them, 628 candidate windows were skipped because they named another candidate and 250 because they used a charged word (DR-002).
- The topic evaluation's 120 excerpts are one sentence each, 12 to 25 words, drawn with the same quotation rules.
- Weak point: the full-text CSVs are still in the public repository's `original/` folder, because the revival preserved the 2025 project as it was. The website does not serve them, but anyone can download them from GitHub.
- Weak point: a 25-word quotation chosen by rules can still be unrepresentative of the document it comes from. Each one links to the full page for that reason.

## What I'd change

- Ask the archive's editors directly how they would like the collected texts to be kept, and follow their answer.
- Move the full-text CSVs out of the public repository (for example, to a private archive) and keep only their SHA-256 hashes, which the build already records, so the derived data stays verifiable.
