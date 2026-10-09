import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { Callout, EmptyState, SourceLink, StatTile, TableView } from "@/components/common/bits";
import { PageIntro, Panel } from "@/components/common/page-intro";
import { TimelineChart, type ChartSeries } from "@/components/timeline/timeline-chart";
import { TimelineControls } from "@/components/timeline/timeline-controls";
import { SERIES_VARS } from "@/lib/chart";
import { DEFAULT_CONCEPT } from "@/lib/concepts";
import { formatDate, formatDecimal, formatInt } from "@/lib/format";
import { parseTimelineParams } from "@/lib/params";
import { conceptRanges, normaliseTerm } from "@/lib/textkit";
import { buildHref } from "@/lib/url";
import { cn } from "@/lib/utils";
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

async function TimelineResults({
  searchParams,
}: {
  searchParams: PageProps<"/timeline">["searchParams"];
}) {
  const params = parseTimelineParams(await searchParams);
  const concepts = getConcepts();
  const speakers = getSpeakers();
  const chosen = params.speakers.map((s) => speakerBySlug(s)).filter((s) => !!s);
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
      // Palette slots follow the order candidates were added; the first three
      // slots are validated for any pairing, so three series stay distinguishable.
      selected={chosen.map((s, i) => ({ slug: s.slug, name: s.name, slot: i }))}
    />
  );

  if (params.term && !term) {
    return (
      <div className="space-y-8">
        {controls}
        <EmptyState title={`“${params.term}” has no letters to look up`}>
          <p>
            The word index holds words made of letters only, so numbers and symbols such as “2020”
            or “9/11” cannot be charted. Try a word, or pick a topic from the list.
          </p>
        </EmptyState>
      </div>
    );
  }

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
    slot: chosen.length ? i : 0,
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
  const slotOf = new Map(chosen.map((s, i) => [s.name, i]));
  const docGroups = term
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
          note={
            concept
              ? `matches: ${patterns.join(", ")}${patterns.some((p) => /^[A-Z]/.test(p)) ? " (capitalised only)" : ""}`
              : "a single indexed word"
          }
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
          {series.every((s) => s.points.length === 0) ? (
            <div className="grid min-h-60 place-items-center rounded-md border border-dashed border-border bg-background/50 p-6 text-center">
              <div>
                <p className="font-serif text-lg">Too little text per {params.by} to plot</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Every {params.by} here has fewer than {formatInt(MIN_PERIOD_WORDS)} words, so the
                  rates would be mostly noise.{" "}
                  {params.by === "year"
                    ? "Try another candidate, or clear the candidates to see the whole field."
                    : "A longer period pools more text."}
                </p>
                <p className="mt-3 flex flex-wrap justify-center gap-2">
                  {(params.by === "month"
                    ? (["quarter", "year"] as const)
                    : params.by === "quarter"
                      ? (["year"] as const)
                      : []
                  ).map((b) => (
                    <Link
                      key={b}
                      href={buildHref("/timeline", {
                        ...current,
                        by: b === "quarter" ? undefined : b,
                      })}
                      className="rounded-full border border-border px-3 py-1 text-sm hover:bg-accent"
                    >
                      Show by {b}
                    </Link>
                  ))}
                </p>
              </div>
            </div>
          ) : (
            <TimelineChart
              periods={periods}
              series={chartSeries}
              label={`Line chart of ${subject} per 10,000 words by ${params.by} for ${series.map((s) => s.label).join(", ")}, with 95% intervals`}
            />
          )}
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
            ? `Short passages (25 words or fewer) from the documents that use ${concept.label.toLowerCase()} terms most${chosen.length ? "" : ", one per speaker"}, picked by count. Passages that name another candidate or use name-calling are skipped for the next use. Quoting is not endorsement; each links to the full text.`
            : `Documents with the most uses of this word${chosen.length > 1 ? ", the same number for each speaker" : ""}. Each links to the full text.`}
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
                    <Highlighted
                      text={s.snippet}
                      ranges={conceptRanges(s.snippet, patterns, [s.hlStart, s.hlEnd])}
                    />
                  </blockquote>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {slotOf.has(s.speaker) ? (
                        <LegendSwatch
                          color={SERIES_VARS[slotOf.get(s.speaker)! % SERIES_VARS.length]}
                          shape="line"
                        />
                      ) : null}
                      {s.speaker}
                    </span>
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
        ) : docGroups.some((g) => g.docs.length) ? (
          <div className={cn("mt-4 grid gap-6", docGroups.length > 1 && "md:grid-cols-2")}>
            {docGroups.map((g) => (
              <div key={g.group}>
                {chosen.length ? (
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <LegendSwatch color={SERIES_VARS[g.group % SERIES_VARS.length]} shape="line" />
                    {chosen[g.group]?.name}
                  </p>
                ) : null}
                {g.docs.length ? (
                  <ul className="mt-1 divide-y divide-border/70">
                    {g.docs.map((d) => (
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
                  <p className="mt-2 text-sm text-muted-foreground">Not used by this speaker.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Not used by this selection.</p>
        )}
      </Panel>

      <Callout title="Reading the bands">
        A rate per 10,000 words lets busy and quiet months be compared. The interval treats each
        period&apos;s count as Poisson: with 10,000 words and no mentions the band still reaches
        about 3.7 per 10k. Topic lists are matched as whole words or phrases, ignoring case except
        for the two party names, which count only when capitalised; they count mentions, not
        stances. See{" "}
        <Link href="/method#timeline" className="inline-link">
          Method
        </Link>
        .
      </Callout>
    </div>
  );
}

/** `text` with each of the (sorted, non-overlapping) `ranges` marked. */
function Highlighted({ text, ranges }: { text: string; ranges: Array<[number, number]> }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a < at) continue;
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={a} className="hit">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
