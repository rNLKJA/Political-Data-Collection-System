/**
 * The showcase tour: key-feature screenshots and three recorded walkthroughs.
 * Every journey also asserts what it shows, so the tour doubles as an
 * end-to-end test of the site.
 *
 * Raw output goes to web/.showcase/ (ignored by git); `pnpm showcase:media`
 * turns it into the PNGs, GIFs, MP4s, posters and captions that are committed.
 *
 * No real API key is ever used. The AI walkthrough types a placeholder key and
 * answers the provider request inside the browser with a mocked response,
 * labelled on screen as such; nothing leaves the machine.
 */
import fs from "node:fs";
import path from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { journey, MOCK_NOTICE, SCREENS, type Journey, type Screen } from "../src/lib/showcase";
import { overlayScript, RAW_SCREEN_DIR, RAW_VIDEO_DIR, Tour } from "./showcase-helpers";

test.describe.configure({ mode: "serial" });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const VIDEO = { width: 1280, height: 800 };

/** Not a key: a visible placeholder. The request it would sign is answered locally. */
const PLACEHOLDER_KEY = "sk-ant-showcase-placeholder-not-a-real-key";
const BADGE = `${MOCK_NOTICE} · no API call made`;

const CHICAGO_1960 = /^Presidential Debate in Chicago, 26 Sep 1960/;
const PHILADELPHIA_2024 = /^Presidential Debate in Philadelphia, Pennsylvania, 10 Sep 2024/;

// ---------------------------------------------------------------------------
// The mocked provider: deterministic labels, close to gold but not equal to it.

const GOLD = (
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "data", "topic-gold.json"), "utf8"),
  ) as { labels: Record<string, string> }
).labels;

/** FNV-1a, so each excerpt id maps to the same mocked label on every run. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const MOCK_SALT = "showcase-2026";

/** Whether the mocked answer for an excerpt departs from its gold label (about one in five). */
function mockedWrong(id: string): boolean {
  return hash(`${MOCK_SALT}:${id}`) % 100 >= 78;
}

/** The mocked answer for one excerpt: its gold label, or another topic when `mockedWrong`. */
function mockTopic(id: string, topics: readonly string[]): string {
  const gold = GOLD[id];
  if (!mockedWrong(id)) return gold;
  const others = topics.filter((t) => t !== gold);
  return others[hash(`${MOCK_SALT}:${id}`) % others.length];
}

async function mockAnthropic(context: BrowserContext) {
  await context.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = req.postDataJSON() as {
      model: string;
      messages: { content: string }[];
      output_config: {
        format: {
          schema: {
            properties: { labels: { items: { properties: { topic: { enum: string[] } } } } };
          };
        };
      };
    };
    // The key header must be present (the app sends the visitor's key only to the provider).
    expect(req.headers()["x-api-key"]).toBe(PLACEHOLDER_KEY);
    const user = body.messages[0].content;
    const ids = [...user.matchAll(/^\[(T\d+)\]/gm)].map((m) => m[1]);
    const topics = body.output_config.format.schema.properties.labels.items.properties.topic.enum;
    const labels = ids.map((id) => ({ id, topic: mockTopic(id, topics) }));
    await new Promise((r) => setTimeout(r, 650));
    return route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify({
        id: `msg_mock_${ids[0]}`,
        type: "message",
        role: "assistant",
        model: body.model,
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ labels }) }],
        usage: { input_tokens: 1450 + Math.round(user.length / 4), output_tokens: 14 * ids.length },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Shared steps

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Scroll so an element sits just below the sticky header, without animation. */
async function jumpTo(page: Page, selector: string, offset = 80) {
  await page
    .locator(selector)
    .first()
    .evaluate((el, off) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off });
    }, offset);
  await page.waitForTimeout(300);
}

/** Open AI settings from the evaluation panel (its button comes before the inline link). */
async function openAiSettings(page: Page, tour?: Tour) {
  const open = page.getByRole("button", { name: "AI settings", exact: true }).first();
  if (tour) await tour.click(open);
  else await open.click();
  const dialog = page.getByRole("dialog", { name: "AI settings" });
  await expect(dialog).toBeVisible();
  const keyInput = dialog.getByLabel("Your Anthropic API key");
  return { dialog, keyInput };
}

