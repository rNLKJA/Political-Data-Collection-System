"use client";

import { useMemo, useState } from "react";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { formatTick, linearScale, niceTicks } from "@/lib/chart";
import { formatInt } from "@/lib/format";

export interface FunnelLabel {
  term: string;
  x: number;
  z: number;
  side: 1 | 2;
}

/**
 * Monroe et al.'s funnel: z-score against total frequency. Words beyond
 * |z| = 1.96 take their group's colour; the rest stay a quiet grey.
 */
export function FunnelPlot({
  cloud,
  labels,
  labelA,
  labelB,
}: {
  cloud: Array<[number, number, 0 | 1 | 2]>;
  labels: FunnelLabel[];
  labelA: string;
  labelB: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<FunnelLabel | null>(null);
  const height = 360;
  const m = { top: 16, right: 16, bottom: 40, left: 44 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const xMax = Math.max(1, ...cloud.map((c) => c[0]));
  const zAbs = Math.max(4, ...cloud.map((c) => Math.abs(c[1])));
  const zLim = Math.ceil(zAbs / 5) * 5;
  const x = linearScale([0, Math.ceil(xMax)], [0, innerW]);
  const y = linearScale([-zLim, zLim], [innerH, 0]);
  const xTicks = niceTicks(0, Math.ceil(xMax), Math.min(5, Math.ceil(xMax)));
  const yTicks = niceTicks(-zLim, zLim, 6);
  const fill = (f: 0 | 1 | 2) =>
    f === 1 ? "var(--series-1)" : f === 2 ? "var(--series-2)" : "var(--chart-muted)";

  // Draw greys first so coloured points sit on top.
  const ordered = useMemo(() => [...cloud].sort((p, q) => p[2] - q[2]), [cloud]);
  const narrow = width < 520;

  // Greedy placement, strongest words first: try the right of the dot, then
  // the left. A label may not cover another label or another highlighted dot.
  // Dots that sit on top of each other share the strongest word's label; the
  // others keep their tooltip only.
  const pos = labels.map((l) => ({ cx: x(l.x), cy: y(l.z) }));
  const near = (i: number, j: number) =>
    Math.hypot(pos[i].cx - pos[j].cx, pos[i].cy - pos[j].cy) < 9;
  const overlaps = (
    a: { x0: number; x1: number; y0: number; y1: number },
    b: { x0: number; x1: number; y0: number; y1: number },
  ) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const dotBox = (j: number) => ({
    x0: pos[j].cx - 6.5,
    x1: pos[j].cx + 6.5,
    y0: pos[j].cy - 6.5,
    y1: pos[j].cy + 6.5,
  });
  const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  const labelled: number[] = [];
  const texts: Array<{ anchor: "start" | "end"; tx: number } | null> = labels.map(() => null);
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => Math.abs(labels[b].z) - Math.abs(labels[a].z));
  for (const i of order) {
    if (labelled.some((j) => near(i, j))) continue;
    const { cx, cy } = pos[i];
    const w = labels[i].term.length * 6.4 + 4;
    const options = [
      { anchor: "start" as const, tx: cx + 7, x0: cx + 5, x1: cx + 7 + w },
      { anchor: "end" as const, tx: cx - 7, x0: cx - 7 - w, x1: cx - 5 },
    ];
    for (const o of options) {
      const box = { x0: o.x0, x1: o.x1, y0: cy - 7, y1: cy + 7 };
      if (box.x0 < 0 || box.x1 > innerW + m.right) continue;
      const clash =
        placed.some((b) => overlaps(box, b)) ||
        pos.some((_, j) => j !== i && !near(i, j) && overlaps(box, dotBox(j)));
      if (!clash) {
        placed.push(box);
        labelled.push(i);
        texts[i] = { anchor: o.anchor, tx: o.tx };
        break;
      }
    }
  }
  const placements = labels.map((l, i) => ({ l, cx: pos[i].cx, cy: pos[i].cy, text: texts[i] }));
  const shownLabels = narrow ? placements.filter((_, i) => i % 2 === 0) : placements;

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Funnel plot of word z-scores against frequency; positive values lean towards ${labelA}, negative towards ${labelB}.`}
        className="block max-w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <g transform={`translate(${m.left},${m.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={innerW} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} />
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
          {[1.96, -1.96].map((t) => (
            <line
              key={t}
              x2={innerW}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--chart-axis)"
              strokeOpacity={0.6}
            />
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={innerH + 18}
              textAnchor="middle"
              className="tabular fill-muted-foreground font-mono text-[10px]"
            >
              {formatInt(10 ** t)}
            </text>
          ))}
          <text
            x={innerW / 2}
            y={innerH + 34}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            Times used in A and B together (log scale)
          </text>
          <text
            transform={`translate(${-34},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            z-score
          </text>
          {ordered.map(([lx, z, f], i) => (
            <circle
              key={i}
              cx={x(lx)}
              cy={y(z)}
              r={f ? 2.6 : 1.8}
              fill={fill(f)}
              fillOpacity={f ? 0.85 : 0.6}
            />
          ))}
          {shownLabels.map(({ l, cx, cy }) => (
            <circle
              key={`dot-${l.term}`}
              cx={cx}
              cy={cy}
              r={4.5}
              fill={fill(l.side)}
              stroke="var(--chart-surface)"
              strokeWidth={2}
            />
          ))}
          {shownLabels.map(({ l, cy, text }) =>
            text ? (
              <text
                key={`label-${l.term}`}
                x={text.tx}
                y={cy}
                dy="0.32em"
                textAnchor={text.anchor}
                className="fill-foreground font-mono text-[10.5px]"
                style={{ paintOrder: "stroke", stroke: "var(--chart-surface)", strokeWidth: 3 }}
              >
                {l.term}
              </text>
            ) : null,
          )}
          {shownLabels.map(({ l, cx, cy }) => (
            <circle
              key={`hit-${l.term}`}
              cx={cx}
              cy={cy}
              r={12}
              fill="transparent"
              onMouseEnter={() => setHover(l)}
            />
          ))}
          <text x={4} y={8} className="fill-muted-foreground text-[11px]">
            ↑ leans A
          </text>
          <text x={4} y={innerH - 6} className="fill-muted-foreground text-[11px]">
            ↓ leans B
          </text>
        </g>
      </svg>
      {hover ? (
        <ChartTooltip x={m.left + x(hover.x)} y={m.top + y(hover.z)} width={width}>
          <p className="font-mono font-medium">{hover.term}</p>
          <p className="text-muted-foreground">
            z = {hover.z.toFixed(1)} · used {formatInt(10 ** hover.x)} times
          </p>
          <p className="text-muted-foreground">Leans {hover.side === 1 ? labelA : labelB}</p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
