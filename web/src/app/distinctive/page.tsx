import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { Callout, EmptyState, SourceLink, StatTile } from "@/components/common/bits";
import { PageIntro, Panel } from "@/components/common/page-intro";
import { FunnelPlot, type FunnelLabel } from "@/components/distinctive/funnel-plot";
import { GroupControls } from "@/components/distinctive/group-controls";
import { StabilityPanel } from "@/components/distinctive/stability-panel";
import { WordColumn } from "@/components/distinctive/word-column";
import { formatCompact, formatDate, formatInt } from "@/lib/format";
import { parseDistinctiveParams } from "@/lib/params";
import { buildHref } from "@/lib/url";
import { getSpeakers } from "@/server/corpus";
import {
  computeFightinWords,
  computeStability,
  groupLabel,
  groupToken,
  parseGroup,
  termExamples,
  type GroupSpec,
} from "@/server/term-index";

export const metadata: Metadata = {
  title: "Distinctive words",
  description:
    "Compare the vocabulary of any two candidates or election cycles with the weighted log-odds ratio and informative Dirichlet prior of Monroe, Colaresi and Quinn (2008).",
};

export default function DistinctivePage(props: PageProps<"/distinctive">) {
  return (
    <>
      <PageIntro kicker="Tool 02 · Distinctive words" title="How two vocabularies differ">
        <p>
          Pick two groups of documents: two candidates, two election cycles, or one group against
          everything else. Each word gets a z-score from the “Fightin&apos; Words” method (Monroe,
          Colaresi and Quinn, 2008): how much more often one group uses it than the other, shrunk
          towards the whole archive so rare words do not dominate.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Suspense
          fallback={
            <div className="h-[36rem] animate-pulse rounded-lg bg-muted" aria-busy="true" />
          }
        >
          <DistinctiveResults searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}

function overlaps(a: GroupSpec, b: GroupSpec): boolean {
  if (b.rest || a.rest) return false;
  const speakerClash = !a.speaker || !b.speaker || a.speaker === b.speaker;
  const cycleClash = !a.cycle || !b.cycle || a.cycle === b.cycle;
  return speakerClash && cycleClash;
}

async function DistinctiveResults({
  searchParams,
}: {
  searchParams: PageProps<"/distinctive">["searchParams"];
}) {
  const params = parseDistinctiveParams(await searchParams);
  const a = parseGroup(params.a) ?? { cycle: 2016 as const };
  const bParsed = parseGroup(params.b) ?? { cycle: 2024 as const };
  const b: GroupSpec = groupToken(a) === groupToken(bParsed) ? { rest: true } : bParsed;
  const current = {
    a: groupToken(a),
    b: groupToken(b),
    prior: params.prior === 10_000 ? undefined : String(params.prior),
    word: params.word,
  };
  const speakers = getSpeakers().map((s) => ({ slug: s.slug, name: s.name, docs: s.docs }));
  const labelA = groupLabel(a);
  const labelB = groupLabel(b, a);
  const view = computeFightinWords(a, b, params.prior);
  const tooSmall = view.docsA === 0 || view.docsB === 0;
  const maxZ = Math.max(1, ...view.topA.map((w) => w.z), ...view.topB.map((w) => -w.z));
  const labels: FunnelLabel[] = [
    ...view.topA
      .slice(0, 7)
      .map((w) => ({ term: w.term, x: Math.log10(w.yA + w.yB), z: w.z, side: 1 as const })),
    ...view.topB
      .slice(0, 7)
      .map((w) => ({ term: w.term, x: Math.log10(w.yA + w.yB), z: w.z, side: 2 as const })),
  ];
  const hrefFor = (term: string) =>
    buildHref("/distinctive", { ...current, word: term }) + "#examples";
  const examplesA = params.word ? termExamples(params.word, a, null) : [];
  const examplesB = params.word ? termExamples(params.word, b, a) : [];

  return (
    <div className="space-y-10">
      <GroupControls key={JSON.stringify(current)} current={current} speakers={speakers} />

      {tooSmall ? (
        <EmptyState title="One of the groups has no documents">
          That candidate has no documents in the chosen cycle. Try “All cycles” or another cycle.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <StatTile
              label="Group A"
              value={
                <span className="flex items-center gap-2 text-lg leading-tight sm:text-xl">
                  <LegendSwatch color="var(--series-1)" /> {labelA}
                </span>
              }
              note={`${formatInt(view.docsA)} documents · ${formatCompact(view.nA)} indexed words`}
            />
            <StatTile
              label="Group B"
              value={
                <span className="flex items-center gap-2 text-lg leading-tight sm:text-xl">
                  <LegendSwatch color="var(--series-2)" /> {labelB}
                </span>
              }
              note={`${formatInt(view.docsB)} documents · ${formatCompact(view.nB)} indexed words`}
            />
            <StatTile
              label="Words beyond |z| = 1.96"
              value={formatInt(view.significant)}
              note={`of ${formatInt(view.compared)} words used by either group · about ${formatInt(Math.round(view.compared * 0.05))} would pass by chance · ${formatInt(view.strong)} beyond 3.29`}
            />
            <StatTile
              label="Prior strength α₀"
              value={formatInt(view.alpha0)}
              note="pseudo-words from the whole archive"
            />
          </div>

          {overlaps(a, b) ? (
            <Callout title="These groups overlap">
              Some documents belong to both groups, which pulls the scores towards zero. For a clean
              contrast, compare two candidates, two cycles, or one group against “everyone else”.
            </Callout>
          ) : null}

          <Panel>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl">Every word at once</h2>
              <p className="text-xs text-muted-foreground">
                {formatInt(view.cloud.length)} words shown; the labelled ones lead each list
              </p>
            </div>
            <p className="mt-1 mb-4 max-w-3xl text-sm text-muted-foreground">
              Common words can reach large z-scores with small differences; rare words need big
              ones. The horizontal rules mark z = ±1.96.
            </p>
            <FunnelPlot cloud={view.cloud} labels={labels} labelA={labelA} labelB={labelB} />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <LegendSwatch color="var(--series-1)" shape="dot" /> Leans {labelA}
              </span>
              <span className="flex items-center gap-1.5">
                <LegendSwatch color="var(--series-2)" shape="dot" /> Leans {labelB}
              </span>
              <span className="flex items-center gap-1.5">
                <LegendSwatch color="var(--chart-muted)" shape="dot" /> Within ±1.96
              </span>
            </div>
          </Panel>

          <div className="grid gap-8 lg:grid-cols-2">
            <Panel>
              <WordColumn
                side="A"
                title={labelA}
                words={view.topA}
                maxZ={maxZ}
                hrefFor={hrefFor}
                selected={params.word}
              />
            </Panel>
            <Panel>
              <WordColumn
                side="B"
                title={labelB}
                words={view.topB}
                maxZ={maxZ}
                hrefFor={hrefFor}
                selected={params.word}
              />
            </Panel>
          </div>

          <section id="stability" aria-labelledby="stability-heading">
            <Suspense
              fallback={
                <Panel>
                  <p className="font-serif text-xl">How stable are these lists?</p>
                  <p className="mt-2 text-sm text-muted-foreground" aria-busy="true">
                    Resampling documents and recomputing both lists…
                  </p>
                  <div className="mt-4 h-64 animate-pulse rounded-md bg-muted" />
                </Panel>
              }
            >
              <Stability a={a} b={b} alpha0={params.prior} labelA={labelA} labelB={labelB} />
            </Suspense>
          </section>

          <section id="examples" aria-labelledby="examples-heading">
            <Panel>
              <h2 id="examples-heading" className="font-serif text-xl">
                {params.word ? (
                  <>
                    Where <span className="font-mono text-[0.95em]">“{params.word}”</span> appears
                    most
                  </>
                ) : (
                  "Example documents"
                )}
              </h2>
              {params.word ? (
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  {[
                    { label: labelA, rows: examplesA, color: "var(--series-1)" },
                    { label: labelB, rows: examplesB, color: "var(--series-2)" },
                  ].map((g) => (
                    <div key={g.label}>
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <LegendSwatch color={g.color} /> {g.label}
                      </p>
                      {g.rows.length ? (
                        <ul className="mt-2 divide-y divide-border/70">
                          {g.rows.map((d) => (
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
                        <p className="mt-2 text-sm text-muted-foreground">
                          Not used in this group.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Select any word in the lists above to see the documents in each group that use it
                  most often, with links to read them in full on the archive.
                </p>
              )}
            </Panel>
          </section>

          <Callout title="How to read this">
            A high z-score says the two groups use a word at rates further apart than its counts
            would usually vary. Each word is tested on its own, so among thousands of words about 5%
            pass |z| = 1.96 by chance alone; the top of each list, or |z| above 3.29, is the
            stronger signal. A score says nothing about whether the word is used approvingly or
            critically, and press-release boilerplate (names, places, “county”) counts like any
            other word. Stop-words are excluded; words must appear in at least five documents.
            Details and formula on the{" "}
            <Link href="/methods#fightin-words" className="inline-link">
              methods page
            </Link>
            .
          </Callout>
        </>
      )}
    </div>
  );
}

/** Streams in after the lists: the bootstrap takes a moment for large groups. */
async function Stability({
  a,
  b,
  alpha0,
  labelA,
  labelB,
}: {
  a: GroupSpec;
  b: GroupSpec;
  alpha0: number;
  labelA: string;
  labelB: string;
}) {
  // Yield once so the lists above are sent before the resampling starts.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return <StabilityPanel view={computeStability(a, b, alpha0)} labelA={labelA} labelB={labelB} />;
}
