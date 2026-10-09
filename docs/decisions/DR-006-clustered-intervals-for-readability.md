# DR-006: Clustered intervals for readability, and two corrections to DR-003

**Decision:** Readability intervals resample clusters rather than rows: whole speakers (with all their documents) for the mean grade of a cycle and kind of text, and whole election cycles (with all their debates) for the debate trends. The 14-speaker paired gap is reported with a t interval and an exact sign test instead of a percentile bootstrap. Two uncertainty statements in DR-003 are corrected here rather than edited there.

| Status   | Decided         | Recorded        | Owner                   |
| -------- | --------------- | --------------- | ----------------------- |
| Accepted | 10 October 2026 | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

The first version of /readability, built in the October 2026 upgrade, resampled single documents and single debates, and the methods page said the intervals resampled "the unit the claim is about". Review before release showed that this was too generous. Documents cluster by speaker: the 1,395 graded written releases from 2024 come from only 10 speakers, and 54% of them from one. Debates cluster by election cycle: the debates of one cycle share candidates, moderators and a transcription source, which is exactly the effect the page warns about. Treating the rows as independent made the intervals too narrow, in places by a factor of five.

The paired comparison of each speaker's transcribed and written texts did resample speakers, but with 14 speakers a percentile bootstrap tends to run narrow. Separately, DR-003 gave two figures that were not quite right: "about 840" words crossing |z| = 1.96 by chance, a fixed number shown for every comparison, and a Monte Carlo error of "about ±3.5 percentage points" for a kept share.

## Decision

- **Document means.** For each cycle and kind of text, the 95% interval comes from a cluster bootstrap over speakers: each resample draws as many speakers as the cell has, with replacement, takes all their documents and computes the mean grade per document. Cells with fewer than five documents or five speakers get no interval. The number of speakers is shown next to the number of documents.
- **Debate trends.** The per-decade slope and the band for the fitted line come from a cluster bootstrap over election cycles: 49 general-election and vice-presidential debates in 14 cycles, and 130 primary debates in 9 cycles. A single cycle's mean still resamples that cycle's debates, and describes that cycle only.
- **Paired gap.** The mean of the 14 per-speaker gaps, and its sentence-length and word-length parts, get a t interval; the percentile bootstrap over speakers is reported beside it, and an exact sign test checks the direction without assuming normality.
- **Implementation.** `clusterBootstrap` and `clusterBootstrapMean` in `web/src/lib/stats/bootstrap.ts` draw clusters from the same seeded mulberry32 stream as the row bootstrap (10,000 resamples, seed 20261010). Student's t quantile and the sign test live in `web/src/lib/stats`. All are checked against numpy and SciPy values written by `scripts/stats_reference.py`.
- **Corrections to DR-003.** The significance tile on /distinctive now states how many words each comparison actually tests (words used by either group) and 5% of that number, not a fixed 840. The stability panel now calls ±3.5 points what it is: the largest Monte Carlo standard error of a kept share with 200 resamples (a 95% margin is about ±6.9 points).

## Options considered

| Option                                                    | Why not                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Keep row-level intervals and add a caveat                 | The tiles would still show numbers that are several times too precise.                                                               |
| Mixed-effects models with speaker or cycle effects        | More assumptions, harder to explain on the page, and no simple match to a reference implementation.                                  |
| Cluster-robust standard errors for the trend              | A good check, but with 9 to 14 clusters the normal approximation is weak too; the bootstrap is consistent with the rest of the site. |
| Cluster bootstrap, t interval for the paired gap (chosen) | Matches how the data were generated, stays in the site's bootstrap framework and can be checked digit for digit.                     |

## Why

An interval should describe how much the number would move if the data had been collected again. A new collection would bring different speakers and different election cycles, not just different documents from the same campaigns, so the clusters are the units to resample. For a mean of 14 paired differences the t interval is the standard small-sample choice, and it is slightly more conservative than the bootstrap here.

## What happened

- The general-election and VP trend is −0.75 grade levels per decade with a 95% interval of −1.02 to −0.55 (cycles resampled), against −0.94 to −0.58 with debates resampled. The primary trend is −0.45, with −0.89 to −0.17 against −0.65 to −0.26: almost twice as wide. Both still exclude zero.
- For 2024 written releases the interval is 10.00 to 12.92 with speakers resampled, against 10.34 to 10.74 with documents resampled. For 2024 transcribed remarks it is 5.21 to 7.86, against 5.74 to 6.31.
- The paired gap is −5.47 grade levels, t interval −6.89 to −4.05; the percentile bootstrap gave −6.71 to −4.20. All 14 speakers grade lower when transcribed (exact sign test p = 0.0001).
- Weak point: with 9 to 14 cycles, and as few as 6 speakers in some cells, a cluster bootstrap is itself approximate and can still run a little narrow. One cell (2024 addresses, 9 documents from 6 speakers) even comes out slightly narrower than the document bootstrap.
- Weak point: none of these intervals covers the transcription effect, which the page shows separately with the two events held in two transcripts.

## What I'd change

- Add a wild cluster bootstrap or cluster-robust standard errors with a small-sample correction for the trends, and show how much they agree.
- Model the debate trend with transcript source as a covariate, once the sources are coded.
- Apply the same clustering to the timeline's rate intervals, which still treat word tokens as independent.
