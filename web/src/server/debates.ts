import "server-only";

import type { DebateKind, Role } from "@/lib/corpus-types";
import { debateSlugs } from "@/lib/debate-slug";
import { all } from "@/server/db";

export interface DebateSummary {
  id: number;
  slug: string;
  url: string;
  date: string;
  year: number;
  cycle: number;
  title: string;
  kind: DebateKind;
  party: string;
  format: "debate" | "forum";
  turns: number;
  words: number;
  candidateWords: number;
  moderatorWords: number;
  otherWords: number;
  unattributedWords: number;
  crosstalk: number;
  stageMarkers: number;
  interruptedTurns: number;
  fkCandidates: number | null;
  fkModerators: number | null;
  nCandidates: number;
  labelStyle: string;
  participants: string | null;
  moderators: string | null;
  listingDate: string;
  listingRows: number;
  relatedCategory: string | null;
  /** candidates' display names, most words first */
  candidates: string[];
  /** mean words per candidate turn */
  meanCandidateTurn: number;
}

export interface DebateSpeaker {
  idx: number;
  key: string;
  display: string;
  role: Role;
  turns: number;
  words: number;
  share: number;
  meanTurn: number;
  medianTurn: number;
  maxTurn: number;
  interrupted: number;
  fkGrade: number | null;
}

export interface DebateTurn {
  seq: number;
  speakerIdx: number;
  words: number;
  interrupted: number;
}

let cache: DebateSummary[] | undefined;

export function listDebates(): DebateSummary[] {
  if (cache) return cache;
  const rows = all<Omit<DebateSummary, "slug" | "candidates" | "meanCandidateTurn">>(
    `SELECT id, url, date, year, cycle, title, kind, party, format, turns, words,
            candidate_words AS candidateWords, moderator_words AS moderatorWords,
            other_words AS otherWords, unattributed_words AS unattributedWords, crosstalk,
            stage_markers AS stageMarkers, interrupted_turns AS interruptedTurns,
            fk_candidates AS fkCandidates, fk_moderators AS fkModerators,
            n_candidates AS nCandidates, label_style AS labelStyle, participants, moderators,
            listing_date AS listingDate, listing_rows AS listingRows,
            related_category AS relatedCategory
       FROM debates ORDER BY date, id`,
  );
  const speakers = all<{ debate_id: number; display: string; turns: number; words: number }>(
    `SELECT debate_id, display, turns, words FROM debate_speakers
      WHERE role = 'candidate' ORDER BY debate_id, words DESC`,
  );
  const byDebate = new Map<number, { names: string[]; turns: number; words: number }>();
  for (const s of speakers) {
    const e = byDebate.get(s.debate_id) ?? { names: [], turns: 0, words: 0 };
    e.names.push(s.display);
    e.turns += s.turns;
    e.words += s.words;
    byDebate.set(s.debate_id, e);
  }
  const slugs = debateSlugs(rows);
  cache = rows.map((r, i) => {
    const c = byDebate.get(r.id);
    return {
      ...r,
      slug: slugs[i],
      candidates: c?.names ?? [],
      meanCandidateTurn: c && c.turns ? c.words / c.turns : 0,
    };
  });
  return cache;
}

export function getDebate(slug: string) {
  const list = listDebates();
  const i = list.findIndex((d) => d.slug === slug);
  if (i < 0) return null;
  const debate = list[i];
  const speakers = all<DebateSpeaker>(
    `SELECT idx, key, display, role, turns, words, share, mean_turn AS meanTurn,
            median_turn AS medianTurn, max_turn AS maxTurn, interrupted, fk_grade AS fkGrade
       FROM debate_speakers WHERE debate_id = ? ORDER BY idx`,
    debate.id,
  );
  const turns = all<DebateTurn>(
    `SELECT seq, speaker_idx AS speakerIdx, words, interrupted
       FROM debate_turns WHERE debate_id = ? ORDER BY seq`,
    debate.id,
  );
  // The archive holds a second transcript of a few events (same date and title).
  const twins = list.filter(
    (d) => d.id !== debate.id && d.date === debate.date && d.title === debate.title,
  );
  return {
    debate,
    speakers,
    turns,
    twins,
    prev: i > 0 ? list[i - 1] : null,
    next: i < list.length - 1 ? list[i + 1] : null,
  };
}
