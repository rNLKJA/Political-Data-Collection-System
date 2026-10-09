import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { MonthlyColumns } from "@/components/charts/monthly-columns";
import { BarList, Callout, EmptyState, StatTile, TableView } from "@/components/common/bits";
import { PageIntro, Panel } from "@/components/common/page-intro";
import { DocumentList, Pagination } from "@/components/explorer/document-list";
import { ExplorerFilters } from "@/components/explorer/explorer-filters";
import { DOC_TYPE_NOTE, type DocType } from "@/lib/corpus-types";
import { formatCompact, formatDate, formatDecimal, formatInt, formatMonth } from "@/lib/format";
import { parseExplorerParams, type ExplorerParams } from "@/lib/params";
import { buildHref } from "@/lib/url";
import {
  allMonths,
  exploreDocuments,
  getSpeakers,
  PAGE_SIZE,
  speakerBySlug,
} from "@/server/corpus";

export const metadata: Metadata = {
  title: "Explorer",
  description:
    "Filter 7,556 US campaign documents (2016 to 2024) by candidate, document type, date and title, and see how many were published each month.",
};

export default function ExplorerPage(props: PageProps<"/explorer">) {
  return (
    <>
      <PageIntro kicker="Tool 01 · Explorer" title="The campaign document shelf">
        <p>
          Every campaign document the scraper collected, filed under the candidate The American
          Presidency Project lists it under. Narrow the shelf by candidate, type, year or title; the
          chart counts documents per month and the list links each one back to its source page.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Suspense fallback={<ExplorerSkeleton />}>
          <ExplorerResults searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}

function stateOf(p: ExplorerParams): Record<string, string | undefined> {
  return {
    speaker: p.speaker,
    type: p.type,
    from: p.from,
    to: p.to,
    q: p.q,
    page: p.page > 1 ? String(p.page) : undefined,
  };
}

async function ExplorerResults({
  searchParams,
}: {
  searchParams: PageProps<"/explorer">["searchParams"];
}) {
  const params = parseExplorerParams(await searchParams);
  const speaker = speakerBySlug(params.speaker);
  const result = exploreDocuments(
    {
      speakerId: speaker?.id,
      docType: params.type,
      from: params.from,
      to: params.to,
      q: params.q,
    },
    params.page,
  );
  const state = stateOf({ ...params, speaker: speaker?.slug });
  const months = allMonths().filter(
    (m) => (!params.from || m >= params.from) && (!params.to || m <= params.to),
  );
  const counts = Object.fromEntries(result.months.map((m) => [m.month, m.n]));
  const speakers = getSpeakers().map((s) => ({ slug: s.slug, name: s.name, docs: s.docs }));
  const first = result.months[0]?.month;
  const last = result.months[result.months.length - 1]?.month;
  const describe = [
    speaker?.name ?? "all speakers",
    params.type ? `type “${params.type}”` : null,
    params.q ? `titles containing “${params.q}”` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-10">
      <ExplorerFilters key={JSON.stringify(state)} current={state} speakers={speakers} />

      {result.total === 0 ? (
        <EmptyState title="No documents match these filters">
          Try a wider date range, another document type, or clear the title search.{" "}
          <Link href="/explorer" className="inline-link">
            Reset everything
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <StatTile
              label="Documents"
              value={formatInt(result.total)}
              note="of 7,556 de-duplicated"
            />
            <StatTile label="Words (original count)" value={formatCompact(result.words)} />
            <StatTile
              label="Median reading grade"
              value={formatDecimal(result.medianGrade)}
              note="Flesch-Kincaid, own-voice text"
            />
            <StatTile
              label="Span"
              value={
                first && last
                  ? `${formatMonth(first).slice(-4)}–${formatMonth(last).slice(-4)}`
                  : "–"
              }
              note={first && last ? `${formatMonth(first)} to ${formatMonth(last)}` : undefined}
            />
          </div>

          <Panel>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl">Documents per month</h2>
              <p className="text-xs text-muted-foreground">{describe}</p>
            </div>
            <div className="mt-4">
              <MonthlyColumns
                months={months}
                counts={counts}
                label={`Column chart of documents per month for ${describe}`}
              />
            </div>
            <TableView
              caption={`Documents per month, ${describe}`}
              head={["Month", "Documents"]}
              rows={result.months.map((m) => [formatMonth(m.month), formatInt(m.n)])}
            />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <h2 className="font-serif text-xl">By document type</h2>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">
                Types were assigned by the 2025 scraper from words in each title.
              </p>
              <BarList
                items={result.byType.map((t) => ({
                  key: t.docType,
                  label: (
                    <Link
                      href={buildHref("/explorer", { ...state, type: t.docType, page: undefined })}
                      className="hover:underline"
                      title={DOC_TYPE_NOTE[t.docType as DocType]}
                    >
                      {t.docType}
                    </Link>
                  ),
                  value: t.n,
                }))}
                format={formatInt}
              />
            </Panel>
            <Panel>
              <h2 className="font-serif text-xl">By candidate</h2>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">
                The twelve with the most documents under these filters.
              </p>
              <BarList
                items={result.bySpeaker.map((s) => ({
                  key: s.slug,
                  label: (
                    <Link
                      href={buildHref("/explorer", { ...state, speaker: s.slug, page: undefined })}
                      className="hover:underline"
                    >
                      {s.name}
                    </Link>
                  ),
                  value: s.n,
                }))}
                format={formatInt}
              />
            </Panel>
          </div>

          <section aria-labelledby="doc-list-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="doc-list-heading" className="font-serif text-xl">
                The documents
              </h2>
              <p className="text-sm text-muted-foreground">
                Newest first · page {result.page} of {formatInt(result.pages)}
              </p>
            </div>
            <div className="mt-4">
              <DocumentList
                rows={result.rows}
                start={(result.page - 1) * PAGE_SIZE + 1}
                speakerHref={(slug) =>
                  buildHref("/explorer", { ...state, speaker: slug, page: undefined })
                }
              />
            </div>
            <Pagination
              page={result.page}
              pages={result.pages}
              href={(p) =>
                buildHref("/explorer", { ...state, page: p > 1 ? String(p) : undefined })
              }
            />
          </section>

          <Callout title="Reading these numbers">
            Counts reflect what the APP archive filed in its campaign-documents category, not
            everything a campaign published; some campaigns posted far more press releases than
            others. Word counts are the scraper&apos;s originals. Reading grades use only text in
            the candidate&apos;s own voice: interviewer, audience and moderator turns inside
            transcripts are left out (see{" "}
            <Link href="/method#attribution" className="inline-link">
              Method
            </Link>
            ). Dates run from {formatDate("2016-01-01")} to {formatDate("2024-11-06")}.
          </Callout>
        </>
      )}
    </div>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading documents">
      <div className="h-36 animate-pulse rounded-lg bg-muted lg:h-28" />
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
