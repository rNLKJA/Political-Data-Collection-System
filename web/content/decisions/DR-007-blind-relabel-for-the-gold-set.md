# DR-007: Record how the gold set was made, and finish it with a blind relabel

**Decision:** Record how the topic gold labels were made as fields (method, coders, human coders, whether the coders were blind to the keyword dictionary, agreement between coders and agreement with the AI draft), word the provenance note on /topics and /methods from those fields and always show it, and replace the AI-drafted labels with a blind relabel by people, never with a review of the draft in place. This amends the gold-set entry of DR-004, which marked the labels with a single status.

| Status   | Decided         | Recorded        | Owner                   |
| -------- | --------------- | --------------- | ----------------------- |
| Accepted | 10 October 2026 | 10 October 2026 | Sunchuangyu (Rin) Huang |

## Context

DR-004 kept the gold labels in `web/src/data/topic-gold.json` with a `status` of "draft" or "reviewed". The labels are a single-annotator draft made by the AI coding assistant that built the upgrade, which had written the keyword dictionary shortly before. Every published baseline figure (75.8% agreement, kappa 0.59, 54% on policy excerpts) is scored against that draft.

Review before release found two problems with the planned way to finish the set. First, the plan was for a person to review the draft and set the status to "reviewed". Reviewing a draft anchors the reviewer on it (automation bias), so a reviewed draft would keep most of the bias towards Claude models and towards the dictionary that the review was meant to remove. Second, the provenance callout on /topics was shown only while the status was "draft", and /methods would then have read "Gold labels: reviewed; until reviewed, every score is provisional". One field could hide a disclosure that was still true.

## Decision

- **Provenance as fields.** `topic-gold.json` replaces `status` with `provenance`: `method` ("ai-draft", "edited-ai-draft" or "blind-relabel"), `coders`, `human_coders`, `blind_to_keyword_rules`, `intercoder_kappa` and `kappa_vs_ai_draft`. The current set is recorded as it is: an AI draft, one coder, no human coders.
- **A note that is always shown.** /topics and /methods always show a provenance note, worded from those fields by one function (`goldProvenanceNote` in `web/src/lib/topics/data.ts`). Scores are called provisional unless the method is a blind relabel by at least two people. An edited draft is described as an edited draft, with the anchoring risk stated.
- **How the set is finished.** Two people, at least one of whom has not seen `keyword-rules.ts`, each download the coding sheet from `/topics/blind-relabel.csv`. It holds the 120 ids and excerpts only, with empty topic and note columns: no gold label, keyword label, source link or coder's note. They label from the codebook and the five coding rules (the system prompt shown on /topics, or `codebook.ts`) without seeing the draft or each other's sheets.
- **How the relabel is scored.** `uv run scripts/score_relabel.py coder-a.csv coder-b.csv` reports, for the two coders and for each coder against the AI draft, the agreement with a Wilson interval, Cohen's kappa with a percentile bootstrap interval and Krippendorff's alpha. The coders then resolve their disagreements against the codebook, and the result is committed as gold version 2 with the provenance fields filled in. A new record reports the outcome, and the model card is updated (`pnpm sync:docs`). The AI draft stays in the history and is used only as a comparison.

## Options considered

| Option                                                      | Why not                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Review the draft in place and set the status to "reviewed"  | Anchors the reviewer on the draft, keeps the bias towards Claude models and the dictionary, and one field hides the disclosure. |
| Keep the draft and only disclose it                         | Honest, but every score stays provisional for good, and nothing measures how far coders disagree.                               |
| One person relabels blind                                   | Removes the anchoring but gives no measure of agreement between coders, so the gold labels' own error stays unknown.            |
| Two blind coders, provenance as fields, note shown (chosen) | Removes the anchoring, measures coder agreement, and keeps the disclosure true whatever state the labels are in.                |

## Why

A gold set is only as good as its independence from the things it scores. Labels made without the draft or the dictionary in view are the only way to remove both known biases, and two coders are the minimum that shows how hard the task is for people. Wording the note from recorded fields means the page can only say what the file says, and there is no state in which it says nothing.

## What happened

- The gold labels themselves are unchanged in this record: still the AI draft (method "ai-draft", one coder, no human coders). The keyword baseline is still 75.8% agreement (95% CI 67.4% to 82.6%) and kappa 0.59 (0.45 to 0.71) against it.
- The relabel has not been done. It needs people, and it is mine to organise. Until then, every score on /topics stays provisional and the page says why.
- Unit tests cover the note for each method, and check that the coding sheet carries no gold label, keyword label, source link or coder's note.
- Weak point: the coding sheet lists the excerpts in id order, which groups them by election cycle, so a coder's drift over the session lines up with the cycles.
- Weak point: the codebook a coder needs sits on the same page as the gold labels and the dictionary. A coder has to be told to read only the coding sheet and the codebook.

## What I'd change

- Give each coder the sheet in a different seeded random order, with the seed recorded.
- Mask candidate names in the coding sheet, as DR-005 suggests for the prompt, so coders and models see the same text.
- Grow the set and stratify it by topic, as DR-004 suggests, before relabelling, so the work is done once.
