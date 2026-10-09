import { Check, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/common/bits";
import { PageIntro, Panel, Section } from "@/components/common/page-intro";
import {
  DatePlayground,
  ReadabilityPlayground,
  SplitterPlayground,
} from "@/components/method/playgrounds";
import candidates from "@/data/debate-candidates.json";
import parity from "@/data/parity-python.json";
import { formatInt, formatPercent } from "@/lib/format";
import { APP_CITATION, SITE } from "@/lib/site";
import { getConcepts, getOverview } from "@/server/corpus";
import { listDecisions } from "@/server/docs";
import { readabilitySummary } from "@/server/readability";
import { buildSystemPrompt } from "@/lib/ai/topic-labels";
import { ANTHROPIC_MODELS, DEFAULT_OPENAI_MODEL } from "@/lib/ai/providers";
import { DEFAULT_SEED } from "@/lib/stats/bootstrap";
import { STABILITY_RESAMPLES } from "@/lib/stats/fw-stability";
import { READABILITY_RESAMPLES } from "@/lib/readability-stats";
import { EVAL_ITEMS, EXCERPTS_NAMING_CANDIDATE, GOLD_META, SAMPLE_META } from "@/lib/topics/data";
import { scoreLabeller } from "@/lib/topics/evaluation";
import { KEYWORD_RULES_VERSION, keywordLabel } from "@/lib/topics/keyword-rules";

export const metadata: Metadata = {
  title: "Methods, decisions and AI use",
  description:
    "How the 2025 scrapers worked and were checked, how every statistic and interval on the site is computed, the topic-label evaluation design, assumptions and limits, decision records, the model card and the AI use statement.",
};

const TOC = [
  ["pipeline", "The collection pipeline"],
  ["parity", "Checking the port"],
  ["dates", "Date normalisation"],
  ["splitter", "Transcript splitting"],
  ["attribution", "Whose words count"],
  ["readability", "Reading grade"],
  ["fightin-words", "Distinctive words"],
  ["timeline", "Rates and intervals"],
  ["debates", "Debate turns and roles"],
  ["source", "Source, licence and limits"],
  ["stability", "Stability of word lists"],
  ["readability-intervals", "Uncertainty in reading grades"],
  ["topic-eval", "Topic labels: evaluation"],
  ["assumptions", "Assumptions and limitations"],
  ["ai-use", "AI use statement"],
  ["model-card", "Model card"],
  ["decisions", "Decision records"],
  ["change", "What I'd change"],
] as const;

/** "-5.47" -> "−5.5" (a true minus sign) */
const minus = (v: number, d = 1) => v.toFixed(d).replace("-", "\u2212");

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="relative rounded-md border border-border bg-background/60 p-4">
      <p className="kicker">{n}</p>
      <p className="mt-1 font-serif text-[1.05rem]">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </li>
  );
}

function Formula({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure
      tabIndex={0}
      className="my-4 overflow-x-auto rounded-md border border-border bg-background/70 px-4 py-3"
    >
      <figcaption className="kicker mb-2">{label}</figcaption>
      <div className="font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-[0.82rem] leading-7 whitespace-pre">
        {children}
      </div>
    </figure>
  );
}

