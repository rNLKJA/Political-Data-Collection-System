/**
 * The topic-label evaluation set: 120 one-sentence excerpts drawn by
 * `scripts/build_topic_eval.py` (seeded, 40 per election cycle) and their gold
 * labels (`src/data/topic-gold.json`, assigned item by item against the
 * codebook; `status` says whether a person has reviewed them yet).
 */
import gold from "@/data/topic-gold.json";
import items from "@/data/topic-eval-items.json";

import { isTopicId, type TopicId } from "./codebook";

export interface EvalItem {
  id: string;
  excerpt: string;
  words: number;
  gold: TopicId;
  /** the coder's note on a hard call, if any */
  note?: string;
  docId: number;
  url: string;
  date: string;
  cycle: number;
  speaker: string;
  docType: string;
}

export const GOLD_META = {
  version: gold.version,
  status: gold.status as "draft" | "reviewed",
  annotator: gold.annotator,
  labelledOn: gold.labelled_on,
} as const;

export const SAMPLE_META = {
  seed: items.seed,
  perCycle: items.per_cycle,
  words: items.words as [number, number],
  sourceSha256: items.source_sha256,
  eligibleDocuments: items.eligible_documents as Record<string, number>,
} as const;

const labels = gold.labels as Record<string, string>;
const notes = gold.notes as Record<string, string>;

export const EVAL_ITEMS: readonly EvalItem[] = items.items.map((it) => {
  const g = labels[it.id];
  if (!isTopicId(g)) throw new Error(`${it.id}: gold label "${g}" is not in the codebook`);
  return {
    id: it.id,
    excerpt: it.excerpt,
    words: it.words,
    gold: g,
    note: notes[it.id],
    docId: it.doc_id,
    url: it.url,
    date: it.date,
    cycle: it.cycle,
    speaker: it.speaker,
    docType: it.doc_type,
  };
});

/** The names a speaker is usually called by: surname, then first name ("Joseph R. Biden, Jr." -> Biden, Joseph). */
export function speakerNames(speaker: string): { surname: string; first: string } {
  const parts = speaker
    .replace(/\(.*?\)/g, "")
    .replace(/,?\s+(Jr|Sr)\.?\s*$/i, "")
    .trim()
    .split(/\s+/);
  return { surname: parts[parts.length - 1], first: parts[0] };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether an excerpt names the candidate whose campaign issued it: the
 * surname in any case, or the first name as written ("Hillary", "Beto").
 * The speaker is never sent to the model as metadata, but a named candidate
 * is in the text itself.
 */
export function namesSpeaker(excerpt: string, speaker: string): boolean {
  const { surname, first } = speakerNames(speaker);
  const word = (w: string, flags: string) =>
    new RegExp(`(^|[^\\p{L}])${escapeRegExp(w)}($|[^\\p{L}])`, flags).test(excerpt);
  return word(surname, "iu") || word(first, "u");
}

/** Excerpts in the evaluation set that name their own candidate. */
export const EXCERPTS_NAMING_CANDIDATE = EVAL_ITEMS.filter((i) =>
  namesSpeaker(i.excerpt, i.speaker),
).length;
