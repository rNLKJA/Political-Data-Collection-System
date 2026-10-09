import type { Metadata } from "next";
import Link from "next/link";

import { Callout, SourceLink, StatTile } from "@/components/common/bits";
import { PageIntro, Panel, Section } from "@/components/common/page-intro";
import { numInterval } from "@/components/topics/format";
import { TopicHarness, type HarnessItem } from "@/components/topics/topic-harness";
import { buildSystemPrompt, buildUserMessage, DEFAULT_BATCH_SIZE } from "@/lib/ai/topic-labels";
import { formatDate, formatInt, formatPercent } from "@/lib/format";
import { CODEBOOK, CODING_RULES, topicLabel } from "@/lib/topics/codebook";
import { EVAL_ITEMS, EXCERPTS_NAMING_CANDIDATE, GOLD_META, SAMPLE_META } from "@/lib/topics/data";
import { scoreLabeller } from "@/lib/topics/evaluation";
import { KEYWORD_RULES_VERSION, KEYWORDS, keywordLabel } from "@/lib/topics/keyword-rules";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Topic labels: an LLM against keyword rules",
  description: `Policy-topic labels from a large language model (bring your own key) against a transparent keyword dictionary, on ${EVAL_ITEMS.length} gold-labelled campaign excerpts${GOLD_META.status === "draft" ? " (a draft, single-annotator gold set prepared by an AI assistant and awaiting human review)" : ""}, with Cohen's kappa and bootstrap intervals.`,
};

