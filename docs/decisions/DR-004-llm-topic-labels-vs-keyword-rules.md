# DR-004: LLM topic labels only as a bring-your-own-key evaluation against keyword rules

**Decision:** Offer language-model topic labels only inside an evaluation: the model labels the same fixed gold set as a frozen keyword dictionary, both are scored with agreement and Cohen's kappa with intervals, calls go straight from the visitor's browser with their own key, only short excerpts are sent, every call is logged in the browser, and a simulated run shows the harness without a key.

| Status   | Decided         | Recorded        | Owner                   |
| -------- | --------------- | --------------- | ----------------------- |
| Accepted | 10 October 2026 | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

Coding text into policy topics is a classic task in political science, traditionally done by trained human coders with a codebook such as the Comparative Agendas Project's. Language models are now used for it, often without a check against human labels. I wanted the site to show the check rather than the claim. There is no budget for model calls, the site must work fully without any AI, and visitors should not have to trust this site with an API key.

## Decision

- **Codebook.** 21 policy topics modelled on the CAP major topics, plus "no policy topic", with five written coding rules (one label per excerpt, the main subject, the first-mentioned subject on a tie, code the subject not the stance, use only the excerpt). Two adaptations from CAP: jobs and employment sit under Labour, and "no policy topic" covers events, thanks, endorsements, polls and attacks without a policy subject. It is described as CAP-style, never as the CAP codebook.
- **Baseline.** A keyword dictionary per topic (keywords-v1), written from the codebook descriptions before any gold-set excerpt was drawn, then frozen. The rule: most matches wins, ties go to the earliest match, no match is "none".
- **Gold set.** 120 single sentences (12 to 25 words), 40 per cycle, drawn by `scripts/build_topic_eval.py` with seed 20261010 and the site's quotation rules. Gold labels in `web/src/data/topic-gold.json`, marked with who labelled them and a status.
- **Model run.** The visitor picks a sample size (20, 40, 60 or all 120) and a seed. Excerpts go in batches of ten with an opaque id; the prompt holds the codebook and rules; the answer must be JSON in a fixed schema, checked with zod. Default model Claude Haiku 4.5 at temperature 0; Claude Sonnet 5.5 (low effort) and any OpenAI model are options. No server-side model fallback, so every answer is from the model the visitor chose; an excerpt left unlabelled counts as "no answer".
- **Scoring.** On the same excerpts: agreement with gold (Wilson 95% interval), Cohen's kappa (percentile bootstrap over excerpts, 10,000 resamples, seed shown), agreement on policy excerpts only, and a paired comparison: the difference in agreement and in kappa (paired bootstrap) and McNemar's exact test. Corrections a visitor makes are logged as edits and never change the scores.
- **Governance.** The key is kept in sessionStorage (or localStorage if the visitor opts in), never sent to this site, never logged. Every call, failure and simulated run goes to an IndexedDB audit log with prompt, output, latency, tokens and the human decision, viewable at `/ai-log` and exportable. Every output is labelled AI-generated; simulated output is labelled as simulated. The design is informed by the Australian Government's policy for the responsible use of AI in government, the EU AI Act's transparency principles and the NIST AI Risk Management Framework; it does not claim compliance with any of them.

## Options considered

| Option                                               | Why not                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Label the whole archive with an LLM and chart topics | No budget, no way to check the labels, and topic charts by candidate invite partisan readings.        |
| A server route with the site's own key               | Costs money per visitor and invites abuse of a public endpoint.                                       |
| Commit a reference LLM run                           | No budget to make one honestly; a single run also hides run-to-run variation.                         |
| Compare against the existing 44-topic vocabulary     | Gold excerpts drawn from keyword hits would favour the keywords; the sample here is keyword-blind.    |
| BYOK evaluation against frozen rules (chosen)        | No cost to the site, no key on the server, and anyone can repeat the comparison with their own model. |

## Why

An evaluation with a transparent baseline and honest intervals is more useful than an impressive-looking feature. Keyword rules are what a careful analyst would try first, and they are easy to audit, so they are the right thing to beat.

## What happened

- The keyword rules agree with the gold labels on 91 of 120 excerpts: 75.8% (95% CI 67.4% to 82.6%), Cohen's kappa 0.59 (0.45 to 0.71). On the 50 excerpts with a policy topic they agree on 54% (40% to 67%).
- 58% of the gold labels are "no policy topic", which is what campaign documents are like, and which flatters raw agreement: the rules say "none" for 69% of excerpts. Kappa and the policy-only score are shown for that reason.
- No LLM numbers ship with the site. The harness computes them in the visitor's browser when they run it.
- Weak point, and the most important one: the gold labels are a single-annotator first draft, prepared by the AI coding assistant that built this upgrade and not yet reviewed by a person. Until they are, every score is provisional, and agreement with Claude models may be flattered because the draft came from the same model family. The page says so above the scores.
- Weak point: most topics have between one and eight gold excerpts, so per-topic precision and recall describe this set and nothing more, and a 40-excerpt run gives agreement intervals about 30 points wide.

## What I'd change

- Have two people label the gold set independently from the codebook, report their agreement (Krippendorff's alpha) and resolve disagreements before treating any score as a result.
- Grow the set and stratify it by topic so that every topic has at least ten excerpts.
- With a small budget, commit dated reference runs for each default model, repeated to show run-to-run variation, and test how much the labels move when the prompt wording changes.
