import Link from "next/link";

import { SourceLink } from "@/components/common/bits";
import type { DocumentRow } from "@/lib/corpus-types";
import { formatDate, formatDecimal, formatInt } from "@/lib/format";

/** Documents as catalogue cards: metadata only, the text stays on the APP. */
export function DocumentList({
  rows,
  start,
  speakerHref,
}: {
  rows: DocumentRow[];
  start: number;
  speakerHref: (slug: string) => string;
}) {
  return (
    <ol className="divide-y divide-border/80 border-y border-border/80" start={start}>
      {rows.map((d, i) => (
        <li key={d.id} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[7.5rem_1fr_auto]">
          <div className="flex items-baseline gap-2 font-mono text-xs text-muted-foreground sm:flex-col sm:gap-1">
            <span className="tabular">No. {formatInt(start + i)}</span>
            <time dateTime={d.date} className="tabular text-foreground/80">
              {formatDate(d.date)}
            </time>
          </div>
          <div className="min-w-0">
            <p className="font-serif text-[1.05rem] leading-snug">{d.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={speakerHref(d.speakerSlug)} className="hover:text-foreground hover:underline">
                {d.speaker}
              </Link>
              <span aria-hidden> · </span>
              {d.docType}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-1">
            <span className="tabular">{formatInt(d.wordCount)} words</span>
            <span className="tabular" title="Flesch-Kincaid grade level (documents of 100+ words)">
              Grade {formatDecimal(d.fkGrade)}
            </span>
            <SourceLink href={d.url} className="text-xs">
              Read on APP
            </SourceLink>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Pagination({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages])).filter(
    (n) => n >= 1 && n <= pages,
  );
  const linkCls =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border px-3 text-sm hover:bg-accent";
  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkCls} rel="prev" scroll={false}>
          Previous
        </Link>
      ) : null}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && n - nums[i - 1] > 1 ? <span className="text-muted-foreground">…</span> : null}
          {n === page ? (
            <span aria-current="page" className={`${linkCls} border-primary bg-primary text-primary-foreground hover:bg-primary`}>
              {n}
            </span>
          ) : (
            <Link href={href(n)} className={linkCls} scroll={false}>
              {n}
            </Link>
          )}
        </span>
      ))}
      {page < pages ? (
        <Link href={href(page + 1)} className={linkCls} rel="next" scroll={false}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
