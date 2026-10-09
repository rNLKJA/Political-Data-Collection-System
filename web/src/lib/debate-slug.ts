import { slugify } from "@/lib/format";

const MAX_SLUG = 96;

/**
 * URL slugs for debates listed in date order: "<date>-<title>", trimmed to 96
 * characters. The archive holds a few transcripts that share a date and a
 * title (two versions of the same event); later ones get "-2", "-3", ... so
 * every transcript has its own address.
 */
export function debateSlugs(rows: readonly { date: string; title: string }[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}-${slugify(r.title)}`.slice(0, MAX_SLUG).replace(/-+$/, "");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}