// ---------------------------------------------------------------------------
// Screenshots

async function screenContext(browser: Browser, s: Pick<Screen, "theme" | "viewport">) {
  return browser.newContext({
    viewport: s.viewport === "mobile" ? MOBILE : DESKTOP,
    deviceScaleFactor: s.viewport === "mobile" ? 2 : 1,
    isMobile: s.viewport === "mobile",
    hasTouch: s.viewport === "mobile",
    colorScheme: s.theme,
    reducedMotion: "reduce",
  });
}

function screen(file: string): Screen {
  const s = SCREENS.find((x) => x.file === file);
  if (!s) throw new Error(`Unknown screen ${file}`);
  return s;
}

async function shoot(page: Page, s: Screen) {
  fs.mkdirSync(RAW_SCREEN_DIR, { recursive: true });
  // Stills show no cursor, and the mock notice sits bottom right, clear of the content headings.
  await page.evaluate(() => {
    const cursor = document.getElementById("__sc_cursor");
    if (cursor) cursor.style.display = "none";
    const badge = document.getElementById("__sc_badge");
    if (badge) Object.assign(badge.style, { top: "auto", bottom: "18px" });
  });
  await page.screenshot({ path: path.join(RAW_SCREEN_DIR, `${s.file}.png`) });
}

test.describe("screenshots", () => {
  /** Pages that need no interaction: open, optionally scroll, capture. */
  const simple: { file: string; ready: (page: Page) => Promise<void> }[] = [
    {
      file: "01-landing-light",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1 })).toContainText("read closely");
      },
    },
    {
      file: "02-landing-dark",
      ready: async (page) => {
        await expect(page.locator("html")).toHaveClass(/dark/);
      },
    },
    {
      file: "03-explorer",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      },
    },
    {
      file: "04-distinctive-words",
      ready: async (page) => {
        await expect(page.getByText("More characteristic of Hillary Clinton")).toBeVisible();
        await jumpTo(page, "h2:text('Every word at once')", 110);
      },
    },
    {
      file: "05-word-stability",
      ready: async (page) => {
        await expect(page.locator("#stability-heading")).toBeVisible({ timeout: 60_000 });
        await jumpTo(page, "#stability", 84);
      },
    },
    {
      file: "06-debates",
      ready: async (page) => {
        await page.getByRole("button", { name: "Words per candidate turn" }).click();
        await jumpTo(page, "h2:text('Six decades, four measures')", 110);
      },
    },
    {
      file: "07-debate-turns",
      ready: async (page) => {
        await expect(page.getByRole("heading", { name: "The debate, turn by turn" })).toBeVisible();
        await jumpTo(page, "h2:text('The debate, turn by turn')", 110);
      },
    },
    {
      file: "08-term-timeline",
      ready: async (page) => {
        await expect(page.getByRole("heading", { name: /per 10,000 words, by/ })).toBeVisible();
        await jumpTo(page, "h2:has-text('per 10,000 words, by')", 110);
      },
    },
    {
      file: "09-readability",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await jumpTo(page, "h2:has-text('reading grade in debates')", 250);
      },
    },
    {
      file: "13-methods",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      },
    },
    {
      file: "14-mobile-landing",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      },
    },
    {
      file: "15-mobile-distinctive",
      ready: async (page) => {
        await expect(page.getByText("More characteristic of Hillary Clinton")).toBeVisible();
        await jumpTo(page, "h3:has-text('More characteristic of Hillary Clinton')", 76);
      },
    },
    {
      file: "16-mobile-debate",
      ready: async (page) => {
        await expect(page.locator("html")).toHaveClass(/dark/);
        await jumpTo(page, "h2:text('Share of words')", 76);
      },
    },
  ];

  for (const { file, ready } of simple) {
    test(file, async ({ browser }) => {
      const s = screen(file);
      const context = await screenContext(browser, s);
      const page = await context.newPage();
      await page.goto(s.path);
      await settle(page);
      await ready(page);
      await settle(page);
      await shoot(page, s);
      await context.close();
    });
  }

  test("10-12 BYOK settings, mocked evaluation run and audit log", async ({ browser }) => {
    const context = await screenContext(browser, { theme: "light", viewport: "desktop" });
    await context.addInitScript(overlayScript);
    await mockAnthropic(context);
    const page = await context.newPage();
    await page.goto("/topics");
    await settle(page);

    await jumpTo(page, "h2:text('Run the comparison')", 120);
    const { dialog, keyInput } = await openAiSettings(page);
    await keyInput.fill(PLACEHOLDER_KEY);
    await expect(keyInput).toHaveAttribute("type", "password");
    await page.waitForTimeout(300);
    await shoot(page, screen("10-byok-settings"));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Run with my key" }).click();
    await expect(page.getByRole("heading", { name: /^Results on 40 excerpts/ })).toBeVisible();
    await expect(page.getByText("AI-generated").first()).toBeVisible();
    await page.evaluate(
      (t) =>
        (
          window as unknown as { __showcase: { badge: (t: string | null) => void } }
        ).__showcase.badge(t),
      BADGE,
    );
    await jumpTo(page, "section[aria-labelledby='run-results']", 84);
    await shoot(page, screen("11-topic-evaluation"));

    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText(/accepted/i).first()).toBeVisible();
    await page.goto("/ai-log");
    await settle(page);
    await expect(page.getByText(/claude-haiku-4-5/).first()).toBeVisible();
    await shoot(page, screen("12-ai-audit-log"));
    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Recorded walkthroughs

async function record(
  browser: Browser,
  j: Journey,
  run: (page: Page, tour: Tour, context: BrowserContext) => Promise<void>,
) {
  fs.mkdirSync(RAW_VIDEO_DIR, { recursive: true });
  const context = await browser.newContext({
    viewport: VIDEO,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    recordVideo: { dir: path.join(RAW_VIDEO_DIR, "tmp"), size: VIDEO },
  });
  await context.addInitScript(overlayScript);
  const page = await context.newPage();
  const tour = new Tour(page, j);
  try {
    await run(page, tour, context);
    await tour.read(1200);
    tour.save();
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      await video.saveAs(path.join(RAW_VIDEO_DIR, `${j.slug}.webm`));
      await video.delete();
    }
  }
}