export default function TopicsPage() {
  const rules = EVAL_ITEMS.map((i) => keywordLabel(i.excerpt));
  const gold = EVAL_ITEMS.map((i) => i.gold);
  const score = scoreLabeller(
    gold,
    rules.map((r) => r.topic),
  );
  const harnessItems: HarnessItem[] = EVAL_ITEMS.map((i, k) => ({
    id: i.id,
    excerpt: i.excerpt,
    gold: i.gold,
    rules: rules[k].topic,
    url: i.url,
    date: i.date,
  }));
  const goldCounts = CODEBOOK.map((t) => ({
    ...t,
    n: gold.filter((g) => g === t.id).length,
    rules: score.perClass.find((c) => c.label === t.id),
  }));
  const example = EVAL_ITEMS.slice(0, 3).map((i) => ({ id: i.id, excerpt: i.excerpt }));
  const none = gold.filter((g) => g === "none").length;

  return (
    <>
      <PageIntro kicker="Tool 06 · Topic labels" title="An LLM against keyword rules">
        <p>
          Which policy area is a campaign sentence about? Here a large language model and a
          transparent keyword dictionary label the same {EVAL_ITEMS.length} excerpts, and both are
          scored against gold labels assigned one by one against a written codebook. The keyword
          baseline runs on this page for everyone; the model runs only with your own API key,
          straight from your browser.
        </p>
      </PageIntro>

      <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6">
        {GOLD_META.status === "draft" ? (
          <Callout title="The gold labels are a first draft">
            {GOLD_META.annotator} Until they are reviewed, treat every score on this page as
            provisional. Because the draft came from the same model family as the default labeller,
            agreement with Claude models may be flattered. The same assistant also wrote the keyword
            dictionary, so the gold labels are not independent of the baseline either, which could
            move its scores in either direction.
          </Callout>
        ) : null}

        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatTile
            label="Keyword rules: agreement"
            value={formatPercent(score.agreement.estimate)}
            note={`95% CI ${formatPercent(score.agreement.lower)} to ${formatPercent(score.agreement.upper)} (Wilson), n = ${score.n}`}
          />
          <StatTile
            label="Keyword rules: Cohen's kappa"
            value={score.kappa.estimate.toFixed(2)}
            note={`95% CI ${score.kappa.lower.toFixed(2)} to ${score.kappa.upper.toFixed(2)} (bootstrap, ${formatInt(score.kappa.resamples)} resamples, seed ${score.kappa.seed})`}
          />
          <StatTile
            label="Keyword rules: policy excerpts only"
            value={formatPercent(score.policyAgreement.estimate, 0)}
            note={`95% CI ${formatPercent(score.policyAgreement.lower, 0)} to ${formatPercent(score.policyAgreement.upper, 0)} (Wilson), n = ${score.policyAgreement.n} with a policy gold label`}
          />
          <StatTile
            label="Gold set"
            value={`${EVAL_ITEMS.length} excerpts`}
            note={`${none} with no policy topic (${formatPercent(none / EVAL_ITEMS.length, 0)}); ${CODEBOOK.length - 1} topics + none`}
          />
        </div>

        <TopicHarness items={harnessItems} />

        <Callout title="How to read the scores">
          Agreement is the share of excerpts given the gold label. Cohen&apos;s kappa corrects it
          for agreement expected by chance from how often each labeller uses each label (1 is
          perfect, 0 is chance level), which matters here because{" "}
          {formatPercent(none / EVAL_ITEMS.length, 0)} of the gold labels are &ldquo;no policy
          topic&rdquo;. With 40 excerpts an agreement interval is about 30 points wide, so small
          differences between the two labellers are noise. The paired difference resamples the same
          excerpts for both, and McNemar&apos;s test uses only the excerpts where exactly one of
          them is right. Method and limits:{" "}
          <Link href="/methods#topic-eval" className="inline-link">
            methods
          </Link>
          ,{" "}
          <Link href="/methods/model-card" className="inline-link">
            model card
          </Link>{" "}
          and{" "}
          <Link
            href="/methods/decisions/dr-004-llm-topic-labels-vs-keyword-rules"
            className="inline-link"
          >
            DR-004
          </Link>
          .
        </Callout>
      </div>

      <Section
        id="sent"
        kicker="Transparency"
        title="What is sent to the provider"
        className="mt-16"
        description={`Only short excerpts. Each request carries the codebook, the coding rules and up to ten one-sentence excerpts of 25 words or fewer, each with an opaque id. No speaker, date, title, link or gold label is sent as metadata, and your key goes only to the provider you chose. The text itself can still identify the campaign: ${EXCERPTS_NAMING_CANDIDATE} of the ${EVAL_ITEMS.length} excerpts name the candidate, and some name journalists or officials.`}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <p className="kicker">System prompt (the same for every request)</p>
            <pre
              tabIndex={0}
              className="mt-3 max-h-80 overflow-auto rounded-md border border-border bg-background/70 p-3 font-mono text-[0.72rem] leading-relaxed whitespace-pre-wrap"
            >
              {buildSystemPrompt()}
            </pre>
          </Panel>
          <Panel>
            <p className="kicker">A user message (first three excerpts of the set)</p>
            <pre
              tabIndex={0}
              className="mt-3 overflow-auto rounded-md border border-border bg-background/70 p-3 font-mono text-[0.72rem] leading-relaxed whitespace-pre-wrap"
            >
              {buildUserMessage(example)}
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              The answer must be JSON of the form{" "}
              <code className="inline">{'{"labels": [{"id": "T001", "topic": "none"}]}'}</code>,
              checked against a schema. Up to {DEFAULT_BATCH_SIZE} excerpts go in one request;
              Claude Haiku runs at temperature 0. Every request and answer is written to the{" "}
              <Link href="/ai-log" className="inline-link">
                AI audit log
              </Link>{" "}
              in your browser, without the key.
            </p>
          </Panel>
        </div>
      </Section>

      <Section
        id="codebook"
        kicker="The codebook"
        title="Twenty-one policy topics and “none”"
        className="mt-16"
        description={
          <>
            Modelled on the major topics of the Comparative Agendas Project, adapted for single
            campaign sentences (jobs sit under Labour, and a &ldquo;no policy topic&rdquo; label
            covers events, thanks, endorsements and polls). It is not the official CAP codebook.
            Keyword dictionary: {KEYWORD_RULES_VERSION}, frozen before the gold set was drawn.
          </>
        }
      >
        <div className="space-y-6">
          <ol className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            {CODING_RULES.map((r, i) => (
              <li key={r} className="flex gap-2">
                <span className="kicker mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
          {/* Phones: one card per topic. */}
          <ul
            className="divide-y divide-border/70 rounded-lg border border-border sm:hidden"
            aria-label="Codebook, gold counts and keyword-rule accuracy by topic"
          >
            {goldCounts.map((t) => (
              <li key={t.id} className="space-y-1 px-3 py-3 text-sm">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{t.label}</span>
                  <span className="font-mono text-[0.68rem] text-muted-foreground">{t.id}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t.covers}</p>
                <p className="tabular text-xs">
                  Gold {t.n} · rules precision{" "}
                  {t.rules && t.rules.predicted ? formatPercent(t.rules.precision, 0) : "–"} ·
                  recall {t.rules && t.rules.support ? formatPercent(t.rules.recall, 0) : "–"}
                </p>
              </li>
            ))}
          </ul>
          <div
            className="hidden overflow-x-auto rounded-lg border border-border sm:block"
            role="region"
            aria-label="Codebook, gold counts and keyword-rule accuracy by topic"
            tabIndex={0}
          >
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">
                Each topic, what it covers, how many gold excerpts carry it, and the keyword
                rules&apos; precision and recall for it
              </caption>
              <thead className="bg-secondary text-xs">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Covers
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Gold
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Rules precision
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Rules recall
                  </th>
                </tr>
              </thead>
              <tbody>
                {goldCounts.map((t) => (
                  <tr key={t.id} className="border-t border-border/70 align-top">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {t.label}
                      <span className="block font-mono text-[0.68rem] font-normal text-muted-foreground">
                        {t.id}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.covers}</td>
                    <td className="tabular px-3 py-2 text-right">{t.n}</td>
                    <td className="tabular px-3 py-2 text-right text-xs">
                      {t.rules && t.rules.predicted ? formatPercent(t.rules.precision, 0) : "–"}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-xs">
                      {t.rules && t.rules.support ? formatPercent(t.rules.recall, 0) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Per-topic figures rest on very few excerpts (most topics have one to eight), so they
            describe this set and nothing more.
          </p>
          <details className="rounded-lg border border-border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              The keyword dictionary ({KEYWORD_RULES_VERSION})
            </summary>
            <p className="mt-2 text-muted-foreground">
              Count each topic&apos;s matches (longest phrase first, no overlaps); the topic with
              the most matches wins, a tie goes to the earliest match, and no match means
              &ldquo;none&rdquo;.
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
              {Object.entries(KEYWORDS).map(([topic, words]) => (
                <div key={topic}>
                  <dt className="font-medium">{topicLabel(topic as never)}</dt>
                  <dd className="text-xs text-muted-foreground">{words.join(", ")}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </Section>

      <Section
        id="gold"
        kicker="The gold set"
        title="120 excerpts and their gold labels"
        className="mt-16"
        description={
          <>
            Drawn by <code className="inline">scripts/build_topic_eval.py</code> with seed{" "}
            {SAMPLE_META.seed}: {SAMPLE_META.perCycle} documents per election cycle, one sentence of{" "}
            {SAMPLE_META.words[0]} to {SAMPLE_META.words[1]} words from each, after the site&apos;s
            quotation rules (no other candidate named, no charged words). Labelled on{" "}
            {formatDate(GOLD_META.labelledOn)}, status: {GOLD_META.status}. Excerpts are listed in
            id order and never summarised by speaker or party.
          </>
        }
      >
        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Show all {EVAL_ITEMS.length} excerpts with their gold and keyword labels
          </summary>
          {/* Phones: one entry per excerpt. */}
          <ol
            className="mt-3 max-h-[40rem] divide-y divide-border/70 overflow-auto rounded-md border border-border sm:hidden"
            aria-label="The gold set"
            tabIndex={0}
          >
            {EVAL_ITEMS.map((it, k) => (
              <li key={it.id} className="space-y-1.5 px-3 py-3">
                <p>
                  <span className="font-mono text-[0.7rem] text-muted-foreground">
                    {it.id} · {it.cycle}
                  </span>{" "}
                  <span className="font-serif">{it.excerpt}</span>{" "}
                  <SourceLink href={it.url} className="text-xs">
                    Source
                  </SourceLink>
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Gold</dt>
                  <dd>{topicLabel(it.gold)}</dd>
                  <dt className="text-muted-foreground">Rules</dt>
                  <dd>
                    {topicLabel(rules[k].topic)}
                    {rules[k].matches.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({rules[k].matches.map((m) => m.phrase).join(", ")})
                      </span>
                    ) : null}
                  </dd>
                </dl>
                {it.note ? (
                  <p className="text-xs text-muted-foreground">Coder&apos;s note: {it.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
          <div
            className="relative mt-3 hidden max-h-[40rem] overflow-auto rounded-md border border-border sm:block"
            role="region"
            aria-label="The gold set"
            tabIndex={0}
          >
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">
                Every excerpt in the gold set with its gold label, the keyword rules&apos; label and
                the coder&apos;s note on hard calls
              </caption>
              <thead className="sticky top-0 bg-secondary text-xs">
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
                </tr>
              </thead>
              <tbody>
                {EVAL_ITEMS.map((it, k) => (
                  <tr key={it.id} className="border-t border-border/70 align-top">
                    <td className="px-3 py-2">
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {it.id} · {it.cycle}
                      </span>{" "}
                      <span className="font-serif">{it.excerpt}</span>{" "}
                      <SourceLink href={it.url} className="text-xs">
                        Source
                      </SourceLink>
                      {it.note ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Coder&apos;s note: {it.note}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{topicLabel(it.gold)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {topicLabel(rules[k].topic)}
                      {rules[k].matches.length ? (
                        <span className="block text-muted-foreground">
                          {rules[k].matches.map((m) => m.phrase).join(", ")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The items and labels are in the repository:{" "}
            <a href={`${SITE.repo}/blob/main/web/src/data/topic-gold.json`} className="inline-link">
              topic-gold.json
            </a>{" "}
            and{" "}
            <a
              href={`${SITE.repo}/blob/main/web/src/data/topic-eval-items.json`}
              className="inline-link"
            >
              topic-eval-items.json
            </a>
            . Kappa for the rules: {numInterval(score.kappa)}.
          </p>
        </details>
      </Section>
    </>
  );
}
