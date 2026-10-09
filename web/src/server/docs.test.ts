import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { decisionSlug, firstTable, headingId, resolveDocHref, splitTitle } from "@/lib/docs";
import { EVAL_ITEMS } from "@/lib/topics/data";
import { scoreLabeller } from "@/lib/topics/evaluation";
import { keywordLabel } from "@/lib/topics/keyword-rules";

vi.mock("server-only", () => ({}));
const { contentDir, getDecision, getModelCard, listDecisions } = await import("./docs");

const docsDir = path.join(process.cwd(), "..", "docs");

describe("docs mirrored into web/content", () => {
  it.runIf(existsSync(docsDir))("are identical to docs/ (run pnpm sync:docs)", () => {
    const pairs = [
      "model-card.md",
      ...readdirSync(path.join(docsDir, "decisions"))
        .filter((f) => /^DR-\d{3}-.+\.md$/.test(f))
        .map((f) => `decisions/${f}`),
    ];
    for (const f of pairs) {
      expect(readFileSync(path.join(contentDir(), f), "utf8"), f).toBe(
        readFileSync(path.join(docsDir, f), "utf8"),
      );
    }
    expect(readdirSync(path.join(contentDir(), "decisions")).length).toBe(pairs.length - 1);
  });

  it("parses every decision record in the house format", () => {
    const records = listDecisions();
    expect(records.map((r) => r.id)).toEqual(["DR-001", "DR-002", "DR-003", "DR-004"]);
    const sections = [
      "## Context",
      "## Decision",
      "## Options considered",
      "## Why",
      "## What happened",
      "## What I'd change",
    ];
    for (const r of records) {
      expect(r.decision.length, r.id).toBeGreaterThan(20);
      expect(r.status, r.id).toBe("Accepted");
      expect(r.decided, r.id).not.toBe("");
      expect(r.recorded, r.id).not.toBe("");
      // the decision is stated first, before any section
      expect(r.body.indexOf("**Decision:**"), r.id).toBe(0);
      let at = -1;
      for (const s of sections) {
        const i = r.body.indexOf(`\n${s}\n`);
        expect(i, `${r.id} ${s}`).toBeGreaterThan(at);
        at = i;
      }
      // house style: no em dashes, and no claim of formal compliance
      expect(r.body).not.toMatch(/—/);
      expect(r.body).not.toMatch(/\bcompliant\b/i);
      expect(getDecision(r.slug)?.id).toBe(r.id);
    }
    expect(getDecision("nope")).toBeUndefined();
  });

  it("keeps the model card's baseline numbers in step with the computed scores", () => {
    const card = getModelCard();
    expect(card.title).toBe("Model card: policy-topic labellers");
    const s = scoreLabeller(
      EVAL_ITEMS.map((i) => i.gold),
      EVAL_ITEMS.map((i) => keywordLabel(i.excerpt).topic),
    );
    const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
    const squashed = card.body.replace(/ {2,}/g, " ");
    expect(squashed).toContain(
      `| ${pct(s.agreement.estimate)} (${pct(s.agreement.lower)} to ${pct(s.agreement.upper)})`,
    );
    expect(squashed).toContain(
      `| ${s.kappa.estimate.toFixed(2)} (${s.kappa.lower.toFixed(2)} to ${s.kappa.upper.toFixed(2)})`,
    );
    expect(squashed).toContain(
      `| ${pct(s.policyAgreement.estimate, 0)} (${pct(s.policyAgreement.lower, 0)} to ${pct(s.policyAgreement.upper, 0)})`,
    );
    expect(card.body).not.toMatch(/—/);
    expect(card.body).not.toMatch(/\bcompliant\b/i);
  });
});

describe("doc helpers", () => {
  it("splits titles and reads the first table", () => {
    expect(splitTitle("# Hello\n\nBody")).toEqual({ title: "Hello", body: "Body" });
    expect(splitTitle("No title")).toEqual({ title: "", body: "No title" });
    expect(firstTable("x\n\n| A | B |\n| - | - |\n| 1 | two |\n")).toEqual({ A: "1", B: "two" });
    expect(firstTable("no table")).toEqual({});
  });

  it("maps GitHub-relative links onto site routes", () => {
    expect(resolveDocHref("../model-card.md#evaluation")).toBe("/methods/model-card#evaluation");
    expect(resolveDocHref("decisions/DR-004-llm-topic-labels-vs-keyword-rules.md")).toBe(
      "/methods/decisions/dr-004-llm-topic-labels-vs-keyword-rules",
    );
    expect(resolveDocHref("https://example.org/x.md")).toBe("https://example.org/x.md");
    expect(resolveDocHref("/methods")).toBe("/methods");
    expect(resolveDocHref("https://campaign-text-lab.vercel.app/methods#ai-use")).toBe(
      "/methods#ai-use",
    );
    expect(resolveDocHref("other.txt")).toBe("other.txt");
    expect(decisionSlug("DR-002-x.md")).toBe("dr-002-x");
    expect(headingId("What I'd change")).toBe("what-id-change");
  });
});
