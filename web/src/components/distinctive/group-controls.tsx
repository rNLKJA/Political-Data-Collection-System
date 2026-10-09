"use client";

import { ArrowLeftRight, LoaderCircle } from "lucide-react";

import { LegendSwatch } from "@/components/charts/chart-tooltip";
import { Field, Select } from "@/components/ui/field";
import { useQueryNav, type QueryState } from "@/hooks/use-query-nav";

interface Option {
  slug: string;
  name: string;
  docs: number;
}

const CYCLES = ["2016", "2020", "2024"];

function split(token: string): { speaker: string; cycle: string } {
  if (token === "rest") return { speaker: "rest", cycle: "" };
  const c = /^cycle-(\d{4})$/.exec(token);
  if (c) return { speaker: "", cycle: c[1] };
  const [speaker, cycle = ""] = token.split("@");
  return { speaker, cycle };
}

function join(speaker: string, cycle: string): string {
  if (speaker === "rest") return "rest";
  if (!speaker) return cycle ? `cycle-${cycle}` : "";
  return cycle ? `${speaker}@${cycle}` : speaker;
}

export const PRESETS = [
  { label: "2016 cycle vs 2024 cycle", a: "cycle-2016", b: "cycle-2024" },
  { label: "2020 cycle vs everything else", a: "cycle-2020", b: "rest" },
  {
    label: "Clinton vs Sanders, 2016 primaries",
    a: "hillary-clinton@2016",
    b: "bernie-sanders@2016",
  },
  { label: "Haley vs DeSantis, 2024 primaries", a: "nikki-haley@2024", b: "ron-desantis@2024" },
] as const;

export function GroupControls({
  current,
  speakers,
}: {
  current: QueryState & { a: string; b: string };
  speakers: Option[];
}) {
  const { go, pending } = useQueryNav("/distinctive", current);
  const A = split(current.a);
  const B = split(current.b);

  const setA = (speaker: string, cycle: string) => {
    const token = join(speaker, cycle);
    // Group A must be a real subset; fall back to the 2016 cycle.
    go({ a: token || "cycle-2016", word: undefined });
  };
  const setB = (speaker: string, cycle: string) => {
    go({ b: join(speaker, cycle) || "rest", word: undefined });
  };

  const speakerOptions = speakers.map((s) => (
    <option key={s.slug} value={s.slug}>
      {s.name} ({s.docs})
    </option>
  ));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <fieldset className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
            <LegendSwatch color="var(--series-1)" /> Group A
          </legend>
          <Field label="Candidate" htmlFor="a-speaker">
            <Select
              id="a-speaker"
              value={A.speaker}
              onChange={(e) => setA(e.target.value, A.cycle)}
            >
              <option value="">All speakers</option>
              {speakerOptions}
            </Select>
          </Field>
          <Field label="Election cycle" htmlFor="a-cycle">
            <Select id="a-cycle" value={A.cycle} onChange={(e) => setA(A.speaker, e.target.value)}>
              <option value="">{A.speaker ? "All cycles" : "Choose a cycle"}</option>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c} cycle
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
        <button
          type="button"
          onClick={() => {
            if (current.b === "rest") return;
            go({ a: current.b, b: current.a, word: undefined });
          }}
          disabled={current.b === "rest"}
          className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-40"
          aria-label="Swap group A and group B"
          title={
            current.b === "rest"
              ? "Group B is “everyone else”, so it cannot be swapped"
              : "Swap A and B"
          }
        >
          <ArrowLeftRight className="size-4" aria-hidden />
          <span className="lg:sr-only">Swap</span>
        </button>
        <fieldset className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
            <LegendSwatch color="var(--series-2)" /> Group B
          </legend>
          <Field label="Candidate" htmlFor="b-speaker">
            <Select
              id="b-speaker"
              value={B.speaker}
              onChange={(e) => {
                const speaker = e.target.value;
                if (speaker === "rest") return setB("rest", "");
                // "All speakers" needs a cycle; coming from "everyone else" there is
                // none yet, so pick one that differs from group A's.
                if (!speaker && !B.cycle) return setB("", A.cycle === "2024" ? "2020" : "2024");
                setB(speaker, B.cycle);
              }}
            >
              <option value="rest">Everyone else (all other documents)</option>
              <option value="">All speakers</option>
              {speakerOptions}
            </Select>
          </Field>
          <Field label="Election cycle" htmlFor="b-cycle">
            <Select
              id="b-cycle"
              value={B.cycle}
              disabled={B.speaker === "rest"}
              onChange={(e) => setB(B.speaker, e.target.value)}
            >
              <option value="">
                {B.speaker && B.speaker !== "rest" ? "All cycles" : "Choose a cycle"}
              </option>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c} cycle
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
      </div>
      <div className="mt-5 flex flex-col gap-4 border-t border-border/70 pt-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="kicker mr-1">Examples</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => go({ a: p.a, b: p.b, word: undefined })}
              aria-pressed={current.a === p.a && current.b === p.b}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:border-primary aria-pressed:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-end">
          {/* No gap on the row: the live region is empty (zero width) when idle. */}
          <p className="pb-2.5 text-xs text-muted-foreground" aria-live="polite">
            {pending ? (
              <span className="inline-flex items-center gap-1.5 pr-3">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Recomputing…
              </span>
            ) : null}
          </p>
          <Field label="Prior strength" htmlFor="prior" className="w-44">
            <Select
              id="prior"
              value={current.prior ?? "10000"}
              onChange={(e) =>
                go({ prior: e.target.value === "10000" ? undefined : e.target.value })
              }
            >
              <option value="1000">Light · 1,000</option>
              <option value="10000">Default · 10,000</option>
              <option value="100000">Strong · 100,000</option>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}
