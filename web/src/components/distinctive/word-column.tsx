import Link from "next/link";

import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { formatDecimal, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DistinctiveWord } from "@/server/term-index";

/** Ranked words for one side, with a z-score bar and per-10k rates for both groups. */
export function WordColumn({
  side,
  title,
  words,
  maxZ,
  hrefFor,
  selected,
}: {
  side: "A" | "B";
  title: string;
  words: DistinctiveWord[];
  maxZ: number;
  hrefFor: (term: string) => string;
  selected?: string;
}) {
  const color = side === "A" ? "var(--series-1)" : "var(--series-2)";
  return (
    <div>
      <h3 className="flex items-center gap-2 font-serif text-lg">
        <LegendSwatch color={color} />
        <span>More characteristic of {title}</span>
      </h3>
      {words.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Select a word to see the documents that use it most.
        </p>
      ) : null}
      {words.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No word leans this way.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">
            Words most characteristic of {title}, ranked by z-score, with uses per 10,000 words in
            each group
          </caption>
          <thead>
            <tr className="text-left text-[0.7rem] tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="py-1.5 pr-2 font-medium">
                Word
              </th>
              <th scope="col" className="w-[38%] py-1.5 pr-2 font-medium">
                z-score
              </th>
              <th
                scope="col"
                className="py-1.5 pr-2 text-right font-medium"
                title="Uses per 10,000 indexed words"
              >
                A /10k
              </th>
              <th
                scope="col"
                className="py-1.5 text-right font-medium"
                title="Uses per 10,000 indexed words"
              >
                B /10k
              </th>
            </tr>
          </thead>
          <tbody>
            {words.map((w) => (
              <tr
                key={w.term}
                className={cn("border-t border-border/60", selected === w.term && "bg-mark/40")}
              >
                <td className="py-1.5 pr-2">
                  <Link
                    href={hrefFor(w.term)}
                    className="font-mono text-[0.85rem] underline decoration-primary/50 decoration-dotted underline-offset-4 hover:text-primary hover:decoration-solid"
                    title={`Show documents that use “${w.term}” (${formatInt(w.yA)} in A, ${formatInt(w.yB)} in B)`}
                  >
                    {w.term}
                  </Link>
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="relative h-2 flex-1 rounded-full bg-muted" aria-hidden>
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.max(2, (Math.abs(w.z) / maxZ) * 100)}%`,
                          background: color,
                        }}
                      />
                    </span>
                    <span className="tabular w-10 text-right text-xs text-muted-foreground">
                      {formatDecimal(Math.abs(w.z))}
                    </span>
                  </div>
                </td>
                <td className="tabular py-1.5 pr-2 text-right text-xs">
                  {formatDecimal(w.rateA, 1)}
                </td>
                <td className="tabular py-1.5 text-right text-xs">{formatDecimal(w.rateB, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
