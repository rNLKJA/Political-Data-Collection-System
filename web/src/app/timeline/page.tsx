import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Callout, EmptyState, SourceLink, StatTile, TableView } from "@/components/common/bits";
import { PageIntro, Panel } from "@/components/common/page-intro";
import { TimelineChart, type ChartSeries } from "@/components/timeline/timeline-chart";
import { TimelineControls } from "@/components/timeline/timeline-controls";
import { DEFAULT_CONCEPT } from "@/lib/concepts";
import { formatDate, formatDecimal, formatInt } from "@/lib/format";
import { parseTimelineParams } from "@/lib/params";
import { normaliseTerm } from "@/lib/textkit";
import { buildHref } from "@/lib/url";
import { conceptSnippets, getConcepts, getSpeakers, speakerBySlug } from "@/server/corpus";
import {
  buildTimeline,
  conceptPerDoc,
  hasTerm,
  MIN_PERIOD_WORDS,
  suggestTerms,
  termPerDoc,
  timelinePeriods,
  topDocsForTerm,
} from "@/server/term-index";

export const metadata: Metadata = {
  title: "Term timeline",
  description:
    "How often a topic or word appears in US campaign documents, 2016 to 2024, per 10,000 words with exact Poisson confidence intervals.",
};

export default function TimelinePage(props: PageProps<"/timeline">) {
  return (
    <>
      <PageIntro kicker="Tool 04 · Term timeline" title="When a topic rose and fell">
        <p>
          Choose a topic from a fixed list of policy areas, or type any word. The line shows how
          often it appears per 10,000 words of campaign text in each period; the shaded band is an
          exact 95% interval, wide where there was little text to go on.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Suspense
          fallback={
            <div className="h-[34rem] animate-pulse rounded-lg bg-muted" aria-busy="true" />
          }
        >
          <TimelineResults searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}

/**
 * Palette slots follow the order candidates were added. The first three
 * slots are the ones validated for any pairing, so three series always stay
 * distinguishable.
 */
function assignSlots(ids: number[]): number[] {
  return ids.map((_, i) => i);
}

async function TimelineResults({
  searchParams,
}: {
  searchParams: PageProps<"/timeline">["searchParams"];
}) {
  const params = parseTimelineParams(await searchParams);
  const concepts = getConcepts();
  const speakers = getSpeakers();
  const chosen = params.speakers.map((s) => speakerBySlug(s)).filter((s) => !!s);
  const slots = assignSlots(chosen.map((s) => s.id));
  const term = params.term ? normaliseTerm(params.term) : "";
  const concept = term
    ? undefined
    : (concepts.find((c) => c.slug === params.concept) ??
      concepts.find((c) => c.slug === DEFAULT_CONCEPT)!);
  const current = {
    concept: concept && concept.slug !== DEFAULT_CONCEPT ? concept.slug : undefined,
    term: term || undefined,
    speakers: chosen.length ? chosen.map((s) => s.slug).join(",") : undefined,
    by: params.by === "quarter" ? undefined : params.by,
  };
  const controls = (
    <TimelineControls
      key={JSON.stringify(current)}
      current={current}
      concepts={concepts.map((c) => ({ slug: c.slug, label: c.label }))}
      speakers={speakers.map((s) => ({ slug: s.slug, name: s.name, docs: s.docs }))}
      selected={chosen.map((s, i) => ({ slug: s.slug, name: s.name, slot: slots[i] }))}
    />
  );

  const termKnown = term && !term.includes(" ") && hasTerm(term);
  if (term && !termKnown) {
    const prefix = term.split(" ")[0].slice(0, 4);
    const suggestions = prefix.length >= 2 ? suggestTerms(prefix) : [];
    return (
      <div className="space-y-8">
        {controls}
        <EmptyState title={`“${params.term}” is not in the word index`}>
          <p>
            The index holds single words that appear in at least five documents, without common
            function words such as “the” or “we”. Phrases are available through the topic list.
          </p>
          {suggestions.length ? (
            <p className="mt-3">
              Similar indexed words:{" "}
              {suggestions.map((s, i) => (
                <span key={s}>
                  {i ? ", " : ""}
                  <Link
                    href={buildHref("/timeline", { ...current, term: s })}
                    className="inline-link font-mono"
                  >
                    {s}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </EmptyState>
      </div>
    );
  }

  const perDoc = term ? termPerDoc(term) : conceptPerDoc(concept!.id);
  const series = buildTimeline(
    perDoc,
    chosen.map((s) => s.slug),
    params.by,
  );
  const periods = timelinePeriods(params.by);
  const chartSeries: ChartSeries[] = series.map((s, i) => ({
    key: s.key,
    label: s.label,
    slot: chosen.length ? slots[i] : 0,
    points: s.points,
  }));
  const subject = term ? `“${term}”` : concept!.label;
  const patterns = concept?.patterns ?? [term];
  const snippets = concept
    ? conceptSnippets(
        concept.id,
        chosen.map((s) => s.id),
        6,
      )
    : [];
  const docs = term
    ? topDocsForTerm(
        perDoc,
        chosen.map((s) => s.slug),
        6,
      )
    : [];
  const peak = series.map((s) =>
    s.points.reduce(
      (best, p) => (p.k > 0 && p.rate > (best?.rate ?? -1) ? p : best),
      undefined as (typeof s.points)[number] | undefined,
    ),
  );

  return (
    <div className="space-y-10">
      {controls}

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {series.slice(0, 3).map((s, i) => (
          <StatTile
            key={s.key}
            label={`${s.label}, whole period`}
            value={`${formatDecimal(s.total.rate, 2)}`}
            note={`per 10k words · 95% ${formatDecimal(s.total.lower, 2)} to ${formatDecimal(s.total.upper, 2)}${peak[i] ? ` · peak ${peak[i]!.period}` : ""}`}
          />
        ))}
        <StatTile
          label="Counted as"
          value={<span className="text-lg leading-tight font-medium">{subject}</span>}
          note={concept ? `matches: ${patterns.join(", ")}` : "a single indexed word"}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl">
            {subject} per 10,000 words, by {params.by}
          </h2>
          <p className="text-xs text-muted-foreground">
            Denominator: words in the candidates&apos; own voice
          </p>
        </div>
        <div className="mt-4">
          <TimelineChart
            periods={periods}
            series={chartSeries}
            label={`Line chart of ${subject} per 10,000 words by ${params.by} for ${series.map((s) => s.label).join(", ")}, with 95% intervals`}
          />
        </div>
        {series.some((s) => s.hidden) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Periods with fewer than {formatInt(MIN_PERIOD_WORDS)} words of text are left off the
            chart (
            {series
              .filter((s) => s.hidden)
              .map((s) => `${s.label}: ${s.hidden}`)
              .join("; ")}
            ); they still count towards the whole-period rate.
          </p>
        ) : null}
        <TableView
          caption={`${subject} per 10,000 words by ${params.by}`}
          head={["Series", "Period", "Mentions", "Words", "Per 10k", "95% low", "95% high"]}
          rows={series.flatMap((s) =>
            s.points.map((p) => [
              s.label,
              p.period,
              formatInt(p.k),
              formatInt(p.words),
              formatDecimal(p.rate, 2),
              formatDecimal(p.lower, 2),
              formatDecimal(p.upper, 2),
            ]),
          )}
        />
      </Panel>

      <Panel>
        <h2 className="font-serif text-xl">
          {concept ? "In their words" : "Where it appears most"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {concept
            ? `Short passages (25 words or fewer) from the documents that use ${concept.label.toLowerCase()} terms most${chosen.length ? "" : ", one per speaker"}, picked by count alone. Quoting is not endorsement; each links to the full text.`
            : "Documents with the most uses of this word. Each links to the full text."}
        </p>
        {concept ? (
          snippets.length ? (
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {snippets.map((s) => (
                <li
                  key={s.docId}
                  className="rounded-md border border-border/80 bg-background/60 p-4"
                >
                  <blockquote className="font-serif text-[1.02rem] leading-relaxed">
                    {s.snippet.slice(0, s.hlStart)}
                    <mark className="hit">{s.snippet.slice(s.hlStart, s.hlEnd)}</mark>
                    {s.snippet.slice(s.hlEnd)}
                  </blockquote>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{s.speaker}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={s.date}>{formatDate(s.date)}</time>
                    <span aria-hidden>·</span>
                    <SourceLink href={s.url} className="text-xs">
                      {s.title.length > 60 ? `${s.title.slice(0, 58)}…` : s.title}
                    </SourceLink>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No passages for this selection.</p>
          )
        ) : docs.length ? (
          <ul className="mt-4 divide-y divide-border/70">
            {docs.map((d) => (
              <li key={d.id} className="py-2.5 text-sm">
                <p className="font-serif leading-snug">{d.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{d.speaker}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={d.date}>{formatDate(d.date)}</time>
                  <span aria-hidden>·</span>
                  <span className="tabular">used {formatInt(d.count)}×</span>
                  <SourceLink href={d.url} className="text-xs">
                    Read on APP
                  </SourceLink>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Not used by this selection.</p>
        )}
      </Panel>

      <Callout title="Reading the bands">
        A rate per 10,000 words lets busy and quiet months be compared. The interval treats each
        period&apos;s count as Poisson: with 10,000 words and no mentions the band still reaches
        about 3.7 per 10k. Topic lists are matched as whole words or phrases after lower-casing;
        they count mentions, not stances. See{" "}
        <Link href="/method#timeline" className="inline-link">
          Method
        </Link>
        .
      </Callout>
    </div>
  );
}
