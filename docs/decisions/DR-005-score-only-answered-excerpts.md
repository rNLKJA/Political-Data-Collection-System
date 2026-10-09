# DR-005: Score only the excerpts the model answered for

**Decision:** In the topic-label comparison, score an excerpt only when the model answered for it, leave out excerpts whose request failed or was stopped (for both labellers, so the comparison stays paired), mark such a run incomplete with no verdict, and disclose that the gold labels are independent of neither labeller. This amends the scoring rule of DR-004, which counted every unlabelled excerpt as a wrong answer.

| Status   | Decided         | Recorded        | Owner                   |
| -------- | --------------- | --------------- | ----------------------- |
| Accepted | 10 October 2026 | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

DR-004 said that "an excerpt left unlabelled counts as no answer", which never matches a gold label. Review before release showed that this rule did not separate the model declining to answer from the request never reaching the model. A reviewer simulated a labeller that gave every excerpt its gold label, with the network failing after two of four batches. The page reported it as 32.5 points worse than the keyword rules (95% CI −52.5 to −12.5, McNemar p = 0.004). A rejected key on the first request produced 0% agreement, a "significant" verdict and an AI-generated badge on output that did not exist. Accepting that run then wrote "accepted" onto the failed calls in the audit log.

The same review found two disclosures missing. The AI coding assistant that drafted the gold labels had also written the keyword dictionary about ten minutes earlier, with the dictionary in view, so the gold set is not independent of the baseline. And although no speaker metadata is sent to the model, 35 of the 120 excerpts name the candidate whose campaign issued them.

## Decision

- **What is scored.** An excerpt is scorable when its request got an answer from the model. If the model skipped it, refused, was cut off or returned JSON that failed validation, that is the model's behaviour: the excerpt counts as "no answer" and is scored as wrong. If the request failed for any other reason (a rejected key, permission, billing, an unknown model, a rejected request, the network or CORS, a rate limit or overload after retries, a server error) or the visitor pressed Stop, the model never saw the excerpt, and it is excluded.
- **Paired on the same subset.** Both the model and the keyword rules are scored on the scorable excerpts only, so agreement, kappa, the paired differences and McNemar's test all use the same items.
- **Incomplete runs.** The results say "Partial run: results on m of n excerpts", explain the exclusion, and replace the verdict sentence with a notice that no verdict is drawn. The CSV marks each row as scored or not; the JSON export carries `complete`, `excerpts_scored`, `excluded_ids`, `failures` and `stopped`.
- **Nothing answered.** When no request was answered, no results are shown and nothing carries an AI-generated label; the page shows the error and the failed calls stay in the audit log.
- **Audit log.** A human decision (accept, correct, reject) is recorded only on calls that returned a usable answer; failed calls stay "pending" because there is nothing to review. Any text that came back from a model, including unusable raw output, carries the AI-generated label in the log.
- **Disclosure.** /topics, the methods page, the model card and the README now say that the same assistant wrote the dictionary and drafted the gold labels, and that 35 of the 120 excerpts name the candidate in the text.

## Options considered

| Option                                                                 | Why not                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Keep DR-004's rule: every unlabelled excerpt is wrong                  | Penalises the model for the visitor's key or connection and can produce a false "significant" difference. |
| Discard the whole run after any failure                                | Throws away answers the visitor paid for, and still needs a rule for refusals and malformed output.       |
| Retry failed requests automatically until they succeed                 | Spends the visitor's money and time without asking, and still needs a rule for Stop.                      |
| Score answered excerpts only, both labellers, mark incomplete (chosen) | Keeps the comparison paired, puts model behaviour in the score and keeps infrastructure out of it.        |

## Why

The comparison is meant to measure the model's labels, not the visitor's network or key. A refusal or malformed answer is something the model did, so it belongs in the score; a dropped connection is not. Scoring both labellers on the same subset keeps the paired design that the intervals and McNemar's test rely on. A partial run covers only the first batches of the seeded sample, so the page withholds the verdict rather than draw a confident sentence from a subset the visitor did not choose.

## What happened

- Unit tests now cover each case with the provider mocked: a perfect labeller losing the network after two of four batches (20 excerpts scored, all correct, 20 excluded, the failed call left pending), a rejected key on the first call (nothing scored, nothing to review), a rejected request on one batch (that batch excluded, the run continues), Stop (the remaining excerpts excluded) and invalid JSON (scored as "no answer", not reviewable).
- No live model call was made for this record; the behaviour was checked with mocked and intercepted requests.
- Weak point: the gold labels still come from the assistant that wrote the dictionary. That could bias the keyword rules' 75.8% agreement and kappa of 0.59 in either direction, and only a human review of the gold set can say which.
- Weak point: 35 of 120 excerpts name the candidate, so a model can recognise the campaign from the text. The site does not compare candidates, but the labels may still lean on that recognition.

## What I'd change

- Offer to resume an incomplete run by sending only the excluded excerpts, with the cost shown first.
- Mask candidate names in the excerpts (for example "[CANDIDATE]"), in both the gold set and the prompt, and measure whether the labels change.
- Have the gold set relabelled by two people who have not seen the keyword dictionary.
