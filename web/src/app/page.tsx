import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { MonthlyColumns } from "@/components/charts/monthly-columns";
import { BarList, StatTile, ToolCard } from "@/components/common/bits";
import { Panel, Section } from "@/components/common/page-intro";
import { formatCompact, formatDateLong, formatInt } from "@/lib/format";
import { APP_CITATION, SITE } from "@/lib/site";
import { allMonths, collectedCounts, exploreDocuments, getOverview } from "@/server/corpus";
import { listDebates } from "@/server/debates";

export default function HomePage() {
  const o = getOverview();
  const all = exploreDocuments({}, 1);
  const collected = collectedCounts();
  const months = allMonths();
  const counts = Object.fromEntries(all.months.map((m) => [m.month, m.n]));
  const debates = listDebates();
  const general = debates.filter((d) => d.kind !== "primary").length;

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20">
        <p className="kicker">A personal data project · collected 2025 · revived 2026</p>
        <h1 className="mt-4 max-w-4xl text-[2.6rem] leading-[1.03] font-medium tracking-tight sm:text-[4.2rem]">
          What US campaigns put on the record, <span className="italic">read closely.</span>
        </h1>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-4 text-[1.08rem] leading-relaxed text-muted-foreground">
            <p>
              In August 2025 I wrote two small Python scrapers for{" "}
              <a href={SITE.app} className="inline-link">
                The American Presidency Project
              </a>{" "}
              at UC Santa Barbara. One collected the archive&apos;s campaign documents from 2016 to
              2024; the other collected every presidential and vice-presidential debate transcript
              from 1960 to 2024, plus the primary debates it holds.
            </p>
            <p>
              Campaign Text Lab turns those CSV files into a reading room. It counts, compares and
              charts; it does not judge, predict or score anyone. The texts themselves stay on the
              archive, one click away from every number here.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/explorer"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Open the explorer <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/method"
                className="inline-flex h-11 items-center rounded-md border border-border px-5 text-sm font-medium hover:bg-accent"
              >
                How it was built
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-7 border-t border-rule/60 pt-6 lg:border-t-0 lg:border-l lg:pt-1 lg:pl-8">
            <StatTile
              label="Campaign documents"
              value={formatInt(o.documents)}
              note={`${o.speakers} speakers, 2016 to 2024`}
            />
            <StatTile
              label="Words in candidates' own voice"
              value={formatCompact(o.tokens)}
              note="after removing other speakers"
            />
            <StatTile
              label="Debate transcripts"
              value={formatInt(o.debates)}
              note={`${general} general-election and VP, ${o.debates - general} primary`}
            />
            <StatTile
              label="Speaking turns"
              value={formatInt(o.debateTurns)}
              note={`${formatCompact(o.debateWords)} words, 1960 to 2024`}
            />
          </dl>
        </div>
      </section>

      <div className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
        <Panel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Campaign documents per month</h2>
            <p className="text-xs text-muted-foreground">
              {formatDateLong(o.firstDate)} to {formatDateLong(o.lastDate)}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The archive fills up in election years: primaries in the first half, conventions and the
            general election after.
          </p>
          <div className="mt-4">
            <MonthlyColumns
              months={months}
              counts={counts}
              label="Column chart of campaign documents per month, 2016 to 2024"
            />
          </div>
        </Panel>
      </div>

      <Section id="tools" kicker="Four ways in" title="Choose a question" className="mt-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ToolCard href="/explorer" index="01 · Explorer" title="Who published what, when">
            Filter documents by candidate, type, year and title. See the monthly rhythm and open any
            document on the archive.
          </ToolCard>
          <ToolCard
            href="/distinctive"
            index="02 · Distinctive words"
            title="How two vocabularies differ"
          >
            Compare any two candidates or election cycles with the weighted log-odds method of
            Monroe, Colaresi and Quinn.
          </ToolCard>
          <ToolCard href="/debates" index="03 · Debates" title="Who held the floor">
            Talk share, turn lengths, moderator share and readability across 179 debates from 1960
            to 2024.
          </ToolCard>
          <ToolCard href="/timeline" index="04 · Term timeline" title="When a topic rose and fell">
            Mentions per 10,000 words over time, with exact confidence intervals and short quoted
            passages.
          </ToolCard>
        </div>
      </Section>

      <Section
        id="original"
        kicker="What the 2025 scrapers produced"
        title="The original results, as collected"
        description="The summary the 2025 notebook printed, from its own fields and all of its listing rows. The rest of the site counts each document once."
        className="mt-20"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <h3 className="font-serif text-lg">Documents by type</h3>
            <p className="mt-1 mb-4 text-xs text-muted-foreground">
              Assigned from title words by the scraper. All {formatInt(o.listingRows)} listing rows,
              as collected; {formatInt(o.listingRows - o.documents)} of them list a page a second
              time, so the site works with {formatInt(o.documents)} documents.
            </p>
            <BarList
              items={collected.byType.map((t) => ({
                key: t.docType,
                label: t.docType,
                value: t.n,
                note: t.docs !== t.n ? `${formatInt(t.docs)} once each` : undefined,
              }))}
              format={formatInt}
            />
          </Panel>
          <Panel>
            <h3 className="font-serif text-lg">Documents by candidate</h3>
            <p className="mt-1 mb-4 text-xs text-muted-foreground">
              The archive&apos;s own filing, as collected; volumes reflect how much each campaign
              released. Top eight of {formatInt(o.speakers)}.
            </p>
            <BarList
              items={collected.bySpeaker.slice(0, 8).map((s) => ({
                key: s.slug,
                label: s.name,
                value: s.n,
                note: s.docs !== s.n ? `${formatInt(s.docs)} once each` : undefined,
              }))}
              format={formatInt}
            />
          </Panel>
        </div>
      </Section>

      <Section
        id="ground-rules"
        kicker="Ground rules"
        title="Descriptive by design"
        className="mt-20"
      >
        <div className="grid gap-8 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
          <div>
            <p className="font-medium text-foreground">Symmetric</p>
            <p className="mt-1">
              Every candidate is treated the same way. Colours mark groups being compared, never
              parties; the defaults compare election cycles, not people.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Counts, not verdicts</p>
            <p className="mt-1">
              Word frequencies, turn lengths and reading grades describe texts. They are not
              measures of honesty, quality or sentiment, and nothing here forecasts anything.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">The texts stay at the source</p>
            <p className="mt-1">
              The database holds counts and metadata. Quotations are capped at 25 words and link to
              the archive page they come from.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="about"
        kicker="About this project"
        title="A personal project, 2025"
        className="mt-20"
      >
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div className="prose-archive space-y-3">
            <p>
              Campaign Text Lab started as a personal data-collection exercise in August 2025: two
              Jupyter notebooks that page through the archive politely (rate-limited, with retries,
              a pickle cache and a resumable checkpoint), parse each page with BeautifulSoup and
              write tidy CSVs. It was not coursework and is not affiliated with The American
              Presidency Project.
            </p>
            <p>
              In 2026 it was revived as this website. Nothing was re-scraped: a reproducible script
              reads the original CSVs and writes a small read-only SQLite database of derived
              statistics, which the site queries on the server. The original parsing code was ported
              to TypeScript and is tested against the original outputs, row for row.
            </p>
            <p>
              <span className="font-medium text-foreground">Provenance.</span> The notebooks and
              CSVs are preserved unchanged in the repository&apos;s{" "}
              <code className="inline">original/</code> folder. Source texts: {APP_CITATION}{" "}
              Copyright © The American Presidency Project.
            </p>
          </div>
          <dl className="grid content-start gap-5 text-sm">
            <div className="border-l border-rule/60 pl-4">
              <dt className="kicker">Type</dt>
              <dd className="mt-1">Personal project · 2025 (revived 2026)</dd>
            </div>
            <div className="border-l border-rule/60 pl-4">
              <dt className="kicker">Author</dt>
              <dd className="mt-1">Sunchuangyu (Rin) Huang</dd>
            </div>
            <div className="border-l border-rule/60 pl-4">
              <dt className="kicker">Original stack</dt>
              <dd className="mt-1 text-muted-foreground">
                Python, Jupyter, requests, BeautifulSoup4, pandas, ThreadPoolExecutor, tqdm
              </dd>
            </div>
            <div className="border-l border-rule/60 pl-4">
              <dt className="kicker">Revived stack</dt>
              <dd className="mt-1 text-muted-foreground">
                Next.js 16, React 19, TypeScript, Tailwind CSS 4, SQLite via node:sqlite, Python
                build scripts run with uv, Vitest
              </dd>
            </div>
            <div className="border-l border-rule/60 pl-4">
              <dt className="kicker">Code</dt>
              <dd className="mt-1">
                <a href={SITE.repo} className="inline-link">
                  rNLKJA/Political-Data-Collection-System
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </Section>
    </>
  );
}
