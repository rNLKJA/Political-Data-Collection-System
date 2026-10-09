# Model card: policy-topic labellers

The topic-label evaluation on `/topics` compares two labellers that assign one policy topic to a one-sentence excerpt of a US campaign document. This card describes both, how they are evaluated and where they fail. The decision behind the design is [DR-004](decisions/DR-004-llm-topic-labels-vs-keyword-rules.md).

## Model details

| Labeller           | What it is                                                                                                                                                                                                                                         | Version                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Keyword rules      | A fixed dictionary of words and phrases per topic (written from the codebook by the AI coding assistant, before the gold set was drawn) and one counting rule: most matches wins, a tie goes to the earliest match, no match is "no policy topic". | keywords-v1, frozen 10 Oct 2026 |
| LLM (your own key) | A general-purpose language model given the codebook, the coding rules and up to ten excerpts per request, answering in a fixed JSON schema. Default Claude Haiku 4.5.                                                                              | prompt topic-labels-v1          |

Both use the same codebook: 21 policy topics modelled on the major topics of the Comparative Agendas Project (CAP), adapted for single campaign sentences, plus "no policy topic". It is not the official CAP master codebook. Source: `web/src/lib/topics/codebook.ts`, `keyword-rules.ts` and `web/src/lib/ai/topic-labels.ts`.

The LLM options are Claude Haiku 4.5 (`claude-haiku-4-5`, temperature 0, the default), Claude Sonnet 5.5 (`claude-sonnet-5-5`, low effort) and any OpenAI Chat Completions model that supports JSON-schema output (default `gpt-5-mini`, editable). The visitor's provider runs and bills the model; this project has no control over model versions and records the model id the provider reports for every call.

## Intended use

- To show, on a small fixed set, how a language model's topic labels compare with a transparent baseline and with gold labels, with honest uncertainty.
- As a teaching example of evaluation design: a frozen baseline, a paired comparison on the same items, chance-corrected agreement and intervals.

Not intended for: labelling the archive at scale, comparing candidates or parties by topic, profiling any person, moderating content, or any decision about people. The page never aggregates labels by speaker or party.

## Data

- **Keyword rules:** no training data. The dictionary was written from the codebook descriptions before the gold set was drawn and has not been tuned on it.
- **LLMs:** pretrained by their providers on data this project does not know. The excerpts come from public pages and may be in their training data.
- **Evaluation set:** 120 single sentences of 12 to 25 words, 40 per election cycle (2016, 2020, 2024), drawn by `scripts/build_topic_eval.py` (seed 20261010) from the campaign documents the 2025 scraper collected from The American Presidency Project. One sentence per sampled document, taken from the document's own text after the site's quotation rules (no other candidate named, no charged words). Documents were sampled uniformly, so most excerpts come from press releases, and some of those are press round-ups that quote journalists or officials. 35 of the 120 excerpts name the candidate whose campaign issued the document.
- **Gold labels:** `web/src/data/topic-gold.json`. Provenance (recorded as fields, see [DR-007](decisions/DR-007-blind-relabel-for-the-gold-set.md)): an AI draft, one coder, no human coders. One annotator assigned each label against the written codebook and rules before either labeller was run on the set; this first pass was prepared by the AI coding assistant that built the October 2026 upgrade, and no person has labelled the set yet. The same assistant wrote the keyword dictionary shortly before, with the dictionary in view, so the gold labels are not independent of the baseline either (see [DR-005](decisions/DR-005-score-only-answered-excerpts.md)). Fourteen hard calls carry a written note.

## Evaluation

Scored against the gold labels, on the same excerpts for both labellers. Intervals are 95%: Wilson for shares, percentile bootstrap over excerpts for kappa (10,000 resamples, seed 20261010).

| Labeller      | Excerpts                         | Agreement with gold                 | Cohen's kappa       | Agreement on the 50 policy excerpts |
| ------------- | -------------------------------- | ----------------------------------- | ------------------- | ----------------------------------- |
| Keyword rules | 120                              | 75.8% (67.4% to 82.6%)              | 0.59 (0.45 to 0.71) | 54% (40% to 67%)                    |
| LLM           | 20 to 120, chosen by the visitor | computed in the browser at run time | same                | same                                |

No LLM results are published: the project has no budget for model calls, so each visitor's run is their own and appears only in their browser and their exports. The paired comparison reports the difference in agreement and in kappa (paired bootstrap) and McNemar's exact test.

Only excerpts the model answered for are scored. If a request fails (a rejected key, billing, the network, rate limits after retries, a server or request error) or the visitor presses Stop, the model never saw those excerpts: they are left out for both labellers, so the comparison stays paired, and the run is marked incomplete with no verdict ([DR-005](decisions/DR-005-score-only-answered-excerpts.md)).

Gold labels are 58% "no policy topic", and the rules answer "none" for 69% of excerpts, so raw agreement flatters any labeller that says "none" often. Read kappa and the policy-only figure alongside it.

## Known failure modes

**Keyword rules**

- Blind to sense and context: "Our grassroots army across the state of Florida" is labelled Defence (from "army"); a line about a candidate's campaign travel to Puerto Rico is labelled Public lands (from "Puerto Rico"); "the United Nations" in a biography line is labelled International affairs.
- Blind to policy talk without dictionary words: "a staunch defender of life" (abortion), "white supremacy", a new COVID-19 "testing strategy" and "Osama Bin Laden" all get "none".
- Tie-breaking by first mention can pick the wrong topic: in "she created thousands of jobs and turned the Palmetto State into an economic powerhouse", "jobs" comes first, so the rules say Labour where the gold label is Macroeconomics.

**LLMs**

- May recognise the speaker or event from training data, or from a name in the excerpt, and label from that rather than from what the excerpt says.
- May label the stance or the speaker's party ("this is a Republican talking point") instead of the subject, against the rules.
- Labels can change between runs, models and prompt wordings; a single run says nothing about that variation.
- May skip an excerpt, refuse, be cut off or return malformed JSON; such excerpts count as "no answer" and are scored as wrong. Requests that fail for reasons outside the model (key, network, rate limit, server error) or are stopped are excluded instead.
- Excerpts are short and stripped of context, which is hard for any coder, human or model.

## Ethical considerations

- The texts are political speech about real people. The site does not use topic labels to compare candidates or parties. The speaker, date, title and link are not sent as metadata, but 35 of the 120 excerpts name the candidate in the text, and some name journalists or officials, so the model can often tell whose campaign wrote them.
- Only the excerpts (25 words or fewer, with an opaque id), the codebook and the rules are sent to the provider the visitor chose. The visitor's key goes only to that provider.
- Every output is labelled AI-generated (or simulated), every call is logged with the human decision, and corrections never alter the evaluation.
- The design is informed by the Australian Government's policy for the responsible use of AI in government, the EU AI Act's transparency principles and the NIST AI Risk Management Framework. It does not claim compliance with any of them.

## Caveats and recommendations

- Treat all scores as provisional until two people have relabelled the set blind, from the codebook and without seeing the AI draft or the keyword dictionary, with their agreement reported ([DR-007](decisions/DR-007-blind-relabel-for-the-gold-set.md)). Only a blind relabel removes both known biases: possible favour towards Claude models, and dependence on the keyword dictionary. Reviewing the AI draft in place would not, because the draft anchors the reviewer.
- Per-topic figures rest on zero to eight excerpts per topic and should not be generalised. Transportation, social welfare and culture have no excerpt in this set, so the evaluation says nothing about them.
- A run of 40 excerpts gives agreement intervals about 30 percentage points wide; use all 120 for a comparison that can separate the labellers at all.
