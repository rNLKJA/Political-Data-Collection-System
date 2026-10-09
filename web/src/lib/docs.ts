/**
 * Parsing for the markdown documents the site renders under /methods
 * (decision records and the model card). Pure functions;
 * the file reading lives in `src/server/docs.ts`.
 */

import { SITE } from "./site";

export type DecisionRecord = {
  /** "dr-001-no-full-text-on-the-site" */
  slug: string;
  /** "DR-001-no-full-text-on-the-site.md" */
  file: string;
  /** "DR-001" */
  id: string;
  title: string;
  /** the one-line decision stated at the top */
  decision: string;
  status: string;
  decided: string;
  /** when the record was written (later than `decided` for records made in hindsight) */
  recorded: string;
  /** markdown after the H1 */
  body: string;
  /** earlier records this one amends, corrects or supersedes ("DR-004") */
  amends: string[];
  /** later records that amend this one (filled in by `linkAmendments`) */
  amendedBy: Array<{ id: string; slug: string; title: string }>;
};

const CHANGE_WORDS = /\b(amend(s|ed)?|correct(s|ed|ions?)?|supersed(e|es|ed)|replac(e|es|ed))\b/i;

/**
 * The records a record changes: an "Amends" column in its meta table, or any
 * sentence of its decision line that both names a record and says it amends,
 * corrects, supersedes or replaces it ("This amends the scoring rule of
 * DR-004", "Two statements in DR-003 are corrected here").
 */
export function parseAmends(
  id: string,
  decision: string,
  meta: Readonly<Record<string, string>>,
): string[] {
  const found = new Set<string>();
  for (const m of (meta.Amends ?? "").matchAll(/DR-\d{3}/g)) found.add(m[0]);
  for (const sentence of decision.split(/(?<=\.)\s+/)) {
    if (!CHANGE_WORDS.test(sentence)) continue;
    for (const m of sentence.matchAll(/DR-\d{3}/g)) found.add(m[0]);
  }
  found.delete(id);
  return [...found].sort();
}

/** Point each record at the later records that amend it. */
export function linkAmendments(records: readonly DecisionRecord[]): DecisionRecord[] {
  return records.map((r) => ({
    ...r,
    amendedBy: records
      .filter((later) => later.amends.includes(r.id))
      .map((later) => ({ id: later.id, slug: later.slug, title: later.title })),
  }));
}

/** "DR-001-foo-bar.md" -> "dr-001-foo-bar" */
export function decisionSlug(file: string): string {
  return file.replace(/\.md$/, "").toLowerCase();
}

/** Split off the first-level heading. */
export function splitTitle(markdown: string): { title: string; body: string } {
  const m = /^#\s+(.+)\r?\n/.exec(markdown);
  if (!m) return { title: "", body: markdown };
  return { title: m[1].trim(), body: markdown.slice(m[0].length).replace(/^\s+/, "") };
}

function stripMarkdown(s: string): string {
  return s.replace(/\*\*|`/g, "").trim();
}

/** The first markdown table's header row mapped onto its first data row. */
export function firstTable(markdown: string): Record<string, string> {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith("|"));
  if (start < 0 || start + 2 >= lines.length) return {};
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(lines[start]);
  const row = cells(lines[start + 2]);
  return Object.fromEntries(head.map((h, i) => [h, row[i] ?? ""]));
}

export function parseDecisionRecord(file: string, markdown: string): DecisionRecord {
  const { title: h1, body } = splitTitle(markdown);
  const m = /^(DR-\d{3}):\s*(.+)$/.exec(h1);
  if (!m) throw new Error(`${file}: the title must read "DR-00N: ..."`);
  const decisionLine = /^\*\*Decision:\*\*\s*(.+)$/m.exec(body);
  if (!decisionLine) throw new Error(`${file}: the decision must be stated first`);
  const meta = firstTable(body);
  const decision = stripMarkdown(decisionLine[1]);
  return {
    slug: decisionSlug(file),
    file,
    id: m[1],
    title: m[2].trim(),
    decision,
    status: meta.Status ?? "",
    decided: meta.Decided ?? "",
    recorded: meta.Recorded ?? "",
    body,
    amends: parseAmends(m[1], decision, meta),
    amendedBy: [],
  };
}

/**
 * Map a link written for GitHub (relative .md paths, or a full URL on the
 * production site) onto the site's routes. Other links are returned unchanged.
 */
export function resolveDocHref(href: string): string {
  if (href.startsWith(`${SITE.url}/`)) return href.slice(SITE.url.length);
  if (/^[a-z]+:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  const [path, hash] = href.split("#");
  const file = path.split("/").pop() ?? "";
  const anchor = hash ? `#${hash}` : "";
  if (file === "model-card.md") return `/methods/model-card${anchor}`;
  if (/^DR-\d{3}-.+\.md$/.test(file)) return `/methods/decisions/${decisionSlug(file)}${anchor}`;
  if (file === "README.md" && path.includes("decisions")) return "/methods#decisions";
  return href;
}

/** Heading text -> anchor id ("What I'd change" -> "what-id-change"). */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
