import type { Metadata } from "next";
import Link from "next/link";

import { ForestRows, type ForestRow } from "@/components/charts/forest-rows";
import { Callout, SourceLink, StatTile, TableView } from "@/components/common/bits";
import { PageIntro, Panel, Section } from "@/components/common/page-intro";
import { GradeTrend, type TrendGroup } from "@/components/readability/grade-trend";
import { CYCLES } from "@/lib/corpus-types";
import { formatDate, formatDecimal, formatInt, formatSigned } from "@/lib/format";
import {
  fractional,
  MIN_CLUSTERS_FOR_INTERVAL,
  MIN_GROUP_FOR_INTERVAL,
  READABILITY_RESAMPLES,
  REGISTER_LABEL,
  type Register,
} from "@/lib/readability-stats";
import { DEFAULT_SEED } from "@/lib/stats/bootstrap";
import { listDebates } from "@/server/debates";
import { readabilitySummary } from "@/server/readability";

export const metadata: Metadata = {
  title: "Readability, with intervals",
  description:
    "Flesch-Kincaid reading grade of debate transcripts (1960 to 2024) and campaign documents (2016 to 2024) with cluster-bootstrap and t intervals, and a demonstration of how much transcription alone moves the number.",
};

const REGISTER_COLOR: Record<Register, string> = {
  written: "var(--series-6)",
  transcribed: "var(--series-1)",
  address: "var(--series-3)",
};

const signed = (v: number, d = 2) => formatSigned(v, d);

