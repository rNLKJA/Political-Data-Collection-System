/**
 * The guided tour: three recorded walkthroughs and a set of screenshots.
 *
 * One source of truth for the step captions. The Playwright tour
 * (e2e/showcase.spec.ts) burns these captions into the recordings, the media
 * script turns their timings into WebVTT files, and /tour lists them as text
 * for anyone who cannot or would rather not watch.
 */

export type JourneySlug =
  "compare-two-speakers" | "sixty-years-of-debates" | "classical-vs-llm-topic-labels";

export interface Journey {
  slug: JourneySlug;
  title: string;
  /** one sentence under the title */
  summary: string;
  /** the page the walkthrough starts on */
  path: string;
  /** one caption per step, in order; each is shown on screen while that step plays */
  steps: readonly string[];
  /** shown with the video when part of it is not the live site */
  note?: string;
  /** the step whose frame becomes the poster image */
  posterStep: number;
}

/** Caption shown beside every frame that contains the mocked model output. */
export const MOCK_NOTICE = "Mocked AI response for illustration";

export const JOURNEYS: readonly Journey[] = [
  {
    slug: "compare-two-speakers",
    title: "Compare two speakers",
    summary:
      "Pick two candidates and see the words that most set them apart, with z-scores, a stability check and links back to the source documents.",
    path: "/distinctive",
    posterStep: 5,
    steps: [
      "Distinctive words compares the vocabulary of any two groups of campaign documents.",
      "Group A: choose a candidate, Hillary Clinton, and the 2016 cycle.",
      "Group B: Bernie Sanders, in the same cycle.",
      "Each side's document count and indexed words, and how many words pass |z| = 1.96.",
      "Every word gets a Fightin' Words z-score; the funnel plot shows all of them at once.",
      "The ranked lists: a z-score bar and uses per 10,000 words in each group.",
      "Select a word to see the documents in each group that use it most.",
      "Every example links back to the full text on The American Presidency Project.",
      "Resampling documents 200 times shows how stable each top word is.",
    ],
  },
  {
    slug: "sixty-years-of-debates",
    title: "Sixty years of debates",
    summary:
      "Talk share and turn length by participant, from Kennedy and Nixon in 1960 to Harris and Trump in 2024.",
    path: "/debates",
    posterStep: 5,
    steps: [
      "179 debate transcripts from 1960 to 2024, split into 44,255 speaking turns.",
      "One dot per debate: the share of words spoken by moderators and panellists.",
      "Switch the measure to words per candidate turn: turns have shortened since the 1960s.",
      "Select a dot to open a debate: Kennedy and Nixon in Chicago, 26 September 1960.",
      "The debate turn by turn: each block is one turn, as wide as it is long.",
      "Share of words, a stand-in for talk time, and the length of every turn by speaker.",
      "Back to the overview to jump 64 years ahead.",
      "Harris and Trump in Philadelphia, 10 September 2024.",
      "Four times as many candidate turns, averaging 123 words where 1960 averaged 328.",
    ],
  },
  {
    slug: "classical-vs-llm-topic-labels",
    title: "Classical vs LLM topic labels",
    summary:
      "A transparent keyword dictionary against a language model on the same gold-labelled excerpts, with intervals, a paired test, human review and an audit log.",
    path: "/topics",
    posterStep: 7,
    note: "The model output in this walkthrough is a mocked response for illustration: the recording intercepts the request in the browser, so no API key is used and no provider is called. Its scores say nothing about any model.",
    steps: [
      "Topic labels: a keyword dictionary and a language model label the same gold-labelled excerpts.",
      "The keyword baseline runs for everyone: agreement and Cohen's kappa with 95% intervals.",
      "The model is optional and runs on the visitor's own key. Open AI settings.",
      "Paste a key (here a placeholder, not a real key). It stays in this browser tab.",
      "Save. Requests go straight from the browser to the provider, never to this site.",
      `A seeded sample of 40 excerpts, sent in four requests. ${MOCK_NOTICE}.`,
      "Both labellers scored on the same excerpts: intervals, paired difference and McNemar's test.",
      "Every label is marked AI-generated. Correct one, then accept the run.",
      "Every call is in the AI audit log with prompt, answer, latency, tokens and decision.",
    ],
  },
];