test.describe("walkthroughs", () => {
  test("compare two speakers", async ({ browser }) => {
    await record(browser, journey("compare-two-speakers"), async (page, tour) => {
      await tour.idle(async () => {
        await page.goto("/distinctive");
        await settle(page);
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "How two vocabularies differ",
      );
      await tour.step(1);
      await tour.read(2400);

      const waitFor = async (key: "a" | "b", token: string) => {
        await tour.idle(async () => {
          await page.waitForURL((u) => u.searchParams.get(key) === token);
          await expect(page.getByText("Recomputing…")).toHaveCount(0);
          await settle(page);
        });
      };

      await tour.step(2);
      // Group A starts as the 2016 cycle, so choosing a candidate keeps that cycle.
      await tour.select(page.locator("#a-speaker"), "hillary-clinton");
      await waitFor("a", "hillary-clinton@2016");
      await tour.moveTo(page.locator("#a-cycle"));
      await expect(page.locator("#a-cycle")).toHaveValue("2016");
      await tour.read(1400);

      await tour.step(3);
      await tour.select(page.locator("#b-cycle"), "2016");
      await waitFor("b", "cycle-2016");
      await tour.read(400);
      await tour.select(page.locator("#b-speaker"), "bernie-sanders");
      await waitFor("b", "bernie-sanders@2016");
      await expect(page.getByText("More characteristic of Bernie Sanders")).toBeVisible();
      await tour.read(1000);

      await tour.step(4);
      await tour.scrollTo(page.locator("#a-speaker"), 150);
      await tour.moveTo(page.getByText("Words beyond |z| = 1.96"));
      await tour.read(2600);

      await tour.step(5);
      await tour.scrollTo(page.getByRole("heading", { name: "Every word at once" }), 96);
      await tour.moveTo(page.getByRole("heading", { name: "Every word at once" }), {
        dx: 760,
        dy: 300,
      });
      await tour.read(2800);

      await tour.step(6);
      const columnA = page.locator("h3", { hasText: "More characteristic of Hillary Clinton" });
      await tour.scrollTo(columnA, 96);
      await tour.read(2600);

      await tour.step(7);
      // "work" leads the substantive words for Clinton (her own name comes first).
      const words = page
        .locator("table", { has: page.locator("caption", { hasText: /Hillary Clinton/ }) })
        .locator("tbody a");
      const work = words.filter({ hasText: /^work$/ });
      const wordLink = (await work.count()) ? work.first() : words.first();
      const word = (await wordLink.textContent())?.trim() ?? "";
      expect(word.length).toBeGreaterThan(0);
      await tour.click(wordLink);
      await tour.idle(async () => {
        await page.waitForURL((u) => u.searchParams.get("word") === word);
        await expect(page.locator("#examples-heading")).toContainText(word);
        await settle(page);
      });
      await tour.scrollTo(page.locator("#examples"), 90);
      await tour.read(2200);

      await tour.step(8);
      const source = page
        .locator("#examples")
        .getByRole("link", { name: /Read on APP/ })
        .first();
      await expect(source).toHaveAttribute("href", /presidency\.ucsb\.edu/);
      await tour.moveTo(source);
      await tour.read(2600);

      await tour.step(9);
      await expect(page.locator("#stability-heading")).toBeVisible({ timeout: 60_000 });
      await tour.scrollTo(page.locator("#stability"), 84);
      await tour.read(3200);
    });
  });

  test("sixty years of debates", async ({ browser }) => {
    await record(browser, journey("sixty-years-of-debates"), async (page, tour) => {
      await tour.idle(async () => {
        await page.goto("/debates");
        await settle(page);
      });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("1960 to 2024");
      await tour.step(1);
      await tour.moveTo(page.getByText("Words transcribed"));
      await tour.read(2400);

      await tour.step(2);
      await tour.scrollTo(page.getByRole("heading", { name: "Six decades, four measures" }), 90);
      const dots = page.locator("circle[role='link']");
      await expect(dots.first()).toBeVisible();
      await tour.moveTo(dots.nth(60));
      await tour.read(2600);

      await tour.step(3);
      await tour.click(page.getByRole("button", { name: "Words per candidate turn" }));
      await tour.read(1400);
      const chicagoDot = page.locator(
        "circle[role='link'][aria-label^='Presidential Debate in Chicago, 26 Sep 1960']",
      );
      await tour.moveTo(chicagoDot);
      await tour.read(2400);

      await tour.step(4);
      await expect(chicagoDot).toHaveAttribute("aria-label", CHICAGO_1960);
      await tour.pressAndDispatch(chicagoDot);
      await tour.idle(async () => {
        await page.waitForURL(/\/debates\/1960-09-26-presidential-debate-in-chicago$/);
        await settle(page);
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Presidential Debate in Chicago",
      );
      await tour.read(2200);

      await tour.step(5);
      await tour.scrollTo(page.getByRole("heading", { name: "The debate, turn by turn" }), 90);
      await tour.read(3200);

      await tour.step(6);
      await tour.scrollTo(page.getByRole("heading", { name: "Share of words" }), 90);
      await tour.moveTo(page.getByRole("heading", { name: "How long each turn ran" }), { dy: 90 });
      await tour.read(3200);

      await tour.step(7);
      await tour.scrollToY(0);
      await tour.click(page.getByRole("link", { name: "All debates" }));
      await tour.idle(async () => {
        await page.waitForURL(/\/debates$/);
        await settle(page);
      });
      await tour.scrollTo(page.getByRole("heading", { name: "Six decades, four measures" }), 90);
      await tour.click(page.getByRole("button", { name: "Words per candidate turn" }));
      await tour.read(900);

      await tour.step(8);
      const philly = page.locator(
        "circle[role='link'][aria-label^='Presidential Debate in Philadelphia, Pennsylvania, 10 Sep 2024']",
      );
      await expect(philly).toHaveAttribute("aria-label", PHILADELPHIA_2024);
      await tour.moveTo(philly);
      await tour.read(1600);
      await tour.pressAndDispatch(philly);
      await tour.idle(async () => {
        await page.waitForURL(
          /\/debates\/2024-09-10-presidential-debate-in-philadelphia-pennsylvania$/,
        );
        await settle(page);
      });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Philadelphia");
      await tour.read(1800);
      await tour.scrollTo(page.getByRole("heading", { name: "The debate, turn by turn" }), 90);
      await tour.read(2800);

      await tour.step(9);
      await tour.scrollTo(page.getByRole("heading", { name: "Share of words" }), 90);
      await tour.moveTo(page.getByRole("heading", { name: "How long each turn ran" }), { dy: 90 });
      await tour.read(3400);
    });
  });

  test("classical vs LLM topic labels", async ({ browser }) => {
    await record(browser, journey("classical-vs-llm-topic-labels"), async (page, tour, context) => {
      await mockAnthropic(context);
      await tour.idle(async () => {
        await page.goto("/topics");
        await settle(page);
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "An LLM against keyword rules",
      );
      await tour.step(1);
      await tour.read(2600);

      await tour.step(2);
      await tour.moveTo(page.getByText("Keyword rules: Cohen's kappa"));
      await tour.read(2800);

      await tour.step(3);
      await tour.scrollTo(page.getByRole("heading", { name: "Run the comparison" }), 110);
      await tour.read(900);
      const { dialog, keyInput } = await openAiSettings(page, tour);
      await tour.read(1600);

      await tour.step(4);
      await tour.type(keyInput, PLACEHOLDER_KEY);
      await expect(keyInput).toHaveAttribute("type", "password");
      await tour.moveTo(dialog.getByText("Remember on this device"));
      await tour.read(1800);

      await tour.step(5);
      await tour.moveTo(dialog.getByText("Your key never reaches this site."));
      await tour.read(2000);
      await tour.click(dialog.getByRole("button", { name: "Save" }));
      await expect(dialog).toBeHidden();
      await tour.read(800);

      await tour.step(6);
      await tour.badge(BADGE);
      await tour.moveTo(page.getByText("What a real run sends"));
      await tour.read(2200);
      await tour.click(page.getByRole("button", { name: "Run with my key" }));
      await expect(page.getByRole("heading", { name: /^Results on 40 excerpts/ })).toBeVisible();
      await tour.read(1000);

      await tour.step(7);
      await tour.scrollTo(page.locator("#run-results"), 140);
      await expect(page.getByText("AI-generated").first()).toBeVisible();
      await tour.moveTo(page.getByText("Agreement, LLM minus rules"));
      await tour.read(3400);

      await tour.step(8);
      // A row where the mocked label differs from gold: correct it to the gold label.
      const table = page.locator("table", {
        has: page.locator("caption", { hasText: "the LLM's label" }),
      });
      const rows = table.locator("tbody tr");
      const count = await rows.count();
      let target = -1;
      let gold = "";
      for (let i = 0; i < count; i++) {
        const id =
          (await rows.nth(i).locator("td").first().locator("span").first().textContent())?.trim() ??
          "";
        if (GOLD[id] && mockedWrong(id)) {
          target = i;
          gold = GOLD[id];
          break;
        }
      }
      expect(target).toBeGreaterThanOrEqual(0);
      const row = rows.nth(target);
      await tour.scrollTo(row, 260);
      await tour.select(row.locator("select"), gold);
      await tour.read(1200);
      const accept = page.getByRole("button", { name: "Accept with 1 correction" });
      await tour.click(accept);
      await expect(page.getByText(/edited/i).first()).toBeVisible();
      await tour.read(2200);

      await tour.step(9);
      await tour.idle(async () => {
        await page.goto("/ai-log");
        await settle(page);
      });
      await expect(page.getByText(/claude-haiku-4-5/).first()).toBeVisible();
      await tour.read(1600);
      await tour.moveTo(page.getByRole("button", { name: "Export JSON" }));
      await tour.read(1400);
      const details = page.getByText("What was sent and what came back").first();
      await tour.click(details);
      await tour.read(1200);
      await tour.scrollTo(details, 200);
      await tour.read(3200);
    });
  });
});
