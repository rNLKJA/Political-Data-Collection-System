/**
 * Readability trends with uncertainty (the /readability page).
 *
 * Pure functions over per-document and per-debate rows, so the numbers can be
 * checked against `scripts/stats_reference.py`, which recomputes them from
 * `analytics.db` with numpy and the same seeded resampling.
 *
 * Flesch-Kincaid grade is linear in words per sentence (WPS) and syllables
 * per word (SPW): grade = 0.39 WPS + 11.8 SPW − 15.59. A difference in mean
 * grade between two groups therefore splits exactly into a sentence-length
 * part (0.39 ΔWPS) and a word-length part (11.8 ΔSPW). Sentence length is
 * where transcription matters: in a transcript, the transcriber decides where
 * one spoken sentence ends and the next begins.
 */
import {
  bootstrap,
  bootstrapMean,
  DEFAULT_SEED,
  meanAt,
  quantile,
  type BootstrapInterval,
} from "@/lib/stats/bootstrap";
import { olsLine } from "@/lib/stats/regression";

export const READABILITY_RESAMPLES = 10_000;
/** Groups smaller than this get a point estimate but no interval. */
export const MIN_GROUP_FOR_INTERVAL = 5;

export type Register = "written" | "transcribed" | "address";

/** How each scraper document type was produced. */
export const REGISTER_OF: Record<string, Register> = {
  Document: "written",
  Statement: "written",
  Debate: "written", // press releases about debates, not transcripts
  "Speech/Remarks": "transcribed",
  Interview: "transcribed",
  Address: "address",
};

export const REGISTER_LABEL: Record<Register, string> = {
  written: "Written releases and statements",
  transcribed: "Transcribed remarks and interviews",
  address: "Addresses",
};

export interface DocRow {
  id: number;
  speakerId: number;
  speaker: string;
  cycle: number;
  docType: string;
  tokens: number;
  sentences: number;
  syllables: number;
  fkGrade: number;
}

export interface GroupSummary {
  n: number;
  /** mean grade; the interval is null below MIN_GROUP_FOR_INTERVAL */
  grade: BootstrapInterval | null;
  meanGrade: number;
  meanWps: number;
  meanSpw: number;
}

const wps = (d: Pick<DocRow, "tokens" | "sentences">) => d.tokens / d.sentences;
const spw = (d: Pick<DocRow, "tokens" | "syllables">) => d.syllables / d.tokens;
const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;

export function summariseDocs(
  rows: readonly DocRow[],
  { resamples = READABILITY_RESAMPLES, seed = DEFAULT_SEED } = {},
): GroupSummary {
  const grades = rows.map((d) => d.fkGrade);
  return {
    n: rows.length,
    grade:
      rows.length >= MIN_GROUP_FOR_INTERVAL ? bootstrapMean(grades, { resamples, seed }) : null,
    meanGrade: mean(grades),
    meanWps: mean(rows.map(wps)),
    meanSpw: mean(rows.map(spw)),
  };
}

export interface CycleRegisterCell extends GroupSummary {
  cycle: number;
  register: Register;
}

/** Mean grade per election cycle and register, documents resampled within each cell. */
export function gradeByCycleAndRegister(
  rows: readonly DocRow[],
  cycles: readonly number[],
  options?: { resamples?: number; seed?: number },
): CycleRegisterCell[] {
  const out: CycleRegisterCell[] = [];
  for (const register of ["written", "transcribed", "address"] as const) {
    for (const cycle of cycles) {
      const cell = rows.filter((d) => d.cycle === cycle && REGISTER_OF[d.docType] === register);
      out.push({ cycle, register, ...summariseDocs(cell, options) });
    }
  }
  return out;
}

export interface SpeakerGap {
  speakerId: number;
  speaker: string;
  nWritten: number;
  nTranscribed: number;
  written: number;
  transcribed: number;
  /** transcribed − written, in grade levels */
  gap: number;
  wpsGap: number;
  spwGap: number;
}

export interface WithinSpeakerGap {
  minDocs: number;
  speakers: SpeakerGap[];
  /** mean of the per-speaker gaps (transcribed − written), speakers resampled */
  gap: BootstrapInterval;
  /** the sentence-length and word-length parts of the mean gap (they sum to it) */
  sentencePart: BootstrapInterval;
  wordPart: BootstrapInterval;
  /** standardised mean difference of the paired gaps (mean / SD) */
  dz: number;
  /** speakers whose transcribed texts grade lower than their written ones */
  lower: number;
}

/**
 * The same person's transcribed speech against their written releases: for
 * every speaker with at least `minDocs` graded documents of each kind, the
 * difference in mean grade, then the mean over speakers with a bootstrap
 * interval that resamples speakers (the paired unit).
 */
