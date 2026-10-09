/**
 * The /readability summaries, recomputed from analytics.db and compared with
 * scripts/stats_reference.py (numpy, the same seeded resampling).
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { CYCLES } from "@/lib/corpus-types";
import {
  debateMeansByCycle,
  debateTrend,
  fractional,
  gradeByCycleAndRegister,
  withinSpeakerGap,
  type DebateRow,
  type DocRow,
} from "@/lib/readability-stats";
import { openAnalytics } from "@/test/originals";

const ref = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "src/lib/__fixtures__/stats-reference.json"), "utf8"),
).readability;

const db = openAnalytics();
afterAll(() => db.close());

const docs = db
  .prepare(
    `SELECT d.id, d.speaker_id AS speakerId, s.name AS speaker, d.cycle, d.doc_type AS docType,
            d.tokens, d.sentences, d.syllables, d.fk_grade AS fkGrade
       FROM documents d JOIN speakers s ON s.id = d.speaker_id
      WHERE d.fk_grade IS NOT NULL ORDER BY d.id`,
  )
  .all() as unknown as DocRow[];
const debates = db
  .prepare(
    `SELECT id, date, year, cycle, kind, label_style AS labelStyle, fk_candidates AS fkCandidates
       FROM debates WHERE fk_candidates IS NOT NULL ORDER BY date, id`,
  )
  .all() as unknown as DebateRow[];

const close = (a: number, b: number, tol = 1e-9) =>
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("readability summaries", () => {
  it("grade by cycle and register matches the numpy reference", () => {
    const cells = gradeByCycleAndRegister(docs, CYCLES);
    expect(cells).toHaveLength(ref.cells.length);
    cells.forEach((c, i) => {
      const r = ref.cells[i];
      expect([c.cycle, c.register, c.n]).toEqual([r.cycle, r.register, r.n]);
      close(c.meanGrade, r.mean, 1e-12);
      if (r.interval) {
        close(c.grade!.lower, r.interval.lower);
        close(c.grade!.upper, r.interval.upper);
      } else expect(c.grade).toBeNull();
    });
  });

  it("the within-speaker gap and its decomposition match, and the parts add up", () => {
    const g = withinSpeakerGap(docs);
    expect(g.speakers.map((s) => s.speakerId)).toEqual(ref.gap.speakers);
    for (const k of ["gap", "sentencePart", "wordPart"] as const) {
      close(g[k].estimate, ref.gap[k].estimate, 1e-12);
      close(g[k].lower, ref.gap[k].lower);
      close(g[k].upper, ref.gap[k].upper);
    }
    close(g.dz, ref.gap.dz, 1e-10);
    // FK is linear in words per sentence and syllables per word, so the parts sum to the gap
    close(g.sentencePart.estimate + g.wordPart.estimate, g.gap.estimate, 1e-9);
  });

  it("debate trends match", () => {
    const years = ref.general.trend.band.map((b: { year: number }) => b.year);
    for (const kind of ["general", "primary"] as const) {
      const rows = debates.filter((d) => (kind === "primary") === (d.kind === "primary"));
      const t = debateTrend(rows, years);
      const r = ref[kind].trend;
      expect(t.n).toBe(r.n);
      close(t.perDecade.estimate, r.perDecade.estimate, 1e-9);
      close(t.perDecade.lower, r.perDecade.lower, 1e-8);
      close(t.perDecade.upper, r.perDecade.upper, 1e-8);
      t.band.forEach((b, j) => {
        close(b.lower, r.band[j].lower, 1e-8);
        close(b.upper, r.band[j].upper, 1e-8);
      });
      const means = debateMeansByCycle(rows);
      means.forEach((m, j) => {
        const e = ref[kind].byCycle[j];
        expect([m.cycle, m.n]).toEqual([e.cycle, e.n]);
        close(m.mean, e.mean, 1e-12);
        if (e.interval) close(m.interval!.lower, e.interval.lower);
        else expect(m.interval).toBeNull();
      });
    }
  });

  it("places dates within the year", () => {
    expect(fractional("1960-01-01")).toBe(1960);
    expect(fractional("2024-12-31")).toBeCloseTo(2024 + 365 / 365.25, 12);
  });
});
