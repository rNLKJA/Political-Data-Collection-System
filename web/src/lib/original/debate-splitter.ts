/**
 * Transcript splitting from debates.ipynb (`_clean_whitespace`,
 * `_extract_label_block` and the content half of `extract_debate_info`),
 * ported line by line. Given the inner HTML of a transcript's
 * `div.field-docs-content`, it returns the same Participants, Moderators and
 * plain-text fields that the notebook wrote to `debates_data_processed.csv`.
 */

import type { Element } from "domhandler";

import { PY_WS, pyRstrip, pyStrip } from "@/lib/py";
import { decodeContents, find, findAll, getText, parseHtml } from "@/lib/original/soup";

/** `_clean_whitespace`: strip lines, trim blank edges, collapse 3+ newlines. */
export function cleanWhitespace(text: string): string {
  const lines = text
    .replaceAll("\r", "")
    .split("\n")
    .map((ln) => pyStrip(ln));
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

const BR_RE = new RegExp(`<br${PY_WS}*/?>`, "gi");
const TRAILING_PUNCT_RE = new RegExp(`[.;]${PY_WS}*$`);
const SENTINEL = "|||BR|||";

/**
 * `_extract_label_block(p_tag, label)`: drop the bold label, split the rest on
 * `<br>` and semicolons, and trim list punctuation.
 */
export function extractLabelBlock(p: Element, label: string): [string[], string] {
  const innerHtml = decodeContents(p);
  const labelRe = new RegExp(`^${PY_WS}*<b>${PY_WS}*${label}${PY_WS}*:${PY_WS}*</b>${PY_WS}*`, "i");
  const withoutLabel = innerHtml.replace(labelRe, "");
  const temp = withoutLabel.replace(BR_RE, SENTINEL);
  const plain = pyStrip(getText(parseHtml(temp), " "));
  const parts = plain.split(SENTINEL).map((part) => pyStrip(part, " ;"));
  const finalParts: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const segs = part
      .split(";")
      .map((s) => pyStrip(s))
      .filter((s) => s.length > 0);
    finalParts.push(...segs);
  }
  const cleaned = finalParts.map((s) => pyStrip(s.replace(TRAILING_PUNCT_RE, "")));
  return [cleaned, cleaned.join("\n")];
}

export interface SplitTranscript {
  participants: string;
  participantsList: string[];
  moderators: string;
  moderatorsList: string[];
  text: string;
}

/**
 * The part of `extract_debate_info` that runs after the page is fetched,
 * applied to the inner HTML of `div.field-docs-content`.
 */
export function splitTranscript(contentInnerHtml: string): SplitTranscript {
  const result: SplitTranscript = {
    participants: "",
    participantsList: [],
    moderators: "",
    moderatorsList: [],
    text: "",
  };
  // The notebook parsed the whole page and selected the div; parsing the
  // stored inner HTML inside a wrapper gives the same subtree.
  const doc = parseHtml(`<div class="field-docs-content">${contentInnerHtml}</div>`);
  const contentDiv = find(doc, "div");
  if (!contentDiv) return result;

  let participantsFound = false;
  let moderatorsFound = false;
  for (const p of findAll(contentDiv, "p")) {
    const bold = find(p, "b");
    if (!bold) continue;
    const labelText = pyRstrip(getText(bold, "", true), ":").toLowerCase();
    if (!participantsFound && labelText.startsWith("participants")) {
      const [plist] = extractLabelBlock(p, "participants");
      if (plist.length) {
        result.participantsList = plist;
        result.participants = plist.join("; ");
        participantsFound = true;
      }
      continue;
    }
    if (!moderatorsFound && labelText.startsWith("moderators")) {
      const [mlist] = extractLabelBlock(p, "moderators");
      if (mlist.length) {
        result.moderatorsList = mlist;
        result.moderators = mlist.join("; ");
        moderatorsFound = true;
      }
      continue;
    }
  }

  // content_clone = BeautifulSoup(str(content_div)); its only child is the
  // div itself, so the generic branch applies: every text node, stripped and
  // joined with newlines (<br> placeholders strip to nothing).
  const parts: string[] = [];
  const txt = getText(contentDiv, "\n", true);
  if (txt) parts.push(txt);
  result.text = cleanWhitespace(parts.join("\n\n"));
  return result;
}

// Characters str.isprintable() rejects: Unicode "Other" and "Separator"
// categories, except the ordinary space.
const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function escapeNonPrintable(c: string): string {
  if (c === " " || !NON_PRINTABLE.test(c)) return c;
  const cp = c.codePointAt(0)!;
  const hex = cp.toString(16);
  if (cp < 0x100) return `\\x${hex.padStart(2, "0")}`;
  if (cp < 0x10000) return `\\u${hex.padStart(4, "0")}`;
  return `\\U${hex.padStart(8, "0")}`;
}

/**
 * Python's `str(list)` for a list of strings, as stored in `Participants_List`:
 * each item is `repr(item)`, which picks the quote, escapes backslashes, \t \n
 * \r and any character that is not printable (e.g. a non-breaking space
 * becomes \xa0).
 */
export function pythonListRepr(items: string[]): string {
  const quote = (s: string) => {
    const useDouble = s.includes("'") && !s.includes('"');
    const q = useDouble ? '"' : "'";
    let body = "";
    for (const c of s) {
      if (c === "\\") body += "\\\\";
      else if (c === q) body += `\\${q}`;
      else if (c === "\n") body += "\\n";
      else if (c === "\r") body += "\\r";
      else if (c === "\t") body += "\\t";
      else body += escapeNonPrintable(c);
    }
    return `${q}${body}${q}`;
  };
  return `[${items.map(quote).join(", ")}]`;
}
