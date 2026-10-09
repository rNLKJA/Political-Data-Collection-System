"use client";

import { useState } from "react";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { linearScale, quantile } from "@/lib/chart";
import { formatInt } from "@/lib/format";

export interface StripRow {
  idx: number;
  display: string;
  role: "candidate" | "moderator" | "other";
  lengths: number[];
}

const ROLE_FILL = {
  candidate: "var(--role-candidate)",
  moderator: "var(--role-moderator)",
  other: "var(--role-other)",
} as const;

/**
 * Turn-length distribution per speaker on a log scale: every turn is a thin
 * tick, the box spans the middle half and the bar marks the median.
 */
export function TurnStrips({ rows }: { rows: StripRow[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const rowH = 30;
  const narrow = width < 560;
  const m = { top: 4, right: 12, bottom: 30, left: narrow ? 84 : 130 };
  const innerW = Math.max(10, width - m.left - m.right);
  const height = m.top + m.bottom + rows.length * rowH;
  const maxLen = Math.max(10, ...rows.flatMap((r) => r.lengths));
  const lx = linearScale([0, Math.log10(maxLen * 1.1)], [0, innerW]);
  const x = (v: number) => lx(Math.log10(Math.max(1, v)));
  const ticks = [1, 10, 100, 1000, 10000].filter((t) => t <= maxLen * 1.1);
  const stats = rows.map((r) => {
    const s = [...r.lengths].sort((a, b) => a - b);
    return { q1: quantile(s, 0.25), med: quantile(s, 0.5), q3: quantile(s, 0.75), n: s.length };
  });

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Distribution of turn lengths in words for each speaker, log scale"
        className="block max-w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <g transform={`translate(${m.left},${m.top})`}>
          {ticks.map((t) => (
            <g key={t} transform={`translate(${x(t)},0)`}>
              <line y2={rows.length * rowH} stroke="var(--chart-grid)" />
              <text
                y={rows.length * rowH + 16}
                textAnchor="middle"
                className="tabular fill-muted-foreground font-mono text-[10px]"
              >
                {formatInt(t)}
              </text>
            </g>
          ))}
          <text
            x={innerW / 2}
            y={rows.length * rowH + 28}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            words per turn (log scale)
          </text>
          {rows.map((r, i) => {
            const st = stats[i];
            const cy = i * rowH + rowH / 2;
            return (
              <g key={r.idx} onMouseEnter={() => setHover(i)}>
                <rect y={i * rowH} width={innerW} height={rowH} fill="transparent" />
                <text
                  x={-8}
                  y={cy}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-foreground text-[11px]"
                >
                  {r.display.length > (narrow ? 11 : 18)
                    ? `${r.display.slice(0, narrow ? 10 : 17)}…`
                    : r.display}
                </text>
                {r.lengths.map((len, j) => (
                  <line
                    key={j}
                    x1={x(len)}
                    x2={x(len)}
                    y1={cy - 7}
                    y2={cy + 7}
                    stroke={ROLE_FILL[r.role]}
                    strokeOpacity={0.35}
                  />
                ))}
                <rect
                  x={x(st.q1)}
                  y={cy - 4}
                  width={Math.max(2, x(st.q3) - x(st.q1))}
                  height={8}
                  rx={2}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeOpacity={0.55}
                />
                <line
                  x1={x(st.med)}
                  x2={x(st.med)}
                  y1={cy - 8}
                  y2={cy + 8}
                  stroke="var(--foreground)"
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </g>
      </svg>
      {hover !== null ? (
        <ChartTooltip x={m.left + x(stats[hover].med)} y={m.top + hover * rowH} width={width}>
          <p className="font-medium">{rows[hover].display}</p>
          <p className="tabular text-muted-foreground">
            {formatInt(stats[hover].n)} turns · median {formatInt(stats[hover].med)} words
          </p>
          <p className="tabular text-muted-foreground">
            middle half {formatInt(stats[hover].q1)} to {formatInt(stats[hover].q3)} words
          </p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
