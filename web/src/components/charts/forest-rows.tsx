import { Fragment } from "react";

import { formatDecimal } from "@/lib/format";

export interface ForestRow {
  key: string;
  /** rows that share a group get one heading above them */
  group?: string;
  label: React.ReactNode;
  note?: React.ReactNode;
  estimate: number;
  lower: number | null;
  upper: number | null;
  color?: string;
}

/**
 * Point estimates with 95% intervals as plain HTML rows (labels stay text and
 * scale with the page). Every value is also printed, so nothing depends on
 * reading the marks.
 */
export function ForestRows({
  rows,
  domain,
  ticks,
  digits = 1,
  zero,
  caption,
}: {
  rows: ForestRow[];
  domain: [number, number];
  ticks: number[];
  digits?: number;
  /** draw a reference line at this value (e.g. 0 for differences) */
  zero?: number;
  caption: string;
}) {
  const [lo, hi] = domain;
  const pos = (v: number) => `${(100 * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo)}%`;
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="grid grid-cols-[minmax(0,7.5rem)_minmax(4rem,1fr)_auto] gap-x-3 gap-y-2 text-sm sm:grid-cols-[minmax(0,15rem)_minmax(8rem,1fr)_auto]">
        {rows.map((r, i) => (
          <Fragment key={r.key}>
            {r.group && r.group !== rows[i - 1]?.group ? (
              <li className="col-span-3 mt-3 font-medium first:mt-0">{r.group}</li>
            ) : null}
            <li className="col-span-3 grid grid-cols-subgrid items-center">
              <span className="min-w-0 leading-tight">
                {r.label}
                {r.note ? (
                  <span className="block text-xs text-muted-foreground">{r.note}</span>
                ) : null}
              </span>
              <span className="relative h-5" aria-hidden>
                <span
                  className="absolute inset-x-0 top-1/2 h-px"
                  style={{ background: "var(--chart-grid)" }}
                />
                {zero !== undefined ? (
                  <span
                    className="absolute inset-y-0 w-px"
                    style={{ left: pos(zero), background: "var(--chart-axis)" }}
                  />
                ) : null}
                {r.lower !== null && r.upper !== null ? (
                  <span
                    className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                    style={{
                      left: pos(r.lower),
                      width: `calc(${pos(r.upper)} - ${pos(r.lower)})`,
                      background: r.color ?? "var(--role-candidate)",
                      opacity: 0.55,
                    }}
                  />
                ) : null}
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                  style={{ left: pos(r.estimate), background: r.color ?? "var(--role-candidate)" }}
                />
              </span>
              <span className="tabular text-right text-xs whitespace-nowrap text-muted-foreground">
                <span className="font-medium text-foreground">
                  {formatDecimal(r.estimate, digits)}
                </span>
                <span className="block sm:inline">
                  {r.lower !== null && r.upper !== null
                    ? ` (${formatDecimal(r.lower, digits)} to ${formatDecimal(r.upper, digits)})`
                    : " (no interval)"}
                </span>
              </span>
            </li>
          </Fragment>
        ))}
        <li className="col-span-3 grid grid-cols-subgrid" aria-hidden>
          <span />
          <span className="relative h-4">
            {ticks.map((t) => (
              <span
                key={t}
                className="tabular absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
                style={{ left: pos(t) }}
              >
                {t}
              </span>
            ))}
          </span>
          <span />
        </li>
      </ul>
    </figure>
  );
}
