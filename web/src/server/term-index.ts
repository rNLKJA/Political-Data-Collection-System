import "server-only";

import { CYCLES, type Cycle } from "@/lib/corpus-types";
import { decodePostings } from "@/lib/postings";
import { DEFAULT_ALPHA0, fightinWords, Z_THRESHOLD } from "@/lib/stats/fightin-words";
import { rateWithInterval } from "@/lib/stats/poisson";
import { allMonths, getDocumentsByIds, getSpeakers, speakerBySlug } from "@/server/corpus";
import { all } from "@/server/db";

/**
 * The inverted index and per-document metadata, decoded once per server
 * process (about 1.5 million postings, ~12 MB of typed arrays).
 */
interface Index {
  nDocs: number;
  speaker: Int16Array;
  cycle: Int16Array;
  month: Int16Array; // index into months
  tokens: Int32Array;
  months: string[];
  terms: string[];
  termId: Map<string, number>;
  cf: Float64Array;
  offsets: Int32Array; // postings for term t live in [offsets[t], offsets[t+1])
  docs: Int32Array;
  counts: Int32Array;
}

const g = globalThis as unknown as { __ctlIndex?: Index };

function buildIndex(): Index {
  const months = allMonths();
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const docRows = all<{
    id: number;
    speaker_id: number;
    cycle: number;
    month: string;
    tokens: number;
  }>("SELECT id, speaker_id, cycle, month, tokens FROM documents ORDER BY id");
  const nDocs = docRows.length;
  const speaker = new Int16Array(nDocs);
  const cycle = new Int16Array(nDocs);
  const month = new Int16Array(nDocs);
  const tokens = new Int32Array(nDocs);
  for (const d of docRows) {
    speaker[d.id] = d.speaker_id;
    cycle[d.id] = d.cycle;
    month[d.id] = monthIdx.get(d.month) ?? 0;
    tokens[d.id] = d.tokens;
  }
  const termRows = all<{ id: number; term: string; cf: number; postings: Uint8Array }>(
    "SELECT id, term, cf, postings FROM terms ORDER BY id",
  );
  const decoded = termRows.map((t) => decodePostings(t.postings));
  const total = decoded.reduce((a, p) => a + p.docs.length, 0);
  const offsets = new Int32Array(termRows.length + 1);
  const docs = new Int32Array(total);
  const counts = new Int32Array(total);
  let o = 0;
  decoded.forEach((p, t) => {
    offsets[t] = o;
    docs.set(p.docs, o);
    counts.set(p.counts, o);
    o += p.docs.length;
  });
  offsets[termRows.length] = o;
  return {
    nDocs,
    speaker,
    cycle,
    month,
    tokens,
    months,
    terms: termRows.map((t) => t.term),
    termId: new Map(termRows.map((t) => [t.term, t.id])),
    cf: Float64Array.from(termRows, (t) => t.cf),
    offsets,
    docs,
    counts,
  };
}

export function getIndex(): Index {
  g.__ctlIndex ??= buildIndex();
  return g.__ctlIndex;
}

// ---------------------------------------------------------------------------
// Groups: who is being compared
// ---------------------------------------------------------------------------

export interface GroupSpec {
  /** speaker slug, or undefined for every speaker */
  speaker?: string;
  cycle?: Cycle;
  /** the complement of the other group */
  rest?: boolean;
}

/** "bernie-sanders", "bernie-sanders@2020", "cycle-2016", "rest" */
export function parseGroup(token: string | undefined): GroupSpec | null {
  if (!token) return null;
  if (token === "rest") return { rest: true };
  const cyc = /^cycle-(\d{4})$/.exec(token);
  if (cyc) {
    const c = Number(cyc[1]);
    return (CYCLES as readonly number[]).includes(c) ? { cycle: c as Cycle } : null;
  }
  const [slug, c] = token.split("@");
  if (!speakerBySlug(slug)) return null;
  if (c === undefined) return { speaker: slug };
  const n = Number(c);
  return (CYCLES as readonly number[]).includes(n) ? { speaker: slug, cycle: n as Cycle } : null;
}