export default function ReadabilityPage() {
  const r = readabilitySummary();
  const titles = new Map(listDebates().map((d) => [d.id, d.title]));
  const dots = (kind: "general" | "primary") =>
    r.debates
      .filter((d) => (kind === "primary") === (d.kind === "primary"))
      .map((d) => ({
        date: d.date,
        cycle: d.cycle,
        t: fractional(d.date),
        grade: d.fkCandidates,
        title: titles.get(d.id) ?? "",
      }));
  const group = (
    key: "general" | "primary",
    label: string,
    color: string,
    data: typeof r.general,
  ): TrendGroup => ({
    key,
    label,
    color,
    dots: dots(key),
    band: data.trend.band,
    cycles: data.trend.cycles,
    byCycle: data.byCycle.map((c) => ({
      cycle: c.cycle,
      n: c.n,
      mean: c.mean,
      lower: c.interval?.lower ?? null,
      upper: c.interval?.upper ?? null,
    })),
    perDecade: data.trend.perDecade,
  });
  const groups = [
    group("general", "General election and vice-presidential", "var(--series-1)", r.general),
    group("primary", "Primary", "var(--series-3)", r.primary),
  ];

  const docRows: ForestRow[] = (["written", "transcribed", "address"] as const).flatMap((reg) =>
    CYCLES.map((cycle) => {
      const c = r.docs.cells.find((x) => x.cycle === cycle && x.register === reg)!;
      return {
        key: `${reg}-${cycle}`,
        group: REGISTER_LABEL[reg],
        label: <span className="tabular">{cycle}</span>,
        note: `${formatInt(c.n)} docs from ${c.speakers} speakers · ${formatDecimal(c.meanWps, 1)} words/sentence`,
        estimate: c.meanGrade,
        lower: c.grade?.lower ?? null,
        upper: c.grade?.upper ?? null,
        color: REGISTER_COLOR[reg],
      };
    }),
  );

  const cycleGaps = CYCLES.map((cycle) => {
    const cell = (reg: Register) =>
      r.docs.cells.find((x) => x.cycle === cycle && x.register === reg)!.meanGrade;
    return cell("written") - cell("transcribed");
  });

  const g = r.gap;
  const gapRows: ForestRow[] = [
    {
      key: "gap",
      label: "Transcribed minus written",
      note: `mean over ${g.speakers.length} speakers`,
      estimate: g.gapT.estimate,
      lower: g.gapT.lower,
      upper: g.gapT.upper,
      color: "var(--role-candidate)",
    },
    {
      key: "sentence",
      label: "… from sentence length",
      note: "0.39 × difference in words per sentence",
      estimate: g.sentencePartT.estimate,
      lower: g.sentencePartT.lower,
      upper: g.sentencePartT.upper,
      color: "var(--series-1)",
    },
    {
      key: "word",
      label: "… from word length",
      note: "11.8 × difference in syllables per word",
      estimate: g.wordPartT.estimate,
      lower: g.wordPartT.lower,
      upper: g.wordPartT.upper,
      color: "var(--series-2)",
    },
  ];

  const twins = r.twins;
  const twinDiffs = twins.map((t) => Math.abs(t.gradeA - t.gradeB));
  const maxTwin = twins.reduce(
    (a, t) => (Math.abs(t.gradeA - t.gradeB) > Math.abs(a.gradeA - a.gradeB) ? t : a),
    twins[0],
  );
  const meanTwin = twinDiffs.reduce((a, b) => a + b, 0) / Math.max(1, twinDiffs.length);
  const twinEvents = [...new Map(twins.map((t) => [t.date, t])).values()];

  return (
    <>
      <PageIntro kicker="Tool 05 · Readability" title="Reading grade, with its error bars">
        <p>
          The Flesch-Kincaid grade combines how long sentences are and how long words are. This page
          shows how it has moved, with 95% intervals, and how much of it is decided by whoever
          punctuated the text. A grade describes a transcript or a press release; it says nothing
          about the quality of what was said.
        </p>
      </PageIntro>

      <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatTile
            label="General and VP debates, per decade"
            value={signed(r.general.trend.perDecade.estimate)}
            note={`95% CI ${signed(r.general.trend.perDecade.lower)} to ${signed(r.general.trend.perDecade.upper)} · ${r.general.trend.n} debates in ${r.general.trend.cycles} cycles, cycles resampled`}
          />
          <StatTile
            label="Primary debates, per decade"
            value={signed(r.primary.trend.perDecade.estimate)}
            note={`95% CI ${signed(r.primary.trend.perDecade.lower)} to ${signed(r.primary.trend.perDecade.upper)} · ${r.primary.trend.n} debates in ${r.primary.trend.cycles} cycles, cycles resampled`}
          />
          <StatTile
            label="Same speaker, transcribed vs written"
            value={signed(g.gapT.estimate, 1)}
            note={`95% CI ${signed(g.gapT.lower, 1)} to ${signed(g.gapT.upper, 1)} grades (t) · ${g.speakers.length} speakers, paired; ${g.sign.negative} of ${g.speakers.length} lower`}
          />
          <StatTile
            label="Same debate, two transcripts"
            value={`up to ${formatDecimal(Math.abs(maxTwin.gradeA - maxTwin.gradeB), 1)}`}
            note={`grade levels apart for one speaker; ${formatDecimal(meanTwin, 2)} on average over ${twins.length} speakers`}
          />
        </div>

        <Panel>
          <h2 className="font-serif text-xl">
            Candidates&apos; reading grade in debates, 1960 to 2024
          </h2>
          <p className="mt-1 mb-4 max-w-3xl text-sm text-muted-foreground">
            Each dot is the grade of everything the candidates said in one debate. The dashed line
            is a least-squares trend. Debates in one election cycle share candidates and a
            transcription source, so its band and the per-decade interval resample whole cycles, not
            single debates ({formatInt(READABILITY_RESAMPLES)} resamples, seed {DEFAULT_SEED}). With{" "}
            {r.primary.trend.cycles} to {r.general.trend.cycles} cycles, even these intervals are
            approximate.
          </p>
          <GradeTrend groups={groups} />
          <TableView
            caption="Candidates' mean reading grade per election cycle, with 95% bootstrap intervals over that cycle's debates (five or more)"
            head={["Cycle", "Debates", "General and VP: mean (95% CI)", "Primary: mean (95% CI)"]}
            rows={[...new Set(r.debates.map((d) => d.cycle))]
              .sort((a, b) => a - b)
              .map((cycle) => {
                const cell = (list: typeof r.general.byCycle) => {
                  const c = list.find((x) => x.cycle === cycle);
                  if (!c) return "–";
                  return c.interval
                    ? `${formatDecimal(c.mean)} (${formatDecimal(c.interval.lower)} to ${formatDecimal(c.interval.upper)})`
                    : `${formatDecimal(c.mean)} (n = ${c.n}, no interval)`;
                };
                const n =
                  (r.general.byCycle.find((x) => x.cycle === cycle)?.n ?? 0) +
                  (r.primary.byCycle.find((x) => x.cycle === cycle)?.n ?? 0);
                return [cycle, n, cell(r.general.byCycle), cell(r.primary.byCycle)];
              })}
          />
        </Panel>

        <Callout title="Part of this trend is in the transcripts">
          The grade falls by about {formatDecimal(Math.abs(r.general.trend.perDecade.estimate), 1)}{" "}
          a decade in general-election debates, and the interval is well clear of zero. But the
          transcripts were made differently over time: the early ones were set by the Government
          Printing Office and newspapers, the recent ones by networks and transcription services
          with shorter sentences. The two transcripts of the same 2000 debates below differ by up to{" "}
          {formatDecimal(Math.abs(maxTwin.gradeA - maxTwin.gradeB), 1)} grade levels for one
          speaker, about{" "}
          {formatDecimal(
            Math.abs(maxTwin.gradeA - maxTwin.gradeB) /
              Math.abs(r.general.trend.perDecade.estimate),
            0,
          )}{" "}
          decades of the trend. The intervals cover sampling of cycles and debates, not this
          transcription effect.
        </Callout>
      </div>

      <Section
        id="documents"
        kicker="Campaign documents, 2016 to 2024"
        title="Written releases against transcribed speech"
        className="mt-16"
        description={
          <>
            Mean grade per document (documents with 100 or more words in the candidate&apos;s own
            voice). A campaign&apos;s documents share a style, so the 95% intervals resample
            speakers, each with all of their documents, not single documents; cells with fewer than{" "}
            {MIN_GROUP_FOR_INTERVAL} documents or {MIN_CLUSTERS_FOR_INTERVAL} speakers get no
            interval. Document types are the scraper&apos;s, from title words: releases and
            statements are written prose; remarks and interviews are transcripts of speech.
          </>
        }
      >
        <Panel>
          <ForestRows
            rows={docRows}
            domain={[4, 16]}
            ticks={[4, 6, 8, 10, 12, 14, 16]}
            caption="Mean Flesch-Kincaid grade by register and election cycle with 95% intervals"
          />
          <p className="mt-4 text-sm text-muted-foreground">
            In every cycle, transcribed remarks grade {formatDecimal(Math.min(...cycleGaps), 1)} to{" "}
            {formatDecimal(Math.max(...cycleGaps), 1)} levels below written releases. Both kinds
            grade lower in 2024, so a trend over cycles depends on the mix of document types as well
            as on the year: compare one kind of text at a time.
          </p>
        </Panel>
      </Section>

      <Section
        id="paired"
        kicker="A paired comparison"
        title="The same speakers, written and transcribed"
        className="mt-16"
        description={
          <>
            For each speaker with at least {g.minDocs} graded documents of both kinds, the
            difference between their transcribed and written texts; then the mean over the{" "}
            {g.speakers.length} speakers with a t interval (at this size a percentile bootstrap runs
            narrow). Because the grade is linear in sentence length and word length, the gap splits
            exactly into the two parts below.
          </>
        }
      >
        <Panel>
          <ForestRows
            rows={gapRows}
            domain={[-8, 1]}
            ticks={[-8, -6, -4, -2, 0]}
            zero={0}
            caption="Within-speaker difference in grade (transcribed minus written) and its two parts, with 95% t intervals"
          />
          <p className="mt-4 text-sm text-muted-foreground">
            {g.sign.negative} of {g.speakers.length} speakers grade lower when transcribed (exact
            sign test p = {g.sign.p < 0.001 ? g.sign.p.toFixed(4) : g.sign.p.toFixed(3)}); the
            standardised paired difference is d<sub>z</sub> = {formatDecimal(g.dz, 2)}. A percentile
            bootstrap over speakers gives {signed(g.gap.lower, 1)} to {signed(g.gap.upper, 1)} for
            the gap, a little narrower than the t interval shown. Most of the gap comes from
            sentence length, which in a transcript is the transcriber&apos;s choice of where to put
            full stops.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Speakers in this comparison (alphabetical)
            </summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
              {[...g.speakers]
                .sort((a, b) => a.speaker.localeCompare(b.speaker))
                .map((s) => (
                  <li key={s.speakerId} className="tabular">
                    <span className="text-foreground">{s.speaker}</span>: {s.nWritten} written,{" "}
                    {s.nTranscribed} transcribed, gap {signed(s.gap, 1)}
                  </li>
                ))}
            </ul>
          </details>
        </Panel>
      </Section>

      <Section
        id="twins"
        kicker="A natural experiment"
        title="Same debate, two transcripts"
        className="mt-16"
        description={`The archive holds two transcripts of ${twinEvents.length} events from January 2000, with almost identical word counts. Same speakers, same words; only the transcription differs.`}
      >
        <div
          className="relative overflow-x-auto rounded-lg border border-border"
          role="region"
          aria-label="Twin transcripts (scrolls sideways on small screens)"
          tabIndex={0}
        >
          <table className="w-full min-w-[38rem] text-left text-sm">
            <caption className="sr-only">
              Candidates&apos; reading grade in two transcripts of the same debate
            </caption>
            <thead className="bg-secondary text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Debate
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Speaker
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Words (A / B)
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Grade A
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Grade B
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {twins.map((t) => (
                <tr key={`${t.date}-${t.speaker}`} className="border-t border-border/70">
                  <td className="px-3 py-2 text-xs">
                    {formatDate(t.date)}{" "}
                    <SourceLink href={t.urlA} className="text-xs">
                      A
                    </SourceLink>{" "}
                    <SourceLink href={t.urlB} className="text-xs">
                      B
                    </SourceLink>
                  </td>
                  <td className="px-3 py-2">{t.speaker}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {formatInt(t.wordsA)} / {formatInt(t.wordsB)}
                  </td>
                  <td className="px-3 py-2 text-right">{formatDecimal(t.gradeA, 2)}</td>
                  <td className="px-3 py-2 text-right">{formatDecimal(t.gradeB, 2)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {signed(t.gradeB - t.gradeA, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Eight speakers from two events is too few for an interval; the table is shown as it is.
        </p>
      </Section>

      <Section
        id="transcription"
        kicker="Read before comparing"
        title="How transcription style moves the grade"
        className="mt-16"
      >
        <div className="prose-archive max-w-3xl">
          <p>
            Speech has no full stops. A transcriber decides where one sentence ends, whether a
            run-on answer becomes one sentence or four, and whether false starts and repetitions are
            kept. Because the grade gives 0.39 grade levels for every extra word per sentence, those
            decisions move it directly: a transcriber who splits a 30-word answer into three
            sentences lowers it by almost eight grade levels for that answer.
          </p>
          <p>
            Written releases are edited prose with long, clause-heavy sentences, so they grade much
            higher than the same person&apos;s transcribed remarks. Debate transcripts from
            different decades and sources follow different conventions, so part of any trend is a
            change in transcription. Compare like with like (the same kind of text, ideally the same
            source), and read grades as a description of the text, never of the speaker. The
            calculation itself is on the{" "}
            <Link href="/methods#readability" className="inline-link">
              methods page
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
