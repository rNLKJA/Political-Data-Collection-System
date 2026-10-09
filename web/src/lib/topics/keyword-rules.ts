/**
 * The transparent baseline for the topic-label evaluation: a keyword
 * dictionary per topic and one counting rule.
 *
 * Rule: tokenise the excerpt with the site's tokeniser (lower-cased runs of
 * letters; "health-care" becomes "health care"), count non-overlapping matches
 * of each topic's words and phrases (longest phrase first), and pick the topic
 * with the most matches. A tie goes to the topic whose first match comes
 * earliest in the excerpt, mirroring the coding rule "if two subjects are
 * equally prominent, choose the one mentioned first". No match means "none".
 *
 * Dictionary version 1 was written from the codebook descriptions on
 * 10 October 2026, before the gold set was sampled, and is frozen: it has not
 * been tuned on the gold set (see docs/decisions/DR-004). Changing it means a
 * new version and a new decision record.
 */
import { words } from "@/lib/textkit";

import type { TopicId } from "./codebook";

export const KEYWORD_RULES_VERSION = "keywords-v1 (10 October 2026)";

export const KEYWORDS: Readonly<Record<Exclude<TopicId, "none">, readonly string[]>> = {
  macroeconomics: [
    "economy", "economic", "economies", "economists", "inflation", "recession", "cost of living",
    "tax", "taxes", "taxation", "taxpayer", "taxpayers", "irs", "budget", "budgets", "deficit",
    "deficits", "national debt", "federal debt", "federal spending", "government spending",
    "interest rates", "federal reserve", "gdp",
  ],
  "civil-rights": [
    "civil rights", "civil liberties", "discrimination", "equality", "equal rights", "equal pay",
    "voting rights", "right to vote", "abortion", "abortions", "roe", "reproductive", "lgbt",
    "lgbtq", "gay", "transgender", "same sex", "marriage equality", "religious liberty",
    "religious freedom", "free speech", "freedom of speech", "first amendment", "privacy",
    "affirmative action", "racial justice", "racial", "women's rights",
  ],
  health: [
    "health", "healthcare", "health care", "health insurance", "medicare", "medicaid",
    "obamacare", "affordable care act", "insulin", "prescription", "prescriptions",
    "drug prices", "prescription drugs", "hospital", "hospitals", "doctor", "doctors", "nurse",
    "nurses", "patients", "medical", "mental health", "opioid", "opioids", "addiction", "covid",
    "coronavirus", "pandemic", "vaccine", "vaccines", "cancer", "disease", "diseases",
    "pre existing conditions", "preexisting conditions",
  ],
  agriculture: [
    "farm", "farms", "farmer", "farmers", "farming", "agriculture", "agricultural", "crop",
    "crops", "rancher", "ranchers", "ranching", "livestock", "usda", "food safety",
  ],
  labour: [
    "job", "jobs", "worker", "workers", "wage", "wages", "minimum wage", "union", "unions",
    "labor", "labour", "employment", "unemployment", "employees", "employee", "paycheck",
    "paychecks", "workforce", "overtime", "paid leave", "family leave", "pension", "pensions",
    "apprenticeship", "apprenticeships", "job training", "workplace",
  ],
  education: [
    "education", "educational", "school", "schools", "teacher", "teachers", "student",
    "students", "college", "colleges", "university", "universities", "tuition", "student loan",
    "student loans", "student debt", "pre k", "preschool", "classroom", "classrooms",
  ],
  environment: [
    "environment", "environmental", "climate", "climate change", "global warming", "pollution",
    "polluters", "clean air", "clean water", "drinking water", "emissions", "carbon",
    "conservation", "epa", "wildlife", "endangered", "toxic", "green new deal",
  ],
  energy: [
    "energy", "oil", "gas", "gasoline", "gas prices", "natural gas", "coal", "nuclear power",
    "nuclear energy", "renewable", "renewables", "solar", "wind power", "wind energy",
    "electricity", "power plants", "pipeline", "pipelines", "keystone", "fracking", "drilling",
    "ethanol",
  ],
  immigration: [
    "immigration", "immigrant", "immigrants", "border", "borders", "asylum", "refugee",
    "refugees", "deportation", "deportations", "deport", "deported", "migrant", "migrants",
    "undocumented", "illegal aliens", "daca", "dreamers", "citizenship", "visa", "visas",
  ],
  transportation: [
    "transportation", "road", "roads", "highway", "highways", "bridge", "bridges", "rail",
    "railroad", "railroads", "trains", "transit", "airport", "airports", "airline", "airlines",
    "aviation", "infrastructure", "potholes", "ports",
  ],
  "law-crime": [
    "crime", "crimes", "criminal", "criminals", "police", "policing", "law enforcement",
    "prison", "prisons", "jail", "jails", "incarceration", "criminal justice", "gun", "guns",
    "firearm", "firearms", "second amendment", "shooting", "shootings", "gun violence",
    "violent", "murder", "murders", "drug trafficking", "trafficking", "cartel", "cartels",
    "fentanyl", "gang", "gangs", "sentencing", "prosecutor", "prosecutors", "domestic violence",
    "sheriff", "sheriffs",
  ],
  "social-welfare": [
    "social security", "poverty", "food stamps", "snap", "welfare", "child care", "childcare",
    "seniors", "disability", "disabilities", "disabled", "low income", "safety net", "hunger",
    "homebound", "caregivers", "caregiving",
  ],
  housing: [
    "housing", "homeownership", "home ownership", "homeless", "homelessness", "rent", "rents",
    "renters", "mortgage", "mortgages", "affordable housing", "landlords", "eviction",
    "evictions",
  ],
  commerce: [
    "bank", "banks", "banking", "bankers", "wall street", "small business", "small businesses",
    "corporations", "corporate", "consumer", "consumers", "consumer protection", "bankruptcy",
    "financial", "credit card", "credit cards", "antitrust", "monopoly", "monopolies",
    "disaster", "disasters", "hurricane", "hurricanes", "fema", "tourism", "entrepreneurs",
    "price gouging",
  ],
  defence: [
    "military", "troops", "soldier", "soldiers", "veteran", "veterans", "army", "navy",
    "marines", "air force", "armed forces", "defense", "defence", "pentagon", "national security",
    "war", "wars", "terrorism", "terrorist", "terrorists", "terror", "isis", "al qaeda",
    "homeland security", "nuclear weapons", "weapons", "missile", "missiles", "service members",
    "servicemembers",
  ],
  technology: [
    "technology", "technologies", "tech", "internet", "broadband", "science", "scientific",
    "scientists", "space", "nasa", "innovation", "artificial intelligence", "cyber",
    "cybersecurity", "social media", "telecommunications", "computer", "computers",
  ],
  "foreign-trade": [
    "trade", "tariff", "tariffs", "exports", "imports", "export", "import", "nafta", "usmca",
    "trade deal", "trade deals", "outsourcing", "offshoring", "trade deficit", "tpp",
    "trans pacific partnership",
  ],
  international: [
    "foreign policy", "diplomacy", "diplomatic", "allies", "alliance", "alliances", "nato",
    "united nations", "china", "chinese", "russia", "russian", "putin", "ukraine", "ukrainian",
    "israel", "israeli", "iran", "iranian", "north korea", "afghanistan", "iraq", "syria",
    "middle east", "europe", "european", "foreign aid", "human rights", "international",
    "embassy", "sanctions", "hamas", "gaza", "taiwan", "venezuela", "cuba",
  ],
  government: [
    "federal government", "congress", "bureaucracy", "bureaucrats", "corruption", "ethics",
    "campaign finance", "citizens united", "lobbyists", "lobbying", "special interests",
    "term limits", "census", "postal service", "voter fraud", "election integrity",
    "electoral college", "supreme court", "judges", "justices", "government shutdown",
    "shutdown", "federal workers", "transparency", "swamp", "dark money", "super pac",
    "super pacs",
  ],
  "public-lands": [
    "public lands", "public land", "federal lands", "national park", "national parks", "forest",
    "forests", "forestry", "wildfire", "wildfires", "water rights", "tribal", "tribes",
    "native american", "native americans", "indian country", "reservations", "territories",
    "puerto rico",
  ],
  culture: ["arts", "artists", "museum", "museums", "humanities", "cultural"],
}; // prettier-ignore