export function groupToken(spec: GroupSpec): string {
  if (spec.rest) return "rest";
  if (spec.speaker) return spec.cycle ? `${spec.speaker}@${spec.cycle}` : spec.speaker;
  return spec.cycle ? `cycle-${spec.cycle}` : "rest";
}

export function groupLabel(spec: GroupSpec, other?: GroupSpec): string {
  if (spec.rest) return other ? `Everything except ${groupLabel(other)}` : "Everything else";
  const name = spec.speaker ? speakerBySlug(spec.speaker)?.name : undefined;
  if (name && spec.cycle) return `${name}, ${spec.cycle} cycle`;
  if (name) return name;
  if (spec.cycle) return `All speakers, ${spec.cycle} cycle`;
  return "All documents";
}

function mask(spec: GroupSpec, ix: Index): Uint8Array {
  const m = new Uint8Array(ix.nDocs);
  const sid = spec.speaker ? speakerBySlug(spec.speaker)?.id : undefined;
  for (let d = 0; d < ix.nDocs; d++) {
    if (sid !== undefined && ix.speaker[d] !== sid) continue;
    if (spec.cycle !== undefined && ix.cycle[d] !== spec.cycle) continue;
    m[d] = 1;
  }
  return m;
}

function groupMasks(a: GroupSpec, b: GroupSpec, ix: Index): [Uint8Array, Uint8Array] {
  const ma = mask(a, ix);
  if (b.rest) {
    const mb = new Uint8Array(ix.nDocs);
    for (let d = 0; d < ix.nDocs; d++) mb[d] = ma[d] ? 0 : 1;
    return [ma, mb];
  }
  return [ma, mask(b, ix)];
}

// ---------------------------------------------------------------------------
// Fightin' Words
// ---------------------------------------------------------------------------

export interface DistinctiveWord {
  term: string;
  yA: number;
  yB: number;
  /** per 10,000 indexed words in each group */
  rateA: number;
  rateB: number;
  delta: number;
  z: number;
}

export interface FightinWordsView {
  docsA: number;
  docsB: number;
  nA: number;
  nB: number;
  alpha0: number;
  topA: DistinctiveWord[];
  topB: DistinctiveWord[];
  /** a sample of every word for the funnel plot: [log10 total count, z, flag] */
  cloud: Array<[number, number, 0 | 1 | 2]>;
  significant: number;
}

const fwCache = new Map<string, FightinWordsView>();

