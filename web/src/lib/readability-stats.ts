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
 *
 * Rows are not independent: documents come in batches from the same speaker's
 * campaign, and debates in the same cycle share candidates and a transcription
 * source. So the intervals resample clusters (speakers for documents, cycles
 * for debate trends), not rows; see DR-006.
 */
import {
  bootstrap,
  bootstrapMean,
  clusterBootstrap,
  clusterBootstrapMean,
  DEFAULT_SEED,
  meanAt,
  quantile,
  type BootstrapInterval,
} from "@/lib/stats/bootstrap";
import { olsLine } from "@/lib/stats/regression";
import { signTest, tIntervalMean, type SignTest, type TInterval } from "@/lib/stats/small-sample";

export const READABILITY_RESAMPLES = 10_000;
/** Groups smaller than this get a point estimate but no interval. */
export const MIN_GROUP_FOR_INTERVAL = 5;
/** Groups from fewer clusters (speakers or cycles) than this get no interval either. */
export const MIN_CLUSTERS_FOR_INTERVAL = 5;

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
  /** distinct speakers (the resampled clusters) */
  speakers: number;
  /**
   * mean grade per document, with an interval that resamples speakers; null
   * below MIN_GROUP_FOR_INTERVAL documents or MIN_CLUSTERS_FOR_INTERVAL speakers
   */
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
  const keys = rows.map((d) => d.speakerId);
  const speakers = new Set(keys).size;
  return {
    n: rows.length,
    speakers,
    grade:
      rows.length >= MIN_GROUP_FOR_INTERVAL && speakers >= MIN_CLUSTERS_FOR_INTERVAL
        ? clusterBootstrapMean(grades, keys, { resamples, seed })
        : null,
    meanGrade: mean(grades),
    meanWps: mean(rows.map(wps)),
    meanSpw: mean(rows.map(spw)),
  };
}

export interface CycleRegisterCell extends GroupSummary {
  cycle: number;
  register: Register;
}

/** Mean grade per election cycle and register, speakers resampled within each cell. */
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
  /**
   * t intervals for the same three means. With 14 speakers the percentile
   * bootstrap runs narrow, so the page leads with these.
   */
  gapT: TInterval;
  sentencePartT: TInterval;
  wordPartT: TInterval;
  /** exact sign test on the per-speaker gaps */
  sign: SignTest;
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
    gapT: tIntervalMean(gaps),
    sentencePartT: tIntervalMean(sentence),
    wordPartT: tIntervalMean(word),
    sign: signTest(gaps),
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
  /** election cycles the debates fall in (the resampled clusters) */
  cycles: number;
  /**
   * change in candidates' mean grade per decade (OLS on the debate date), with
   * an interval that resamples whole cycles
   */
  perDecade: BootstrapInterval;
  /**
   * the same slope with debates resampled as if independent; shown on /methods
   * only, to say how much narrower that would be
   */
  perDecadeDebates: BootstrapInterval;
  intercept: number;
  /** pointwise 95% band for the fitted line at each year in `years` (cycles resampled) */
  band: Array<{ year: number; fit: number; lower: number; upper: number }>;
}

/** Linear trend of candidates' grade over time, with a cycle-level (cluster) bootstrap. */
export function debateTrend(
  rows: readonly DebateRow[],
  years: readonly number[],
  { resamples = READABILITY_RESAMPLES, seed = DEFAULT_SEED } = {},
): DebateTrend {
  const x = rows.map((d) => fractional(d.date));
  const y = rows.map((d) => d.fkCandidates);
  const fit = olsLine(x, y);
  const slopeAt = (idx: readonly number[]) =>
    olsLine(
      idx.map((i) => x[i]),
      idx.map((i) => y[i]),
    );
  const fitsAt: number[][] = years.map(() => []);
  // The bootstrap evaluates the statistic once on the original sample, then on
  // each resample; only the resamples feed the band.
  let calls = 0;
  const perDecade = clusterBootstrap(
    rows.map((d) => d.cycle),
    (idx) => {
      const line = slopeAt(idx);
      if (calls++ > 0) years.forEach((yr, j) => fitsAt[j].push(line.intercept + line.slope * yr));
      return line.slope * 10;
    },
    { resamples, seed },
  );
  const perDecadeDebates = bootstrap(rows.length, (idx) => slopeAt(idx).slope * 10, {
    resamples,
    seed,
  });
  const alpha = 1 - perDecade.level;
  const q = (vals: number[], p: number) =>
    quantile(
      vals.filter((v) => !Number.isNaN(v)),
      p,
    );
  return {
    n: rows.length,
    cycles: perDecade.clusters ?? 0,
    perDecade,
    perDecadeDebates,
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

/**
 * Mean candidates' grade per cycle; debates resampled within the cycle. This
 * describes the cycle's own debates: there is one cluster per cycle, so the
 * interval cannot include cycle-to-cycle variation and is shown only as a
 * description of that cycle.
 */
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
