/**
 * Helpers for the showcase tour: an on-screen caption banner, a visible cursor,
 * human-paced pointer movement, and a timing record per recording that the
 * media script uses to trim idle time and write WebVTT captions.
 */
import fs from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import type { Journey } from "../src/lib/showcase";

export const SHOWCASE_DIR = path.join(__dirname, "..", ".showcase");
export const RAW_VIDEO_DIR = path.join(SHOWCASE_DIR, "videos");
export const RAW_SCREEN_DIR = path.join(SHOWCASE_DIR, "screens");

/**
 * Runs inside every page of a recorded context. It draws a caption banner, an
 * optional notice badge and a cursor ring that follows real mouse events, and
 * restores them after a full page load from sessionStorage. Everything is
 * pointer-events: none, so it never intercepts a click.
 */
export function overlayScript() {
  const KEY = "__showcase_overlay";
  type State = {
    caption?: { step: number; total: number; text: string } | null;
    badge?: string | null;
    x?: number;
    y?: number;
  };
  const read = (): State => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as State;
    } catch {
      return {};
    }
  };
  const write = (patch: Partial<State>) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
    } catch {
      // storage unavailable: the overlay just will not survive a reload
    }
  };
  const css = `
    #__sc_root, #__sc_root:popover-open { position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; background: transparent;
      overflow: visible; color: inherit; pointer-events: none; z-index: 2147483647; font-family: var(--font-plex-sans), "IBM Plex Sans", system-ui, sans-serif; }
    #__sc_cursor { position: fixed; left: -100px; top: -100px; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 9999px;
      background: rgba(245, 190, 40, 0.30); border: 2px solid rgba(190, 120, 0, 0.95); box-shadow: 0 0 0 1px rgba(255,255,255,0.7), 0 2px 8px rgba(0,0,0,0.25); }
    #__sc_cursor::after { content: ""; position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 9999px; background: rgba(150, 90, 0, 1); }
    #__sc_cursor.down { animation: __sc_press 420ms ease-out; }
    @keyframes __sc_press { 0% { transform: scale(1); } 35% { transform: scale(0.7); background: rgba(245,190,40,0.6); } 100% { transform: scale(1); } }
    #__sc_caption { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); width: max-content; max-width: min(1060px, calc(100vw - 48px));
      display: flex; align-items: center; gap: 14px; padding: 13px 22px 13px 14px; border-radius: 12px;
      background: rgba(18, 22, 20, 0.93); color: #f6f1e6; box-shadow: 0 8px 28px rgba(0,0,0,0.28); transition: opacity 220ms ease; }
    #__sc_caption[hidden] { display: none; }
    #__sc_root.modal #__sc_caption { left: 18px; top: 50%; bottom: auto; transform: translateY(-50%); max-width: min(330px, calc((100vw - 34rem) / 2 - 30px));
      flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px 18px; }
    #__sc_step { flex: none; font: 600 13px/1 var(--font-plex-mono), "IBM Plex Mono", ui-monospace, monospace; letter-spacing: 0.04em;
      padding: 7px 9px; border-radius: 7px; background: #e9c46a; color: #1d1a12; }
    #__sc_text { font-size: 19px; line-height: 1.35; font-weight: 500; }
    #__sc_badge { position: fixed; top: 76px; right: 18px; padding: 7px 12px; border-radius: 8px; border: 1.5px dashed #a66b00;
      background: #fff4d6; color: #5c3b00; font: 600 12.5px/1.2 var(--font-plex-mono), "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.05em; text-transform: uppercase; box-shadow: 0 4px 14px rgba(0,0,0,0.18); }
    #__sc_badge[hidden] { display: none; }
  `;
  const render = () => {
    const s = read();
    const cap = document.getElementById("__sc_caption");
    const step = document.getElementById("__sc_step");
    const text = document.getElementById("__sc_text");
    const badge = document.getElementById("__sc_badge");
    const cursor = document.getElementById("__sc_cursor");
    if (!cap || !step || !text || !badge || !cursor) return;
    if (s.caption) {
      cap.hidden = false;
      step.textContent = `${s.caption.step} / ${s.caption.total}`;
      text.textContent = s.caption.text;
    } else {
      cap.hidden = true;
    }
    badge.hidden = !s.badge;
    badge.textContent = s.badge ?? "";
    if (typeof s.x === "number" && typeof s.y === "number") {
      cursor.style.left = `${s.x}px`;
      cursor.style.top = `${s.y}px`;
    }
  };
  const install = () => {
    if (document.getElementById("__sc_root")) return;
    const root = document.createElement("div");
    root.id = "__sc_root";
    root.setAttribute("aria-hidden", "true");
    const style = document.createElement("style");
    style.textContent = css;
    root.appendChild(style);
    for (const id of ["__sc_cursor", "__sc_caption", "__sc_badge"]) {
      const el = document.createElement("div");
      el.id = id;
      if (id === "__sc_caption") {
        el.hidden = true;
        const step = document.createElement("span");
        step.id = "__sc_step";
        const text = document.createElement("span");
        text.id = "__sc_text";
        el.append(step, text);
      }
      if (id === "__sc_badge") el.hidden = true;
      root.appendChild(el);
    }
    // A manual popover lives in the top layer, so it can be raised above a modal <dialog>.
    root.setAttribute("popover", "manual");
    document.documentElement.appendChild(root);
    raise();
    render();
  };
  let raisedOver: Element | null = null;
  function raise() {
    const root = document.getElementById("__sc_root");
    if (!root) return;
    try {
      if (root.matches(":popover-open")) root.hidePopover();
      root.showPopover();
    } catch {
      // no popover support: the overlay stays a plain fixed layer
    }
    raisedOver = document.querySelector("dialog:modal");
  }
  /** Keep the overlay above whichever modal dialog opened last. */
  const keepOnTop = () => {
    const modal = document.querySelector("dialog:modal");
    if (modal !== raisedOver) raise();
    // With a dialog open, the caption moves to the side so it hides none of the dialog.
    document.getElementById("__sc_root")?.classList.toggle("modal", modal !== null);
  };
  const w = window as unknown as {
    __showcase?: {
      caption: (step: number, total: number, text: string) => void;
      clearCaption: () => void;
      badge: (text: string | null) => void;
    };
  };
  w.__showcase = {
    caption(step, total, text) {
      write({ caption: { step, total, text } });
      install();
      const cap = document.getElementById("__sc_caption");
      if (cap && !cap.hidden) {
        cap.style.opacity = "0";
        setTimeout(() => {
          render();
          cap.style.opacity = "1";
        }, 200);
      } else render();
    },
    clearCaption() {
      write({ caption: null });
      render();
    },
    badge(text) {
      write({ badge: text });
      install();
      render();
    },
  };
  document.addEventListener(
    "mousemove",
    (e) => {
      const cursor = document.getElementById("__sc_cursor");
      if (cursor) {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      }
      write({ x: e.clientX, y: e.clientY });
    },
    true,
  );
  document.addEventListener(
    "mousedown",
    () => {
      const cursor = document.getElementById("__sc_cursor");
      if (!cursor) return;
      cursor.classList.remove("down");
      void cursor.offsetWidth;
      cursor.classList.add("down");
    },
    true,
  );
  // Installed once the page has loaded (after hydration starts), and again if a
  // re-render ever removes it.
  const start = () => {
    install();
    setInterval(() => {
      install();
      keepOnTop();
    }, 120);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RecordingTimings {
  slug: string;
  title: string;
  posterStep: number;
  /** when each caption appeared, ms after the video started */
  steps: { step: number; text: string; atMs: number }[];
  /** stretches with nothing to see (page loads, server work), ms after the video started */
  idle: [number, number][];
  endMs: number;
}

/** Drives one page at human pace and records when each caption appeared. */
export class Tour {
  private readonly t0: number;
  private readonly timings: RecordingTimings;
  private mouse = { x: 640, y: 420 };

  constructor(
    readonly page: Page,
    readonly journey: Journey,
  ) {
    this.t0 = Date.now();
    this.timings = {
      slug: journey.slug,
      title: journey.title,
      posterStep: journey.posterStep,
      steps: [],
      idle: [],
      endMs: 0,
    };
  }

  private now() {
    return Date.now() - this.t0;
  }

  /** Show caption `n` (1-based) of the journey. */
  async step(n: number) {
    const text = this.journey.steps[n - 1];
    if (!text) throw new Error(`${this.journey.slug} has no step ${n}`);
    await this.page.evaluate(
      ([step, total, t]) =>
        (
          window as unknown as {
            __showcase: { caption: (s: number, n: number, t: string) => void };
          }
        ).__showcase.caption(step, total, t),
      [n, this.journey.steps.length, text] as const,
    );
    this.timings.steps.push({ step: n, text, atMs: this.now() + 200 });
    await sleep(350);
  }

  async badge(text: string | null) {
    await this.page.evaluate(
      (t) =>
        (
          window as unknown as { __showcase: { badge: (t: string | null) => void } }
        ).__showcase.badge(t),
      text,
    );
  }

  /** Pause so a viewer can read what is on screen. */
  async read(ms = 1800) {
    await sleep(ms);
  }

  /** Something the viewer does not need to watch (a page load); trimmed from the media. */
  async idle<T>(work: () => Promise<T>): Promise<T> {
    const from = this.now();
    try {
      return await work();
    } finally {
      this.timings.idle.push([from, this.now()]);
    }
  }

  async moveTo(target: Locator, opts: { dx?: number; dy?: number } = {}) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("Target is not visible");
    const x = box.x + box.width / 2 + (opts.dx ?? 0);
    const y = box.y + box.height / 2 + (opts.dy ?? 0);
    const dist = Math.hypot(x - this.mouse.x, y - this.mouse.y);
    await this.page.mouse.move(x, y, { steps: Math.max(10, Math.min(45, Math.round(dist / 18))) });
    this.mouse = { x, y };
    await sleep(220);
  }

  async click(target: Locator) {
    await this.moveTo(target);
    await sleep(180);
    await target.click();
  }

  /**
   * Point at `target` and click it by event rather than by position: for small
   * overlapping marks (chart dots) where a positional click could land on a
   * neighbour drawn on top.
   */
  async pressAndDispatch(target: Locator) {
    await this.moveTo(target);
    await this.page.evaluate(() => {
      const cursor = document.getElementById("__sc_cursor");
      if (!cursor) return;
      cursor.classList.remove("down");
      void cursor.offsetWidth;
      cursor.classList.add("down");
    });
    await sleep(260);
    await target.dispatchEvent("click");
  }

  async select(target: Locator, value: string | { label: string }) {
    await this.moveTo(target);
    await sleep(200);
    await target.selectOption(value);
  }

  async type(target: Locator, text: string) {
    await this.click(target);
    await target.pressSequentially(text, { delay: 70 });
  }

  /** Smooth-scroll so `target` sits `offset` px below the top of the viewport. */
  async scrollTo(target: Locator, offset = 84) {
    const top = await target.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await this.scrollToY(top - offset);
  }

  async scrollToY(y: number) {
    await this.page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
    // wait for the smooth scroll to settle
    let last = -1;
    for (let i = 0; i < 40; i++) {
      await sleep(120);
      const now = await this.page.evaluate(() => window.scrollY);
      if (now === last) break;
      last = now;
    }
  }

  /** Write the timing record next to the raw video. */
  save() {
    this.timings.endMs = this.now();
    fs.mkdirSync(RAW_VIDEO_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RAW_VIDEO_DIR, `${this.journey.slug}.json`),
      JSON.stringify(this.timings, null, 2),
    );
  }
}