export function computeFightinWords(
  a: GroupSpec,
  b: GroupSpec,
  alpha0 = DEFAULT_ALPHA0,
  top = 30,
): FightinWordsView {
  const key = `${groupToken(a)}|${groupToken(b)}|${alpha0}|${top}`;
  const hit = fwCache.get(key);
  if (hit) return hit;
  const ix = getIndex();
  const [ma, mb] = groupMasks(a, b, ix);
  const V = ix.terms.length;
  const yA = new Float64Array(V);
  const yB = new Float64Array(V);
  for (let t = 0; t < V; t++) {
    let sa = 0;
    let sb = 0;
    for (let i = ix.offsets[t]; i < ix.offsets[t + 1]; i++) {
      const d = ix.docs[i];
      if (ma[d]) sa += ix.counts[i];
      if (mb[d]) sb += ix.counts[i];
    }
    yA[t] = sa;
    yB[t] = sb;
  }
  const res = fightinWords(yA, yB, ix.cf, alpha0);
  const order: number[] = [];
  for (let t = 0; t < V; t++) if (yA[t] + yB[t] > 0 && !Number.isNaN(res.z[t])) order.push(t);
  order.sort((x, y) => res.z[y] - res.z[x]);
  const word = (t: number): DistinctiveWord => ({
    term: ix.terms[t],
    yA: yA[t],
    yB: yB[t],
    rateA: res.nA ? (yA[t] / res.nA) * 1e4 : 0,
    rateB: res.nB ? (yB[t] / res.nB) * 1e4 : 0,
    delta: res.delta[t],
    z: res.z[t],
  });
  const topA = order
    .slice(0, top)
    .filter((t) => res.z[t] > 0)
    .map(word);
  const topB = order
    .slice(-top)
    .reverse()
    .filter((t) => res.z[t] < 0)
    .map(word);

  // Funnel plot sample (about 1,200 points): the 120 strongest words on each
  // side plus an even sample of the rest, so the payload stays small.
  const cloud: FightinWordsView["cloud"] = [];
  let significant = 0;
  for (const t of order) if (Math.abs(res.z[t]) >= Z_THRESHOLD) significant++;
  const stride = Math.max(1, Math.floor(order.length / 950));
  order.forEach((t, rank) => {
    const z = res.z[t];
    const sig = Math.abs(z) >= Z_THRESHOLD;
    const extreme = rank < 120 || rank >= order.length - 120;
    if (extreme || rank % stride === 0) {
      cloud.push([
        Math.round(Math.log10(yA[t] + yB[t]) * 1000) / 1000,
        Math.round(z * 100) / 100,
        sig ? (z > 0 ? 1 : 2) : 0,
      ]);
    }
  });
  let docsA = 0;
  let docsB = 0;
  for (let d = 0; d < ix.nDocs; d++) {
    docsA += ma[d];
    docsB += mb[d];
  }
  const view = {
    docsA,
    docsB,
    nA: res.nA,
    nB: res.nB,
    alpha0,
    topA,
    topB,
    cloud,
    significant,
  };
  if (fwCache.size > 200) fwCache.clear();
  fwCache.set(key, view);
  return view;
}

/** Documents in a group that use a term most often. */
export function termExamples(term: string, spec: GroupSpec, other: GroupSpec | null, n = 4) {
  const ix = getIndex();
  const t = ix.termId.get(term);
  if (t === undefined) return [];
  const m = spec.rest && other ? groupMasks(other, spec, ix)[1] : mask(spec, ix);
  const hits: Array<[number, number]> = [];
  for (let i = ix.offsets[t]; i < ix.offsets[t + 1]; i++) {
    if (m[ix.docs[i]]) hits.push([ix.docs[i], ix.counts[i]]);
  }
  hits.sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  const top = hits.slice(0, n);
  const docs = getDocumentsByIds(top.map((h) => h[0]));
  return docs.map((d, i) => ({ ...d, count: top[i][1] }));
}

export function hasTerm(term: string): boolean {
  return getIndex().termId.has(term);
}

/** Suggestions for the term box: indexed words starting with a prefix, most frequent first. */
export function suggestTerms(prefix: string, n = 8): string[] {
  const ix = getIndex();
  const out: Array<[string, number]> = [];
  for (let t = 0; t < ix.terms.length; t++) {
    if (ix.terms[t].startsWith(prefix)) out.push([ix.terms[t], ix.cf[t]]);
  }
  return out
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((x) => x[0]);
}

// ---------------------------------------------------------------------------
// Timelines
// ---------------------------------------------------------------------------

export type Granularity = "month" | "quarter" | "year";

export interface TimelinePoint {
  period: string;
  start: string; // YYYY-MM of the first month in the period
  k: number;
  words: number;
  rate: number;
  lower: number;
  upper: number;
}

export interface TimelineSeries {
  key: string;
  label: string;
  points: TimelinePoint[];
  total: { k: number; words: number; rate: number; lower: number; upper: number };
  /** periods with some text but fewer than MIN_PERIOD_WORDS, left off the chart */
  hidden: number;
}

/** Periods with less text than this are too thin to plot a rate for. */
export const MIN_PERIOD_WORDS = 5_000;

