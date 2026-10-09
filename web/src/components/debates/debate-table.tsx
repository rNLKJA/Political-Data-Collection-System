"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { Select } from "@/components/common/field";
import { formatDate, formatInt, formatPercent } from "@/lib/format";

export interface DebateRow {
  slug: string;
  date: string;
  title: string;
  kind: "general" | "vice-presidential" | "primary";
  party: string;
  format: string;
  candidates: string[];
  turns: number;
  words: number;
  moderatorShare: number;
}

const PAGE = 30;

const KIND_LABEL = {
  general: "General election",
  "vice-presidential": "Vice-presidential",
  primary: "Primary",
} as const;
const KIND_COLOR = {
  general: "var(--series-1)",
  "vice-presidential": "var(--series-2)",
  primary: "var(--series-3)",
} as const;

export function DebateTable({ rows }: { rows: DebateRow[] }) {
  const [kind, setKind] = useState<string>("");
  const [decade, setDecade] = useState<string>("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const filterKey = `${kind}|${decade}|${q}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setLimit(PAGE);
  }
  const decades = Array.from(new Set(rows.map((r) => `${r.date.slice(0, 3)}0s`)));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !kind || r.kind === kind)
      .filter((r) => !decade || `${r.date.slice(0, 3)}0s` === decade)
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.candidates.some((c) => c.toLowerCase().includes(needle)),
      )
      .slice()
      .reverse();
  }, [rows, kind, decade, q]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr]">
        <label className="flex flex-col gap-1.5">
          <span className="kicker">Kind</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="kicker">Decade</span>
          <Select value={decade} onChange={(e) => setDecade(e.target.value)}>
            <option value="">All decades</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="kicker">Title or candidate</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Kennedy, Des Moines"
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          />
        </label>
      </div>
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {formatInt(Math.min(limit, shown.length))} of {formatInt(shown.length)} matching transcripts
        {shown.length !== rows.length ? ` (${formatInt(rows.length)} in all)` : ""}, newest first
      </p>
      {shown.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No transcript matches. Clear a filter to see more.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/80 border-y border-border/80">
          {shown.slice(0, limit).map((r) => (
            <li key={r.slug}>
              <Link
                href={`/debates/${r.slug}`}
                className="grid gap-x-6 gap-y-1 py-3.5 hover:bg-accent/40 sm:grid-cols-[7rem_1fr_9rem] sm:px-2"
              >
                <time
                  dateTime={r.date}
                  className="tabular font-mono text-xs text-muted-foreground sm:pt-1"
                >
                  {formatDate(r.date)}
                </time>
                <span className="min-w-0">
                  <span className="block font-serif text-[1.02rem] leading-snug">{r.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <LegendSwatch color={KIND_COLOR[r.kind]} shape="dot" />
                      {KIND_LABEL[r.kind]}
                      {r.party ? ` (${r.party})` : ""}
                      {r.format === "forum" ? " · forum" : ""}
                    </span>
                    {r.candidates.length ? (
                      <span className="truncate">· {r.candidates.join(", ")}</span>
                    ) : null}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
                  <span className="tabular">{formatInt(r.turns)} turns</span>
                  <span className="tabular">moderators {formatPercent(r.moderatorShare, 0)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm hover:bg-accent"
          >
            Show {Math.min(PAGE, shown.length - limit)} more
          </button>
          <button
            type="button"
            onClick={() => setLimit(shown.length)}
            className="text-sm text-primary hover:underline"
          >
            Show all {formatInt(shown.length)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
