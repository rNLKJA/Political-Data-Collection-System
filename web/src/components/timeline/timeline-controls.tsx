"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useState } from "react";

import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { controlClass, Field, Select } from "@/components/ui/field";
import { useQueryNav, type QueryState } from "@/hooks/use-query-nav";
import { SERIES_VARS } from "@/lib/chart";
import { cn } from "@/lib/utils";

export function TimelineControls({
  current,
  concepts,
  speakers,
  selected,
}: {
  current: QueryState;
  concepts: Array<{ slug: string; label: string }>;
  speakers: Array<{ slug: string; name: string; docs: number }>;
  selected: Array<{ slug: string; name: string; slot: number }>;
}) {
  const { go, pending } = useQueryNav("/timeline", current);
  const [term, setTerm] = useState(current.term ?? "");
  const chosen = selected.map((s) => s.slug);
  const setSpeakers = (list: string[]) =>
    go({ speakers: list.length ? list.join(",") : undefined });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1.2fr]">
        <Field label="Topic (controlled vocabulary)" htmlFor="t-concept">
          <Select
            id="t-concept"
            value={current.term ? "" : (current.concept ?? "economy")}
            onChange={(e) => {
              setTerm("");
              go({ concept: e.target.value || undefined, term: undefined });
            }}
          >
            {current.term ? <option value="">Using the word “{current.term}”</option> : null}
            {concepts.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="hidden self-end pb-2.5 text-sm text-muted-foreground md:block">or</p>
        <Field label="Any single word" htmlFor="t-term">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = term.trim().toLowerCase();
              go({ term: t || undefined, concept: t ? undefined : current.concept });
            }}
          >
            <input
              id="t-term"
              type="search"
              value={term}
              maxLength={40}
              placeholder="e.g. tariffs, union, freedom"
              onChange={(e) => setTerm(e.target.value)}
              className={controlClass}
            />
            <button
              type="submit"
              aria-label="Show this word"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Search className="size-4" aria-hidden />
            </button>
          </form>
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <p className="kicker mb-1.5">Candidates (up to three, or all speakers together)</p>
          <div className="flex flex-wrap items-center gap-2">
            {selected.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs">
                <LegendSwatch color={SERIES_VARS[0]} shape="line" /> All speakers
              </span>
            ) : (
              selected.map((s) => (
                <span
                  key={s.slug}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pr-1 pl-3 text-xs"
                >
                  <LegendSwatch color={SERIES_VARS[s.slot % SERIES_VARS.length]} shape="line" />
                  {s.name}
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => setSpeakers(chosen.filter((c) => c !== s.slug))}
                    className="inline-flex size-5 items-center justify-center rounded-full hover:bg-accent"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))
            )}
            {selected.length < 3 ? (
              <div className="w-60">
                <label htmlFor="t-add" className="sr-only">
                  Add a candidate
                </label>
                <Select
                  id="t-add"
                  value=""
                  onChange={(e) => e.target.value && setSpeakers([...chosen, e.target.value])}
                  className="h-8 text-xs"
                >
                  <option value="">Add a candidate…</option>
                  {speakers
                    .filter((s) => !chosen.includes(s.slug))
                    .map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name} ({s.docs})
                      </option>
                    ))}
                </Select>
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <p className="kicker mb-1.5">Bucket</p>
          <div
            role="group"
            aria-label="Time bucket"
            className="inline-flex rounded-md border border-border p-0.5"
          >
            {(["month", "quarter", "year"] as const).map((g) => {
              const on = (current.by ?? "quarter") === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => go({ by: g === "quarter" ? undefined : g })}
                  className={cn(
                    "rounded px-3 py-1 text-xs capitalize",
                    on
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Counting…
          </span>
        ) : null}
      </p>
    </div>
  );
}
