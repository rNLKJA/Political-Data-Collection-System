import type { Metadata } from "next";
import Link from "next/link";

import { Callout, StatTile, TableView } from "@/components/common/bits";
import { PageIntro, Panel, Section } from "@/components/common/page-intro";
import { DebateTable } from "@/components/debates/debate-table";
import { DebateTrend, type TrendPoint } from "@/components/debates/debate-trend";
import { median } from "@/lib/chart";
import { DEBATE_KIND_LABEL } from "@/lib/corpus-types";
import { formatCompact, formatDate, formatDecimal, formatInt, formatPercent } from "@/lib/format";
import { listDebates } from "@/server/debates";

export const metadata: Metadata = {
  title: "Debates, 1960 to 2024",
  description:
    "Talk share, turn lengths, moderator share and readability across 179 presidential, vice-presidential and primary debate transcripts from 1960 to 2024.",
};

export default function DebatesPage() {
  const debates = listDebates();
  const points: TrendPoint[] = debates.map((d) => ({
    slug: d.slug,
    date: d.date,
    title: d.title,
    kind: d.kind,
    party: d.party,
    moderatorShare: d.words ? d.moderatorWords / d.words : 0,
    meanCandidateTurn: d.meanCandidateTurn,
    fkCandidates: d.fkCandidates,
    turnsPer10k: d.words ? (d.turns / d.words) * 10_000 : 0,
    candidates: d.candidates,
  }));
  const general = debates.filter((d) => d.kind !== "primary");
  const byDecade = (from: number, to: number) =>
    general.filter((d) => d.year >= from && d.year <= to);
  const medTurn = (list: typeof debates) => median(list.map((d) => d.meanCandidateTurn));
  const totals = debates.reduce(
    (acc, d) => ({ turns: acc.turns + d.turns, words: acc.words + d.words }),
    { turns: 0, words: 0 },
  );

  return (
    <>
      <PageIntro kicker="Tool 03 · Debates" title="Who held the floor, 1960 to 2024">
        <p>
          The scraper kept every transcript&apos;s original HTML. Splitting it at each speaker label
          gives {formatInt(totals.turns)} turns across {debates.length} debates, from Kennedy and
          Nixon in Chicago to the 2024 vice-presidential debate. Word counts stand in for talk time,
          since transcripts carry no timestamps.
        </p>
      </PageIntro>

      <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatTile
            label="Transcripts"
            value={formatInt(debates.length)}
            note={`${formatDate(debates[0].date)} to ${formatDate(debates[debates.length - 1].date)}`}
          />
          <StatTile
            label="Words transcribed"
            value={formatCompact(totals.words)}
            note={`${formatInt(totals.turns)} speaking turns`}
          />
          <StatTile
            label="Candidate turn, 1960s to 1980s"
            value={`${formatDecimal(medTurn(byDecade(1960, 1988)), 0)} words`}
            note="median of general-election and VP debates"
          />
          <StatTile
            label="Candidate turn, 2012 to 2024"
            value={`${formatDecimal(medTurn(byDecade(2012, 2024)), 0)} words`}
            note="same measure, recent debates"
          />
        </div>

        <Panel>
          <h2 className="font-serif text-xl">Six decades, four measures</h2>
          <div className="mt-4">
            <DebateTrend points={points} />
          </div>
          <TableView
            caption="Per-debate measures"
            head={[
              "Date",
              "Debate",
              "Kind",
              "Moderator share",
              "Words per candidate turn",
              "Turns",
              "Candidates' grade",
            ]}
            rows={debates.map((d) => [
              formatDate(d.date),
              d.title,
              DEBATE_KIND_LABEL[d.kind],
              formatPercent(d.words ? d.moderatorWords / d.words : 0, 0),
              formatDecimal(d.meanCandidateTurn, 0),
              formatInt(d.turns),
              formatDecimal(d.fkCandidates),
            ])}
          />
        </Panel>

        <Callout title="What these numbers can and cannot say">
          Transcripts differ in how they were made: older ones come from the Government Printing
          Office or newspapers, newer ones from networks, and some mark crosstalk while others do
          not. Speaker roles come from turn labels and a list of the people who debated in each
          cycle; anyone else who speaks counts as a moderator, panellist or questioner. See{" "}
          <Link href="/methods#debates" className="inline-link">
            Methods
          </Link>{" "}
          for the segmentation rules.
        </Callout>
      </div>

      <Section
        id="all-debates"
        kicker="The transcripts"
        title="Every debate in the archive"
        className="mt-16"
      >
        <DebateTable
          rows={debates.map((d) => ({
            slug: d.slug,
            date: d.date,
            title: d.title,
            kind: d.kind,
            party: d.party,
            format: d.format,
            candidates: d.candidates,
            turns: d.turns,
            words: d.words,
            moderatorShare: d.words ? d.moderatorWords / d.words : 0,
          }))}
        />
      </Section>
    </>
  );
}
