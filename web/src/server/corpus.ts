import "server-only";

import type { DocumentRow, Speaker } from "@/lib/corpus-types";
import { all, get } from "@/server/db";

export function getMeta(): Record<string, string> {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM meta");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

let speakersCache: Speaker[] | undefined;

/** All 54 speakers, most documents first. */
export function getSpeakers(): Speaker[] {
  speakersCache ??= all<Speaker>(
    `SELECT id, name, slug, surname, speaker_title AS title, docs, tokens,
            first_date AS firstDate, last_date AS lastDate
       FROM speakers ORDER BY docs DESC, name`,
  );
  return speakersCache;
}

export function speakerBySlug(slug: string | undefined): Speaker | undefined {
  if (!slug) return undefined;
  return getSpeakers().find((s) => s.slug === slug);
}

export interface CorpusOverview {
  documents: number;
  listingRows: number;
  speakers: number;
  tokens: number;
  firstDate: string;
  lastDate: string;
  debates: number;
  debateTurns: number;
  debateWords: number;
  firstDebate: string;
  lastDebate: string;
  vocabulary: number;
  excludedTokens: number;
  rawTokens: number;
  snippets: number;
  zeroWordDocs: number;
}

export function getOverview(): CorpusOverview {
  const meta = getMeta();
  const docs = get<{ first: string; last: string; zero: number }>(
    "SELECT MIN(date) AS first, MAX(date) AS last, SUM(word_count = 0) AS zero FROM documents",
  )!;
  const deb = get<{ first: string; last: string }>(
    "SELECT MIN(date) AS first, MAX(date) AS last FROM debates",
  )!;
  return {
    documents: Number(meta.documents_documents),
    listingRows: Number(meta.documents_listing_rows),
    speakers: Number(meta.documents_speakers),
    tokens: Number(meta.documents_tokens),
    rawTokens: Number(meta.documents_raw_tokens),
    excludedTokens: Number(meta.documents_excluded_other_speaker_tokens),
    vocabulary: Number(meta.documents_vocabulary),
    snippets: Number(meta.documents_snippets),
    firstDate: docs.first,
    lastDate: docs.last,
    zeroWordDocs: docs.zero,
    debates: Number(meta.debates_debates),
    debateTurns: Number(meta.debates_turns),
    debateWords: Number(meta.debates_words),
    firstDebate: deb.first,
    lastDebate: deb.last,
  };
}

export interface DocFilter {
  speakerId?: number;
  docType?: string;
  from?: string; // YYYY-MM
  to?: string; // YYYY-MM
  q?: string;
}

function whereClause(f: DocFilter): { sql: string; params: Array<string | number> } {
  const parts: string[] = [];
  const params: Array<string | number> = [];
  if (f.speakerId !== undefined) {
    parts.push("d.speaker_id = ?");
    params.push(f.speakerId);
  }
  if (f.docType) {
    parts.push("d.doc_type = ?");
    params.push(f.docType);
  }
  if (f.from) {
    parts.push("d.month >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("d.month <= ?");
    params.push(f.to);
  }
  if (f.q) {
    parts.push("d.title LIKE ? ESCAPE '\\'");
    params.push(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export interface ExplorerResult {
  total: number;
  words: number;
  medianGrade: number | null;
  months: Array<{ month: string; n: number }>;
  byType: Array<{ docType: string; n: number }>;
  bySpeaker: Array<{ name: string; slug: string; n: number }>;
  rows: DocumentRow[];
  page: number;
  pages: number;
}

export const PAGE_SIZE = 25;

export function exploreDocuments(f: DocFilter, page: number): ExplorerResult {
  const { sql, params } = whereClause(f);
  const totals = get<{ n: number; words: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(d.word_count), 0) AS words FROM documents d ${sql}`,
    ...params,
  )!;
  const grades = all<{ g: number }>(
    `SELECT d.fk_grade AS g FROM documents d ${sql} ${sql ? "AND" : "WHERE"} d.fk_grade IS NOT NULL ORDER BY d.fk_grade`,
    ...params,
  );
  const medianGrade = grades.length
    ? grades.length % 2
      ? grades[(grades.length - 1) / 2].g
      : (grades[grades.length / 2 - 1].g + grades[grades.length / 2].g) / 2
    : null;
  const months = all<{ month: string; n: number }>(
    `SELECT d.month AS month, COUNT(*) AS n FROM documents d ${sql} GROUP BY d.month ORDER BY d.month`,
    ...params,
  );
  const byType = all<{ docType: string; n: number }>(
    `SELECT d.doc_type AS docType, COUNT(*) AS n FROM documents d ${sql} GROUP BY d.doc_type ORDER BY n DESC`,
    ...params,
  );
  const bySpeaker = all<{ name: string; slug: string; n: number }>(
    `SELECT s.name AS name, s.slug AS slug, COUNT(*) AS n FROM documents d
       JOIN speakers s ON s.id = d.speaker_id ${sql}
      GROUP BY s.id ORDER BY n DESC, s.name LIMIT 12`,
    ...params,
  );
  const pages = Math.max(1, Math.ceil(totals.n / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = all<DocumentRow>(
    `SELECT d.id, d.url, d.date, d.title, s.name AS speaker, s.slug AS speakerSlug,
            d.doc_type AS docType, d.word_count AS wordCount, d.tokens, d.fk_grade AS fkGrade
       FROM documents d JOIN speakers s ON s.id = d.speaker_id ${sql}
      ORDER BY d.date DESC, d.id DESC LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (p - 1) * PAGE_SIZE,
  );
  return {
    total: totals.n,
    words: totals.words,
    medianGrade,
    months,
    byType,
    bySpeaker,
    rows,
    page: p,
    pages,
  };
}

/** Every month between the first and last document, for continuous axes. */
export function allMonths(): string[] {
  const r = get<{ first: string; last: string }>(
    "SELECT MIN(month) AS first, MAX(month) AS last FROM documents",
  )!;
  const out: string[] = [];
  let [y, m] = r.first.split("-").map(Number);
  const [ly, lm] = r.last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function getDocumentsByIds(ids: number[]): DocumentRow[] {
  if (!ids.length) return [];
  const rows = all<DocumentRow>(
    `SELECT d.id, d.url, d.date, d.title, s.name AS speaker, s.slug AS speakerSlug,
            d.doc_type AS docType, d.word_count AS wordCount, d.tokens, d.fk_grade AS fkGrade
       FROM documents d JOIN speakers s ON s.id = d.speaker_id
      WHERE d.id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is DocumentRow => !!r);
}

export interface Concept {
  id: number;
  slug: string;
  label: string;
  patterns: string[];
}

export function getConcepts(): Concept[] {
  return all<{ id: number; slug: string; label: string; patterns: string }>(
    "SELECT id, slug, label, patterns FROM concepts ORDER BY id",
  ).map((c) => ({ ...c, patterns: JSON.parse(c.patterns) as string[] }));
}

export interface Snippet {
  docId: number;
  snippet: string;
  hlStart: number;
  hlEnd: number;
  title: string;
  url: string;
  date: string;
  speaker: string;
}

/**
 * Example passages for a concept. With no speaker filter, at most one passage
 * per speaker (the document that uses the concept most), so no single
 * campaign dominates the list; with a filter, up to `perSpeaker` each.
 */
export function conceptSnippets(conceptId: number, speakerIds: number[], limit = 6): Snippet[] {
  const filter = speakerIds.length
    ? `AND d.speaker_id IN (${speakerIds.map(() => "?").join(",")})`
    : "";
  const perSpeaker = speakerIds.length ? Math.max(2, Math.ceil(limit / speakerIds.length)) : 1;
  return all<Snippet>(
    `SELECT docId, snippet, hlStart, hlEnd, title, url, date, speaker FROM (
       SELECT s.doc_id AS docId, s.snippet, s.hl_start AS hlStart, s.hl_end AS hlEnd,
              d.title, d.url, d.date, sp.name AS speaker, h.n AS n,
              ROW_NUMBER() OVER (PARTITION BY d.speaker_id ORDER BY h.n DESC, d.date DESC) AS rk
         FROM concept_snippets s
         JOIN concept_hits h ON h.concept_id = s.concept_id AND h.doc_id = s.doc_id
         JOIN documents d ON d.id = s.doc_id
         JOIN speakers sp ON sp.id = d.speaker_id
        WHERE s.concept_id = ? ${filter})
      WHERE rk <= ? ORDER BY n DESC, date DESC LIMIT ?`,
    conceptId,
    ...speakerIds,
    perSpeaker,
    limit,
  );
}
