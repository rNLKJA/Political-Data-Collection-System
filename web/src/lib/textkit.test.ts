import { describe, expect, it } from "vitest";

import {
  cleanDocument,
  conceptRanges,
  countSentences,
  fleschKincaid,
  matchConcept,
  ownerSurname,
  stripStageDirections,
  syllables,
  tokenize,
} from "@/lib/textkit";
import { hasOriginal, openAnalytics, readCsv } from "@/test/originals";

describe("tokenize", () => {
  it("keeps internal apostrophes, normalises curly quotes and drops digits", () => {
    expect(tokenize("We’re in 2024; Julián's plan.").map((t) => t.text)).toEqual([
      "we're",
      "in",
      "julián's",
      "plan",
    ]);
  });
  it("reports offsets into the original text", () => {
    const [t] = tokenize("  Hello");
    expect([t.start, t.end]).toEqual([2, 7]);
  });
});

describe("readability pieces", () => {
  it("counts sentences without splitting on titles or initials", () => {
    expect(countSentences("Mr. Smith went to Washington. He met J.D. Vance! Did he?")).toBe(3);
    expect(countSentences("no punctuation")).toBe(1);
  });
  it("estimates syllables", () => {
    expect(syllables("the")).toBe(1);
    expect(syllables("economy")).toBe(4);
    expect(syllables("made")).toBe(1);
  });
  it("needs 100 words for a grade", () => {
    expect(fleschKincaid("Short text.").grade).toBeNull();
    const long = Array.from({ length: 30 }, () => "The cat sat on the mat today.").join(" ");
    const r = fleschKincaid(long);
    expect(r.words).toBe(210);
    expect(r.sentences).toBe(30);
    expect(r.grade).not.toBeNull();
  });
});

describe("cleanDocument", () => {
  it("drops other speakers' turns and stage directions", () => {
    const content = [
      "THE VICE PRESIDENT: Hello, Nevada. (Applause.)",
      "Thank you.",
      "AUDIENCE MEMBER: We love you!",
      "Still the audience.",
      "THE VICE PRESIDENT: Back to me.",
    ].join("\\n\\n");
    const r = cleanDocument(content, "Kamala Harris");
    expect(r.text).toBe("Hello, Nevada.  \nThank you.\nBack to me.");
    expect(r.droppedLabels).toEqual(["AUDIENCE MEMBER"]);
  });
  it("treats press-release fields as the owner's text", () => {
    expect(cleanDocument("FACT: Something.", "Ted Cruz").text).toBe("FACT: Something.");
  });
  it("derives surnames like the Python helper", () => {
    expect(ownerSurname("Joseph R. Biden, Jr.")).toBe("BIDEN");
    expect(ownerSurname("Donald J. Trump (1st Term)")).toBe("TRUMP");
    expect(ownerSurname("Bill de Blasio")).toBe("BLASIO");
  });
  it("strips bracketed stage directions only", () => {
    expect(stripStageDirections("Yes [crosstalk] (R-OH) (laughter and applause)")).toBe(
      "Yes   (R-OH)  ",
    );
  });
});

describe("matchConcept", () => {
  it("prefers the longest phrase and does not double count", () => {
    const toks = "raise the minimum wage and wages".split(" ");
    expect(matchConcept(toks, ["wage", "wages", "minimum wage"])).toEqual([
      [2, 2],
      [5, 1],
    ]);
  });
  it("needs a capital letter in the source for a capitalised pattern word", () => {
    const text = "Democratic primary voters want democratic values; Democrats agree";
    const toks = tokenize(text);
    const lower = toks.map((t) => t.text);
    const cased = toks.map((t) => text.slice(t.start, t.end));
    const party = ["Democrat", "Democrats", "Democratic"];
    expect(matchConcept(lower, party, cased)).toEqual([
      [0, 1],
      [6, 1],
    ]);
    // Without the source spelling a capitalised pattern word never matches.
    expect(matchConcept(lower, party)).toEqual([]);
    // Lower-case patterns ignore case as before.
    expect(matchConcept(lower, ["voters"], cased)).toEqual([[2, 1]]);
  });
});

describe("conceptRanges", () => {
  it("finds every use of a topic in a snippet and keeps the stored range", () => {
    const s = "… the economy is strong and our economic plan works …";
    const ranges = conceptRanges(s, ["economy", "economic", "economies"], [32, 40]);
    expect(ranges.map(([a, b]) => s.slice(a, b))).toEqual(["economy", "economic"]);
  });
  it("respects capitalised party patterns", () => {
    const s = "the Republican nominee and a republican form of government";
    expect(conceptRanges(s, ["Republican", "Republicans"]).map(([a, b]) => s.slice(a, b))).toEqual([
      "Republican",
    ]);
  });
});

describe.skipIf(!hasOriginal("campaign_documents.csv"))(
  "parity with analytics.db (every de-duplicated document)",
  () => {
    it("recomputes tokens, sentences, syllables and the FK grade exactly", () => {
      const db = openAnalytics();
      const stored = new Map(
        (
          db
            .prepare("SELECT url, tokens, sentences, syllables, fk_grade FROM documents")
            .all() as Array<{
            url: string;
            tokens: number;
            sentences: number;
            syllables: number;
            fk_grade: number | null;
          }>
        ).map((r) => [r.url, r]),
      );
      db.close();
      const seen = new Set<string>();
      const bad: string[] = [];
      for (const row of readCsv("campaign_documents.csv")) {
        if (seen.has(row.Document_Link)) continue;
        seen.add(row.Document_Link);
        const want = stored.get(row.Document_Link);
        const clean = cleanDocument(row.Document_Content, row.Speaker);
        const fk = fleschKincaid(clean.text);
        const ok =
          want &&
          want.tokens === fk.words &&
          want.sentences === fk.sentences &&
          want.syllables === fk.syllables &&
          (want.fk_grade === null
            ? fk.grade === null
            : fk.grade !== null && Math.abs(fk.grade - want.fk_grade) < 1e-9);
        if (!ok) bad.push(row.Document_Link);
      }
      expect(seen.size).toBe(7556);
      expect(bad).toEqual([]);
    });
  },
);
