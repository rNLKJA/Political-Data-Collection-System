/**
 * The per-excerpt export of a topic-label run (CSV and JSON on /topics).
 *
 * Every row says who produced its label, so a file that leaves the page still
 * shows whether the labels are AI-generated or simulated, which model was
 * asked, which run they came from and the sample seed.
 */
import { NO_ANSWER, type AiLabel } from "./topic-labels";

export const RUN_CSV_COLUMNS = [
  "run_id",
  "labeller",
  "ai_generated",
  "provider",
  "model",
  "served_model",
  "sample_seed",
  "id",
  "excerpt",
  "source",
  "gold",
  "rules",
  "scored",
  "model_label",
  "human_correction",
  "model_matches_gold",
  "rules_match_gold",
] as const;

export type RunCsvColumn = (typeof RUN_CSV_COLUMNS)[number];
export type RunExportRow = Record<RunCsvColumn, string | number | boolean | null>;

export interface RunExportInput {
  runId: string;
  simulated: boolean;
  provider: string;
  model: string;
  servedModel: string | null;
  seed: number;
  items: ReadonlyArray<{ id: string; excerpt: string; url: string; gold: string; rules: string }>;
  scoredIds: ReadonlySet<string>;
  labels: Readonly<Record<string, AiLabel>>;
  edits: Readonly<Record<string, string>>;
}

/** Who produced the labels, in words that survive outside the page. */
export function runLabeller(simulated: boolean, provider: string, model: string): string {
  return simulated ? "simulated (no model called)" : `AI-generated: ${provider}/${model}`;
}

export function runExportRows(run: RunExportInput): RunExportRow[] {
  const labeller = runLabeller(run.simulated, run.provider, run.model);
  return run.items.map((i) => {
    const scored = run.scoredIds.has(i.id);
    const modelLabel = scored ? (run.labels[i.id] ?? NO_ANSWER) : "";
    return {
      run_id: run.runId,
      labeller,
      ai_generated: !run.simulated,
      provider: run.provider,
      model: run.model,
      served_model: run.servedModel,
      sample_seed: run.seed,
      id: i.id,
      excerpt: i.excerpt,
      source: i.url,
      gold: i.gold,
      rules: i.rules,
      scored,
      model_label: modelLabel,
      human_correction: run.edits[i.id] ?? "",
      model_matches_gold: scored ? modelLabel === i.gold : "",
      rules_match_gold: i.rules === i.gold,
    };
  });
}

/** "topic-labels-simulated-<stamp>.csv" for the no-key demo, "topic-labels-<stamp>.csv" otherwise. */
export function runFileName(simulated: boolean, stamp: string, ext: "csv" | "json"): string {
  return `topic-labels-${simulated ? "simulated-" : ""}${stamp}.${ext}`;
}