export function withinSpeakerGap(
  rows: readonly DocRow[],
  { minDocs = 5, resamples = READABILITY_RESAMPLES, seed = DEFAULT_SEED } = {},
): WithinSpeakerGap {
  const by = new Map<number, { speaker: string; w: DocRow[]; t: DocRow[] }>();
  for (const d of rows) {
    const reg = REGISTER_OF[d.docType];
    if (reg !== "written" && reg !== "transcribed") continue;
    const e = by.get(d.speakerId) ?? { speaker: d.speaker, w: [], t: [] };
    (reg === "written" ? e.w : e.t).push(d);
    by.set(d.speakerId, e);
  }
  const speakers: SpeakerGap[] = [];
  for (const [speakerId, e] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    if (e.w.length < minDocs || e.t.length < minDocs) continue;
    const written = mean(e.w.map((d) => d.fkGrade));
    const transcribed = mean(e.t.map((d) => d.fkGrade));
    speakers.push({
      speakerId,
      speaker: e.speaker,
      nWritten: e.w.length,
      nTranscribed: e.t.length,
      written,
      transcribed,
      gap: transcribed - written,
      wpsGap: mean(e.t.map(wps)) - mean(e.w.map(wps)),
      spwGap: mean(e.t.map(spw)) - mean(e.w.map(spw)),
    });
  }
  const gaps = speakers.map((s) => s.gap);
  const sentence = speakers.map((s) => 0.39 * s.wpsGap);
  const word = speakers.map((s) => 11.8 * s.spwGap);
  const opts = { resamples, seed };
  const m = mean(gaps);
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - m) ** 2, 0) / Math.max(1, gaps.length - 1));
  return {
    minDocs,
    speakers,
    gap: bootstrapMean(gaps, opts),
    sentencePart: bootstrapMean(sentence, opts),
    wordPart: bootstrapMean(word, opts),
    dz: m / sd,
    lower: gaps.filter((g) => g < 0).length,
  };
}

export interface DebateRow {
  id: number;
  date: string;
  year: number;
  cycle: number;
  kind: "general" | "vice-presidential" | "primary";
  labelStyle: string;
  fkCandidates: number;
}

export interface DebateTrend {
  n: number;
  /** change in candidates' mean grade per decade (OLS on the debate year), debates resampled */
  perDecade: BootstrapInterval;
  intercept: number;
  /** pointwise 95% band for the fitted line at each year in `years` */
  band: Array<{ year: number; fit: number; lower: number; upper: number }>;
}

/** Linear trend of candidates' grade over time, with a debate-level bootstrap. */
export function debateTrend(
  rows: readonly DebateRow[],
  years: readonly number[],
  { resamples = READABILITY_RESAMPLES, seed = DEFAULT_SEED } = {},
): DebateTrend {
  const x = rows.map((d) => fractional(d.date));
  const y = rows.map((d) => d.fkCandidates);
  const fit = olsLine(x, y);
  const fitsAt: number[][] = years.map(() => []);
  // bootstrap() evaluates the statistic once on the original sample, then on
  // each resample; only the resamples feed the band.
  let calls = 0;
  const perDecade = bootstrap(
    rows.length,
    (idx) => {
      const line = olsLine(
        idx.map((i) => x[i]),
        idx.map((i) => y[i]),
      );
      if (calls++ > 0) years.forEach((yr, j) => fitsAt[j].push(line.intercept + line.slope * yr));
      return line.slope * 10;
    },
    { resamples, seed },
  );
  const alpha = 1 - perDecade.level;
  const q = (vals: number[], p: number) =>
    quantile(
      vals.filter((v) => !Number.isNaN(v)),
      p,
    );
  return {
    n: rows.length,
    perDecade,
    intercept: fit.intercept,
    band: years.map((yr, j) => ({
      year: yr,
      fit: fit.intercept + fit.slope * yr,
      lower: q(fitsAt[j], alpha / 2),
      upper: q(fitsAt[j], 1 - alpha / 2),
    })),
  };
}

export interface CycleMean {
  cycle: number;
  n: number;
  mean: number;
  interval: BootstrapInterval | null;
}

/** Mean candidates' grade per cycle; debates resampled within the cycle. */
export function debateMeansByCycle(
  rows: readonly DebateRow[],
  { resamples = READABILITY_RESAMPLES, seed = DEFAULT_SEED } = {},
): CycleMean[] {
  const cycles = [...new Set(rows.map((d) => d.cycle))].sort((a, b) => a - b);
  return cycles.map((cycle) => {
    const ys = rows.filter((d) => d.cycle === cycle).map((d) => d.fkCandidates);
    return {
      cycle,
      n: ys.length,
      mean: mean(ys),
      interval:
        ys.length >= MIN_GROUP_FOR_INTERVAL
          ? bootstrap(ys.length, (idx) => meanAt(ys, idx), { resamples, seed })
          : null,
    };
  });
}

/** "1960-09-26" -> 1960.73 (day of year / 365.25, for the trend's x axis). */
export function fractional(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const day = (Date.UTC(y, m - 1, d) - start) / 86_400_000;
  return y + day / 365.25;
}
