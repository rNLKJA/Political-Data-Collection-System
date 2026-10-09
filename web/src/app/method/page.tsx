import { Check } from "lucide-react";
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
import { formatCompact, formatInt, formatPercent } from "@/lib/format";
import { APP_CITATION, SITE } from "@/lib/site";
import { getConcepts, getOverview } from "@/server/corpus";

export const metadata: Metadata = {
  title: "Method and source",
  description:
    "How the 2025 scrapers worked, how their date normalisation and transcript splitting were ported to TypeScript and checked against the original CSVs, and how every statistic on the site is computed.",
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
] as const;

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
    <figure className="my-4 overflow-x-auto rounded-md border border-border bg-background/70 px-4 py-3">
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
      py: true,
      ts: "textkit.test.ts (TypeScript vs the Python build)",
    },
    {
      what: "Fightin' Words z-scores and Poisson intervals",
      n: "reference fixtures",
      py: true,
      ts: "stats.test.ts (vs Python and SciPy)",
    },
  ];

  return (
    <>
      <PageIntro
        kicker="Method and source"
        title="How the archive was collected, ported and checked"
      >
        <p>
          Everything on this site comes from the CSV files the 2025 notebooks wrote. Nothing was
          scraped again. This page describes the original collector, the parts of it that were
          ported to TypeScript, and every calculation the site adds.
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
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Step n="2026 · build" title="scripts/build_analytics.py">
                Run with uv. Reads the three CSVs from original/ and writes a{" "}
                {formatCompact(9_100_000)}B read-only SQLite file of derived data: no running text.
              </Step>
              <Step n="2026 · serve" title="Next.js on the server">
                Pages query the database with Node&apos;s built-in node:sqlite. Static pages are
                prerendered; tools that take parameters compute on request.
              </Step>
              <Step n="2026 · test" title="Vitest in CI">
                The TypeScript ports and the statistics are re-checked against the original CSVs on
                every push.
              </Step>
            </div>
          </Section>

          <Section
            id="parity"
            kicker="02"
            title="Checking the port against the original outputs"
            description="Two independent checks. scripts/parity_check.py executes the notebook cells verbatim, with the network replaced by a stub that serves pages rebuilt from the stored data. The Vitest suites then run the TypeScript ports over the same CSVs."
            className="px-0 sm:px-0"
          >
            <div className="overflow-x-auto rounded-lg border border-border">
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
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Check className="size-3.5 text-primary" aria-hidden />
                          {r.py ? "identical" : "differs"}
                        </span>
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
              same with zero tolerance (floating-point values to 1e-9).
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
                escaping) and Python&apos;s definition of whitespace.
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
                took part as candidates in that cycle&apos;s debates (public record). Every other
                named speaker is grouped as a moderator, panellist or questioner; audience members
                and unidentified voices form a third group. Word share stands in for talk time.
                Where a source transcript leaves out a label, the words go to the previous speaker;
                one such gap in the January 2004 Greenville debate is visible in its moderator
                share.
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
        </div>
      </div>
    </>
  );
}
