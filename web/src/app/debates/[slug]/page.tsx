import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BarList, Callout, SourceLink, StatTile, TableView } from "@/components/common/bits";
import { Panel } from "@/components/common/page-intro";
import { TurnStrips } from "@/components/debates/turn-strips";
import { TurnSwimlane } from "@/components/debates/turn-swimlane";
import { DEBATE_KIND_LABEL, ROLE_LABEL } from "@/lib/corpus-types";
import {
  formatDate,
  formatDateLong,
  formatDecimal,
  formatInt,
  formatPercent,
  plural,
} from "@/lib/format";
import { getDebate, listDebates } from "@/server/debates";

// Every transcript is known at build time. Requiring the complete page to be
// static makes an unknown slug wait for the full render, so notFound() can
// still answer with a real 404 status instead of a streamed fallback.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return listDebates().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata(props: PageProps<"/debates/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const found = getDebate(slug);
  if (!found) return { title: "Debate not found" };
  const d = found.debate;
  return {
    title: `${d.title} (${d.date.slice(0, 4)})`,
    description: `Talk share and turn lengths for the ${d.title}, ${formatDateLong(d.date)}: ${formatInt(d.turns)} speaking turns, ${formatInt(d.words)} words.`,
  };
}

const ROLE_COLOR = {
  candidate: "var(--role-candidate)",
  moderator: "var(--role-moderator)",
  other: "var(--role-other)",
} as const;

