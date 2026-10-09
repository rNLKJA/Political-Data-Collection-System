"use client";

import { useState } from "react";

import { ChartTooltip, LegendSwatch } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { formatTick, linearScale, niceTicks } from "@/lib/chart";
import { formatDate, formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TrendDot {
  date: string;
  cycle: number;
  t: number;
  grade: number;
  title: string;
}

export interface TrendGroup {
  key: "general" | "primary";
  label: string;
  color: string;
  dots: TrendDot[];
  band: Array<{ year: number; fit: number; lower: number; upper: number }>;
  /** election cycles in the group (the trend's resampled clusters) */
  cycles: number;
  byCycle: Array<{
    cycle: number;
    n: number;
    mean: number;
    lower: number | null;
    upper: number | null;
  }>;
  perDecade: { estimate: number; lower: number; upper: number };
}

/**
 * Candidates' reading grade, one dot per debate, with the fitted linear trend
 * and its 95% band (whole cycles resampled), and per-cycle means with 95%
 * intervals where a cycle has five or more debates.
 */
export function GradeTrend({ groups }: { groups: TrendGroup[] }) {
  const [key, setKey] = useState<TrendGroup["key"]>(groups[0].key);
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const g = groups.find((x) => x.key === key)!;
  const height = 320;
  const m = { top: 14, right: 14, bottom: 28, left: 40 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const x = linearScale([1958, 2026], [0, innerW]);
  const y = linearScale([2, 14], [innerH, 0]);
  const decades = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
  const area =
    g.band
      .map((b, i) => `${i ? "L" : "M"}${x(b.year).toFixed(1)},${y(b.upper).toFixed(1)}`)
      .join("") +
    [...g.band]
      .reverse()
      .map((b) => `L${x(b.year).toFixed(1)},${y(b.lower).toFixed(1)}`)
      .join("") +
    "Z";
  const line = g.band
    .map((b, i) => `${i ? "L" : "M"}${x(b.year).toFixed(1)},${y(b.fit).toFixed(1)}`)
    .join("");
  const hovered = hover !== null ? g.dots[hover] : undefined;
  // Each cycle's mean sits at the average date of its debates.
  const cycleT = (cycle: number) => {
    const ts = g.dots.filter((d) => d.cycle === cycle).map((d) => d.t);
    return ts.reduce((a, b) => a + b, 0) / Math.max(1, ts.length);
  };

  return (
    <div>
      <div role="group" aria-label="Debates shown" className="flex flex-wrap gap-2">
        {groups.map((gr) => (
          <button
            key={gr.key}
            type="button"
            aria-pressed={key === gr.key}
            onClick={() => {
              setKey(gr.key);
              setHover(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              key === gr.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {gr.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Change per decade:{" "}
        <span className="tabular font-medium text-foreground">
          {formatDecimal(g.perDecade.estimate, 2)} grade levels
        </span>{" "}
        (95% CI {formatDecimal(g.perDecade.lower, 2)} to {formatDecimal(g.perDecade.upper, 2)},
        cycles resampled), {g.dots.length} debates in {g.cycles} cycles.
      </p>
      <div ref={ref} className="relative mt-3">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Candidates' Flesch-Kincaid grade in ${g.label.toLowerCase()} debates, 1960 to 2024: one dot per debate, a fitted trend of ${formatDecimal(g.perDecade.estimate, 2)} grade levels per decade with a 95% band${g.byCycle.some((c) => c.lower !== null) ? ", and per-cycle means with intervals" : ""}. The numbers are in the table below.`}
          className="block max-w-full overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          <g transform={`translate(${m.left},${m.top})`}>
            {niceTicks(2, 14, 6).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={innerW} stroke="var(--chart-grid)" />
                <text
                  x={-8}
                  dy="0.32em"
                  textAnchor="end"
                  className="tabular fill-muted-foreground font-mono text-[10px]"
                >
                  {formatTick(t)}
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
            <path d={area} fill={g.color} opacity={0.14} />
            <path d={line} fill="none" stroke={g.color} strokeWidth={2} strokeDasharray="5 4" />
            {g.dots.map((d, i) => (
              <circle
                key={`${d.date}-${i}`}
                cx={x(d.t)}
                cy={y(d.grade)}
                r={hover === i ? 5.5 : 3.5}
                fill={g.color}
                fillOpacity={0.55}
                stroke="var(--chart-surface)"
                strokeWidth={1}
                onMouseEnter={() => setHover(i)}
              />
            ))}
            {g.byCycle
              .filter((c) => c.lower !== null)
              .map((c) => (
                <g key={c.cycle} transform={`translate(${x(cycleT(c.cycle))},0)`}>
                  <line
                    y1={y(c.lower!)}
                    y2={y(c.upper!)}
                    stroke="var(--foreground)"
                    strokeWidth={1.5}
                  />
                  <rect
                    x={-3.5}
                    y={y(c.mean) - 3.5}
                    width={7}
                    height={7}
                    fill="var(--foreground)"
                    transform={`rotate(45 0 ${y(c.mean)})`}
                  />
                </g>
              ))}
          </g>
        </svg>
        {hovered ? (
          <ChartTooltip x={m.left + x(hovered.t)} y={m.top + y(hovered.grade)} width={width}>
            <p className="font-medium">{hovered.title}</p>
            <p className="text-muted-foreground">{formatDate(hovered.date)}</p>
            <p className="tabular mt-1">
              Candidates&apos; grade:{" "}
              <span className="font-medium">{formatDecimal(hovered.grade)}</span>
            </p>
          </ChartTooltip>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <LegendSwatch color={g.color} shape="dot" /> One debate
        </span>
        <span className="flex items-center gap-1.5">
          <LegendSwatch color={g.color} shape="line" /> Linear trend, 95% band
        </span>
        {g.byCycle.some((c) => c.lower !== null) ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2 rotate-45 bg-foreground" /> Cycle mean,
            95% interval (five or more debates)
          </span>
        ) : (
          <span>No cycle has five debates, so no cycle means are marked.</span>
        )}
      </div>
    </div>
  );
}
