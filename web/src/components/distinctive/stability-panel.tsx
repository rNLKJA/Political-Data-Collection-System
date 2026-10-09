import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { Panel } from "@/components/common/page-intro";
import { formatDecimal, formatInt, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StabilityView, StableWord } from "@/server/term-index";

/** A word "rests on few documents" if it often drops out or one document supplies a quarter of it. */
export const FRAGILE_STABILITY = 0.5;
export const HEAVY_DOC_SHARE = 0.25;

function fragile(w: StableWord) {
  return w.stability < FRAGILE_STABILITY || w.topDocShare >= HEAVY_DOC_SHARE;
}

function StabilityTable({
  title,
  words,
  color,
  top,
  sign,
}: {
  title: string;
  words: StableWord[];
  color: string;
  top: number;
  /** 1 for group A (positive z), −1 for group B */
  sign: 1 | -1;
}) {
  const kept = words.filter((w) => w.stability >= 0.9).length;
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 font-serif text-lg">
        <LegendSwatch color={color} />
        <span className="min-w-0">{title}</span>
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {kept} of {words.length} words stay in the top {top} in at least 90% of resamples.
      </p>
      {words.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No word leans this way.</p>
      ) : (
        <div
          className="mt-3 overflow-x-auto"
          role="region"
          aria-label={`Stability of the words for ${title} (scrolls sideways on small screens)`}
          tabIndex={0}
        >
          <table className="w-full min-w-[26rem] text-sm">
            <caption className="sr-only">
              For each word in the list for {title}: the share of resamples in which it stays in the
              top {top}, the 95% range of its z-score across resamples, the documents in the group
              that use it, and the share of its uses from the single heaviest document
            </caption>
            <thead>
              <tr className="text-left text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Word
                </th>
                <th scope="col" className="w-[34%] py-1.5 pr-2 font-medium">
                  Kept in top {top}
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                  z, 95% range
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                  Docs
                </th>
                <th
                  scope="col"
                  className="py-1.5 text-right font-medium"
                  title="Share of the group's uses that come from its single heaviest document"
                >
                  Top doc
                </th>
              </tr>
            </thead>
            <tbody>
              {words.map((w) => (
                <tr
                  key={w.term}
                  className={cn("border-t border-border/60", fragile(w) && "bg-mark/25")}
                >
                  <td className="py-1.5 pr-2 font-mono text-[0.85rem]">
                    {w.term}
                    {fragile(w) ? (
                      <span className="ml-1.5 font-sans text-[0.68rem] text-muted-foreground">
                        few docs
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="relative h-2 flex-1 rounded-full bg-muted" aria-hidden>
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${Math.max(2, w.stability * 100)}%`, background: color }}
                        />
                      </span>
                      <span className="tabular w-10 text-right text-xs text-muted-foreground">
                        {formatPercent(w.stability, 0)}
                      </span>
                    </div>
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right text-xs whitespace-nowrap">
                    {formatDecimal(Math.min(sign * w.zLower, sign * w.zUpper))} to{" "}
                    {formatDecimal(Math.max(sign * w.zLower, sign * w.zUpper))}
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right text-xs">{formatInt(w.docs)}</td>
                  <td className="tabular py-1.5 text-right text-xs">
                    {formatPercent(w.topDocShare, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The bootstrap check under the two word lists on /distinctive. */
export function StabilityPanel({
  view,
  labelA,
  labelB,
}: {
  view: StabilityView;
  labelA: string;
  labelB: string;
}) {
  const small = Math.min(view.docsA, view.docsB) < 20;
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="stability-heading" className="font-serif text-xl">
          How stable are these lists?
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatInt(view.resamples)} resamples of documents · seed {view.seed}
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        The z-score treats every word as an independent draw, but one press release can repeat a
        word dozens of times. So the documents in each group were resampled with replacement and
        both lists recomputed each time. A word kept in nearly every resample does not depend on a
        few documents; a highlighted word drops out often or gets a quarter or more of its uses from
        one document.
      </p>
      {small ? (
        <p className="mt-2 text-sm text-destructive">
          One group has fewer than 20 documents, so resampling it says little; read these figures
          with care.
        </p>
      ) : null}
      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        <StabilityTable
          title={labelA}
          words={view.a}
          color="var(--series-1)"
          top={view.top}
          sign={1}
        />
        <StabilityTable
          title={labelB}
          words={view.b}
          color="var(--series-2)"
          top={view.top}
          sign={-1}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        With {formatInt(view.resamples)} resamples a kept share is accurate to about ±
        {formatDecimal(100 * Math.sqrt(0.25 / view.resamples), 0)} percentage points. The z range is
        the 2.5th to 97.5th percentile of the word&apos;s z-score across resamples, signed so that
        larger means leaning further towards that column&apos;s group. Prior and α₀ are held fixed.
      </p>
    </Panel>
  );
}
