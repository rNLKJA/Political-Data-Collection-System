/**
 * The topic-label evaluation set: 120 one-sentence excerpts drawn by
 * `scripts/build_topic_eval.py` (seeded, 40 per election cycle) and their gold
 * labels (`src/data/topic-gold.json`, hand-assigned against the codebook).
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
