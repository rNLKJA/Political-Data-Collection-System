"use client";

import { Check, Download, KeyRound, Play, Square, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";

import { useAi } from "@/components/ai/ai-context";
import { AiGeneratedBadge } from "@/components/ai/ai-badge";
import { SourceLink } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { controlClass, Field, Select } from "@/components/ui/field";
import { getAuditStore, substitutedModel } from "@/lib/ai/audit-log";
import { describeAiError } from "@/lib/ai/errors";
import { estimateCostUsd, PROVIDERS } from "@/lib/ai/providers";
import { activeKey, activeModel } from "@/lib/ai/settings";
import {
  decisionPatches,
  DEFAULT_BATCH_SIZE,
  estimateRunTokens,
  NO_ANSWER,
  runTopicLabelling,
  type AiLabel,
  type RunResult,
} from "@/lib/ai/topic-labels";
import { toCsv } from "@/lib/csv";
import { downloadText, fileStamp } from "@/lib/download";
import { formatDecimal, formatInt } from "@/lib/format";
import { DEFAULT_SEED } from "@/lib/stats/bootstrap";
import { sampleWithoutReplacement } from "@/lib/stats/random";
import { CODEBOOK, isTopicId, topicLabel, type TopicId } from "@/lib/topics/codebook";
import { comparePaired, scoreLabeller } from "@/lib/topics/evaluation";
import { MOCK_MODEL_ID } from "@/lib/topics/mock-labeller";
import { cn } from "@/lib/utils";

import { formatP, numInterval, pctInterval, pointsInterval, signedInterval } from "./format";

export interface HarnessItem {
  id: string;
  excerpt: string;
  gold: TopicId;
  rules: TopicId;
  url: string;
  date: string;
}

type Decision = "pending" | "accepted" | "edited" | "rejected";

interface Run {
  runId: string;
  simulated: boolean;
  provider: string;
  model: string;
  startedAt: string;
  n: number;
  seed: number;
  items: HarnessItem[];
  /** the excerpts the model answered for: both labellers are scored on these only */
  scored: HarnessItem[];
  /** excerpts whose request failed or was never sent (stopped run) */
  excluded: HarnessItem[];
  result: RunResult;
}

const SIZES = [20, 40, 60, 120] as const;
const label = (l: AiLabel) => (l === NO_ANSWER ? "No answer" : topicLabel(l));
const SCORING_RULE =
  "Excerpts whose request failed or was stopped are left out of the scores for both labellers; an excerpt the model skipped, refused or answered unusably counts as \u201cno answer\u201d.";

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function TopicHarness({ items }: { items: HarnessItem[] }) {
  const { settings, hasKey, openSettings } = useAi();
  const id = useId();
  const [n, setN] = useState<number>(40);
  const [seedText, setSeedText] = useState(String(DEFAULT_SEED));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, TopicId>>({});
  const [decision, setDecision] = useState<Decision>("pending");
  const [logNote, setLogNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const seed = Number.parseInt(seedText, 10);
  const seedOk = Number.isInteger(seed) && seed >= 0 && seed <= 4_294_967_295;
  const sample = useMemo(
    () => (seedOk ? sampleWithoutReplacement(items, n, seed) : []),
    [items, n, seed, seedOk],
  );
  const provider = settings.provider;
  const model = activeModel(settings);
  const tokens = estimateRunTokens(sample, DEFAULT_BATCH_SIZE);
  const cost = estimateCostUsd(provider, model, tokens.input, tokens.output);
  const calls = Math.ceil(sample.length / DEFAULT_BATCH_SIZE);
  const running = progress !== null;

  async function start(simulated: boolean) {
    if (!seedOk || running) return;
    setError(null);
    setLogNote(null);
    setEdits({});
    setDecision("pending");
    setRun(null);
    const controller = new AbortController();
    abort.current = controller;
    const runId = uuid();
    const picked = sample;
    setProgress({ done: 0, total: picked.length });
    try {
      const result = await runTopicLabelling(
        picked.map((i) => ({ id: i.id, excerpt: i.excerpt })),
        {
          runId,
          provider: simulated ? "mock" : provider,
          model: simulated ? MOCK_MODEL_ID : model,
          apiKey: simulated ? "" : activeKey(settings),
          seed,
          signal: controller.signal,
          store: getAuditStore(),
          goldForMock: simulated
            ? Object.fromEntries(picked.map((i) => [i.id, i.gold]))
            : undefined,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      const firstFailure = result.failures[0];
      const problemText = result.stopped
        ? describeAiError(result.stopped)
        : firstFailure
          ? `${result.failures.length} request${result.failures.length === 1 ? "" : "s"} failed (${firstFailure.message}).`
          : null;
      if (result.scoredIds.length === 0) {
        // Nothing came back from the model: there is nothing to score or label as AI output.
        setError(
          `${problemText ?? "The model did not answer."} No excerpt was labelled, so there is nothing to score. The failed call${result.entryIds.length === 1 ? " is" : "s are"} in the AI log.`,
        );
        return;
      }
      const scored = new Set(result.scoredIds);
      setRun({
        runId,
        simulated,
        provider: simulated ? "mock" : provider,
        model: simulated ? MOCK_MODEL_ID : model,
        startedAt: new Date().toISOString(),
        n: picked.length,
        seed,
        items: picked,
        scored: picked.filter((i) => scored.has(i.id)),
        excluded: picked.filter((i) => !scored.has(i.id)),
        result,
      });
      if (problemText) setError(`${problemText} ${SCORING_RULE}`);
    } catch (e) {
      setError(describeAiError(e));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  async function decide(next: Exclude<Decision, "pending">) {
    if (!run) return;
    const store = getAuditStore();
    const patches = decisionPatches(
      run.result,
      run.items.map((i) => i.id),
      edits,
      next,
    );
    const failed = run.result.entryIds.length - patches.length;
    try {
      for (const { entryId, patch } of patches) await store.decide(entryId, patch);
      setDecision(next);
      setLogNote(
        `Recorded in the AI audit log for ${patches.length} call${patches.length === 1 ? "" : "s"}${failed ? `; ${failed} failed call${failed === 1 ? " has" : "s have"} nothing to review and stay${failed === 1 ? "s" : ""} pending` : ""}.`,
      );
    } catch {
      setLogNote("The audit log is not available in this browser, so the decision was not saved.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl">Run the comparison</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Draw a seeded sample of the gold set, ask a model for one label per excerpt, and
              compare it with the keyword rules on exactly the same excerpts.
            </p>
          </div>
          <Button size="sm" onClick={openSettings}>
            <KeyRound aria-hidden />
            {hasKey ? `${PROVIDERS[provider].label} · ${model}` : "AI settings"}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Excerpts" htmlFor={`${id}-n`}>
            <Select
              id={`${id}-n`}
              value={n}
              disabled={running}
              onChange={(e) => setN(Number(e.target.value))}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s === 120 ? "All 120" : `${s} of 120`}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Sample seed"
            htmlFor={`${id}-seed`}
            hint={seedOk ? "Same seed, same excerpts." : "A whole number from 0 to 4294967295."}
          >
            <input
              id={`${id}-seed`}
              inputMode="numeric"
              value={seedText}
              disabled={running}
              onChange={(e) => setSeedText(e.target.value.trim())}
              aria-invalid={!seedOk}
              className={cn(controlClass, "font-mono aria-invalid:border-destructive")}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="kicker">What a real run sends</span>
            <p className="text-sm leading-snug">
              {formatInt(sample.length)} excerpts in {calls} request{calls === 1 ? "" : "s"} to{" "}
              <span className="font-mono text-[0.85em]">{PROVIDERS[provider].host}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              About {formatInt(tokens.input + tokens.output)} tokens
              {cost !== null ? `, roughly US$${cost.toFixed(cost < 0.01 ? 4 : 3)}` : ""}, billed by{" "}
              {PROVIDERS[provider].label} to your key.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={!hasKey || running || !seedOk}
            onClick={() => void start(false)}
          >
            <Play aria-hidden /> Run with my key
          </Button>
          <Button disabled={running || !seedOk} onClick={() => void start(true)}>
            Run the simulated demo
          </Button>
          {running ? (
            <Button variant="destructive" onClick={() => abort.current?.abort()}>
              <Square aria-hidden /> Stop
            </Button>
          ) : null}
          {!hasKey ? (
            <p className="text-xs text-muted-foreground">
              No key yet: add one in{" "}
              <button type="button" onClick={openSettings} className="inline-link">
                AI settings
              </button>
              , or try the simulated demo, which calls nothing.
            </p>
          ) : null}
        </div>

        {progress ? (
          <div className="mt-4" role="status" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Labelled {progress.done} of {progress.total} excerpts…
            </p>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-4 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>

      {run ? (
        <RunResults
          run={run}
          edits={edits}
          setEdits={setEdits}
          decision={decision}
          onDecide={(d) => void decide(d)}
          logNote={logNote}
        />
      ) : null}
    </div>
  );
}

function RunResults({
  run,
  edits,
  setEdits,
  decision,
  onDecide,
  logNote,
}: {
  run: Run;
  edits: Record<string, TopicId>;
  setEdits: (f: (e: Record<string, TopicId>) => Record<string, TopicId>) => void;
  decision: Decision;
  onDecide: (d: Exclude<Decision, "pending">) => void;
  logNote: string | null;
}) {
  const stats = useMemo(() => {
    // Both labellers are scored on the excerpts the model answered for, so the comparison stays paired.
    const gold = run.scored.map((i) => i.gold);
    const ai = run.scored.map((i) => run.result.labels[i.id] ?? NO_ANSWER) as TopicId[];
    const rules = run.scored.map((i) => i.rules);
    return {
      ai: scoreLabeller(gold, ai),
      rules: scoreLabeller(gold, rules),
      paired: comparePaired(gold, ai, rules),
    };
  }, [run]);
  const name = run.simulated ? "Simulated labeller" : "LLM";
  const nameInText = run.simulated ? "simulated labeller" : "LLM";
  const m = run.scored.length;
  const incomplete = run.excluded.length > 0;
  const scoredIds = new Set(run.result.scoredIds);
  const reviewable = new Set(run.result.reviewableEntryIds);
  const d = stats.paired.agreementDiff;
  const verdict = incomplete
    ? `This run is incomplete, so no verdict is drawn. The figures use only the ${m} of ${run.n} excerpts the ${nameInText} answered for; run it again to score the whole sample.`
    : Number.isNaN(d.lower)
      ? "There is not enough data for an interval."
      : d.lower > 0
        ? `On these ${m} excerpts the ${nameInText} matches the gold labels more often than the keyword rules, and the 95% interval for the difference excludes zero.`
        : d.upper < 0
          ? `On these ${m} excerpts the keyword rules match the gold labels more often than the ${nameInText}, and the 95% interval for the difference excludes zero.`
          : `The 95% interval for the difference includes zero, so these ${m} excerpts cannot tell the two apart.`;
  const editsCount = Object.keys(edits).length;

  const rows = run.items.map((i) => {
    const scored = scoredIds.has(i.id);
    const modelLabel = scored ? (run.result.labels[i.id] ?? NO_ANSWER) : "";
    return {
      id: i.id,
      excerpt: i.excerpt,
      source: i.url,
      gold: i.gold,
      rules: i.rules,
      scored,
      model_label: modelLabel,
      human_correction: edits[i.id] ?? "",
      model_matches_gold: scored ? modelLabel === i.gold : "",
      rules_match_gold: i.rules === i.gold,
    };
  });
  const exportMeta = {
    run_id: run.runId,
    started_at: run.startedAt,
    labeller: run.simulated ? "simulated (no model called)" : "LLM",
    provider: run.provider,
    model: run.model,
    served_model: run.result.servedModel,
    sample_size: run.n,
    sample_seed: run.seed,
    complete: !incomplete,
    excerpts_scored: m,
    excluded_ids: run.excluded.map((i) => i.id),
    scoring_rule: SCORING_RULE,
    failures: run.result.failures,
    stopped: run.result.stopped
      ? { kind: run.result.stopped.kind, message: run.result.stopped.message }
      : null,
    bootstrap: { resamples: stats.paired.kappaDiff.resamples, seed: stats.paired.kappaDiff.seed },
    human_decision: decision,
    metrics: {
      model: {
        agreement: stats.ai.agreement,
        kappa: stats.ai.kappa,
        policy_agreement: stats.ai.policyAgreement,
      },
      keyword_rules: {
        agreement: stats.rules.agreement,
        kappa: stats.rules.kappa,
        policy_agreement: stats.rules.policyAgreement,
      },
      paired: {
        agreement_difference: stats.paired.agreementDiff,
        kappa_difference: stats.paired.kappaDiff,
        mcnemar: stats.paired.mcnemar,
        between: stats.paired.between,
      },
    },
  };

  return (
    <section aria-labelledby="run-results" className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="min-w-0">
          <h3 id="run-results" className="font-serif text-xl">
            {incomplete
              ? `Partial run: results on ${m} of ${run.n} excerpts`
              : `Results on ${m} excerpts`}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Seed {run.seed} · run {run.runId.slice(0, 8)} ·{" "}
            {run.simulated
              ? "no model was called"
              : `${PROVIDERS[run.provider as "anthropic" | "openai"].label} ${run.model}`}
            {substitutedModel(run.model, run.result.servedModel)
              ? ` (served as ${run.result.servedModel})`
              : ""}
          </p>
        </div>
        <AiGeneratedBadge simulated={run.simulated} model={run.simulated ? undefined : run.model} />
      </div>

      {run.simulated ? (
        <p className="border-b border-border bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground sm:px-5">
          Simulated labels: each excerpt gets its gold label with probability 0.7, otherwise a
          random other label. They show how the harness, the audit log and the exports work. They
          say nothing about any model.
        </p>
      ) : null}

      {incomplete ? (
        <p className="flex gap-2 border-b border-border bg-destructive/5 px-4 py-2.5 text-sm sm:px-5">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            Incomplete run: {run.excluded.length} of {run.n} excerpts were left out because their
            request failed or the run was stopped. The model never saw them, so they are not counted
            against it. Both labellers are scored on the same {m} excerpts.
          </span>
        </p>
      ) : null}

      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1.15fr_1fr]">
        <div
          className="relative overflow-x-auto"
          role="region"
          aria-label="Scores against the gold labels (scrolls sideways on small screens)"
          tabIndex={0}
        >
          <table className="w-full text-sm sm:min-w-[30rem]">
            <caption className="mb-2 text-left text-xs text-muted-foreground">
              Against the gold labels, with 95% intervals (Wilson for shares, percentile bootstrap
              over excerpts for kappa, {formatInt(stats.ai.kappa.resamples)} resamples, seed{" "}
              {stats.ai.kappa.seed}).
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Measure
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {name}
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Keyword rules
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              <tr className="border-b border-border/60">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  Agreement with gold
                </th>
                <td className="py-2 pr-3">{pctInterval(stats.ai.agreement)}</td>
                <td className="py-2">{pctInterval(stats.rules.agreement)}</td>
              </tr>
              <tr className="border-b border-border/60">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  Cohen&apos;s kappa
                </th>
                <td className="py-2 pr-3">{numInterval(stats.ai.kappa)}</td>
                <td className="py-2">{numInterval(stats.rules.kappa)}</td>
              </tr>
              <tr className="border-b border-border/60">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  Agreement on policy excerpts{" "}
                  <span className="text-muted-foreground">(n = {stats.ai.policyAgreement.n})</span>
                </th>
                <td className="py-2 pr-3">{pctInterval(stats.ai.policyAgreement)}</td>
                <td className="py-2">{pctInterval(stats.rules.policyAgreement)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  Says &ldquo;no policy topic&rdquo;{" "}
                  <span className="text-muted-foreground">
                    (gold: {Math.round(stats.ai.noneRate.gold * 100)}%)
                  </span>
                </th>
                <td className="py-2 pr-3">{Math.round(stats.ai.noneRate.labeller * 100)}%</td>
                <td className="py-2">{Math.round(stats.rules.noneRate.labeller * 100)}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <p className="kicker">Paired on the same excerpts</p>
          <dl className="mt-2 space-y-2.5 text-sm">
            <div>
              <dt className="text-muted-foreground">Agreement, {nameInText} minus rules</dt>
              <dd className="tabular font-medium">{pointsInterval(stats.paired.agreementDiff)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Kappa, {nameInText} minus rules</dt>
              <dd className="tabular font-medium">{signedInterval(stats.paired.kappaDiff)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">McNemar&apos;s exact test</dt>
              <dd className="tabular">
                {formatP(stats.paired.mcnemar.exactP)}{" "}
                <span className="text-muted-foreground">
                  ({stats.paired.mcnemar.b} only the {nameInText} got right,{" "}
                  {stats.paired.mcnemar.c} only the rules)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">The two give the same label</dt>
              <dd className="tabular">
                {Math.round(stats.paired.between.agreement * 100)}% of excerpts (kappa{" "}
                {formatDecimal(stats.paired.between.kappa, 2)})
              </dd>
            </div>
          </dl>
          <p
            className={cn(
              "mt-3 rounded-md p-3 text-sm",
              incomplete ? "border border-destructive/40 bg-destructive/5" : "bg-secondary/50",
            )}
          >
            {verdict}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4 sm:px-5">
        {reviewable.size > 0 ? (
          <>
            <span className="mr-1 text-sm font-medium">Your decision on these labels</span>
            <Button
              size="sm"
              onClick={() => onDecide("accepted")}
              aria-pressed={decision === "accepted"}
            >
              <Check aria-hidden /> Accept
            </Button>
            <Button
              size="sm"
              disabled={editsCount === 0}
              onClick={() => onDecide("edited")}
              aria-pressed={decision === "edited"}
            >
              Record {editsCount || ""} correction{editsCount === 1 ? "" : "s"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDecide("rejected")}
              aria-pressed={decision === "rejected"}
            >
              <X aria-hidden /> Reject
            </Button>
          </>
        ) : (
          <span className="mr-1 text-sm">
            No call returned a usable answer, so there is nothing to accept, correct or reject.
          </span>
        )}
        <span className="text-xs text-muted-foreground" role="status">
          {logNote ?? (reviewable.size > 0 ? `Decision: ${decision}.` : "")}{" "}
          <Link href="/ai-log" className="inline-link">
            Open the AI log
          </Link>
        </span>
        <span className="ml-auto flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              downloadText(
                `topic-labels-${fileStamp()}.csv`,
                toCsv(rows, [
                  "id",
                  "excerpt",
                  "source",
                  "gold",
                  "rules",
                  "scored",
                  "model_label",
                  "human_correction",
                  "model_matches_gold",
                  "rules_match_gold",
                ]),
                "text/csv",
              )
            }
          >
            <Download aria-hidden /> CSV
          </Button>
          <Button
            size="sm"
            onClick={() =>
              downloadText(
                `topic-labels-${fileStamp()}.json`,
                JSON.stringify({ ...exportMeta, rows }, null, 2),
                "application/json",
              )
            }
          >
            <Download aria-hidden /> JSON
          </Button>
        </span>
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground sm:px-5">
        Scores always use the {nameInText}&apos;s own labels. A correction you make below is
        recorded in the audit log as an edit; it never changes the evaluation.
      </p>

      {/* Phones: one entry per excerpt. */}
      <ol
        className="max-h-[36rem] divide-y divide-border/70 overflow-auto border-t border-border sm:hidden"
        aria-label="Labels for each excerpt"
        tabIndex={0}
      >
        {run.items.map((it) => {
          const scored = scoredIds.has(it.id);
          return (
            <li key={it.id} className={cn("space-y-2 px-4 py-3 text-sm", !scored && "opacity-70")}>
              <ExcerptText item={it} />
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Gold</dt>
                <dd>{topicLabel(it.gold)}</dd>
                <dt className="text-muted-foreground">Rules</dt>
                <dd>
                  <Verdict ok={it.rules === it.gold} text={topicLabel(it.rules)} />
                </dd>
                <dt className="text-muted-foreground">{name}</dt>
                <dd>
                  <ModelLabel
                    item={it}
                    scored={scored}
                    ai={run.result.labels[it.id] ?? NO_ANSWER}
                    editable={scored && reviewable.has(run.result.entryOf[it.id] ?? "")}
                    edit={edits[it.id]}
                    setEdits={setEdits}
                  />
                </dd>
              </dl>
            </li>
          );
        })}
      </ol>
      <div
        className="relative hidden max-h-[36rem] overflow-auto border-t border-border sm:block"
        role="region"
        aria-label="Labels for each excerpt"
        tabIndex={0}
      >
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">
            {`Each excerpt with its gold label, the keyword rules' label and the ${nameInText}'s label`}
          </caption>
          <thead className="sticky top-0 z-10 bg-secondary text-xs">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Excerpt
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Gold
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Rules
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {name}
              </th>
            </tr>
          </thead>
          <tbody>
            {run.items.map((it) => {
              const scored = scoredIds.has(it.id);
              return (
                <tr
                  key={it.id}
                  className={cn("border-t border-border/70 align-top", !scored && "opacity-70")}
                >
                  <td className="max-w-[26rem] px-3 py-2">
                    <ExcerptText item={it} />
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{topicLabel(it.gold)}</td>
                  <td className="px-3 py-2 text-xs">
                    <Verdict ok={it.rules === it.gold} text={topicLabel(it.rules)} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <ModelLabel
                      item={it}
                      scored={scored}
                      ai={run.result.labels[it.id] ?? NO_ANSWER}
                      editable={scored && reviewable.has(run.result.entryOf[it.id] ?? "")}
                      edit={edits[it.id]}
                      setEdits={setEdits}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Verdict({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="inline-flex items-start gap-1">
      {ok ? (
        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-series-2" />
      ) : (
        <X aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      )}
      <span>
        {text}
        <span className="sr-only">{ok ? " (matches gold)" : " (differs from gold)"}</span>
      </span>
    </span>
  );
}

function ExcerptText({ item }: { item: HarnessItem }) {
  return (
    <>
      <span className="font-mono text-[0.7rem] text-muted-foreground">{item.id}</span>{" "}
      <span className="font-serif">{item.excerpt}</span>{" "}
      <SourceLink href={item.url} className="text-xs">
        Source
      </SourceLink>
    </>
  );
}

/** The labeller's answer for one excerpt, with a correction menu when the call can be reviewed. */
function ModelLabel({
  item,
  scored,
  ai,
  editable,
  edit,
  setEdits,
}: {
  item: HarnessItem;
  scored: boolean;
  ai: AiLabel;
  editable: boolean;
  edit: TopicId | undefined;
  setEdits: (f: (e: Record<string, TopicId>) => Record<string, TopicId>) => void;
}) {
  return (
    <>
      {scored ? (
        <Verdict ok={ai === item.gold} text={label(ai)} />
      ) : (
        <span className="text-muted-foreground">Left out: the request failed or was not sent</span>
      )}
      {editable ? (
        <label className="mt-1 block">
          <span className="sr-only">Correct the label for {item.id}</span>
          <select
            value={edit ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setEdits((cur) => {
                const next = { ...cur };
                if (isTopicId(v)) next[item.id] = v;
                else delete next[item.id];
                return next;
              });
            }}
            className="mt-0.5 h-7 max-w-[11rem] rounded border border-input bg-card px-1 text-xs"
          >
            <option value="">Keep</option>
            {CODEBOOK.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
