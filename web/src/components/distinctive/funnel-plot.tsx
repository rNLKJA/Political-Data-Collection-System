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

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Placement {
  text: string;
  anchor: "start" | "end";
  tx: number;
  ty: number;
  leader: boolean;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Rank of labels[i] among the labels on its side (labels arrive strongest first). */
function rankInSide(labels: FunnelLabel[], i: number) {
  let r = 0;
  for (let j = 0; j < i; j++) if (labels[j].side === labels[i].side) r++;
  return r;
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

  // On narrow screens label fewer words: the strongest four on each side.
  const shown = narrow ? labels.filter((_, i) => rankInSide(labels, i) < 4) : labels;

  // Greedy placement, strongest words first. Each label tries the right of its
  // dot, then the left, then nudged up or down with a short leader line; it may
  // not cover another label or another highlighted dot. Dots that sit on top of
  // each other share one label ("hillary · clinton"). The three strongest
  // words on each side are always labelled, even if that means an overlap.
  const pos = shown.map((l) => ({ cx: x(l.x), cy: y(l.z) }));
  const near = (i: number, j: number) =>
    Math.hypot(pos[i].cx - pos[j].cx, pos[i].cy - pos[j].cy) < 9;
  const dotBox = (j: number): Box => ({
    x0: pos[j].cx - 6.5,
    x1: pos[j].cx + 6.5,
    y0: pos[j].cy - 6.5,
    y1: pos[j].cy + 6.5,
  });
  const placed: Box[] = [];
  const done = new Set<number>();
  const texts: Array<Placement | null> = shown.map(() => null);
  const order = shown.map((_, i) => i).sort((a, b) => Math.abs(shown[b].z) - Math.abs(shown[a].z));
  for (const i of order) {
    if (done.has(i)) continue;
    const cluster = order.filter((j) => !done.has(j) && (j === i || near(i, j)));
    const text = cluster.map((j) => shown[j].term).join(" · ");
    const { cx, cy } = pos[i];
    const w = text.length * 6.4 + 4;
    const options: Placement[] = [];
    for (const dy of [0, -14, 14, -28, 28]) {
      options.push(
        { text, anchor: "start", tx: cx + 7, ty: cy + dy, leader: dy !== 0 },
        { text, anchor: "end", tx: cx - 7, ty: cy + dy, leader: dy !== 0 },
      );
    }
    const boxOf = (o: Placement): Box =>
      o.anchor === "start"
        ? { x0: o.tx - 2, x1: o.tx + w, y0: o.ty - 7, y1: o.ty + 7 }
        : { x0: o.tx - w, x1: o.tx + 2, y0: o.ty - 7, y1: o.ty + 7 };
    const inBounds = options.filter((o) => {
      const b = boxOf(o);
      return b.x0 >= 0 && b.x1 <= innerW + m.right && b.y0 >= -m.top && b.y1 <= innerH;
    });
    const free = inBounds.find((o) => {
      const box = boxOf(o);
      return (
        !placed.some((b) => overlaps(box, b)) &&
        !pos.some((_, j) => !cluster.includes(j) && overlaps(box, dotBox(j)))
      );
    });
    const must = cluster.some((j) => rankInSide(shown, j) < 3);
    const choice = free ?? (must ? inBounds[0] : undefined);
    if (!choice) continue;
    placed.push(boxOf(choice));
    texts[i] = choice;
    for (const j of cluster) done.add(j);
  }
  const shownLabels = shown.map((l, i) => ({ l, cx: pos[i].cx, cy: pos[i].cy, text: texts[i] }));

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
          {shownLabels.map(({ l, cx, cy, text }) =>
            text ? (
              <g key={`label-${l.term}`}>
                {text.leader ? (
                  <line
                    x1={cx}
                    y1={cy}
                    x2={text.anchor === "start" ? text.tx - 2 : text.tx + 2}
                    y2={text.ty}
                    stroke="var(--chart-axis)"
                    strokeWidth={0.8}
                  />
                ) : null}
                <text
                  x={text.tx}
                  y={text.ty}
                  dy="0.32em"
                  textAnchor={text.anchor}
                  className="fill-foreground font-mono text-[10.5px]"
                  style={{ paintOrder: "stroke", stroke: "var(--chart-surface)", strokeWidth: 3 }}
                >
                  {text.text}
                </text>
              </g>
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
