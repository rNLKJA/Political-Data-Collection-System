export const SITE = {
  name: "Campaign Text Lab",
  url: "https://campaign-text-lab.vercel.app",
  repo: "https://github.com/rNLKJA/Political-Data-Collection-System",
  description:
    "A descriptive reading room for 7,556 US campaign documents (2016 to 2024) and 179 presidential and vice-presidential debate transcripts (1960 to 2024), built from a personal scraper of The American Presidency Project.",
  app: "https://www.presidency.ucsb.edu",
} as const;

export const NAV = [
  { href: "/explorer", label: "Explorer", blurb: "Filter documents by candidate, type and date." },
  {
    href: "/distinctive",
    label: "Distinctive words",
    blurb: "Compare two speakers or periods with Fightin' Words.",
  },
  { href: "/debates", label: "Debates", blurb: "Talk share and turn lengths, 1960 to 2024." },
  { href: "/timeline", label: "Term timeline", blurb: "How often a term appears, month by month." },
  { href: "/method", label: "Method", blurb: "How the data was collected and checked." },
] as const;

export const APP_CITATION =
  "Gerhard Peters and John T. Woolley, The American Presidency Project, University of California, Santa Barbara.";
