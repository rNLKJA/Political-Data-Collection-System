# DR-002: One set of neutral presentation rules for every speaker and every page

**Decision:** Every speaker goes through the same code, colours mark the groups being compared and never parties, default views compare election cycles rather than people, nothing is scored for sentiment, quality or truth, nothing is predicted, and quotations that name another candidate or use a charged word are skipped.

| Status   | Decided        | Recorded        | Owner                   |
| -------- | -------------- | --------------- | ----------------------- |
| Accepted | 2026 (revival) | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

The subject is US presidential politics. Any chart that puts two candidates side by side can be read as a verdict, and small presentation choices (a red and a blue line, a ranking, a quotation that relays an attack) can tilt it. The site is a portfolio project, not commentary, so it has to be useful to readers of any political view.

## Decision

- **Symmetry.** All speakers are processed by identical code. Transcript roles come from the same rules for every debate (see `scripts/debatekit.py`).
- **Colour.** A validated neutral categorical palette (ochre, teal, plum, olive, rose, steel) identifies the groups in a comparison. No party colours anywhere.
- **Defaults.** The Distinctive words tool opens on 2016 against 2024, not on two people.
- **No verdicts.** No sentiment, quality, honesty or truthfulness scores, and no forecasts. Reading grades are described as properties of a text.
- **Quotations.** A quoted window is skipped if it names another candidate or uses a word from a fixed charged-word list (`CHARGED_WORDS` in `scripts/build_analytics.py`, for example "liar", "racist", "Hitler"); the next use, then the next document, is tried.
- **Upgrade pages.** The readability page lists speakers alphabetically and shows each one's gap between written and transcribed text, not a ranking of grades. The topic evaluation lists excerpts by id, never aggregates labels by speaker or party, and never sends the speaker's name to a model.

## Options considered

| Option                                       | Why not                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Party colours, as most election sites use    | Makes every chart a red-against-blue reading.                                   |
| Rank candidates by readability or vocabulary | Invites reading a description of text as a judgement of a person.               |
| Quote whatever the matching window says      | Relays attacks between candidates under a neutral-looking heading.              |
| One rule set for everyone (chosen)           | Rules can be stated, tested and criticised, and apply the same way to everyone. |

## Why

Rules that are written down and tested are easier to defend than case-by-case judgement, and readers can check them. The tests in `web/src/lib/analytics-integrity.test.ts` assert the role and quotation rules on the built database.

## What happened

- 628 quotation windows were skipped for naming another candidate and 250 for charged words; 3,216 quotations remain.
- The colour palette passes a colour-vision-deficiency separation check and 3:1 contrast on both themes.
- Weak point: the charged-word list is hand-made. Choosing which words count as charged is itself a judgement, and it is English-only.
- Weak point: Distinctive words still allows any two candidates to be compared, and their top words are often names and press-release boilerplate. The page explains this, but the comparison can still be misread.

## What I'd change

- Have the charged-word list reviewed by people of different political views and publish the review.
- Add a short "how this could mislead" note to every tool, not only to some.
