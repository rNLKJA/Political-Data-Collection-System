/**
 * Regression checks on the built analytics database (scripts/build_analytics.py):
 * who counts as a debate candidate, and what the topic snippets may quote.
 */
import { afterAll, describe, expect, it } from "vitest";

import { openAnalytics } from "@/test/originals";

const db = openAnalytics();
afterAll(() => db.close());

const rows = <T>(sql: string, ...params: (string | number)[]) =>
  db.prepare(sql).all(...params) as T[];

describe("debate roles", () => {
  it("does not count people heard only in clips or questions as candidates", () => {
    // [date, APP page (unique), speaker key]
    const wrong = [
      ["2023-12-06", "debate-tuscaloosa-alabama", "TRUMP"], // did not attend; one video clip
      ["2023-08-23", "debate-milwaukee-wisconsin", "BIDEN"], // Republican debate; one clip
      ["2007-11-28", "progress-energy-center", "CLINTON"], // inside a campaign video
      ["1999-12-19", "meet-the-press", "MCCAIN"], // Democratic debate; a videotape
      ["2008-04-16", "debate-philadelphia", "MCCAIN"], // Democratic debate; pre-recorded
      ["2015-08-06", "republican-candidates-debate-cleveland-ohio", "PERRY"], // main stage clip
      ["2015-08-06", "republican-candidates-debate-cleveland-ohio", "FIORINA"],
    ];
    for (const [date, page, key] of wrong) {
      const debates = rows<{ id: number }>(
        "SELECT id FROM debates WHERE date = ? AND url LIKE ?",
        date,
        `%/documents/%${page}%`,
      );
      expect(debates, `${date} ${page}`).toHaveLength(1);
      // The speaker is either gone (folded into "Recorded clips") or not a candidate.
      const r = rows<{ role: string }>(
        "SELECT role FROM debate_speakers WHERE debate_id = ? AND key = ?",
        debates[0].id,
        key,
      );
      expect(
        r.every((x) => x.role !== "candidate"),
        `${date} ${key}`,
      ).toBe(true);
    }
  });

  it("lists the people on stage", () => {
    const cands = (date: string, page: string) =>
      rows<{ display: string }>(
        `SELECT s.display FROM debate_speakers s JOIN debates d ON d.id = s.debate_id
          WHERE d.date = ? AND d.url LIKE ? AND s.role = 'candidate' ORDER BY s.display`,
        date,
        `%/documents/%${page}%`,
      ).map((r) => r.display);
    expect(cands("2023-12-06", "debate-tuscaloosa-alabama")).toEqual([
      "Christie",
      "DeSantis",
      "Haley",
      "Ramaswamy",
    ]);
    expect(cands("2023-08-23", "debate-milwaukee-wisconsin")).toHaveLength(8);
    expect(cands("2015-08-06", "republican-candidates-debate-cleveland-ohio")).toHaveLength(10);
    expect(cands("2015-08-06", "undercard-debate-cleveland-ohio")).toContain("Perry");
  });

  it("names every candidate in the Participants block when the page has one", () => {
    const r = rows<{ key: string; participants: string }>(
      `SELECT s.key, d.participants FROM debate_speakers s JOIN debates d ON d.id = s.debate_id
        WHERE s.role = 'candidate' AND d.participants IS NOT NULL`,
    );
    expect(r.length).toBeGreaterThan(50);
    const missing = r.filter(
      (x) =>
        !x.participants
          .toUpperCase()
          .replace(/[^A-Z']+/g, " ")
          .split(" ")
          .includes(x.key),
    );
    expect(missing).toEqual([]);
  });

  it("keeps n_candidates in step with the speaker table", () => {
    const r = rows<{ n: number; c: number }>(
      `SELECT d.n_candidates AS n,
              (SELECT COUNT(*) FROM debate_speakers s
                WHERE s.debate_id = d.id AND s.role = 'candidate') AS c
         FROM debates d`,
    );
    expect(r.filter((x) => x.n !== x.c)).toEqual([]);
  });
});

describe("topic snippets", () => {
  it("never quote charged words", () => {
    const r = rows<{ snippet: string }>(
      `SELECT snippet FROM concept_snippets
        WHERE lower(snippet) LIKE '%racis%' OR lower(snippet) LIKE '%hitler%'
           OR lower(snippet) LIKE '%liar%' OR lower(snippet) LIKE '%fascis%'
           OR lower(snippet) LIKE '%crook%'`,
    );
    expect(r).toEqual([]);
  });

  it("stay within 25 words", () => {
    const r = rows<{ snippet: string }>("SELECT snippet FROM concept_snippets");
    expect(r.length).toBeGreaterThan(3000);
    const words = (s: string) => s.replace(/…/g, "").trim().split(/\s+/).length;
    expect(r.filter((x) => words(x.snippet) > 25)).toEqual([]);
  });
});
