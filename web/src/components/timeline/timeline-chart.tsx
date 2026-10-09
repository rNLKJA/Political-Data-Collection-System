"use client";

import { useState } from "react";

import { ChartTooltip, LegendSwatch } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { formatTick, linearScale, niceMax, niceTicks, quantile, SERIES_VARS } from "@/lib/chart";
import { formatCompact, formatDecimal, formatInt } from "@/lib/format";

export interface ChartPoint {
  period: string;
  k: number;
  words: number;
  rate: number;
  lower: number;
  upper: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  /** fixed palette slot for this entity, so colours never reshuffle */
  slot: number;
  points: ChartPoint[];
}

function periodLabel(p: string): string {
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split("-");
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`;
  }
  return p.replace("-", " ");
}

/**
 * Rate per 10,000 words over time with a 95 % interval band per series,
 * a crosshair and a tooltip listing every series at the hovered period.
 */
export function TimelineChart({
  periods,
  series,
  label,
}: {
  periods: string[];
  series: ChartSeries[];
  label: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const height = 320;
  const m = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const pIndex = new Map(periods.map((p, i) => [p, i]));
  const step = innerW / Math.max(1, periods.length - 1);
  const x = (i: number) => i * step;

  const rates = series.flatMap((s) => s.points.map((p) => p.rate));
  const uppers = series.flatMap((s) => s.points.map((p) => p.upper)).sort((a, b) => a - b);
  const top = Math.max(Math.max(0, ...rates) * 1.15, quantile(uppers, 0.9) || 0, 1);
  const yMax = niceMax(top, 4);
  const y = linearScale([0, yMax], [innerH, 0]);
  const clampY = (v: number) => y(Math.min(v, yMax));
  const clipped = uppers.some((u) => u > yMax);

  const segments = (pts: ChartPoint[]) => {
    const out: ChartPoint[][] = [];
    let cur: ChartPoint[] = [];
    let prev = -2;
    for (const p of pts) {
      const i = pIndex.get(p.period)!;
      if (i !== prev + 1 && cur.length) {
        out.push(cur);
        cur = [];
      }
      cur.push(p);
      prev = i;
    }
    if (cur.length) out.push(cur);
    return out;
  };

  const tickEvery = Math.max(1, Math.ceil(periods.length / Math.max(2, Math.floor(innerW / 64))));
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left) / step);
    setHover(Math.max(0, Math.min(periods.length - 1, i)));
  };

  return (
    <div>
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block max-w-full overflow-visible"
        >
          <defs>
            <clipPath id="tl-clip">
              <rect width={innerW + 8} height={innerH} x={-4} />
            </clipPath>
          </defs>
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
                  {formatTick(t)}
                </text>
              </g>
            ))}
            <line y1={innerH} y2={innerH} x2={innerW} stroke="var(--chart-axis)" />
            {periods.map((p, i) =>
              i % tickEvery === 0 ? (
                <text
                  key={p}
                  x={x(i)}
                  y={innerH + 18}
                  textAnchor="middle"
                  className="tabular fill-muted-foreground font-mono text-[10px]"
                >
                  {p.length === 4
                    ? p
                    : p.slice(0, 4) + (p.includes("Q") ? ` ${p.slice(5)}` : `-${p.slice(5)}`)}
                </text>
              ) : null,
            )}
            <g clipPath="url(#tl-clip)">
              {series.map((s) =>
                segments(s.points).map((seg, j) => {
                  const color = SERIES_VARS[s.slot % SERIES_VARS.length];
                  const area =
                    seg
                      .map(
                        (p, k) => `${k ? "L" : "M"}${x(pIndex.get(p.period)!)},${clampY(p.upper)}`,
                      )
                      .join(" ") +
                    " " +
                    [...seg]
                      .reverse()
                      .map((p) => `L${x(pIndex.get(p.period)!)},${clampY(p.lower)}`)
                      .join(" ") +
                    " Z";
                  const line = seg
                    .map((p, k) => `${k ? "L" : "M"}${x(pIndex.get(p.period)!)},${clampY(p.rate)}`)
                    .join(" ");
                  return (
                    <g key={`${s.key}-${j}`}>
                      <path d={area} fill={color} fillOpacity={0.12} />
                      <path
                        d={line}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {seg.length === 1 ? (
                        <circle
                          cx={x(pIndex.get(seg[0].period)!)}
                          cy={clampY(seg[0].rate)}
                          r={3.5}
                          fill={color}
                        />
                      ) : null}
                    </g>
                  );
                }),
              )}
            </g>
            {hover !== null ? (
              <g>
                <line x1={x(hover)} x2={x(hover)} y2={innerH} stroke="var(--chart-axis)" />
                {series.map((s) => {
                  const p = s.points.find((pt) => pt.period === periods[hover]);
                  return p ? (
                    <circle
                      key={s.key}
                      cx={x(hover)}
                      cy={clampY(p.rate)}
                      r={4.5}
                      fill={SERIES_VARS[s.slot % SERIES_VARS.length]}
                      stroke="var(--chart-surface)"
                      strokeWidth={2}
                    />
                  ) : null;
                })}
              </g>
            ) : null}
            <rect
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        </svg>
        {hover !== null ? (
          <ChartTooltip x={m.left + x(hover)} y={m.top} width={width} className="max-w-[18rem]">
            <p className="font-medium">{periodLabel(periods[hover])}</p>
            {series.map((s) => {
              const p = s.points.find((pt) => pt.period === periods[hover]);
              return (
                <div key={s.key} className="mt-1.5">
                  <p className="flex items-center gap-1.5">
                    <LegendSwatch color={SERIES_VARS[s.slot % SERIES_VARS.length]} shape="line" />
                    <span className="truncate">{s.label}</span>
                  </p>
                  {p ? (
                    <p className="tabular text-muted-foreground">
                      {formatDecimal(p.rate, 2)} per 10k ({formatDecimal(p.lower, 2)} to{" "}
                      {formatDecimal(p.upper, 2)}) · {formatInt(p.k)} in {formatCompact(p.words)}{" "}
                      words
                    </p>
                  ) : (
                    <p className="text-muted-foreground">No documents in this period</p>
                  )}
                </div>
              );
            })}
          </ChartTooltip>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <LegendSwatch color={SERIES_VARS[s.slot % SERIES_VARS.length]} shape="line" /> {s.label}
          </span>
        ))}
        <span>Shaded: exact 95% interval{clipped ? " (clipped at the top of the chart)" : ""}</span>
      </div>
    </div>
  );
}
