import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodePostings, encodePostings } from "@/lib/postings";
import { fightinWords, topIndices } from "@/lib/stats/fightin-words";
import { gammaP, poissonInterval, rateWithInterval } from "@/lib/stats/poisson";
import { openAnalytics } from "@/test/originals";

const fixture = (name: string) =>
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "src/lib/__fixtures__", name), "utf8"),
  ) as unknown;

describe("postings codec", () => {
  it("round-trips varint pairs, including large ids", () => {
    const pairs: Array<[number, number]> = [
      [0, 1],
      [5, 300],
      [130, 2],
      [70_000, 1],
    ];
    const { docs, counts } = decodePostings(encodePostings(pairs));
    expect(Array.from(docs)).toEqual(pairs.map((p) => p[0]));
    expect(Array.from(counts)).toEqual(pairs.map((p) => p[1]));
  });

  it("decodes every term in analytics.db to its stored cf and df", () => {
    const db = openAnalytics();
    const rows = db.prepare("SELECT cf, df, postings FROM terms").all() as Array<{
      cf: number;
      df: number;
      postings: Uint8Array;
    }>;
    let bad = 0;
    for (const r of rows) {
      const p = decodePostings(r.postings);
      const cf = p.counts.reduce((a, b) => a + b, 0);
      if (p.docs.length !== r.df || cf !== r.cf) bad++;
    }
    db.close();
    expect(rows.length).toBeGreaterThan(10_000);
    expect(bad).toBe(0);
  });
});

describe("Poisson exact interval", () => {
  const ref = fixture("poisson-ci.json") as Array<{ k: number; lower: number; upper: number }>;

  it("matches SciPy chi-square quantiles", () => {
    for (const { k, lower, upper } of ref) {
      const ci = poissonInterval(k);
      expect(ci.lower).toBeCloseTo(lower, 6);
      expect(Math.abs(ci.upper - upper) / upper).toBeLessThan(1e-8);
      if (k > 0) expect(Math.abs(ci.lower - lower) / lower).toBeLessThan(1e-8);
    }
  });

  it("has a sane regularised gamma", () => {
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(gammaP(3, 0)).toBe(0);
  });

  it("scales to a rate per 10,000 words", () => {
    const r = rateWithInterval(5, 20_000);
    expect(r.rate).toBe(2.5);
    expect(r.lower).toBeLessThan(2.5);
    expect(r.upper).toBeGreaterThan(2.5);
  });
});

describe("Fightin' Words", () => {
  it("is antisymmetric and zero for identical groups", () => {
    const prior = [10, 20, 30];
    const same = fightinWords([1, 2, 3], [1, 2, 3], prior, 100);
    expect(Array.from(same.delta)).toEqual([0, 0, 0]);
    const ab = fightinWords([5, 0, 1], [1, 4, 2], prior, 100);
    const ba = fightinWords([1, 4, 2], [5, 0, 1], prior, 100);
    for (let i = 0; i < 3; i++) expect(ab.z[i]).toBeCloseTo(-ba.z[i], 12);
    expect(topIndices(ab.z, 1)).toEqual([0]);
  });

  type Case = {
    name: string;
    a: { cycle?: number; speaker?: string };
    b: { cycle?: number; speaker?: string };
    alpha0: number;
    nA: number;
    nB: number;
    terms: Array<{ term: string; yA: number; yB: number; delta: number; z: number }>;
  };
  const cases = fixture("fightin-words.json") as Case[];

  it("reproduces the Python reference values from the analytics index", () => {
    const db = openAnalytics();
    const docs = db
      .prepare(
        "SELECT d.id, d.cycle, s.name AS speaker FROM documents d JOIN speakers s ON s.id = d.speaker_id",
      )
      .all() as Array<{ id: number; cycle: number; speaker: string }>;
    const terms = db
      .prepare("SELECT id, term, cf, postings FROM terms ORDER BY id")
      .all() as Array<{
      id: number;
      term: string;
      cf: number;
      postings: Uint8Array;
    }>;
    db.close();
    const decoded = terms.map((t) => decodePostings(t.postings));
    const prior = terms.map((t) => t.cf);

    const member = (g: Case["a"]) => {
      const m = new Uint8Array(docs.length);
      for (const d of docs) {
        if (g.cycle !== undefined && d.cycle === g.cycle) m[d.id] = 1;
        if (g.speaker !== undefined && d.speaker === g.speaker) m[d.id] = 1;
      }
      return m;
    };
    const counts = (mask: Uint8Array) =>
      decoded.map((p) => {
        let c = 0;
        for (let i = 0; i < p.docs.length; i++) if (mask[p.docs[i]]) c += p.counts[i];
        return c;
      });

    for (const c of cases) {
      const yA = counts(member(c.a));
      const yB = counts(member(c.b));
      const res = fightinWords(yA, yB, prior, c.alpha0);
      expect(res.nA).toBe(c.nA);
      expect(res.nB).toBe(c.nB);
      const index = new Map(terms.map((t, i) => [t.term, i]));
      for (const t of c.terms) {
        const i = index.get(t.term)!;
        expect(yA[i]).toBe(t.yA);
        expect(yB[i]).toBe(t.yB);
        expect(Math.abs(res.delta[i] - t.delta)).toBeLessThan(1e-9);
        expect(Math.abs(res.z[i] - t.z)).toBeLessThan(1e-9);
      }
    }
  });
});
