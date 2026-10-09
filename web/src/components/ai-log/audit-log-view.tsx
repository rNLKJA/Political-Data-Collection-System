"use client";

import { Download, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AiGeneratedBadge } from "@/components/ai/ai-badge";
import { Button } from "@/components/ui/button";
import {
  auditToCsv,
  auditToJson,
  FEATURE_LABEL,
  getAuditStore,
  isReviewable,
  substitutedModel,
  type AuditEntry,
  type HumanDecision,
} from "@/lib/ai/audit-log";
import { downloadText, fileStamp } from "@/lib/download";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE = 25;
const UNAVAILABLE =
  "This browser does not allow the log to be stored (IndexedDB is unavailable, for example in some private modes).";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; entries: AuditEntry[] };

const DECISION_STYLE: Record<HumanDecision, string> = {
  pending: "border-border text-muted-foreground",
  accepted: "border-series-2/60 text-foreground",
  edited: "border-series-1/60 text-foreground",
  rejected: "border-destructive/60 text-destructive",
};

export function AuditLogView() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [limit, setLimit] = useState(PAGE);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoad({ state: "ready", entries: await getAuditStore().list() });
    } catch {
      setLoad({ state: "error", message: UNAVAILABLE });
    }
  }, []);

  useEffect(() => {
    let live = true;
    getAuditStore()
      .list()
      .then((entries) => live && setLoad({ state: "ready", entries }))
      .catch(() => live && setLoad({ state: "error", message: UNAVAILABLE }));
    return () => {
      live = false;
    };
  }, []);

  const entries = useMemo(() => (load.state === "ready" ? load.entries : []), [load]);
  const counts = useMemo(() => {
    const c: Record<HumanDecision, number> = { pending: 0, accepted: 0, edited: 0, rejected: 0 };
    for (const e of entries) if (isReviewable(e)) c[e.decision]++;
    return c;
  }, [entries]);
  const tokens = useMemo(
    () =>
      entries.reduce(
        (a, e) => ({
          input: a.input + (e.usage?.input_tokens ?? 0),
          output: a.output + (e.usage?.output_tokens ?? 0),
        }),
        { input: 0, output: 0 },
      ),
    [entries],
  );

  if (load.state === "loading") {
    return <p className="text-sm text-muted-foreground">Reading the log in this browser…</p>;
  }
  if (load.state === "error") {
    return (
      <p
        role="alert"
        className="flex gap-2.5 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
      >
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        {load.message}
      </p>
    );
  }

  const simulated = entries.filter((e) => e.provider === "mock").length;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Summary
          label="Calls logged"
          value={formatInt(entries.length)}
          note={simulated ? `${simulated} of them simulated (no model called)` : "in this browser"}
        />
        <Summary
          label="Awaiting review"
          value={formatInt(counts.pending)}
          note={`${counts.accepted} accepted · ${counts.edited} edited · ${counts.rejected} rejected`}
        />
        <Summary
          label="Failed or stopped"
          value={formatInt(entries.filter((e) => e.error).length)}
          note="logged too, with nothing to review"
        />
        <Summary
          label="Tokens reported"
          value={formatInt(tokens.input + tokens.output)}
          note={`${formatInt(tokens.input)} in · ${formatInt(tokens.output)} out`}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void refresh()}>
          <RefreshCw aria-hidden /> Refresh
        </Button>
        <Button
          size="sm"
          disabled={entries.length === 0}
          onClick={() =>
            downloadText(
              `ai-audit-log-${fileStamp()}.json`,
              auditToJson(entries),
              "application/json",
            )
          }
        >
          <Download aria-hidden /> Export JSON
        </Button>
        <Button
          size="sm"
          disabled={entries.length === 0}
          onClick={() =>
            downloadText(`ai-audit-log-${fileStamp()}.csv`, auditToCsv(entries), "text/csv")
          }
        >
          <Download aria-hidden /> Export CSV
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="ml-auto"
          disabled={entries.length === 0}
          onClick={async () => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            await getAuditStore().clear();
            setConfirmClear(false);
            await refresh();
          }}
          onBlur={() => setConfirmClear(false)}
        >
          <Trash2 aria-hidden /> {confirmClear ? "Select again to delete the log" : "Clear log"}
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <p className="font-serif text-lg">No AI calls logged in this browser yet</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Run the{" "}
            <Link href="/topics" className="inline-link">
              topic-label comparison
            </Link>{" "}
            with your own key, or its simulated demo without one. Every call appears here, with what
            was sent and what came back.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {entries.slice(0, limit).map((e) => (
            <li key={e.id}>
              <EntryCard entry={e} />
            </li>
          ))}
        </ol>
      )}
      {entries.length > limit ? (
        <Button onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, entries.length - limit)} more of {entries.length - limit}
        </Button>
      ) : null}
    </div>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-l border-rule/70 pl-4">
      <dt className="text-[0.8rem] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

function EntryCard({ entry: e }: { entry: AuditEntry }) {
  const simulated = e.provider === "mock";
  const swapped = substitutedModel(e.model, e.served_model);
  const meta = e.input.meta as {
    run_id?: string;
    batch?: number;
    batches?: number;
    item_ids?: string[];
  };
  const when = new Date(e.timestamp);
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <time dateTime={e.timestamp} className="tabular font-mono text-xs text-muted-foreground">
          {when.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "medium" })}
        </time>
        <span className="text-sm font-medium">{FEATURE_LABEL[e.feature]}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {simulated ? "simulated" : e.provider} · {e.model}
        </span>
        {e.error ? (
          <span className="rounded-full border border-destructive/60 px-2 py-0.5 text-[0.7rem] text-destructive">
            {e.error.kind.replace(/_/g, " ")}
          </span>
        ) : (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.7rem] capitalize",
              DECISION_STYLE[e.decision],
            )}
          >
            {e.decision === "pending" ? "awaiting review" : e.decision}
          </span>
        )}
        {!e.error ? <AiGeneratedBadge simulated={simulated} className="ml-auto" /> : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {meta.run_id ? `Run ${meta.run_id.slice(0, 8)}` : null}
        {meta.batch ? ` · batch ${meta.batch} of ${meta.batches}` : null}
        {meta.item_ids ? ` · ${meta.item_ids.length} excerpts` : null}
        {e.latency_ms !== null ? ` · ${formatInt(e.latency_ms)} ms` : null}
        {e.usage
          ? ` · ${formatInt(e.usage.input_tokens ?? 0)} tokens in, ${formatInt(e.usage.output_tokens ?? 0)} out`
          : null}
        {e.retries.length ? ` · ${e.retries.length} retried` : null}
        {swapped ? ` · served by ${swapped}` : null}
      </p>
      {e.error ? <p className="mt-2 text-sm">{e.error.message}</p> : null}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          What was sent and what came back
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Block title="Sent: user message" text={e.input.user} />
          <Block
            title={e.error ? "Raw answer" : "Answer (validated)"}
            text={e.error ? (e.raw_output ?? "(none)") : JSON.stringify(e.output, null, 2)}
          />
          {e.decision === "edited" ? (
            <Block title="Your corrections" text={JSON.stringify(e.edited_output, null, 2)} />
          ) : null}
          <Block title="Sent: system prompt" text={e.input.system} />
        </div>
      </details>
    </article>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="kicker mb-1">{title}</p>
      <pre
        tabIndex={0}
        className="max-h-64 overflow-auto rounded-md border border-border bg-background/70 p-2.5 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap"
      >
        {text}
      </pre>
    </div>
  );
}
