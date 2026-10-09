/**
 * Field derivations from documents.ipynb `extract_document_info`, ported as-is.
 *
 * Two quirks are reproduced on purpose because the stored CSV depends on them:
 * the paragraph separator is a literal backslash-n pair (the notebook source
 * escaped it twice), and the location regex contains `\\s` (a literal
 * backslash) so only the first capitalised word after "in " is captured.
 */

import { pySplit } from "@/lib/py";

export type DocumentType =
  | "Debate"
  | "Speech/Remarks"
  | "Interview"
  | "Statement"
  | "Address"
  | "Document";

/** The four characters `\n\n` that separate paragraphs in `Document_Content`. */
export const LITERAL_PARAGRAPH_SEPARATOR = "\\n\\n";

/** Determine document type from the page title (first matching rule wins). */
export function classifyDocumentType(title: string): DocumentType {
  const t = title.toLowerCase();
  if (t.includes("debate")) return "Debate";
  if (["remarks", "speech"].some((w) => t.includes(w))) return "Speech/Remarks";
  if (t.includes("interview")) return "Interview";
  if (t.includes("statement")) return "Statement";
  if (t.includes("address")) return "Address";
  return "Document";
}

// r"in ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)" and r"at the (...)": the doubled
// backslash means "a literal backslash followed by s", so the group repeats
// only on text that contains a backslash.
const LOCATION_PATTERNS = [
  /in ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)/,
  /at the ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)/,
];

/** Location "extracted from title" (empty string when nothing matches). */
export function extractLocation(title: string): string {
  for (const pattern of LOCATION_PATTERNS) {
    const m = pattern.exec(title);
    if (m) return m[1];
  }
  return "";
}

/** `"\\n\\n".join(content_parts)` */
export function joinParagraphs(parts: string[]): string {
  return parts.join(LITERAL_PARAGRAPH_SEPARATOR);
}

/** Inverse of {@link joinParagraphs} for stored `Document_Content`. */
export function splitStoredContent(content: string): string[] {
  return content ? content.split(LITERAL_PARAGRAPH_SEPARATOR) : [];
}

/** `len(" ".join(content_parts).split())` */
export function wordCount(parts: string[]): number {
  return pySplit(parts.join(" ")).length;
}
