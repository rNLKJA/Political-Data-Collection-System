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

export interface TwinPair {
  date: string;
  title: string;
  urlA: string;
  urlB: string;
  speaker: string;
  wordsA: number;
  wordsB: number;
  gradeA: number;
  gradeB: number;
}

/**
 * The archive holds two transcripts of a few events: same date, same kind and
 * party, and word totals within 2% of each other (the 2015-16 "undercard"
 * debates share a date with the main debate but are different events). The
 * same candidate's words, punctuated by two different transcribers, show how
 * much the transcript alone moves the grade.
 */
export function twinTranscripts(): TwinPair[] {
  return all<TwinPair>(
    `SELECT da.date, da.title, da.url AS urlA, db.url AS urlB, sa.display AS speaker,
            sa.words AS wordsA, sb.words AS wordsB, sa.fk_grade AS gradeA, sb.fk_grade AS gradeB
       FROM debates da
       JOIN debates db ON db.date = da.date AND db.kind = da.kind AND db.party = da.party
                      AND db.id > da.id
                      AND ABS(db.words - da.words) < 0.02 * MAX(db.words, da.words)
       JOIN debate_speakers sa ON sa.debate_id = da.id AND sa.role = 'candidate'
       JOIN debate_speakers sb ON sb.debate_id = db.id AND sb.key = sa.key
      WHERE sa.fk_grade IS NOT NULL AND sb.fk_grade IS NOT NULL
      ORDER BY da.date, sa.words DESC`,
  );
}

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
    twins: twinTranscripts(),
  };
}

/** Everything /readability shows (deterministic; computed once per process). */
export function readabilitySummary() {
  cache ??= compute();
  return cache;
}
