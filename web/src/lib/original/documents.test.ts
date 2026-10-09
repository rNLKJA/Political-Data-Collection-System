import { describe, expect, it } from "vitest";

import {
  classifyDocumentType,
  extractLocation,
  joinParagraphs,
  splitStoredContent,
  wordCount,
} from "@/lib/original/documents";
import { hasOriginal, readCsv } from "@/test/originals";

describe("classifyDocumentType", () => {
  it("applies the rules in the notebook's order", () => {
    expect(classifyDocumentType("Statement on the Debate")).toBe("Debate");
    expect(classifyDocumentType("Remarks at a Rally")).toBe("Speech/Remarks");
    expect(classifyDocumentType("Interview with a Newspaper")).toBe("Interview");
    expect(classifyDocumentType("Statement by the Campaign")).toBe("Statement");
    expect(classifyDocumentType("Address to the Convention")).toBe("Address");
    expect(classifyDocumentType("Press Release - New Ad")).toBe("Document");
  });
});

describe("extractLocation", () => {
  it("captures one capitalised word because of the doubled escape", () => {
    expect(extractLocation("Remarks at a Campaign Event in Las Vegas, Nevada")).toBe("Las");
    expect(extractLocation("Remarks in Pittsburgh, Pennsylvania")).toBe("Pittsburgh");
    expect(extractLocation("Remarks at the Economic Club")).toBe("Economic");
    expect(extractLocation("press release")).toBe("");
  });
  it("matches 'in' inside other words, as the original regex does", () => {
    expect(extractLocation("Statement on Kevin McCarthy")).toBe("Mc");
  });
});

describe("paragraph join and word count", () => {
  it("joins with a literal backslash-n pair and counts words before joining", () => {
    const parts = ["First paragraph here.", "Second one."];
    const stored = joinParagraphs(parts);
    expect(stored).toBe("First paragraph here.\\n\\nSecond one.");
    expect(splitStoredContent(stored)).toEqual(parts);
    expect(wordCount(parts)).toBe(5);
  });
});

describe.skipIf(!hasOriginal("campaign_documents.csv"))(
  "parity with campaign_documents.csv (all 7,582 rows)",
  () => {
    const rows = hasOriginal("campaign_documents.csv") ? readCsv("campaign_documents.csv") : [];

    it("reproduces Document_Type", () => {
      const bad = rows.filter((r) => classifyDocumentType(r.Document_Title) !== r.Document_Type);
      expect(bad.map((r) => r.Document_Link)).toEqual([]);
    });

    it("reproduces Location", () => {
      const bad = rows.filter((r) => extractLocation(r.Document_Title) !== r.Location);
      expect(bad.map((r) => `${r.Document_Title} -> ${r.Location}`)).toEqual([]);
    });

    it("reproduces Word_Count from the stored paragraphs", () => {
      const bad = rows.filter(
        (r) => wordCount(splitStoredContent(r.Document_Content)) !== Number(r.Word_Count),
      );
      expect(bad.map((r) => r.Document_Link)).toEqual([]);
    });

    it("round-trips Document_Content through split and join", () => {
      const bad = rows.filter(
        (r) => joinParagraphs(splitStoredContent(r.Document_Content)) !== r.Document_Content,
      );
      expect(bad.length).toBe(0);
    });
  },
);
