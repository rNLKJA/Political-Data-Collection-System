/**
 * The coding sheet for a blind relabel of the gold set (DR-007).
 *
 * It holds the excerpt ids and texts only, in id order, with empty columns for
 * the coder's topic and note. No gold label, keyword label, coder's note,
 * speaker, date or link is included, so a coder labels from the codebook and
 * the excerpt alone. Score finished sheets with `scripts/score_relabel.py`.
 */
import { toCsv } from "@/lib/csv";

import { EVAL_ITEMS } from "./data";

export const BLIND_SHEET_COLUMNS = ["id", "excerpt", "topic", "note"] as const;

export type BlindSheetRow = Record<(typeof BLIND_SHEET_COLUMNS)[number], string>;

export function blindRelabelRows(
  items: ReadonlyArray<{ id: string; excerpt: string }> = EVAL_ITEMS,
): BlindSheetRow[] {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => ({ id: i.id, excerpt: i.excerpt, topic: "", note: "" }));
}

export function blindRelabelCsv(
  items: ReadonlyArray<{ id: string; excerpt: string }> = EVAL_ITEMS,
): string {
  return toCsv(blindRelabelRows(items), BLIND_SHEET_COLUMNS);
}
