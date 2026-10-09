/** Shapes shared by the server data layer and the UI. */

export const CYCLES = [2016, 2020, 2024] as const;
export type Cycle = (typeof CYCLES)[number];

export const DOC_TYPES = [
  "Document",
  "Statement",
  "Speech/Remarks",
  "Debate",
  "Address",
  "Interview",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * How the original notebook typed a document from its title. The first rule
 * that matches wins, in this order: debate, remarks or speech, interview,
 * statement, address, otherwise Document.
 */
export const DOC_TYPE_NOTE: Record<DocType, string> = {
  Debate:
    "Title contains “debate” (checked first; mostly press releases about debates, not transcripts)",
  "Speech/Remarks": "Title contains “remarks” or “speech”, and not “debate”",
  Interview: "Title contains “interview”, and none of debate, remarks or speech",
  Statement: "Title contains “statement”, and none of debate, remarks, speech or interview",
  Address: "Title contains “address”, and none of the words above",
  Document: "Every other title, mostly campaign press releases",
};

export interface Speaker {
  id: number;
  name: string;
  slug: string;
  surname: string;
  title: string | null;
  docs: number;
  tokens: number;
  firstDate: string;
  lastDate: string;
}

export interface DocumentRow {
  id: number;
  url: string;
  date: string;
  title: string;
  speaker: string;
  speakerSlug: string;
  docType: string;
  wordCount: number;
  tokens: number;
  fkGrade: number | null;
}

export type DebateKind = "general" | "vice-presidential" | "primary";

export const DEBATE_KIND_LABEL: Record<DebateKind, string> = {
  general: "General election",
  "vice-presidential": "Vice-presidential",
  primary: "Primary",
};

export type Role = "candidate" | "moderator" | "other";

export const ROLE_LABEL: Record<Role, string> = {
  candidate: "Candidates",
  moderator: "Moderators, panellists and questioners",
  other: "Audience, recorded clips and unidentified",
};