export default async function DebatePage(props: PageProps<"/debates/[slug]">) {
  const { slug } = await props.params;
  const found = getDebate(slug);
  if (!found) notFound();
  const { debate: d, speakers, turns, twins, prev, next } = found;
  const lengths = new Map<number, number[]>();
  for (const t of turns) {
    const arr = lengths.get(t.speakerIdx) ?? [];
    arr.push(t.words);
    lengths.set(t.speakerIdx, arr);
  }
  const ranked = [...speakers].sort((a, b) => b.words - a.words);
  const shown = ranked.filter((s) => s.turns >= 1).slice(0, 14);
  const candShare = d.words ? d.candidateWords / d.words : 0;
  const modShare = d.words ? d.moderatorWords / d.words : 0;
  const clipWords = speakers.find((s) => s.key === "CLIP")?.words ?? 0;

  return (
    <article>
      <header className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
        <Link
          href="/debates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> All debates
        </Link>
        <p className="kicker mt-6">
          {DEBATE_KIND_LABEL[d.kind]}
          {d.party ? ` · ${d.party}` : ""}
          {d.format === "forum" ? " · forum" : ""} · {formatDateLong(d.date)}
        </p>
        <h1 className="mt-3 max-w-4xl text-[2rem] leading-[1.1] font-medium tracking-tight sm:text-[2.8rem]">
          {d.title}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Full transcript: <SourceLink href={d.url}>The American Presidency Project</SourceLink>
        </p>
        {twins.length ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            The archive holds another transcript of this event under the same title. Both were
            collected and are kept as they are:{" "}
            {twins.map((t, i) => (
              <span key={t.slug}>
                {i ? ", " : ""}
                <Link href={`/debates/${t.slug}`} className="underline underline-offset-2">
                  the other version
                </Link>
              </span>
            ))}
            .
          </p>
        ) : null}
      </header>

      <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatTile
            label="Speaking turns"
            value={formatInt(d.turns)}
            note={`${formatInt(d.words)} words transcribed`}
          />
          <StatTile
            label="Candidates' share"
            value={formatPercent(candShare, 0)}
            note={plural(d.nCandidates, "candidate")}
          />
          <StatTile
            label="Moderators' share"
            value={formatPercent(modShare, 0)}
            note="moderators, panellists, questioners"
          />
          <StatTile
            label="Crosstalk markers"
            value={formatInt(d.crosstalk)}
            note={`${plural(d.interruptedTurns, "turn")} end${d.interruptedTurns === 1 ? "s" : ""} on a dash`}
          />
        </div>

        <Panel>
          <h2 className="font-serif text-xl">The debate, turn by turn</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Read left to right: each block is one turn, placed where it falls in the running word
            count and as wide as it is long.
          </p>
          <TurnSwimlane
            speakers={shown.map((s) => ({
              idx: s.idx,
              display: s.display,
              role: s.role,
              words: s.words,
            }))}
            turns={turns}
          />
          {ranked.length > shown.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {ranked.length - shown.length} more speakers with very short contributions are left
              out of the chart but counted in the table below.
            </p>
          ) : null}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Panel>
            <h2 className="font-serif text-xl">Share of words</h2>
            <p className="mt-1 mb-4 text-xs text-muted-foreground">A stand-in for talk time.</p>
            <BarList
              items={shown.map((s) => ({
                key: String(s.idx),
                label: s.display,
                value: s.share,
                color: ROLE_COLOR[s.role],
                note: plural(s.turns, "turn"),
              }))}
              format={(v) => formatPercent(v)}
            />
          </Panel>
          <Panel>
            <h2 className="font-serif text-xl">How long each turn ran</h2>
            <p className="mt-1 mb-4 text-xs text-muted-foreground">
              Ticks are single turns; boxes span the middle half; the heavy bar is the median.
            </p>
            <TurnStrips
              rows={shown
                .filter((s) => (lengths.get(s.idx)?.length ?? 0) > 0)
                .map((s) => ({
                  idx: s.idx,
                  display: s.display,
                  role: s.role,
                  lengths: lengths.get(s.idx) ?? [],
                }))}
            />
          </Panel>
        </div>

        <Panel>
          <h2 className="font-serif text-xl">Every speaker</h2>
          <TableView
            summary="Show the full speaker table"
            caption={`Speakers in the ${d.title}`}
            head={[
              "Speaker",
              "Role",
              "Turns",
              "Words",
              "Share",
              "Median turn",
              "Longest",
              "Ends on a dash",
              "Reading grade",
            ]}
            rows={ranked.map((s) => [
              s.display,
              ROLE_LABEL[s.role],
              formatInt(s.turns),
              formatInt(s.words),
              formatPercent(s.share),
              formatInt(s.medianTurn),
              formatInt(s.maxTurn),
              formatInt(s.interrupted),
              formatDecimal(s.fkGrade),
            ])}
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <h2 className="font-serif text-xl">As the 2025 scraper split it</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The notebook&apos;s own Participants and Moderators fields, reproduced exactly by the
              TypeScript port.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="kicker">Participants</dt>
                <dd className="mt-1">
                  {d.participants ?? (
                    <span className="text-muted-foreground">
                      No participants block in this transcript
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="kicker">Moderators</dt>
                <dd className="mt-1">
                  {d.moderators ?? (
                    <span className="text-muted-foreground">
                      No moderators block in this transcript
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="kicker">Listing date</dt>
                <dd className="mt-1 font-mono text-[0.85rem]">{d.listingDate}</dd>
              </div>
            </dl>
          </Panel>
          <Callout title="About this transcript">
            Speaker labels in this transcript use the{" "}
            {d.labelStyle === "period"
              ? "“Name.” (full-stop)"
              : d.labelStyle === "colon"
                ? "“NAME:” (plain colon)"
                : "bold or italic label"}{" "}
            style.{" "}
            {d.unattributedWords
              ? `${formatInt(d.unattributedWords)} words before the first label are not attributed to anyone. `
              : ""}
            {clipWords
              ? `${plural(clipWords, "word")} come from recorded clips played during the debate; they are listed as “Recorded clips” and not counted as anyone’s live speech. `
              : ""}
            Candidates&apos; reading grade: {formatDecimal(d.fkCandidates)}; moderators&apos;:{" "}
            {formatDecimal(d.fkModerators)}. Grades describe sentence and word length only.
          </Callout>
        </div>

        <nav
          aria-label="Neighbouring debates"
          className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between"
        >
          {prev ? (
            <Link href={`/debates/${prev.slug}`} className="group flex items-start gap-2 text-sm">
              <ArrowLeft className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="kicker block">Earlier · {formatDate(prev.date)}</span>
                <span className="font-serif group-hover:underline">{prev.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/debates/${next.slug}`}
              className="group flex flex-row-reverse items-start gap-2 self-end text-right text-sm sm:self-auto"
            >
              <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="kicker block">Later · {formatDate(next.date)}</span>
                <span className="font-serif group-hover:underline">{next.title}</span>
              </span>
            </Link>
          ) : null}
        </nav>
      </div>
    </article>
  );
}
