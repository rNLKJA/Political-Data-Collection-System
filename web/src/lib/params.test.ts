import { describe, expect, it } from "vitest";

import { parseDistinctiveParams, parseExplorerParams, parseTimelineParams } from "@/lib/params";

describe("search parameter parsing", () => {
  it("drops invalid explorer filters instead of failing", () => {
    const p = parseExplorerParams({
      type: "Memo",
      from: "2016-13",
      page: "-4",
      speaker: "Bad Slug!",
    });
    expect(p).toEqual({
      speaker: undefined,
      type: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      page: 1,
    });
  });

  it("keeps valid explorer filters", () => {
    const p = parseExplorerParams({
      type: "Statement",
      from: "2016-01",
      to: "2020-12",
      page: ["3", "9"],
      q: " jobs ",
    });
    expect(p).toMatchObject({
      type: "Statement",
      from: "2016-01",
      to: "2020-12",
      page: 3,
      q: "jobs",
    });
  });

  it("defaults the distinctive-words comparison to two cycles", () => {
    expect(parseDistinctiveParams({})).toMatchObject({
      a: "cycle-2016",
      b: "cycle-2024",
      prior: 10_000,
    });
    expect(parseDistinctiveParams({ prior: "7" }).prior).toBe(10_000);
    expect(parseDistinctiveParams({ a: "ted-cruz@2016", b: "rest" })).toMatchObject({
      a: "ted-cruz@2016",
      b: "rest",
    });
    // "everyone else" only makes sense for group B
    expect(parseDistinctiveParams({ a: "rest" }).a).toBe("cycle-2016");
  });

  it("caps the timeline at three speakers", () => {
    const p = parseTimelineParams({ speakers: "a,b,c,d", by: "decade" });
    expect(p.speakers).toEqual(["a", "b", "c"]);
    expect(p.by).toBe("quarter");
  });

  it("drops repeated timeline speakers", () => {
    const p = parseTimelineParams({ speakers: "bernie-sanders,bernie-sanders,ted-cruz" });
    expect(p.speakers).toEqual(["bernie-sanders", "ted-cruz"]);
  });
});
