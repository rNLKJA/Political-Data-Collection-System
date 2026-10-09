import { describe, expect, it } from "vitest";

import { debateSlugs } from "@/lib/debate-slug";
import { openAnalytics } from "@/test/originals";

describe("debateSlugs", () => {
  it("builds date-title slugs and numbers repeats in order", () => {
    expect(
      debateSlugs([
        { date: "2000-01-10", title: "Debate at Calvin College" },
        { date: "2000-01-10", title: "Debate at Calvin College" },
        { date: "2000-01-11", title: "Debate at Calvin College" },
      ]),
    ).toEqual([
      "2000-01-10-debate-at-calvin-college",
      "2000-01-10-debate-at-calvin-college-2",
      "2000-01-11-debate-at-calvin-college",
    ]);
  });

  it("gives every transcript in the analytics database its own slug", () => {
    const db = openAnalytics();
    const rows = db.prepare("SELECT date, title FROM debates ORDER BY date, id").all() as {
      date: string;
      title: string;
    }[];
    db.close();
    const slugs = debateSlugs(rows);
    expect(rows).toHaveLength(179);
    expect(new Set(slugs).size).toBe(rows.length);
  });
});
