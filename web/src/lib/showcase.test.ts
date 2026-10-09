import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import media from "@/data/showcase-media.json";

import { clockTime, JOURNEYS, SCREENS, type ShowcaseMedia } from "./showcase";

const WEB = path.resolve(import.meta.dirname, "..", "..");
const ROOT = path.resolve(WEB, "..");
const M = media as ShowcaseMedia;
const MB = 1024 * 1024;

const publicFile = (url: string) => path.join(WEB, "public", url.replace(/^\//, ""));
const size = (file: string) => fs.statSync(file).size;

describe("showcase definitions", () => {
  it("gives every journey a poster step and distinct slugs", () => {
    expect(new Set(JOURNEYS.map((j) => j.slug)).size).toBe(JOURNEYS.length);
    for (const j of JOURNEYS) {
      expect(j.posterStep).toBeGreaterThanOrEqual(1);
      expect(j.posterStep).toBeLessThanOrEqual(j.steps.length);
    }
  });

  it("names screenshots in order with unique files", () => {
    const files = SCREENS.map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
    expect([...files].sort()).toEqual(files);
    for (const s of SCREENS) expect(s.file).toMatch(/^\d{2}-[a-z0-9-]+$/);
  });

  it("formats clock times", () => {
    expect(clockTime(0)).toBe("0:00");
    expect(clockTime(7.9)).toBe("0:07");
    expect(clockTime(62)).toBe("1:02");
  });
});

describe("showcase media", () => {
  it("has a recording for every journey, with every step timed in order", () => {
    for (const j of JOURNEYS) {
      const m = M.journeys[j.slug];
      expect(m, j.slug).toBeDefined();
      expect(m.steps.map((s) => s.step)).toEqual(j.steps.map((_, k) => k + 1));
      const times = m.steps.map((s) => s.atS);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(times[times.length - 1]).toBeLessThan(m.durationS);
    }
  });

  it("keeps the committed files within their size budgets", () => {
    for (const j of JOURNEYS) {
      const m = M.journeys[j.slug];
      const mp4 = publicFile(m.mp4);
      expect(size(mp4)).toBe(m.mp4Bytes);
      expect(m.mp4Bytes).toBeLessThanOrEqual(8 * MB);
      expect(size(path.join(ROOT, m.gif))).toBeLessThanOrEqual(8 * MB);
      expect(fs.existsSync(publicFile(m.poster))).toBe(true);
      const vtt = fs.readFileSync(publicFile(m.vtt), "utf8");
      expect(vtt.startsWith("WEBVTT")).toBe(true);
      // one cue per step, carrying the step's caption
      for (const text of j.steps) expect(vtt).toContain(text);
    }
    for (const s of SCREENS) {
      const m = M.screens.find((x) => x.file === s.file);
      expect(m, s.file).toBeDefined();
      expect(size(path.join(ROOT, m!.png))).toBeLessThan(600 * 1024);
      expect(fs.existsSync(publicFile(m!.webp))).toBe(true);
      const desktop = s.viewport === "desktop";
      expect([m!.docsWidth, m!.docsHeight]).toEqual(desktop ? [1440, 900] : [390, 844]);
    }
  });
});

describe("README walkthrough", () => {
  it("lists every recorded caption, in order", () => {
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8").replace(/\s+/g, " ");
    for (const j of JOURNEYS) {
      let from = readme.indexOf(`**${j.title}**`);
      expect(from, j.title).toBeGreaterThanOrEqual(0);
      for (const text of j.steps) {
        const at = readme.indexOf(text, from);
        expect(at, text).toBeGreaterThan(from);
        from = at;
      }
    }
  });
});
