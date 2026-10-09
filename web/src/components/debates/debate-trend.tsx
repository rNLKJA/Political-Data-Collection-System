"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ChartTooltip, LegendSwatch } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { formatTick, fractionalYear, linearScale, niceMax, niceTicks } from "@/lib/chart";
import { formatDate, formatDecimal, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  slug: string;
  date: string;
  title: string;
  kind: "general" | "vice-presidential" | "primary";
  party: string;
  moderatorShare: number;
  meanCandidateTurn: number;
  fkCandidates: number | null;
  turnsPer10k: number;
  candidates: string[];
}

const METRICS = [
  {
    key: "moderatorShare",
    label: "Moderator share",
    long: "Share of transcribed words spoken by moderators, panellists and questioners",
    format: (v: number) => formatPercent(v, 0),
    axis: (v: number) => `${Math.round(v * 100)}%`,
  },
  {
    key: "meanCandidateTurn",
    label: "Words per candidate turn",
    long: "Mean length of a candidate's turn, in words",
    format: (v: number) => formatDecimal(v, 0),
    axis: formatTick,
  },
  {
    key: "turnsPer10k",
    label: "Turns per 10,000 words",
    long: "How often the floor changes hands, per 10,000 transcribed words",
    format: (v: number) => formatDecimal(v, 0),
    axis: formatTick,
  },
  {
    key: "fkCandidates",
    label: "Candidates' reading grade",
    long: "Flesch-Kincaid grade level of everything the candidates said",
    format: (v: number) => formatDecimal(v, 1),
    axis: formatTick,
  },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const KINDS = [
  { key: "general", label: "General election", color: "var(--series-1)" },
  { key: "vice-presidential", label: "Vice-presidential", color: "var(--series-2)" },
  { key: "primary", label: "Primary", color: "var(--series-3)" },
] as const;

export function DebateTrend({ points }: { points: TrendPoint[] }) {
  const router = useRouter();
  const [metric, setMetric] = useState<MetricKey>("moderatorShare");
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const def = METRICS.find((m) => m.key === metric)!;
  const height = 320;
  const m = { top: 14, right: 14, bottom: 28, left: 48 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const data = useMemo(
    () =>
      points
        .map((p, i) => ({ i, p, v: p[metric] as number | null, t: fractionalYear(p.date) }))
        .filter(
          (d): d is { i: number; p: TrendPoint; v: number; t: number } =>
            d.v !== null && Number.isFinite(d.v),
        ),
    [points, metric],
  );
  const yMax = niceMax(Math.max(...data.map((d) => d.v)), 4);
  const x = linearScale([1958, 2026], [0, innerW]);
  const y = linearScale([0, yMax], [innerH, 0]);
  const decades = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
  const hovered = hover !== null ? data.find((d) => d.i === hover) : undefined;

  return (
    <div>
      <div role="group" aria-label="Measure" className="flex flex-wrap gap-2">
        {METRICS.map((mm) => (
          <button
            key={mm.key}
            type="button"
            aria-pressed={metric === mm.key}
            onClick={() => setMetric(mm.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              metric === mm.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {mm.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {def.long}. Each dot is one debate; select a dot to open it.
      </p>
      <div ref={ref} className="relative mt-3">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Dot plot over time: ${def.long}, one dot per debate from 1960 to 2024`}
          className="block max-w-full overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          <g transform={`translate(${m.left},${m.top})`}>
            {niceTicks(0, yMax, 4).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={innerW} stroke="var(--chart-grid)" />
                <text
                  x={-8}
                  dy="0.32em"
                  textAnchor="end"
                  className="tabular fill-muted-foreground font-mono text-[10px]"
                >
                  {def.axis(t)}
                </text>
              </g>
            ))}
            <line y1={innerH} y2={innerH} x2={innerW} stroke="var(--chart-axis)" />
            {decades.map((d) => (
              <text
                key={d}
                x={x(d)}
                y={innerH + 18}
                textAnchor="middle"
                className="tabular fill-muted-foreground font-mono text-[10px]"
              >
                {d}
              </text>
            ))}
            {data.map((d) => {
              const kind = KINDS.find((k) => k.key === d.p.kind)!;
              return (
                <circle
                  key={d.p.slug}
                  cx={x(d.t)}
                  cy={y(d.v)}
                  r={hover === d.i ? 6 : 4.5}
                  fill={kind.color}
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(d.i)}
                  onClick={() => router.push(`/debates/${d.p.slug}`)}
                />
              );
            })}
          </g>
        </svg>
        {hovered ? (
          <ChartTooltip x={m.left + x(hovered.t)} y={m.top + y(hovered.v)} width={width}>
            <p className="font-medium">{hovered.p.title}</p>
            <p className="text-muted-foreground">{formatDate(hovered.p.date)}</p>
            {hovered.p.candidates.length ? (
              <p className="text-muted-foreground">{hovered.p.candidates.slice(0, 6).join(", ")}</p>
            ) : null}
            <p className="tabular mt-1">
              {def.label}: <span className="font-medium">{def.format(hovered.v)}</span>
            </p>
          </ChartTooltip>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {KINDS.map((k) => (
          <span key={k.key} className="flex items-center gap-1.5">
            <LegendSwatch color={k.color} shape="dot" /> {k.label}
          </span>
        ))}
      </div>
    </div>
  );
}
