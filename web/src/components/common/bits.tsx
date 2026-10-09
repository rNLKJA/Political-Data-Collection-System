import { ArrowRight, ArrowUpRight, Info } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-l border-rule/70 pl-4", className)}>
      <p className="text-[0.8rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** A link to the source page on The American Presidency Project. */
export function SourceLink({
  href,
  children,
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary",
        className,
      )}
    >
      {children ?? "Source"}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> (opens The American Presidency Project in a new tab)</span>
    </a>
  );
}

export function Callout({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={title}
      className={cn(
        "flex gap-3 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm leading-relaxed",
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div>
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </aside>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="font-serif text-lg">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

/** Accessible data table behind a disclosure, the chart's table view. */
export function TableView({
  summary = "Show the numbers as a table",
  caption,
  head,
  rows,
}: {
  summary?: string;
  caption: string;
  head: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
        {summary}
      </summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-secondary">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/70">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ToolCard({
  href,
  index,
  title,
  children,
}: {
  href: string;
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <span className="kicker">{index}</span>
      <span className="mt-2 font-serif text-xl font-medium">{title}</span>
      <span className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{children}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        Open
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}

/** Horizontal proportion bars in plain HTML (labels stay text, not colour). */
export function BarList({
  items,
  format = (v: number) => String(v),
  color = "var(--role-candidate)",
  max,
}: {
  items: Array<{
    key: string;
    label: React.ReactNode;
    value: number;
    note?: React.ReactNode;
    color?: string;
  }>;
  format?: (v: number) => string;
  color?: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  // One grid for the whole list (rows are subgrids), so every bar track has the
  // same width and bar lengths stay comparable even when only some rows carry a
  // note under their value.
  return (
    <ul className="grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] gap-x-3 gap-y-2.5 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(4rem,1fr)_auto]">
      {items.map((it) => (
        <li key={it.key} className="col-span-3 grid grid-cols-subgrid items-center">
          <span className="truncate" title={typeof it.label === "string" ? it.label : undefined}>
            {it.label}
          </span>
          <span className="relative h-2.5 rounded-full bg-muted" aria-hidden>
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.max(0.5, (it.value / top) * 100)}%`,
                background: it.color ?? color,
              }}
            />
          </span>
          <span className="tabular min-w-12 text-right text-muted-foreground">
            {format(it.value)}
            {it.note ? <span className="block text-[0.7rem]">{it.note}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
