"use client";

import { useState } from "react";

import { ChartTooltip, LegendSwatch } from "@/components/charts/chart-tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { linearScale } from "@/lib/chart";
import { formatCompact, formatInt } from "@/lib/format";

export interface LaneSpeaker {
  idx: number;
  display: string;
  role: "candidate" | "moderator" | "other";
  words: number;
}

export interface LaneTurn {
  seq: number;
  speakerIdx: number;
  words: number;
  interrupted: number;
}

const ROLE_FILL = {
  candidate: "var(--role-candidate)",
  moderator: "var(--role-moderator)",
  other: "var(--role-other)",
} as const;

/**
 * One row per speaker; every turn is a block placed at its position in the
 * running word count, as wide as the turn is long. Reading left to right
 * replays the debate.
 */
export function TurnSwimlane({ speakers, turns }: { speakers: LaneSpeaker[]; turns: LaneTurn[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const lanes = [...speakers].sort((a, b) => {
    const order = { candidate: 0, moderator: 1, other: 2 };
    return order[a.role] - order[b.role] || b.words - a.words;
  });
  const laneOf = new Map(lanes.map((s, i) => [s.idx, i]));
  const rowH = 22;
  const narrow = width < 560;
  const m = { top: 8, right: 8, bottom: 26, left: narrow ? 84 : 130 };
  const innerW = Math.max(10, width - m.left - m.right);
  const height = m.top + m.bottom + lanes.length * rowH;
  const starts: number[] = [];
  let acc = 0;
  for (const t of turns) {
    starts.push(acc);
    acc += t.words;
  }
  const total = Math.max(1, acc);
  const x = linearScale([0, total], [0, innerW]);
  const ticks = innerW < 360 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const ht = hover !== null ? turns[hover] : null;
  const hs = ht ? speakers.find((s) => s.idx === ht.speakerIdx) : null;

  return (
    <div>
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Timeline of ${turns.length} speaking turns by ${lanes.length} speakers, one row per speaker`}
          className="block max-w-full overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          <g transform={`translate(${m.left},${m.top})`}>
            {lanes.map((s, i) => (
              <g key={s.idx} transform={`translate(0,${i * rowH})`}>
                <rect
                  width={innerW}
                  height={rowH - 4}
                  y={2}
                  fill={i % 2 ? "transparent" : "var(--chart-grid)"}
                  fillOpacity={0.45}
                  rx={2}
                />
                <text
                  x={-8}
                  y={rowH / 2}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-foreground text-[11px]"
                >
                  {s.display.length > (narrow ? 11 : 18)
                    ? `${s.display.slice(0, narrow ? 10 : 17)}…`
                    : s.display}
                </text>
              </g>
            ))}
            {turns.map((t, i) => {
              const lane = laneOf.get(t.speakerIdx);
              const sp = speakers.find((s) => s.idx === t.speakerIdx);
              if (lane === undefined || !sp) return null;
              const w = Math.max(1, x(t.words) - 0.5);
              return (
                <rect
                  key={t.seq}
                  x={x(starts[i])}
                  y={lane * rowH + 4}
                  width={w}
                  height={rowH - 8}
                  rx={1}
                  fill={ROLE_FILL[sp.role]}
                  fillOpacity={hover === null || hover === i ? 1 : 0.35}
                  onMouseEnter={() => setHover(i)}
                />
              );
            })}
            <line
              y1={lanes.length * rowH}
              y2={lanes.length * rowH}
              x2={innerW}
              stroke="var(--chart-axis)"
            />
            {ticks.map((f) => (
              <text
                key={f}
                x={f * innerW}
                y={lanes.length * rowH + 16}
                textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
                className="tabular fill-muted-foreground font-mono text-[10px]"
              >
                {f === 0 ? "start" : f === 1 ? `${formatCompact(total)} words` : `${f * 100}%`}
              </text>
            ))}
          </g>
        </svg>
        {ht && hs ? (
          <ChartTooltip
            x={m.left + x(starts[hover!] + ht.words / 2)}
            y={m.top + (laneOf.get(ht.speakerIdx) ?? 0) * rowH}
            width={width}
          >
            <p className="font-medium">{hs.display}</p>
            <p className="tabular text-muted-foreground">
              Turn {formatInt(ht.seq + 1)} of {formatInt(turns.length)} · {formatInt(ht.words)}{" "}
              words
            </p>
            {ht.interrupted ? (
              <p className="text-muted-foreground">Ends mid-sentence (a dash in the transcript)</p>
            ) : null}
          </ChartTooltip>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--role-candidate)" /> Candidates
        </span>
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--role-moderator)" /> Moderators, panellists, questioners
        </span>
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--role-other)" /> Audience, recorded clips, unidentified
        </span>
      </div>
    </div>
  );
}
