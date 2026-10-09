import { describe, expect, it } from "vitest";

import { words } from "@/lib/textkit";

import { CODEBOOK, isTopicId, TOPIC_IDS } from "./codebook";
import { EVAL_ITEMS, GOLD_META, SAMPLE_META } from "./data";
import { comparePaired, scoreLabeller } from "./evaluation";
import { KEYWORDS, keywordLabel, keywordMatches } from "./keyword-rules";
import { hashString, MOCK_ACCURACY, mockLabel } from "./mock-labeller";

describe("codebook", () => {
  it("has one entry per topic id, a CAP-style list of 21 topics plus none", () => {
    expect(CODEBOOK.map((t) => t.id)).toEqual([...TOPIC_IDS]);
    expect(TOPIC_IDS).toHaveLength(22);
    expect(new Set(CODEBOOK.map((t) => t.cap)).size).toBe(22);
    expect(isTopicId("health")).toBe(true);
    expect(isTopicId("sport")).toBe(false);
  });

  it("gives every policy topic keywords, and none of them twice", () => {
    const seen = new Map<string, string>();
    for (const [topic, list] of Object.entries(KEYWORDS)) {
      expect(list.length, topic).toBeGreaterThan(3);
      for (const p of list) {
        const key = words(p).join(" ");
        expect(seen.get(key), `"${p}" in ${topic} and ${seen.get(key)}`).toBeUndefined();
        seen.set(key, topic);
      }
    }
  });
});

describe("keyword rules", () => {
  it("prefers the longest phrase and does not double count its words", () => {
    const m = keywordMatches("We will lower drug prices and protect health care.");
    expect(m.map((x) => x.phrase)).toEqual(["drug prices", "health care"]);
    expect(keywordLabel("Our health care plan").topic).toBe("health");
  });

  it("counts matches per topic and breaks ties by the first match", () => {
    expect(keywordLabel("Tariffs and trade deals, not troops.").topic).toBe("foreign-trade");
    expect(keywordLabel("Troops first, then tariffs.").topic).toBe("defence");
    expect(keywordLabel("Thank you, Iowa!").topic).toBe("none");
    expect(keywordLabel("Thank you, Iowa!").matches).toEqual([]);
  });

  it("splits hyphenated words like the site's tokeniser", () => {
    expect(keywordLabel("pre-existing conditions are covered").topic).toBe("health");
  });
});

describe("evaluation set", () => {
  it("has 120 excerpts, 40 per cycle, each one sentence within the quotation limit", () => {
    expect(EVAL_ITEMS).toHaveLength(120);
    for (const c of [2016, 2020, 2024]) {
      expect(EVAL_ITEMS.filter((i) => i.cycle === c)).toHaveLength(SAMPLE_META.perCycle);
    }
    expect(new Set(EVAL_ITEMS.map((i) => i.id)).size).toBe(120);
    for (const it of EVAL_ITEMS) {
      expect(it.words).toBe(words(it.excerpt).length);
      expect(it.words).toBeGreaterThanOrEqual(12);
      expect(it.words).toBeLessThanOrEqual(25);
      expect(it.url).toMatch(/^https:\/\/www\.presidency\.ucsb\.edu\//);
    }
  });

  it("labels every excerpt with a codebook topic and says who labelled it", () => {
    expect(EVAL_ITEMS.every((i) => isTopicId(i.gold))).toBe(true);
    expect(GOLD_META.annotator.length).toBeGreaterThan(40);
    expect(["draft", "reviewed"]).toContain(GOLD_META.status);
  });
});

describe("scoring", () => {
  const gold = EVAL_ITEMS.map((i) => i.gold);

  it("scores perfect labels as perfect", () => {
    const s = scoreLabeller(gold, gold, { resamples: 200 });
    expect(s.agreement.estimate).toBe(1);
    expect(s.kappa.estimate).toBe(1);
    expect(s.policyAgreement.estimate).toBe(1);
    expect(s.noneRate.labeller).toBe(s.noneRate.gold);
  });

  it("reports the keyword baseline with intervals that contain the estimate", () => {
    const pred = EVAL_ITEMS.map((i) => keywordLabel(i.excerpt).topic);
    const s = scoreLabeller(gold, pred, { resamples: 1000 });
    expect(s.n).toBe(120);
    for (const ci of [s.agreement, s.kappa, s.policyAgreement]) {
      expect(ci.lower).toBeLessThanOrEqual(ci.estimate);
      expect(ci.upper).toBeGreaterThanOrEqual(ci.estimate);
    }
    expect(s.kappa.estimate).toBeLessThan(s.agreement.estimate);
  });

  it("pairs two labellers on the same excerpts", () => {
    const pred = EVAL_ITEMS.map((i) => keywordLabel(i.excerpt).topic);
    const same = comparePaired(gold, pred, pred, { resamples: 200 });
    expect(same.agreementDiff.estimate).toBe(0);
    expect(same.mcnemar.exactP).toBe(1);
    expect(same.between.agreement).toBe(1);
    const vsPerfect = comparePaired(gold, gold, pred, { resamples: 500 });
    expect(vsPerfect.agreementDiff.estimate).toBeGreaterThan(0);
    expect(vsPerfect.mcnemar.c).toBe(0);
    expect(vsPerfect.mcnemar.exactP).toBeLessThan(0.001);
  });
});

describe("simulated labeller", () => {
  it("is deterministic per seed and close to its nominal accuracy", () => {
    const a = EVAL_ITEMS.map((i) => mockLabel(i, 1));
    expect(EVAL_ITEMS.map((i) => mockLabel(i, 1))).toEqual(a);
    expect(EVAL_ITEMS.map((i) => mockLabel(i, 2))).not.toEqual(a);
    const acc = a.filter((l, i) => l === EVAL_ITEMS[i].gold).length / a.length;
    expect(Math.abs(acc - MOCK_ACCURACY)).toBeLessThan(0.15);
    expect(a.every(isTopicId)).toBe(true);
    expect(hashString("T001")).toBe(hashString("T001"));
  });
});
