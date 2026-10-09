# DR-003: Fightin' Words with an informative prior, exact Poisson rates, and bootstrap checks

**Decision:** Compare vocabularies with the weighted log-odds ratio and informative Dirichlet prior of Monroe, Colaresi and Quinn (2008), report term rates per 10,000 words with exact Poisson intervals, and, since the October 2026 upgrade, check every pair of top-word lists by resampling documents.

| Status   | Decided                                          | Recorded        | Owner                   |
| -------- | ------------------------------------------------ | --------------- | ----------------------- |
| Accepted | 2026 (revival); bootstrap check 10 October 2026  | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

Two tools rest on word counts. Distinctive words asks which words separate two groups of documents (two candidates, two cycles, or one group against the rest). Term timeline asks how often a word or topic appears per period. Group sizes vary from a few dozen documents to several thousand, and many words are rare, so a method that ignores sample size would put rare words at the top of every list and draw confident lines through months with almost no text.

## Decision

- **Distinctive words.** The weighted log-odds ratio with an informative Dirichlet prior: the prior is the whole archive's word distribution scaled to α₀ = 10,000 pseudo-words (adjustable), and each word gets a z-score, δ divided by its approximate standard error. The lists show the 30 most positive and 30 most negative z-scores.
- **Term timeline.** Mentions per 10,000 own-voice words per period, with exact (Garwood) 95% Poisson intervals; periods with fewer than 5,000 words are not plotted.
- **Bootstrap stability (upgrade).** The z-score assumes word tokens are independent draws, which campaign text is not: one press release can repeat a word dozens of times. For every comparison the site resamples the documents within each group with replacement (200 resamples, fixed seed 20261010, shown on the page), recomputes all z-scores with the same prior, and reports for each listed word the share of resamples in which it stays in its top 30, the 95% range of its z-score, the number of documents that use it, and the share of its uses from its single heaviest document.
- All three are implemented in TypeScript and checked against Python: the z-scores against the build script to 1e-9, the Poisson intervals against SciPy, and the bootstrap against an independent Python port of the procedure, result for result.

## Options considered

| Option                                              | Why not                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ratios of relative frequencies, or tf-idf           | No account of sample size; rare words dominate.                                                           |
| Chi-square or log-likelihood (G²) keyness           | Well known, but gives no shrinkage, and its p-values carry the same independence assumption.              |
| Fightin' Words with an uninformative prior          | Shrinks every word by the same amount regardless of how common it is.                                     |
| Topic models                                         | Harder to explain, unstable between runs, and less directly descriptive than word counts.                |
| Informative-prior log-odds, with a bootstrap check (chosen) | A standard method in political text analysis, with the dependence problem measured rather than ignored. |

## Why

The informative prior makes the ranking sensible for small groups, and the method is well known in political science, so readers can look it up. The z-score's flaw is known too; the bootstrap turns it from a footnote into a visible check next to every list.

## What happened

- In the default comparison (2016 cycle against 2024), 21 of the 30 words leaning 2016 and 19 of the 30 leaning 2024 stay in their top 30 in at least 90% of resamples.
- The check catches the problem it was built for. "county" has the third-largest z-score for 2016 (34.3), but its z ranges from 13.5 to 46.5 across resamples and 30% of its 2016 uses come from a single document. Comparing Bernie Sanders with everyone else, "activist" (z = 19.5) stays in the top 30 in only 54% of resamples and 44% of its uses come from one document.
- Weak point: with 16,877 indexed words, about 840 would cross |z| = 1.96 by chance alone. The page now says so next to the count; the lists are rankings, not a set of findings.
- Weak point: the Poisson intervals on the timeline assume the same independence and are too narrow when one document repeats a term. The bootstrap check has not been extended to the timeline yet.
- Weak point: 200 resamples give each kept share a Monte Carlo error of about ±3.5 percentage points. That is enough to separate 50% from 95%, not 90% from 93%.

## What I'd change

- Use a document-level bootstrap or a negative binomial model for the timeline intervals too, so that they account for overdispersion.
- Let the reader choose the number of resamples, and cache results for popular comparisons at build time.
- Report how often each top word's direction flips across resamples, alongside the kept share.
