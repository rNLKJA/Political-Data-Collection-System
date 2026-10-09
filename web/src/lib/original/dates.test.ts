import { describe, expect, it } from "vitest";

import {
  fromIsoFormat,
  isoformat,
  normaliseDebateListingDate,
  normaliseDocumentDate,
  parseListingDate,
  strftimeLong,
  strptime,
} from "@/lib/original/dates";
import { hasOriginal, readCsv } from "@/test/originals";

import differential from "../__fixtures__/dates-differential.json";

type Case = [
  input: string,
  iso: number[] | null,
  isoformat: string | null,
  strftime: string | null,
  listing: string | null,
  document: string,
];

describe("Python datetime emulation", () => {
  it("parses ISO timestamps with offsets and keeps local fields", () => {
    const dt = fromIsoFormat("2023-11-08T20:00:00+00:00");
    expect([dt.year, dt.month, dt.day, dt.hour, dt.offsetMicros]).toEqual([2023, 11, 8, 20, 0]);
    expect(isoformat(dt)).toBe("2023-11-08T20:00:00+00:00");
  });

  it("rejects impossible dates like Python", () => {
    expect(() => fromIsoFormat("2023-02-30")).toThrow();
    expect(() => strptime("February 30, 2024", "%B %d, %Y")).toThrow();
  });

  it("matches month names case-insensitively and accepts unpadded days", () => {
    expect(isoformat(strptime("september 5, 2024", "%B %d, %Y"))).toBe("2024-09-05T00:00:00");
  });
});

describe("differential check against CPython 3.11 (scripts/date_fixtures.py)", () => {
  const cases = differential as unknown as Case[];
  const fields = (input: string) => {
    try {
      const d = fromIsoFormat(input);
      return [d.year, d.month, d.day, d.hour, d.minute, d.second, d.microsecond, d.offsetMicros];
    } catch {
      return null;
    }
  };

  it("covers valid and invalid strings", () => {
    expect(cases.length).toBeGreaterThan(2000);
    expect(cases.filter((c) => c[1]).length).toBeGreaterThan(500);
  });

  it("datetime.fromisoformat accepts and rejects exactly the same strings", () => {
    const bad = cases.filter((c) => JSON.stringify(fields(c[0])) !== JSON.stringify(c[1]));
    expect(bad.map((c) => [c[0], c[1], fields(c[0])])).toEqual([]);
  });

  it("isoformat() and strftime('%B %d, %Y') agree", () => {
    const bad = cases
      .filter((c) => c[1])
      .filter((c) => {
        const d = fromIsoFormat(c[0]);
        return isoformat(d) !== c[2] || strftimeLong(d) !== c[3];
      });
    expect(bad.map((c) => c[0])).toEqual([]);
  });

  it("the notebook's two date functions agree on every string", () => {
    const bad = cases.filter(
      (c) => parseListingDate(c[0]) !== c[4] || normaliseDocumentDate(c[0]) !== c[5],
    );
    expect(
      bad.map((c) => [c[0], c[4], parseListingDate(c[0]), c[5], normaliseDocumentDate(c[0])]),
    ).toEqual([]);
  });
});

describe("parseListingDate (documents.ipynb phase 1)", () => {
  it("formats ISO content as '%B %d, %Y'", () => {
    expect(parseListingDate("2024-09-29T00:00:00+00:00")).toBe("September 29, 2024");
    expect(parseListingDate("2024-10-01T00:00:00Z")).toBe("October 01, 2024");
    expect(parseListingDate("2024-10-01")).toBe("October 01, 2024");
  });
  it("returns the stripped input when it cannot parse, and null for empty", () => {
    expect(parseListingDate("  sometime in 2016 ")).toBe("sometime in 2016");
    expect(parseListingDate("")).toBeNull();
  });
});

describe("normaliseDocumentDate (documents.ipynb phase 2)", () => {
  it("keeps aware ISO timestamps", () => {
    expect(normaliseDocumentDate("2024-09-29T00:00:00+00:00")).toBe("2024-09-29T00:00:00+00:00");
  });
  it("tries the four formats in order", () => {
    expect(normaliseDocumentDate("September 29, 2024")).toBe("2024-09-29T00:00:00");
    expect(normaliseDocumentDate("09/29/2024")).toBe("2024-09-29T00:00:00");
    expect(normaliseDocumentDate("2024-09-29")).toBe("2024-09-29T00:00:00");
    expect(normaliseDocumentDate("29 September 2024")).toBe("2024-09-29T00:00:00");
  });
  it("passes through what it cannot parse (including 'Z' timestamps without '+')", () => {
    expect(normaliseDocumentDate("2024-09-29T00:00:00Z")).toBe("2024-09-29T00:00:00Z");
    expect(normaliseDocumentDate("Fall 2016")).toBe("Fall 2016");
    expect(normaliseDocumentDate("")).toBe("");
  });
});

describe.skipIf(!hasOriginal("campaign_documents.csv"))(
  "parity with campaign_documents.csv",
  () => {
    it("Document_Date survives the content-phase parser unchanged for all 7,582 rows", () => {
      const rows = readCsv("campaign_documents.csv");
      expect(rows.length).toBe(7582);
      const bad = rows.filter((r) => normaliseDocumentDate(r.Document_Date) !== r.Document_Date);
      expect(bad.map((r) => r.Document_Link)).toEqual([]);
    });

    it("listing dates round-trip to the Date column", () => {
      const rows = readCsv("campaign_documents.csv");
      const bad = rows.filter((r) => {
        const listing = parseListingDate(r.Document_Date);
        if (!listing) return true;
        const back = strptime(listing, "%B %d, %Y");
        const iso = `${back.year}-${String(back.month).padStart(2, "0")}-${String(back.day).padStart(2, "0")}`;
        return iso !== r.Date;
      });
      expect(bad.length).toBe(0);
    });

    it("matches the notebook's own sample rows in documents_processed_optimized.csv", () => {
      const sample = readCsv("documents_processed_optimized.csv");
      expect(sample.length).toBe(2);
      for (const r of sample) expect(parseListingDate(r.Document_Date)).toBe(r.Date);
    });
  },
);

describe.skipIf(!hasOriginal("debates_data.csv"))("parity with debates_data.csv", () => {
  it("reproduces the listing Date of all 180 rows from the stored ISO timestamps", () => {
    const listing = readCsv("debates_data.csv");
    const processed = readCsv("debates_data_processed.csv");
    const iso = new Map(processed.map((r) => [r.URL, r.Extracted_Date]));
    expect(listing.length).toBe(180);
    const bad = listing.filter(
      (r) => normaliseDebateListingDate(iso.get(r.Debate_Link) ?? null, "") !== r.Date,
    );
    expect(bad).toEqual([]);
  });
});
