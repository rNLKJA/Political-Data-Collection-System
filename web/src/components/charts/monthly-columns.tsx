"use client";

import { useState } from "react";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { formatTick, linearScale, niceMax, niceTicks } from "@/lib/chart";
import { formatInt, formatMonth } from "@/lib/format";

/**
 * Documents per month as thin columns on one baseline, with a hover tooltip.
 * Every calendar month in `months` gets a slot, so gaps are visible.
 */
export function MonthlyColumns({
  months,
  counts,
  height = 220,
  label,
  unit = "documents",
}: {
  months: string[];
  counts: Record<string, number>;
  height?: number;
  label: string;
  unit?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 12, right: 8, bottom: 26, left: 40 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const values = months.map((mo) => counts[mo] ?? 0);
  const yMax = niceMax(Math.max(1, ...values));
  const y = linearScale([0, yMax], [innerH, 0]);
  const band = innerW / Math.max(1, months.length);
  const barW = Math.max(1, Math.min(24, band - 2));
  const years = months
    .map((mo, i) => ({ mo, i }))
    .filter(({ mo }) => mo.endsWith("-01") || mo === months[0]);
  const yearStep = innerW < 420 ? 2 : 1;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="block max-w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <g transform={`translate(${m.left},${m.top})`}>
          {niceTicks(0, yMax, 4).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={innerW} stroke="var(--chart-grid)" strokeWidth={1} />
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
          {values.map((v, i) => {
            if (!v) return null;
            const h = innerH - y(v);
            const x = i * band + (band - barW) / 2;
            const r = Math.min(2, barW / 2, h);
            return (
              <path
                key={months[i]}
                d={`M${x},${innerH} V${innerH - h + r} Q${x},${innerH - h} ${x + r},${innerH - h} H${x + barW - r} Q${x + barW},${innerH - h} ${x + barW},${innerH - h + r} V${innerH} Z`}
                fill={
                  hover === null || hover === i ? "var(--role-candidate)" : "var(--chart-muted)"
                }
              />
            );
          })}
          <line y1={innerH} y2={innerH} x2={innerW} stroke="var(--chart-axis)" />
          {years.map(({ mo, i }, k) =>
            k % yearStep === 0 ? (
              <text
                key={mo}
                x={i * band}
                y={innerH + 17}
                className="tabular fill-muted-foreground font-mono text-[10px]"
              >
                {mo.slice(0, 4)}
              </text>
            ) : null,
          )}
          {/* hit targets wider than the marks */}
          {months.map((mo, i) => (
            <rect
              key={`hit-${mo}`}
              x={i * band}
              y={0}
              width={band}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </g>
      </svg>
      {hover !== null ? (
        <ChartTooltip
          x={m.left + hover * band + band / 2}
          y={m.top + y(values[hover])}
          width={width}
        >
          <p className="font-medium">{formatMonth(months[hover])}</p>
          <p className="tabular text-muted-foreground">
            {formatInt(values[hover])} {unit}
          </p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
