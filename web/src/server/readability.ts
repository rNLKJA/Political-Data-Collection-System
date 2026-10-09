import "server-only";

import { CYCLES } from "@/lib/corpus-types";
import {
  debateMeansByCycle,
  debateTrend,
  gradeByCycleAndRegister,
  withinSpeakerGap,
  type DebateRow,
  type DocRow,
} from "@/lib/readability-stats";
import { all } from "@/server/db";

/** Graded documents (100 words or more of own-voice text), in id order. */
export function gradedDocuments(): DocRow[] {
  return all<DocRow>(
    `SELECT d.id, d.speaker_id AS speakerId, s.name AS speaker, d.cycle, d.doc_type AS docType,
            d.tokens, d.sentences, d.syllables, d.fk_grade AS fkGrade
       FROM documents d JOIN speakers s ON s.id = d.speaker_id
      WHERE d.fk_grade IS NOT NULL
      ORDER BY d.id`,
  );
}

export function debateGrades(): DebateRow[] {
  return all<DebateRow>(
    `SELECT id, date, year, cycle, kind, label_style AS labelStyle, fk_candidates AS fkCandidates
       FROM debates WHERE fk_candidates IS NOT NULL ORDER BY date, id`,
  );
}

export const TREND_YEARS = Array.from({ length: (2024 - 1960) / 4 + 1 }, (_, i) => 1960 + i * 4);

let cache: ReturnType<typeof compute> | undefined;

function compute() {
  const docs = gradedDocuments();
  const debates = debateGrades();
  const general = debates.filter((d) => d.kind !== "primary");
  const primary = debates.filter((d) => d.kind === "primary");
  return {
    docs: { n: docs.length, cells: gradeByCycleAndRegister(docs, CYCLES) },
    gap: withinSpeakerGap(docs),
    debates,
    general: { trend: debateTrend(general, TREND_YEARS), byCycle: debateMeansByCycle(general) },
    primary: { trend: debateTrend(primary, TREND_YEARS), byCycle: debateMeansByCycle(primary) },
    byStyle: (["colon", "period", "tag"] as const).map((style) => ({
      style,
      general: general.filter((d) => d.labelStyle === style),
    })),
  };
}

/** Everything /readability shows (deterministic; computed once per process). */
export function readabilitySummary() {
  cache ??= compute();
  return cache;
}
