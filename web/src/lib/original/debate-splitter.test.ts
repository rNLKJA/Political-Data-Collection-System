import { describe, expect, it } from "vitest";

import { cleanWhitespace, pythonListRepr, splitTranscript } from "@/lib/original/debate-splitter";
import { hasOriginal, readCsv } from "@/test/originals";

describe("cleanWhitespace", () => {
  it("strips lines, trims blank edges and collapses 3+ newlines", () => {
    expect(cleanWhitespace("\n\n  a  \r\n\n\n\n b \n\n")).toBe("a\n\nb");
  });
});

describe("splitTranscript (handcrafted)", () => {
  const html = [
    "<p><b>PARTICIPANTS:</b><br/>Candidate A (Party X) and<br/>Candidate B (Party Y)</p>",
    "<p><b>MODERATORS:</b><br/>Host One; Host Two.</p>",
    "<p><b>ONE:</b> Good evening.</p>",
    "<p><strong>A</strong>: Thank you &amp; hello.</p>",
  ].join("\n");

  it("splits participants on <br> and keeps the trailing 'and' like the original", () => {
    const r = splitTranscript(html);
    expect(r.participantsList).toEqual(["Candidate A (Party X) and", "Candidate B (Party Y)"]);
    expect(r.participants).toBe("Candidate A (Party X) and; Candidate B (Party Y)");
  });

  it("falls back to semicolons and strips list punctuation", () => {
    expect(splitTranscript(html).moderatorsList).toEqual(["Host One", "Host Two"]);
  });

  it("joins every text node on its own line", () => {
    expect(splitTranscript(html).text).toBe(
      [
        "PARTICIPANTS:",
        "Candidate A (Party X) and",
        "Candidate B (Party Y)",
        "MODERATORS:",
        "Host One; Host Two.",
        "ONE:",
        "Good evening.",
        "A",
        ": Thank you & hello.",
      ].join("\n"),
    );
  });

  it("returns empty fields when there is no label block", () => {
    const r = splitTranscript("<p>Just text.</p>");
    expect(r.participants).toBe("");
    expect(r.moderatorsList).toEqual([]);
    expect(r.text).toBe("Just text.");
  });

  it("formats lists like Python's str(list)", () => {
    expect(pythonListRepr(["a", "O'Donnell (CBS)"])).toBe(`['a', "O'Donnell (CBS)"]`);
    // repr() escapes characters that are not printable, and both quotes
    expect(pythonListRepr(["C\u00a0D", "soft\u00adhyphen", "tab\there", "a'b\"c"])).toBe(
      String.raw`['C\xa0D', 'soft\xadhyphen', 'tab\there', 'a\'b"c']`,
    );
    expect(pythonListRepr(["zero\u200bwidth", "line\u2028sep", "\u{e000}", "back\\slash"])).toBe(
      String.raw`['zero\u200bwidth', 'line\u2028sep', '\ue000', 'back\\slash']`,
    );
  });
});

describe.skipIf(!hasOriginal("debates_data_processed.csv"))(
  "parity with debates_data_processed.csv (all 179 transcripts)",
  () => {
    const rows = hasOriginal("debates_data_processed.csv")
      ? readCsv("debates_data_processed.csv")
      : [];

    it("has the expected number of transcripts", () => {
      expect(rows.length).toBe(179);
    });

    it("reproduces Participants, Moderators, their lists and the plain text exactly", () => {
      const mismatches: string[] = [];
      for (const row of rows) {
        const r = splitTranscript(row.Debate_Content_HTML);
        const check = (field: string, got: string, want: string) => {
          if (got !== want) mismatches.push(`${row.URL} :: ${field}`);
        };
        check("Participants", r.participants, row.Participants);
        check("Moderators", r.moderators, row.Moderators);
        check(
          "Participants_List",
          r.participantsList.length ? pythonListRepr(r.participantsList) : "[]",
          row.Participants_List || "[]",
        );
        check(
          "Moderators_List",
          r.moderatorsList.length ? pythonListRepr(r.moderatorsList) : "[]",
          row.Moderators_List || "[]",
        );
        check("Debate_Content_Text", r.text, row.Debate_Content_Text);
      }
      expect(mismatches).toEqual([]);
    });
  },
);