function periodOf(month: string, gran: Granularity): string {
  const [y, m] = month.split("-");
  if (gran === "year") return y;
  if (gran === "quarter") return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
  return month;
}

/**
 * Relative frequency per 10,000 words with exact Poisson 95 % intervals.
 * `perDoc` maps doc id -> count of the term or concept in that document.
 */
export function buildTimeline(
  perDoc: Map<number, number>,
  speakerSlugs: string[],
  gran: Granularity,
): TimelineSeries[] {
  const ix = getIndex();
  const periods = Array.from(new Set(ix.months.map((m) => periodOf(m, gran))));
  const pIndex = new Map(periods.map((p, i) => [p, i]));
  const monthToPeriod = ix.months.map((m) => pIndex.get(periodOf(m, gran))!);
  const firstMonth = new Map<string, string>();
  for (const m of ix.months) {
    const p = periodOf(m, gran);
    if (!firstMonth.has(p)) firstMonth.set(p, m);
  }
  const speakers = speakerSlugs.length
    ? speakerSlugs.map((s) => speakerBySlug(s)).filter((s) => !!s)
    : [undefined];
  return speakers.map((sp) => {
    const k = new Float64Array(periods.length);
    const words = new Float64Array(periods.length);
    for (let d = 0; d < ix.nDocs; d++) {
      if (sp && ix.speaker[d] !== sp.id) continue;
      const p = monthToPeriod[ix.month[d]];
      words[p] += ix.tokens[d];
      k[p] += perDoc.get(d) ?? 0;
    }
    const points: TimelinePoint[] = [];
    let kt = 0;
    let wt = 0;
    let hidden = 0;
    periods.forEach((period, i) => {
      kt += k[i];
      wt += words[i];
      if (words[i] <= 0) return;
      if (words[i] < MIN_PERIOD_WORDS) {
        hidden++;
        return;
      }
      const r = rateWithInterval(k[i], words[i]);
      points.push({
        period,
        start: firstMonth.get(period)!,
        k: k[i],
        words: words[i],
        rate: r.rate,
        lower: r.lower,
        upper: r.upper,
      });
    });
    const tot = rateWithInterval(kt, wt);
    return {
      key: sp?.slug ?? "all",
      label: sp?.name ?? "All speakers",
      points,
      total: { k: kt, words: wt, ...tot },
      hidden,
    };
  });
}

/** Every period between the first and last document, including empty ones. */
export function timelinePeriods(gran: Granularity): string[] {
  return Array.from(new Set(getIndex().months.map((m) => periodOf(m, gran))));
}

export function termPerDoc(term: string): Map<number, number> {
  const ix = getIndex();
  const t = ix.termId.get(term);
  const out = new Map<number, number>();
  if (t === undefined) return out;
  for (let i = ix.offsets[t]; i < ix.offsets[t + 1]; i++) out.set(ix.docs[i], ix.counts[i]);
  return out;
}

export function conceptPerDoc(conceptId: number): Map<number, number> {
  const rows = all<{ doc_id: number; n: number }>(
    "SELECT doc_id, n FROM concept_hits WHERE concept_id = ?",
    conceptId,
  );
  return new Map(rows.map((r) => [r.doc_id, r.n]));
}

export function topDocsForTerm(perDoc: Map<number, number>, speakerSlugs: string[], n = 6) {
  const ix = getIndex();
  const ids = new Set(
    speakerSlugs.map((s) => speakerBySlug(s)?.id).filter((x): x is number => x !== undefined),
  );
  const hits = Array.from(perDoc.entries())
    .filter(([d]) => !ids.size || ids.has(ix.speaker[d]))
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, n);
  const docs = getDocumentsByIds(hits.map((h) => h[0]));
  return docs.map((d, i) => ({ ...d, count: hits[i][1] }));
}

export function speakerOptions() {
  return getSpeakers().map((s) => ({ slug: s.slug, name: s.name, docs: s.docs }));
}
