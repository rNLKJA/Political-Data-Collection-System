"use client";

import { LoaderCircle, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

import { controlClass, Field, Select } from "@/components/common/field";
import { useQueryNav, type QueryState } from "@/hooks/use-query-nav";
import { DOC_TYPES } from "@/lib/corpus-types";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

export function ExplorerFilters({
  current,
  speakers,
}: {
  current: QueryState;
  speakers: Array<{ slug: string; name: string; docs: number }>;
}) {
  const { go, pending } = useQueryNav("/explorer", current);
  const [q, setQ] = useState(current.q ?? "");
  const active = Object.entries(current).some(([k, v]) => v && k !== "page");

  return (
    <form
      role="search"
      aria-label="Filter documents"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: q.trim() || undefined });
      }}
      className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_1.3fr]"
    >
      <Field label="Candidate" htmlFor="f-speaker">
        <Select
          id="f-speaker"
          value={current.speaker ?? ""}
          onChange={(e) => go({ speaker: e.target.value || undefined })}
        >
          <option value="">All 54 speakers</option>
          {speakers.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name} ({s.docs})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Document type" htmlFor="f-type">
        <Select
          id="f-type"
          value={current.type ?? ""}
          onChange={(e) => go({ type: e.target.value || undefined })}
        >
          <option value="">All types</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="f-from">
        <Select
          id="f-from"
          value={current.from?.slice(0, 4) ?? ""}
          onChange={(e) => go({ from: e.target.value ? `${e.target.value}-01` : undefined })}
        >
          <option value="">Earliest</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To" htmlFor="f-to">
        <Select
          id="f-to"
          value={current.to?.slice(0, 4) ?? ""}
          onChange={(e) => go({ to: e.target.value ? `${e.target.value}-12` : undefined })}
        >
          <option value="">Latest</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title contains" htmlFor="f-q">
        <div className="flex gap-2">
          <input
            id="f-q"
            type="search"
            value={q}
            maxLength={80}
            placeholder="e.g. town hall"
            onChange={(e) => setQ(e.target.value)}
            className={controlClass}
          />
          <button
            type="submit"
            aria-label="Search titles"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Search className="size-4" aria-hidden />
          </button>
        </div>
      </Field>
      <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {pending ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Updating…
            </>
          ) : (
            "Filters update the chart, the breakdowns and the list below."
          )}
        </p>
        {active ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              go({
                speaker: undefined,
                type: undefined,
                from: undefined,
                to: undefined,
                q: undefined,
              });
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Reset filters
          </button>
        ) : null}
      </div>
    </form>
  );
}