export default function MethodPage() {
  const o = getOverview();
  const concepts = getConcepts();
  const decisions = listDecisions();
  const readability = readabilitySummary();
  const written2024 = readability.docs.cells.find(
    (c) => c.cycle === 2024 && c.register === "written",
  )!;
  const namedCount = EXCERPTS_NAMING_CANDIDATE;
  const baseline = scoreLabeller(
    EVAL_ITEMS.map((i) => i.gold),
    EVAL_ITEMS.map((i) => keywordLabel(i.excerpt).topic),
  );
  const promptChars = buildSystemPrompt().length;
  const docMismatch = Object.values(parity.documents.mismatches).reduce((a, b) => a + b, 0);
  const debMismatch = Object.values(parity.debates.mismatches).reduce((a, b) => a + b, 0);
  const parityRows = [
    {
      what: "Debate transcripts → Participants, Moderators, lists, plain text",
      n: `${parity.debates.transcripts} transcripts`,
      py: debMismatch === 0,
      ts: "debate-splitter.test.ts",
    },
    {
      what: "Debate listing → ISO timestamp to “October 01, 2024”",
      n: `${parity.debates.listingRows} rows`,
      py: parity.debates.listingDateMatches === parity.debates.listingRows,
      ts: "dates.test.ts",
    },
    {
      what: "Documents → type, location, word count, paragraph join, date",
      n: `${formatInt(parity.documents.documents)} rows`,
      py: docMismatch === 0,
      ts: "documents.test.ts, dates.test.ts",
    },
    {
      what: "Documents → listing date round-trip to the Date column",
      n: `${formatInt(parity.documents.documents)} rows`,
      py: parity.documents.listingDateMatches === parity.documents.documents,
      ts: "dates.test.ts",
    },
    {
      what: "Revival analytics → tokens, sentences, syllables, grade per document",
      n: `${formatInt(o.documents)} documents`,
      py: null,
      ts: "textkit.test.ts (TypeScript vs the Python build)",
    },
    {
      what: "Fightin' Words z-scores and Poisson intervals",
      n: "reference fixtures",
      py: null,
      ts: "stats.test.ts (vs Python and SciPy)",
    },
    {
      what: "Bootstrap, Wilson, kappa, McNemar, OLS; word-list stability",
      n: "reference fixtures",
      py: null,
      ts: "stats-extra.test.ts (vs numpy, SciPy, statsmodels, scikit-learn, a Python port)",
    },
    {
      what: "Reading-grade intervals, paired gap and debate trends",
      n: `${formatInt(o.documents)} documents, 179 debates`,
      py: null,
      ts: "readability-stats.test.ts (vs numpy on analytics.db)",
    },
  ];

  return (
    <>
      <PageIntro
        kicker="Method and source"
        title="How the archive was collected, checked and analysed"
      >
        <p>
          Everything on this site comes from the CSV files the 2025 notebooks wrote. Nothing was
          scraped again. This page describes the original collector, the parts of it that were
          ported to TypeScript, every calculation and interval the site adds, the topic-label
          evaluation, the assumptions and limits, the decisions behind them, and how AI is and is
          not used.
        </p>
      </PageIntro>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-24 space-y-1.5 border-l border-border pl-4 text-sm">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted-foreground hover:text-foreground">
                  <span className="mr-1.5 font-mono text-[0.7rem]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-16">
          <details className="rounded-lg border border-border bg-card p-4 text-sm lg:hidden">
            <summary className="cursor-pointer font-medium">On this page</summary>
            <nav aria-label="On this page (compact)">
              <ol className="mt-3 space-y-1.5">
                {TOC.map(([id, label], i) => (
                  <li key={id}>
                    <a href={`#${id}`} className="text-muted-foreground hover:text-foreground">
                      <span className="mr-1.5 font-mono text-[0.7rem]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
          <Section
            id="pipeline"
            kicker="01"
            title="The collection pipeline (August 2025)"
            className="px-0 sm:px-0"
          >
            <div className="prose-archive">
              <p>
                Two Jupyter notebooks read public listing pages on{" "}
                <a href={SITE.app}>The American Presidency Project</a> and then each linked page,
                with browser-like headers, connection pooling, retries with exponential backoff on
                429 and 5xx responses, and fixed delays between requests.
              </p>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-3 font-medium">documents.ipynb</p>
                <ol className="space-y-3">
                  <Step n="Phase 1 · listing" title="CampaignDocumentsScraper">
                    Requests the campaign-documents category at 1,000 items per page, finds the page
                    count (pagination links, else a binary search over page numbers), and scrapes
                    pages in a thread pool of up to five workers: date, title, link and the
                    “Related” candidate.
                  </Step>
                  <Step n="Phase 2 · content" title="OptimizedDocumentExtractor">
                    Fetches each unique link in batches of 50 across eight workers, with a pickle
                    cache and a JSON checkpoint every 500 URLs so an interrupted run resumes. It
                    extracts title, date, speaker, byline, paragraphs, a document type and location
                    from the title, a video flag and a word count.
                  </Step>
                </ol>
              </div>
              <div>
                <p className="mb-3 font-medium">debates.ipynb</p>
                <ol className="space-y-3">
                  <Step n="Phase 1 · listing" title="scrape_debates_data">
                    Reads the debates category at 200 items per page: date (normalised from the ISO
                    timestamp), title, link and related category. 180 rows, 179 unique transcripts.
                  </Step>
                  <Step n="Phase 2 · transcripts" title="extract_debate_info">
                    Fetches each transcript one second apart, keeps the full HTML, pulls the
                    “PARTICIPANTS:” and “MODERATORS:” blocks into lists, and flattens the text with
                    line breaks preserved.
                  </Step>
                </ol>
              </div>
            </div>
            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              <Step n="2026 · build" title="scripts/build_analytics.py">
                Run with uv. Reads the three CSVs from original/ and writes a 9 MB read-only SQLite
                file of derived data: no running text.
              </Step>
              <Step n="2026 · serve" title="Next.js on the server">
                Pages query the database with Node&apos;s built-in node:sqlite. Static pages are
                prerendered; tools that take parameters compute on request.
              </Step>
              <Step n="2026 · test" title="Vitest in CI">
                The TypeScript ports and the statistics are re-checked against the original CSVs on
                every push.
              </Step>
            </ol>
          </Section>

          <Section
            id="parity"
            kicker="02"
            title="Checking the port against the original outputs"
            description="Two independent checks. scripts/parity_check.py executes the notebook cells verbatim, with the network replaced by a stub that serves pages rebuilt from the stored data. The Vitest suites then run the TypeScript ports over the same CSVs."
            className="px-0 sm:px-0"
          >
            <div
              className="overflow-x-auto rounded-lg border border-border"
              role="region"
              aria-label="Parity checks (scrolls sideways on small screens)"
              tabIndex={0}
            >
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Parity checks and their results</caption>
                <thead className="bg-secondary text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      What is reproduced
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Rows
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Original Python, offline
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      TypeScript test
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parityRows.map((r) => (
                    <tr key={r.what} className="border-t border-border/70">
                      <td className="px-3 py-2">{r.what}</td>
                      <td className="tabular px-3 py-2 text-muted-foreground">{r.n}</td>
                      <td className="px-3 py-2">
                        {r.py === null ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Minus className="size-3.5" aria-hidden />
                            n/a (new in 2026)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs">
                            {r.py ? (
                              <Check className="size-3.5 text-primary" aria-hidden />
                            ) : (
                              <X className="size-3.5 text-destructive" aria-hidden />
                            )}
                            {r.py ? "identical" : "differs"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.ts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              “Identical” means every field compared equal as strings: 0 mismatches across{" "}
              {parity.documents.fieldsChecked.length} document fields and{" "}
              {parity.debates.fieldsChecked.length} debate fields. The TypeScript suites assert the
              same with zero tolerance (floating-point values to 1e-9). The last four rows are code
              written for the revival, so there is no notebook to compare with; their TypeScript is
              checked against the revival&apos;s own Python build and the Python scientific stack
              instead (<code className="inline">scripts/stats_reference.py</code>).
            </p>
          </Section>

          <Section id="dates" kicker="03" title="Date normalisation" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                Three functions handle dates, and they disagree on purpose. The listing scrapers
                turn the ISO <code>content</code> attribute into “September 29, 2024” with{" "}
                <code>strftime(&quot;%B %d, %Y&quot;)</code>, keeping the wall-clock date of the
                timestamp rather than converting time zones. The content extractor goes the other
                way: an ISO string containing both “T” and “+” is kept as ISO, and anything else is
                tried against four formats in order (<code>%B %d, %Y</code>, <code>%m/%d/%Y</code>,{" "}
                <code>%Y-%m-%d</code>, <code>%d %B %Y</code>) before being passed through unchanged.
                A trailing “Z” therefore survives in the content phase but not in the listing phase.
              </p>
            </div>
            <Panel className="mt-5">
              <DatePlayground />
            </Panel>
          </Section>

          <Section id="splitter" kicker="04" title="Transcript splitting" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                For each paragraph whose first bold element starts with “participants” or
                “moderators”, the notebook takes the paragraph&apos;s HTML, removes a leading{" "}
                <code>&lt;b&gt;LABEL:&lt;/b&gt;</code>, replaces each <code>&lt;br&gt;</code> with a
                sentinel, strips tags, splits on the sentinel and then on semicolons, and trims
                trailing full stops. That is why names keep a trailing “and”. The plain text is
                every text node, stripped and joined with newlines, with runs of three or more
                newlines collapsed. The TypeScript port does the same over an htmlparser2 tree,
                including BeautifulSoup&apos;s serialisation (<code>&lt;br/&gt;</code>, minimal
                escaping) and Python&apos;s definition of whitespace. One known gap: malformed HTML
                (an unclosed or nested <code>&lt;p&gt;</code>) is repaired differently by
                htmlparser2 than by Python&apos;s <code>html.parser</code>, so a pasted fragment
                like that can split differently in the playground. All 179 stored transcripts are
                well formed and match exactly.
              </p>
            </div>
            <Panel className="mt-5">
              <SplitterPlayground />
            </Panel>
          </Section>

          <Section id="attribution" kicker="05" title="Whose words count" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                Documents are filed under one candidate, but interviews and town halls also contain
                interviewers, moderators and audience members. Before counting words, each stored
                document is split into its paragraphs and read in order. A paragraph that opens with
                an upper-case label (“ROGAN:”, “AUDIENCE MEMBER:”) switches the current speaker
                until the next label. Labels that contain the candidate&apos;s surname or an office
                they held (“THE VICE PRESIDENT:”) keep the text; labels that are fields of a press
                release (“FACT:”, “TIME:”, “NARRATOR:”) are not speaker changes; any other label
                drops the text that follows. Stage directions such as “(Applause.)” are removed.
              </p>
              <p>
                This keeps {formatPercent(o.tokens / o.rawTokens)} of all words and removes{" "}
                {formatInt(o.excludedTokens)} words spoken by other people. The original word counts
                are untouched and are what the Explorer reports; the cleaned text feeds the reading
                grades, the word index and the timelines.
              </p>
            </div>
          </Section>

          <Section id="readability" kicker="06" title="Reading grade" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                The Flesch-Kincaid grade level combines average sentence length and average
                syllables per word. Words are runs of letters (with internal apostrophes); sentences
                end at “.”, “!” or “?” followed by a space or quote, after protecting titles (“Mr.”)
                and initials (“J.D.”); syllables use a standard vowel-group heuristic. Texts under
                100 words get no grade. Transcribed speech and press releases are punctuated by
                different people, so grades compare like with like only roughly, and they say
                nothing about the quality of what was said.
              </p>
            </div>
            <Formula label="Flesch-Kincaid grade level">
              {"grade = 0.39 × (words ÷ sentences) + 11.8 × (syllables ÷ words) − 15.59"}
            </Formula>
            <Panel>
              <ReadabilityPlayground />
            </Panel>
          </Section>

          <Section
            id="fightin-words"
            kicker="07"
            title="Distinctive words: Fightin' Words"
            className="px-0 sm:px-0"
          >
            <div className="prose-archive">
              <p>
                The comparison uses the weighted log-odds ratio with an informative Dirichlet prior
                from Monroe, Colaresi and Quinn (2008), “Fightin&apos; Words: Lexical Feature
                Selection and Evaluation for Identifying the Content of Political Conflict”,{" "}
                <em>Political Analysis</em> 16(4). The prior is the whole archive&apos;s word
                distribution scaled to α₀ pseudo-words (10,000 by default): it pulls rare words
                towards the archive-wide rate so that a word used twice by one group and never by
                the other does not top the list.
              </p>
              <p>
                The index holds {formatInt(o.vocabulary)} words: lower-cased tokens of two or more
                letters, present in at least five documents, minus a standard English stop-word
                list. Counts per document are stored as compressed postings; group totals are summed
                on the server for each request.
              </p>
            </div>
            <Formula label="For word w, groups A and B">
              {`a_w     = α₀ × (archive count of w ÷ archive total)
δ_w     = log[(y_w^A + a_w) / (n^A + α₀ − y_w^A − a_w)]
        − log[(y_w^B + a_w) / (n^B + α₀ − y_w^B − a_w)]
σ²(δ_w) ≈ 1/(y_w^A + a_w) + 1/(y_w^B + a_w)
z_w     = δ_w / σ(δ_w)`}
            </Formula>
          </Section>

          <Section id="timeline" kicker="08" title="Rates and intervals" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                A period&apos;s rate is mentions ÷ words × 10,000, where words are the cleaned
                own-voice tokens of every document in the period. Treating the count k as Poisson,
                the exact (Garwood) 95% interval comes from gamma quantiles, computed in TypeScript
                with a regularised incomplete gamma function and checked against SciPy.
              </p>
              <p>
                The topic list has {concepts.length} entries chosen to cover policy areas that
                campaigns of both major parties talk about, and both party names. The adjective
                “Democratic” is left out because it is also a party name. Topics:{" "}
                {concepts.map((c) => c.label).join(", ")}.
              </p>
            </div>
            <Formula label="Exact Poisson interval for k mentions in N words">
              {`lower = Γ⁻¹(0.025; k)      (0 when k = 0)
upper = Γ⁻¹(0.975; k + 1)
rate  = k / N × 10,000      interval scaled the same way`}
            </Formula>
          </Section>

          <Section id="debates" kicker="09" title="Debate turns and roles" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                Transcripts from six decades mark speakers in different ways, so a new turn starts
                at a bold or italic label (“<strong>WALZ:</strong>”, “<em>The President.</em>”), a
                plain upper-case label ending in a colon (“MR. NIXON:”), or, in transcripts that use
                neither, a short name ending in a full stop (“Mr. Newman.”). Lines without a label
                continue the current speaker. Labels are reduced to a surname; “THE PRESIDENT” and
                “THE VICE PRESIDENT” become the office holder of that year.
              </p>
              <p>
                A speaker is a <em>candidate</em> if the surname is on the list below of people who
                took part as candidates in that cycle&apos;s debates (public record), belongs to the
                party holding the debate when it is a primary, and is named in the page&apos;s
                Participants block when there is one. Every other named speaker is grouped as a
                moderator, panellist or questioner; audience members, unidentified voices and
                recorded clips form a third group. Word share stands in for talk time.
              </p>
              <p>
                Recorded material played during a debate is not live speech. Turns between “[begin
                video clip]” and “[end video clip]” (and the transcripts&apos; other spellings of
                these markers), turns tagged “(from videotape.)”, and labels such as “VIDEO CLIP OF
                …” are counted as <em>Recorded clips</em>, so a candidate heard only in a clip, such
                as a president quoted at the other party&apos;s primary, is not listed as taking
                part. A clip whose end marker is missing covers only the next speaker. Where a
                source transcript leaves out a label, the words go to the previous speaker; one such
                gap in the January 2004 Greenville debate is visible in its moderator share.
              </p>
            </div>
            <details className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium">Candidates by cycle</summary>
              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {Object.entries(candidates).map(([cycle, names]) => (
                  <div key={cycle} className="flex gap-3">
                    <dt className="tabular font-mono text-xs text-muted-foreground">{cycle}</dt>
                    <dd className="text-muted-foreground">{names.join(", ")}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </Section>

          <Section
            id="source"
            kicker="10"
            title="Source, licence and limits"
            className="px-0 sm:px-0"
          >
            <div className="prose-archive">
              <p>
                <strong>Source.</strong> {APP_CITATION} Copyright © The American Presidency Project.
                Document and debate pages are linked, never re-published. The site stores titles,
                dates, counts and short quotations of at most 25 words, each linked to its page.
              </p>
              <p>
                <strong>Coverage.</strong> The documents are what the archive files under “campaign
                documents” between {o.firstDate} and {o.lastDate}; that is not everything a campaign
                published, and the volume per candidate reflects both the campaign and the archive.{" "}
                {formatInt(o.listingRows - o.documents)} listing rows were duplicates and are
                counted once; {formatInt(o.zeroWordDocs)} documents have no text.
              </p>
              <p>
                <strong>Neutrality.</strong> Every speaker is processed by the same code. Colours
                identify the groups being compared, never parties. No measure here is a sentiment,
                quality or truthfulness score, and nothing predicts an outcome.
              </p>
              <p>
                <strong>Code.</strong> MIT licence, covering the code only. The original notebooks
                and CSVs are kept unchanged in <code>original/</code> of the{" "}
                <a href={SITE.repo}>GitHub repository</a>.
              </p>
            </div>
            <Callout className="mt-6" title="Questions or corrections">
              If a number looks wrong, open an issue on{" "}
              <a href={`${SITE.repo}/issues`} className="inline-link">
                GitHub
              </a>
              . The{" "}
              <Link href="/explorer" className="inline-link">
                Explorer
              </Link>{" "}
              links every document back to its source page for checking.
            </Callout>
          </Section>

          <Section
            id="stability"
            kicker="11"
            title="Stability of the word lists"
            className="px-0 sm:px-0"
          >
            <div className="prose-archive">
              <p>
                The Fightin&apos; Words z-score treats each word token as an independent draw.
                Campaign text is clustered: one press release can repeat a county&apos;s name thirty
                times. Every comparison on{" "}
                <Link href="/distinctive#stability" className="inline-link">
                  Distinctive words
                </Link>{" "}
                is therefore checked by resampling documents, not words: the documents of each group
                are drawn with replacement ({STABILITY_RESAMPLES} times, seed {DEFAULT_SEED}, group
                A first, then group B, from one mulberry32 stream), every z-score is recomputed with
                the same prior and α₀, and for each listed word the page reports the share of
                resamples in which it stays in its side&apos;s top 30, the 2.5th to 97.5th
                percentile of its z-score, the documents that use it and the share of its uses from
                its heaviest document.
              </p>
              <p>
                With {STABILITY_RESAMPLES} resamples a kept share has a Monte Carlo standard error
                of at most {(100 * Math.sqrt(0.25 / STABILITY_RESAMPLES)).toFixed(1)} percentage
                points. Separately, a comparison tests every word used by either group (up to{" "}
                {formatInt(o.vocabulary)}), and at |z| = 1.96 about 5% of the words tested would
                cross the line even if the groups did not differ; the page shows that figure for
                each comparison. The informative prior makes it a rough guide, but the point stands:
                the lists are rankings to explore, not a set of findings. Rationale and results:{" "}
                <Link
                  href="/methods/decisions/dr-003-term-statistics-method"
                  className="inline-link"
                >
                  DR-003
                </Link>
                .
              </p>
            </div>
          </Section>

          <Section
            id="readability-intervals"
            kicker="12"
            title="Uncertainty in reading grades"
            className="px-0 sm:px-0"
          >
            <div className="prose-archive">
              <p>
                The rows behind{" "}
                <Link href="/readability" className="inline-link">
                  Readability
                </Link>{" "}
                are not independent. A campaign&apos;s documents share writers and a house style,
                and the debates of one election cycle share candidates and a transcription source.
                Resampling single documents or debates would treat them as independent and give
                intervals that are too narrow, so the intervals resample clusters (a cluster
                bootstrap, {formatInt(READABILITY_RESAMPLES)} resamples, seed {DEFAULT_SEED}): for
                the mean grade of a cycle and kind of text, whole speakers with all their documents;
                for a debate trend (the slope of a least-squares line per decade, and a pointwise
                band for the fitted line), whole cycles with all their debates. Groups of fewer than
                five documents or five speakers get a point estimate and no interval.
              </p>
              <p>
                The difference is not small. For 2024 written releases ({formatInt(written2024.n)}{" "}
                documents from {written2024.speakers} speakers) the speaker-level interval is{" "}
                {minus(written2024.grade?.lower ?? Number.NaN, 2)} to{" "}
                {minus(written2024.grade?.upper ?? Number.NaN, 2)}, several times wider than
                resampling documents would suggest. For the primary-debate trend (
                {readability.primary.trend.n} debates in {readability.primary.trend.cycles} cycles)
                the cycle-level interval is {minus(readability.primary.trend.perDecade.lower, 2)} to{" "}
                {minus(readability.primary.trend.perDecade.upper, 2)} grade levels per decade,
                against {minus(readability.primary.trend.perDecadeDebates.lower, 2)} to{" "}
                {minus(readability.primary.trend.perDecadeDebates.upper, 2)} if debates were
                independent. With only {readability.primary.trend.cycles} to{" "}
                {readability.general.trend.cycles} cycles, a cluster bootstrap is itself approximate
                and can still run a little narrow. A cycle&apos;s own mean in the table resamples
                that cycle&apos;s debates and describes that cycle only.
              </p>
              <p>
                Because the grade is linear in words per sentence (WPS) and syllables per word
                (SPW), a difference of mean grades splits exactly into a sentence-length part and a
                word-length part. For the {readability.gap.speakers.length} speakers with enough of
                both kinds of text, each speaker is one paired difference, and the mean gap is{" "}
                {minus(readability.gap.gapT.estimate)} grade levels (95% t interval{" "}
                {minus(readability.gap.gapT.lower)} to {minus(readability.gap.gapT.upper)}; at n ={" "}
                {readability.gap.speakers.length} a percentile bootstrap gives the slightly narrower{" "}
                {minus(readability.gap.gap.lower)} to {minus(readability.gap.gap.upper)}), of which{" "}
                {minus(readability.gap.sentencePartT.estimate)} comes from sentence length.{" "}
                {readability.gap.sign.negative} of {readability.gap.speakers.length} speakers grade
                lower when transcribed (exact sign test p = {readability.gap.sign.p.toFixed(4)}).
                These intervals cover sampling, not measurement: they do not include the effect of
                who transcribed a debate, which the page shows separately with two events the
                archive holds in two transcripts. The choice of clustered intervals is recorded in{" "}
                <Link
                  href="/methods/decisions/dr-006-clustered-intervals-for-readability"
                  className="inline-link"
                >
                  DR-006
                </Link>
                .
              </p>
            </div>
            <Formula label="Splitting a difference in mean grade">
              {`Δgrade = 0.39 × ΔWPS  +  11.8 × ΔSPW
         (sentence length)   (word length)`}
            </Formula>
          </Section>

          <Section
            id="topic-eval"
            kicker="13"
            title="Topic labels: evaluation design"
            className="px-0 sm:px-0"
          >
            <div className="prose-archive">
              <p>
                <strong>Question.</strong> On one-sentence campaign excerpts, how often does a
                language model give the same policy-topic label as a careful coder, compared with a
                transparent keyword dictionary?
              </p>
              <p>
                <strong>Set.</strong> {EVAL_ITEMS.length} sentences of {SAMPLE_META.words[0]} to{" "}
                {SAMPLE_META.words[1]} words, {SAMPLE_META.perCycle} per cycle, one per randomly
                drawn document (seed {SAMPLE_META.seed}), after the quotation rules. The draw is
                blind to keywords, so it does not favour the dictionary. Gold labels:{" "}
                {GOLD_META.status === "draft"
                  ? "a single-annotator draft prepared by the AI coding assistant that built this upgrade, not yet reviewed by a person"
                  : "reviewed"}
                ; until reviewed, every score is provisional.
              </p>
              <p>
                <strong>Labellers.</strong> The keyword rules, {KEYWORD_RULES_VERSION}, were written
                before the set was drawn and then frozen. The model sees the codebook (21 CAP-style
                topics and &ldquo;none&rdquo;), five coding rules and up to ten excerpts with opaque
                ids per request; the system prompt is {formatInt(promptChars)} characters. Defaults:{" "}
                {ANTHROPIC_MODELS[0].label} at temperature 0, or {ANTHROPIC_MODELS[1].label} at low
                effort, or an OpenAI model ({DEFAULT_OPENAI_MODEL} by default).
              </p>
              <p>
                <strong>Metrics.</strong> Agreement with gold (Wilson interval), Cohen&apos;s kappa
                (percentile bootstrap over excerpts), agreement on the excerpts with a policy topic,
                and a paired comparison on the same excerpts: the difference in agreement and in
                kappa (paired bootstrap, so both labellers see the same resamples) and
                McNemar&apos;s exact test. The keyword baseline on all {baseline.n} excerpts:{" "}
                {(100 * baseline.agreement.estimate).toFixed(1)}% agreement (95% CI{" "}
                {(100 * baseline.agreement.lower).toFixed(1)} to{" "}
                {(100 * baseline.agreement.upper).toFixed(1)}), kappa{" "}
                {baseline.kappa.estimate.toFixed(2)} ({baseline.kappa.lower.toFixed(2)} to{" "}
                {baseline.kappa.upper.toFixed(2)}).
              </p>
            </div>
          </Section>

          <Section
            id="assumptions"
            kicker="14"
            title="Assumptions and limitations"
            className="px-0 sm:px-0"
          >
            <ul className="prose-archive list-disc space-y-2 pl-5">
              <li>
                <strong>Coverage.</strong> The documents are what the archive files as campaign
                documents; volumes per candidate reflect the campaign and the archive, not how much
                anyone said.
              </li>
              <li>
                <strong>Own voice.</strong> Text is attributed by speaker labels: turns labelled
                with anyone other than the document&apos;s own speaker are dropped, and interviewer
                text without a label stays in. Debate roles depend on curated candidate lists.
              </li>
              <li>
                <strong>Independence.</strong> z-scores and Poisson intervals treat word tokens as
                independent. The word lists now carry a document-level bootstrap check; the timeline
                intervals do not yet, so they are too narrow when a few documents repeat a term.
              </li>
              <li>
                <strong>Readability.</strong> Flesch-Kincaid was built for edited English prose.
                Transcripts are punctuated by transcribers, so grades compare like with like only
                roughly, and never measure quality.
              </li>
              <li>
                <strong>Intervals.</strong> Every interval covers sampling variability given the
                pipeline&apos;s choices (tokeniser, stop words, cleaning, roles). None of them
                covers uncertainty in those choices. Readability intervals resample speakers or
                election cycles, but with 9 to 24 clusters they are approximate; the topic-label
                intervals treat the {EVAL_ITEMS.length} excerpts, one per document, as independent.
              </li>
              <li>
                <strong>Topic labels.</strong> A small, single-annotator draft gold set; most topics
                have one to eight excerpts; one sentence out of context is hard for any coder. The
                same AI assistant drafted the gold labels and wrote the keyword dictionary, so the
                gold set is independent of neither labeller.
              </li>
              <li>
                <strong>Many tests.</strong> Distinctive words tests every indexed word at once;
                some extreme z-scores are chance.
              </li>
            </ul>
          </Section>

          <Section id="ai-use" kicker="15" title="AI use statement" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                <strong>What AI does here.</strong> One optional feature: on{" "}
                <Link href="/topics" className="inline-link">
                  Topic labels
                </Link>
                , a language model you choose labels the policy topic of short excerpts so that it
                can be compared with keyword rules and gold labels. It runs only when you start it,
                with your own API key.
              </p>
              <p>
                <strong>What it never does.</strong> It produces no number anywhere else on the
                site; every other page is computed without AI. It is never used to compare
                candidates or parties, and its labels are never presented as facts: every output
                carries an &ldquo;AI-generated&rdquo; label, and the simulated demo is labelled as
                simulated. A request that fails (a rejected key, a network or rate-limit error, or
                pressing Stop) is left out of the scores, never counted as the model&apos;s wrong
                answer.
              </p>
              <p>
                <strong>Data sent to the provider.</strong> The codebook, the coding rules and the
                excerpts (one sentence of 25 words or fewer each, with an opaque id), from your
                browser straight to Anthropic or OpenAI. The speaker, date, title and link are not
                sent as metadata, but {namedCount} of the {EVAL_ITEMS.length} excerpts name the
                candidate in the text, and some name journalists or officials, so the model can
                often tell whose campaign wrote them. Your key is kept in your browser
                (sessionStorage, or localStorage if you tick &ldquo;remember on this device&rdquo;),
                never sent to this site&apos;s server and never logged. The provider&apos;s own
                terms apply to what you send it.
              </p>
              <p>
                <strong>Human in the loop and audit.</strong> You can accept, correct or reject each
                run; corrections are recorded as edits and never change the scores, which always use
                the model&apos;s own labels. Every call, failure and simulated run is logged in your
                browser&apos;s IndexedDB with the prompt, the answer, latency, token use and your
                decision, viewable and exportable (JSON or CSV) on the{" "}
                <Link href="/ai-log" className="inline-link">
                  AI audit log
                </Link>
                .
              </p>
              <p>
                <strong>Frameworks.</strong> This design is informed by the Australian
                Government&apos;s policy for the responsible use of AI in government, the
                transparency principles of the EU AI Act and the NIST AI Risk Management Framework.
                It does not claim compliance with any of them.
              </p>
              <p>
                <strong>AI in building the site.</strong> The 2026 upgrade was built with an AI
                coding assistant, which also wrote the keyword dictionary and prepared the draft
                gold labels (see{" "}
                <Link
                  href="/methods/decisions/dr-004-llm-topic-labels-vs-keyword-rules"
                  className="inline-link"
                >
                  DR-004
                </Link>{" "}
                and{" "}
                <Link
                  href="/methods/decisions/dr-005-score-only-answered-excerpts"
                  className="inline-link"
                >
                  DR-005
                </Link>
                ). Every statistic is computed by code that is tested against independent Python
                implementations.
              </p>
            </div>
          </Section>

          <Section id="model-card" kicker="16" title="Model card" className="px-0 sm:px-0">
            <div className="prose-archive">
              <p>
                The two topic labellers (keyword rules and the bring-your-own-key LLM) have a model
                card: intended use, data provenance, evaluation with intervals, known failure modes
                with examples from the gold set, and ethical considerations.
              </p>
            </div>
            <Link
              href="/methods/model-card"
              className="mt-4 inline-flex items-center gap-1 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              Read the model card →
            </Link>
          </Section>

          <Section
            id="decisions"
            kicker="17"
            title="Decision records"
            className="px-0 sm:px-0"
            description="Each record states the decision first, then the context, the options, why, what happened (weak numbers included) and what I'd change. Records are never edited; a change of mind gets a new record."
          >
            <ol className="divide-y divide-border/70 rounded-lg border border-border bg-card">
              {decisions.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/methods/decisions/${d.slug}`}
                    className="block px-4 py-3.5 transition-colors hover:bg-accent/40"
                  >
                    <span className="kicker">
                      {d.id} · {d.status} · {d.decided}
                    </span>
                    <span className="mt-1 block font-serif text-[1.05rem]">{d.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{d.decision}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="change" kicker="18" title="What I'd change" className="px-0 sm:px-0">
            <ul className="prose-archive list-disc space-y-2 pl-5">
              <li>
                Have two people label the topic gold set independently, report their agreement and
                resolve disagreements; grow the set so every topic has at least ten excerpts.
              </li>
              <li>
                Extend the document-level bootstrap (or a negative binomial model) to the timeline,
                whose Poisson intervals ignore overdispersion.
              </li>
              <li>
                Re-derive reading grades from sentence boundaries normalised across transcript
                sources, then measure how much of the debate trend survives.
              </li>
              <li>
                Commit dated reference LLM runs, repeated, once there is a small budget, so the
                comparison is visible without a key and run-to-run variation is measured.
              </li>
              <li>
                Ask the archive&apos;s editors how they would like the collected full texts kept,
                and move them out of the public repository if they prefer.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
