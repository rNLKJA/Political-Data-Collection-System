# DR-008: Fewer readability intervals, and speaker-matched twin transcripts

**Decision:** Give a document cell on /readability an interval only when its documents come from at least ten speakers, and compare a speaker across two transcripts of the same event only when both transcripts give that speaker within 2% of the same number of words. This amends DR-006, whose document cells needed only five speakers.

| Status   | Decided         | Recorded        | Owner                   |
| -------- | --------------- | --------------- | ----------------------- |
| Accepted | 10 October 2026 | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

DR-006 moved the readability intervals to a cluster bootstrap over speakers, with an interval for any cell of at least five documents from at least five speakers. Its own "What happened" flagged the weak point: with 6 speakers, the 2024 addresses cell (9 documents) came out at 5.71 to 7.25, narrower than the 5.58 to 7.89 from resampling documents as if they were independent. A cluster bootstrap with that few clusters under-covers, so the interval looked more certain than the data allow. The methods page also said the intervals rest on "9 to 24 clusters", while two cells rested on 6 and 8 speakers.

Separately, the "two transcripts" comparison paired two transcripts of the same event when their total word counts were within 2%, then compared every candidate in both. For John McCain on 10 January 2000 the two transcripts give 1,930 and 2,157 words (26 and 32 turns), about 11% apart. They attribute different turns to him, so his grade difference mixed who said what with how it was punctuated, while the page said "same words".

## Decision

- **Ten speakers for a document interval.** `MIN_CLUSTERS_FOR_INTERVAL` in `web/src/lib/readability-stats.ts` is 10, and `scripts/stats_reference.py` uses the same threshold. A cell below it shows its mean and the number of documents and speakers, with no interval. The debate trends are unchanged: they resample 9 and 14 election cycles, and the page already says that this is approximate.
- **Speaker-matched transcripts.** A speaker is compared across two transcripts only when their word counts agree within 2% of the larger count (`sameWords`). Speakers who fail the check are listed under the table with both word counts and the reason, not dropped silently.
- **Text from the data.** The methods page now computes the range of clusters behind the intervals shown, and the twin-transcript text counts the speakers it compares.

## Options considered

| Option                                                          | Why not                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Keep five speakers and correct the methods text to "6 to 24"    | Accurate text, but it keeps showing an interval that is known to be too narrow.                               |
| A cluster-robust t interval with G − 1 degrees of freedom       | Better small-sample behaviour, but a second method for two cells, with nothing yet to check it against.       |
| Show both the cluster and the document interval for small cells | Two intervals for one number invite readers to pick the narrower one.                                         |
| Ten speakers, point estimate below it (chosen)                  | Simple to state, consistent with the rest of the page, and it shows no interval rather than a misleading one. |

For the transcripts, keeping McCain with a footnote was also considered. It was not chosen because his row fed the average shown in the summary tile.

## Why

An interval that is too narrow is worse than no interval: it invites a reader to treat a difference as real. Ten clusters is a common rule of thumb for when a cluster bootstrap starts to behave, and every remaining document cell has 10 to 24 speakers. The twin-transcript comparison is meant to hold the speech fixed and vary only the punctuation, so a speaker whose words differ between the transcripts does not belong in it.

## What happened

- Two cells lose their interval: 2016 addresses (16 documents from 8 speakers, previously 8.52 to 11.47) and 2024 addresses (9 documents from 6 speakers, previously 5.71 to 7.25). The other seven cells are unchanged, and regenerating the Python reference changed only those two cells.
- The intervals shown now rest on 9 to 24 clusters: 9 and 14 election cycles for the trends, and 10 to 24 speakers for the document cells.
- The twin-transcript table now compares 7 speakers instead of 8. The largest difference is unchanged at 1.43 grade levels (Al Gore, 17 January 2000), and the mean absolute difference moves from 0.50 to 0.56. McCain is listed under the table as left out.
- Weak point: the 2016 and 2024 addresses now carry no uncertainty at all, so the page compares their means to the other cells only by eye.
- Weak point: ten speakers is a rule of thumb, not a coverage guarantee, and the 2024 written cell sits exactly on it.

## What I'd change

- Run a small simulation from the real cluster structure to check the coverage of the cluster bootstrap at 10 to 14 clusters, and adjust the threshold if it falls well short of 95%.
- Add the wild cluster bootstrap that DR-006 suggests for the trends, and use it for small document cells too.
- Code which transcripts were made by which source, so the transcription effect can be modelled rather than shown by two events.
