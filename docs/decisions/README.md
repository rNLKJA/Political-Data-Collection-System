# Decision records

Each record explains one decision that shaped Campaign Text Lab, and every record follows the same order. It states the decision first, then gives the context, the options that were considered and why one was chosen. It reports what happened, weak numbers included, and ends with what I'd change.

Records are never edited after they are accepted. If a decision changes, a new record supersedes or amends the old one and says so in its decision line; the site then shows an "Amended by" notice on the older record.

| Record                                                                          | Decision                                                                             | Decided         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| [DR-001](DR-001-no-full-text-on-the-site.md)                                    | Show derived statistics and short linked quotations, never the full texts            | 2026 (revival)  |
| [DR-002](DR-002-neutral-presentation-rules.md)                                  | One set of neutral presentation rules for every speaker and every page               | 2026 (revival)  |
| [DR-003](DR-003-term-statistics-method.md)                                      | Fightin' Words with an informative prior, exact Poisson rates, bootstrap checks      | 2026 (revival)  |
| [DR-004](DR-004-llm-topic-labels-vs-keyword-rules.md)                           | LLM topic labels only as a bring-your-own-key evaluation against keyword rules       | 10 October 2026 |
| [DR-005](DR-005-score-only-answered-excerpts.md)                                | Score only the excerpts the model answered for (amends DR-004)                       | 10 October 2026 |
| [DR-006](DR-006-clustered-intervals-for-readability.md)                         | Clustered intervals for readability, and two corrections to DR-003                   | 10 October 2026 |
| [DR-007](DR-007-blind-relabel-for-the-gold-set.md)                              | Record how the gold set was made, and finish it with a blind relabel (amends DR-004) | 10 October 2026 |
| [DR-008](DR-008-fewer-readability-intervals-and-speaker-matched-transcripts.md) | Fewer readability intervals, and speaker-matched twin transcripts (amends DR-006)    | 10 October 2026 |

DR-001 to DR-003 were made when the project was revived in 2026 and written down on 10 October 2026, with what has happened since. The numbers in every record come from `web/data/analytics.db` and the evaluation files in `web/src/data`, and the statistics are recomputed independently by `scripts/stats_reference.py`. The site renders these files under `/methods`.
