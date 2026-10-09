/**
 * The policy-topic codebook used by the topic-label evaluation (/topics).
 *
 * The list is modelled on the major topics of the Comparative Agendas Project
 * (CAP), adapted for one-sentence excerpts of campaign documents. It is not the
 * official CAP master codebook, and nothing here was coded by CAP-trained
 * coders. Two adaptations matter (see docs/decisions/DR-004):
 *
 * - Jobs and employment sit under Labour, not Macroeconomics (CAP files the
 *   unemployment rate under Macroeconomics).
 * - A "No policy topic" label covers the many campaign sentences that are not
 *   about policy at all: events, thanks, endorsements, polls, biography and
 *   attacks without a policy subject.
 *
 * Every excerpt gets exactly one label: the policy subject the sentence is
 * mainly about; if two are equally prominent, the first one mentioned.
 */

export const TOPIC_IDS = [
  "macroeconomics",
  "civil-rights",
  "health",
  "agriculture",
  "labour",
  "education",
  "environment",
  "energy",
  "immigration",
  "transportation",
  "law-crime",
  "social-welfare",
  "housing",
  "commerce",
  "defence",
  "technology",
  "foreign-trade",
  "international",
  "government",
  "public-lands",
  "culture",
  "none",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export interface Topic {
  id: TopicId;
  /** CAP major-topic number this label is modelled on (0 for "no policy topic") */
  cap: number;
  label: string;
  /** what the label covers, as given to the human coder and the model */
  covers: string;
}

export const CODEBOOK: readonly Topic[] = [
  {
    id: "macroeconomics",
    cap: 1,
    label: "Macroeconomics",
    covers:
      "The economy as a whole: growth, inflation and the cost of living, taxes and tax policy, the federal budget and spending, debt and deficits, interest rates.",
  },
  {
    id: "civil-rights",
    cap: 2,
    label: "Civil rights and liberties",
    covers:
      "Discrimination and equality (race, gender, sexuality, disability), voting rights, abortion and reproductive rights, free speech, religious liberty, privacy.",
  },
  {
    id: "health",
    cap: 3,
    label: "Health",
    covers:
      "Health care and insurance, Medicare and Medicaid, prescription drugs and their prices, hospitals and health workers, public health and pandemics, addiction treatment, mental health.",
  },
  {
    id: "agriculture",
    cap: 4,
    label: "Agriculture",
    covers: "Farming and ranching, farm policy and subsidies, crops and livestock, food safety.",
  },
  {
    id: "labour",
    cap: 5,
    label: "Labour and employment",
    covers:
      "Jobs and employment, wages and the minimum wage, unions, working conditions, paid leave, worker training, pensions and employee benefits.",
  },
  {
    id: "education",
    cap: 6,
    label: "Education",
    covers:
      "Schools and teachers, early childhood education, colleges and universities, tuition and student debt.",
  },
  {
    id: "environment",
    cap: 7,
    label: "Environment",
    covers:
      "Climate change, pollution, clean air and water, emissions, conservation of species and habitats, environmental justice.",
  },
  {
    id: "energy",
    cap: 8,
    label: "Energy",
    covers:
      "Oil, gas and coal, nuclear power, renewable energy, electricity, pipelines and drilling, petrol prices, energy independence.",
  },
  {
    id: "immigration",
    cap: 9,
    label: "Immigration",
    covers:
      "Immigration law and enforcement, border security, asylum and refugees, deportation, visas and citizenship, DACA.",
  },
  {
    id: "transportation",
    cap: 10,
    label: "Transportation",
    covers: "Roads, bridges and highways, rail and public transit, airports and aviation, ports.",
  },
  {
    id: "law-crime",
    cap: 12,
    label: "Law and crime",
    covers:
      "Crime and policing, courts and sentencing, prisons, guns and gun violence, drug trafficking and cartels, domestic violence.",
  },
  {
    id: "social-welfare",
    cap: 13,
    label: "Social welfare",
    covers:
      "Poverty and the safety net, food assistance, Social Security, child care, support for seniors and people with disabilities.",
  },
  {
    id: "housing",
    cap: 14,
    label: "Housing",
    covers: "Housing affordability, rent and mortgages, homeownership, homelessness.",
  },
  {
    id: "commerce",
    cap: 15,
    label: "Banking, finance and commerce",
    covers:
      "Banks and Wall Street, small business, corporations and competition, consumer protection, bankruptcy, disaster relief.",
  },
  {
    id: "defence",
    cap: 16,
    label: "Defence",
    covers:
      "The military and troops, veterans, national security, terrorism and homeland security, weapons and defence spending, the conduct of wars.",
  },
  {
    id: "technology",
    cap: 17,
    label: "Science and technology",
    covers:
      "Science and research, space, the internet and broadband, telecommunications, technology companies, artificial intelligence, cybersecurity.",
  },
  {
    id: "foreign-trade",
    cap: 18,
    label: "Foreign trade",
    covers: "Trade agreements, tariffs, imports and exports, offshoring of jobs.",
  },
  {
    id: "international",
    cap: 19,
    label: "International affairs",
    covers:
      "Foreign policy and diplomacy, relations with other countries, alliances such as NATO, foreign aid, human rights abroad.",
  },
  {
    id: "government",
    cap: 20,
    label: "Government operations",
    covers:
      "How government runs: Congress and the federal bureaucracy, ethics and corruption, campaign finance and lobbying, election administration, courts and appointments, the census.",
  },
  {
    id: "public-lands",
    cap: 21,
    label: "Public lands and tribal affairs",
    covers:
      "National parks and federal lands, forests and wildfire management, water resources, Native American and tribal affairs, US territories.",
  },
  {
    id: "culture",
    cap: 23,
    label: "Culture and the arts",
    covers: "Arts, museums, humanities and cultural policy.",
  },
  {
    id: "none",
    cap: 0,
    label: "No policy topic",
    covers:
      "Not about a policy subject: campaign events and logistics, thanks and greetings, endorsements, polls and fundraising, biography, and attacks or praise without a policy subject.",
  },
] as const;

const BY_ID = new Map(CODEBOOK.map((t) => [t.id, t]));

export function topicById(id: TopicId): Topic {
  return BY_ID.get(id)!;
}

export function isTopicId(x: unknown): x is TopicId {
  return typeof x === "string" && BY_ID.has(x as TopicId);
}

export function topicLabel(id: TopicId): string {
  return topicById(id).label;
}

/** The decision rules given to the human coder and, word for word, to the model. */
export const CODING_RULES = [
  "Give each excerpt exactly one label: the policy subject the excerpt is mainly about.",
  "If two subjects are equally prominent, choose the one mentioned first.",
  "Code what the excerpt is about, not what you think the speaker's position is; never judge whether a claim is true.",
  'Campaign events, thanks, endorsements, polls, fundraising, biography, and attacks or praise without a policy subject are "none".',
  "Use only the excerpt itself; do not guess from who might have said it.",
] as const;
