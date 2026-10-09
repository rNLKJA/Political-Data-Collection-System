export const SITE = {
  name: "Campaign Text Lab",
  url: "https://campaign-text-lab.vercel.app",
  repo: "https://github.com/rNLKJA/Political-Data-Collection-System",
  description:
    "A descriptive reading room for 7,556 US campaign documents (2016 to 2024) and 179 debate transcripts (49 general-election and vice-presidential, 130 primary; 1960 to 2024), built from a personal scraper of The American Presidency Project.",
  app: "https://www.presidency.ucsb.edu",
} as const;

/** `short` is the label in the desktop header, where eight links share one line. */
export const NAV = [
  {
    href: "/explorer",
    label: "Explorer",
    short: "Explorer",
    blurb: "Filter documents by candidate, type and date.",
  },
  {
    href: "/distinctive",
    label: "Distinctive words",
    short: "Distinctive words",
    blurb:
      "Compare two speakers or periods with Fightin' Words, and check how stable the lists are.",
  },
  {
    href: "/debates",
    label: "Debates",
    short: "Debates",
    blurb: "Talk share and turn lengths, 1960 to 2024.",
  },
  {
    href: "/timeline",
    label: "Term timeline",
    short: "Timeline",
    blurb: "How often a term appears, month by month.",
  },
  {
    href: "/readability",
    label: "Readability",
    short: "Readability",
    blurb: "Reading-grade trends with intervals, and what transcription does to them.",
  },
  {
    href: "/topics",
    label: "Topic labels",
    short: "Topic labels",
    blurb: "An LLM against keyword rules on 120 gold-labelled excerpts (bring your own key).",
  },
  {
    href: "/methods",
    label: "Methods",
    short: "Methods",
    blurb: "Collection, checks, statistics, decision records and AI use.",
  },
  {
    href: "/tour",
    label: "Guided tour",
    short: "Tour",
    blurb: "Three recorded walkthroughs and screenshots of every tool.",
  },
] as const;

export const APP_CITATION =
  "Gerhard Peters and John T. Woolley, The American Presidency Project, University of California, Santa Barbara.";