export function journey(slug: JourneySlug): Journey {
  const j = JOURNEYS.find((x) => x.slug === slug);
  if (!j) throw new Error(`Unknown journey: ${slug}`);
  return j;
}

export interface Screen {
  /** file name in docs/showcase (PNG) and web/public/showcase/screens (WebP) */
  file: string;
  title: string;
  caption: string;
  path: string;
  theme: "light" | "dark";
  viewport: "desktop" | "mobile";
}

export const SCREENS: readonly Screen[] = [
  {
    file: "01-landing-light",
    title: "Landing, paper theme",
    caption: "Headline figures from the original collection and the six tools.",
    path: "/",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "02-landing-dark",
    title: "Landing, microfilm theme",
    caption: "The same page in the dark theme.",
    path: "/",
    theme: "dark",
    viewport: "desktop",
  },
  {
    file: "03-explorer",
    title: "Explorer",
    caption: "7,556 documents by candidate, type and month, each linked to its source.",
    path: "/explorer",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "04-distinctive-words",
    title: "Distinctive words",
    caption: "Clinton and Sanders in 2016: Fightin' Words z-scores, word by word.",
    path: "/distinctive?a=hillary-clinton%402016&b=bernie-sanders%402016",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "05-word-stability",
    title: "Word-list stability",
    caption: "How often each top word survives 200 document resamples.",
    path: "/distinctive?a=hillary-clinton%402016&b=bernie-sanders%402016",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "06-debates",
    title: "Debates, 1960 to 2024",
    caption: "One dot per debate: moderator share, turn length, turn rate and reading grade.",
    path: "/debates",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "07-debate-turns",
    title: "One debate, turn by turn",
    caption: "Kennedy and Nixon, Chicago 1960: every turn, share of words and turn lengths.",
    path: "/debates/1960-09-26-presidential-debate-in-chicago",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "08-term-timeline",
    title: "Term timeline",
    caption: "Economy mentions per 10,000 words by quarter, with exact Poisson 95% intervals.",
    path: "/timeline",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "09-readability",
    title: "Readability",
    caption: "Reading-grade trends with cluster-bootstrap intervals.",
    path: "/readability",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "10-byok-settings",
    title: "Bring your own key",
    caption:
      "AI settings: the visitor's own key, kept in the browser and sent only to the provider.",
    path: "/topics",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "11-topic-evaluation",
    title: "LLM against keyword rules",
    caption:
      "Paired scores with intervals on the same excerpts (mocked AI response for illustration).",
    path: "/topics",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "12-ai-audit-log",
    title: "AI audit log",
    caption: "Every call with prompt, answer, latency, tokens and the human decision.",
    path: "/ai-log",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "13-methods",
    title: "Methods",
    caption: "Provenance, statistics, the AI use statement, model card and decision records.",
    path: "/methods",
    theme: "light",
    viewport: "desktop",
  },
  {
    file: "14-mobile-landing",
    title: "Phone: landing",
    caption: "The landing page at 390 px.",
    path: "/",
    theme: "light",
    viewport: "mobile",
  },
  {
    file: "15-mobile-distinctive",
    title: "Phone: distinctive words",
    caption: "Word lists stack on a phone.",
    path: "/distinctive?a=hillary-clinton%402016&b=bernie-sanders%402016",
    theme: "light",
    viewport: "mobile",
  },
  {
    file: "16-mobile-debate",
    title: "Phone: a debate, dark theme",
    caption: "Share of words and turn lengths for the 2024 Philadelphia debate.",
    path: "/debates/2024-09-10-presidential-debate-in-philadelphia-pennsylvania",
    theme: "dark",
    viewport: "mobile",
  },
];

/** What `scripts/showcase-media.mjs` writes to src/data/showcase-media.json. */
export interface ShowcaseMedia {
  journeys: Record<
    string,
    {
      title: string;
      mp4: string;
      mp4Bytes: number;
      poster: string;
      posterBytes: number;
      vtt: string;
      gif: string;
      gifBytes: number;
      width: number;
      height: number;
      durationS: number;
      steps: { step: number; atS: number }[];
    }
  >;
  screens: {
    file: string;
    png: string;
    pngBytes: number;
    webp: string;
    webpBytes: number;
    width: number;
    height: number;
    docsWidth: number;
    docsHeight: number;
  }[];
}

/** "0:07", "1:02" */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