type Pattern = { topic: Exclude<TopicId, "none">; seq: string[] };

/** Every phrase as a token sequence, longest first, so "health care" beats "health". */
const PATTERNS: Pattern[] = Object.entries(KEYWORDS)
  .flatMap(([topic, list]) =>
    list.map((p) => ({ topic: topic as Exclude<TopicId, "none">, seq: words(p) })),
  )
  .sort((a, b) => b.seq.length - a.seq.length);

export interface KeywordMatch {
  topic: Exclude<TopicId, "none">;
  phrase: string;
  /** token index of the first word */
  at: number;
}

/** Non-overlapping dictionary matches, scanning left to right, longest phrase first. */
export function keywordMatches(text: string): KeywordMatch[] {
  const toks = words(text);
  const out: KeywordMatch[] = [];
  let i = 0;
  while (i < toks.length) {
    const hit = PATTERNS.find(
      (p) => i + p.seq.length <= toks.length && p.seq.every((w, j) => toks[i + j] === w),
    );
    if (hit) {
      out.push({ topic: hit.topic, phrase: hit.seq.join(" "), at: i });
      i += hit.seq.length;
    } else {
      i++;
    }
  }
  return out;
}

export interface KeywordLabel {
  topic: TopicId;
  matches: KeywordMatch[];
}

/** The baseline's label for one excerpt, with the matches that decided it. */
export function keywordLabel(text: string): KeywordLabel {
  const matches = keywordMatches(text);
  if (matches.length === 0) return { topic: "none", matches };
  const count = new Map<string, number>();
  const first = new Map<string, number>();
  for (const m of matches) {
    count.set(m.topic, (count.get(m.topic) ?? 0) + 1);
    if (!first.has(m.topic)) first.set(m.topic, m.at);
  }
  const ranked = [...count.keys()].sort(
    (a, b) => count.get(b)! - count.get(a)! || first.get(a)! - first.get(b)!,
  );
  return { topic: ranked[0] as TopicId, matches };
}
