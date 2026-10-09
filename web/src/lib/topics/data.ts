/**
 * The topic-label evaluation set: 120 one-sentence excerpts drawn by
 * `scripts/build_topic_eval.py` (seeded, 40 per election cycle) and their gold
 * labels (`src/data/topic-gold.json`, assigned item by item against the
 * codebook; `provenance` records how they were made and by whom, see DR-007).
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

/**
 * How the gold labels were made (DR-007):
 * - "ai-draft": drafted by the AI coding assistant; no person has labelled them.
 * - "edited-ai-draft": a person reviewed the AI draft and changed some labels.
 *   Reviewing a draft anchors the reviewer, so the labels still lean towards it.
 * - "blind-relabel": people labelled the excerpts from the codebook without
 *   seeing the AI draft, the keyword dictionary or each other's labels.
 */
export type GoldMethod = "ai-draft" | "edited-ai-draft" | "blind-relabel";

export interface GoldProvenance {
  method: GoldMethod;
  /** everyone who labelled the set, the AI draft included when it is the gold */
  coders: number;
  humanCoders: number;
  /** whether every coder labelled without having seen the keyword dictionary */
  blindToKeywordRules: boolean;
  /** Cohen's kappa between two human coders, before disagreements were resolved */
  intercoderKappa: number | null;
  /** Cohen's kappa between the final gold labels and the AI draft */
  kappaVsAiDraft: number | null;
}

const GOLD_METHODS: readonly GoldMethod[] = ["ai-draft", "edited-ai-draft", "blind-relabel"];

function readProvenance(p: typeof gold.provenance): GoldProvenance {
  const method = p.method as GoldMethod;
  if (!GOLD_METHODS.includes(method)) throw new Error(`topic-gold.json: unknown method ${method}`);
  return {
    method,
    coders: p.coders,
    humanCoders: p.human_coders,
    blindToKeywordRules: p.blind_to_keyword_rules,
    intercoderKappa: p.intercoder_kappa,
    kappaVsAiDraft: p.kappa_vs_ai_draft,
  };
}

export const GOLD_META = {
  version: gold.version,
  provenance: readProvenance(gold.provenance),
  annotator: gold.annotator,
  labelledOn: gold.labelled_on,
} as const;

/** Whether scores against these gold labels should be read as provisional. */
export function goldIsProvisional(p: GoldProvenance): boolean {
  return p.method !== "blind-relabel" || p.humanCoders < 2;
}

/**
 * The provenance note shown above every score, worded from the recorded
 * fields so it is always true of the labels in use: there is no flag that
 * hides it.
 */
export function goldProvenanceNote(p: GoldProvenance): { title: string; text: string } {
  const k = (v: number | null) => (v === null ? null : v.toFixed(2));
  if (p.method === "ai-draft") {
    return {
      title: "The gold labels are an AI draft",
      text: "The gold labels were drafted by the AI coding assistant (Claude) that built the 2026 upgrade, as a single annotator, and no person has labelled them. Treat every score as provisional. Because the draft came from the same model family as the default labeller, agreement with Claude models may be flattered. The same assistant also wrote the keyword dictionary shortly before, so the gold labels are not independent of the baseline either, which could move its scores in either direction. The labels will be replaced by a blind relabel by people who have not seen the draft, not by a review of this draft.",
    };
  }
  if (p.method === "edited-ai-draft") {
    const agree = k(p.kappaVsAiDraft);
    return {
      title: "The gold labels are an edited AI draft",
      text: `${p.humanCoders === 1 ? "A person" : `${p.humanCoders} people`} reviewed the draft by the AI coding assistant and changed some labels${agree ? ` (kappa ${agree} against the original draft)` : ""}. Reviewing a draft anchors the reviewer, so the labels still lean towards the assistant's, which may flatter Claude models and, because the same assistant wrote the keyword dictionary, the baseline too. Treat every score as provisional.`,
    };
  }
  const inter = k(p.intercoderKappa);
  const draft = k(p.kappaVsAiDraft);
  const who =
    p.humanCoders === 1
      ? "One person labelled the excerpts"
      : `${p.humanCoders} people labelled the excerpts independently`;
  return {
    title:
      p.humanCoders >= 2
        ? "The gold labels come from a blind relabel"
        : "The gold labels come from a single blind coder",
    text: `${who} from the codebook, without seeing the AI draft${p.blindToKeywordRules ? " or the keyword dictionary" : ""}${p.humanCoders >= 2 ? ", and disagreements were then resolved" : ""}.${inter ? ` Agreement between coders before resolution: kappa ${inter}.` : ""}${draft ? ` Agreement with the earlier AI draft: kappa ${draft}.` : ""}${p.humanCoders < 2 ? " With one coder there is no measure of how far coders disagree, so treat the scores as provisional." : ""}${p.blindToKeywordRules ? "" : " At least one coder had seen the keyword dictionary, so the gold labels may lean towards it."}`,
  };
}

/** A short label for the method, for tables and metadata. */
export const GOLD_METHOD_LABEL: Record<GoldMethod, string> = {
  "ai-draft": "AI draft, not labelled by a person",
  "edited-ai-draft": "AI draft edited by a person",
  "blind-relabel": "blind relabel by people",
};

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
