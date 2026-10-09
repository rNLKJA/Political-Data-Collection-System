"use client";

import { useMemo, useState } from "react";

import { controlClass } from "@/components/common/field";
import {
  normaliseDebateListingDate,
  normaliseDocumentDate,
  parseListingDate,
} from "@/lib/original/dates";
import { pythonListRepr, splitTranscript } from "@/lib/original/debate-splitter";
import { cleanDocument, fleschKincaid } from "@/lib/textkit";
import { cn } from "@/lib/utils";

function Output({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/80 bg-background/60 px-3 py-2">
      <p className="kicker">{label}</p>
      <div
        className={cn(
          "mt-1 text-sm break-words whitespace-pre-wrap",
          mono && "font-mono text-[0.8rem]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

const DATE_SAMPLES = [
  "2024-09-29T00:00:00+00:00",
  "2023-11-08T20:00:00Z",
  "September 29, 2024",
  "09/29/2024",
  "29 September 2024",
  "Fall 2016",
];

export function DatePlayground() {
  const [value, setValue] = useState(DATE_SAMPLES[0]);
  const listing = parseListingDate(value);
  return (
    <div className="space-y-3">
      <label htmlFor="date-input" className="kicker">
        A date string as it might appear on a page
      </label>
      <input
        id="date-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cn(controlClass, "font-mono")}
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-2">
        {DATE_SAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(s)}
            className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Output label="Documents, listing phase">
          {listing === null ? "None" : JSON.stringify(listing)}
        </Output>
        <Output label="Documents, content phase">
          {JSON.stringify(normaliseDocumentDate(value))}
        </Output>
        <Output label="Debates, listing">
          {JSON.stringify(normaliseDebateListingDate(value || null, value))}
        </Output>
      </div>
    </div>
  );
}

const SAMPLE_HTML = `<p><b>PARTICIPANTS:</b><br/>Governor Avery Example (X) and<br/>Senator Blake Sample (Y)</p>
<p><b>MODERATORS:</b><br/>Casey Host (Network One); and<br/>Drew Anchor (Network Two)</p>
<p><b>HOST:</b> Good evening, and welcome to tonight's debate.</p>
<p><strong>EXAMPLE</strong>: Thank you. It is good to be here &amp; to see you all.</p>
<p><b>SAMPLE:</b> Thank you, Casey.<br/>(APPLAUSE)</p>`;

export function SplitterPlayground() {
  const [html, setHtml] = useState(SAMPLE_HTML);
  const result = useMemo(() => splitTranscript(html), [html]);
  return (
    <div className="space-y-3">
      <label htmlFor="splitter-input" className="kicker">
        Transcript HTML (the inside of{" "}
        <code className="inline normal-case">div.field-docs-content</code>)
      </label>
      <textarea
        id="splitter-input"
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={8}
        spellCheck={false}
        className="w-full rounded-md border border-input bg-card p-3 font-mono text-[0.78rem] leading-relaxed"
      />
      <p className="text-xs text-muted-foreground">
        A made-up example. Paste the HTML of any transcript from the archive to see what the 2025
        notebook would have stored.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Output label="Participants">{result.participants || "(empty)"}</Output>
        <Output label="Moderators">{result.moderators || "(empty)"}</Output>
        <Output label="Participants_List">{pythonListRepr(result.participantsList)}</Output>
        <Output label="Moderators_List">{pythonListRepr(result.moderatorsList)}</Output>
      </div>
      <Output label="Debate_Content_Text">{result.text || "(empty)"}</Output>
    </div>
  );
}

const SAMPLE_TEXT = `THE CANDIDATE: Thank you all for coming out tonight. (Applause.)

We are here because the archive keeps every word, and every word can be counted. Short sentences read easily. Longer sentences, which pile clause upon clause and reach for polysyllabic vocabulary, push the estimated grade level upward, whatever their merits.

AUDIENCE MEMBER: Four more years!

THE CANDIDATE: The formula only sees lengths. It cannot tell a good argument from a bad one, and it was never meant to. It was designed in the 1970s to estimate how hard a technical manual would be for a reader, and it still does that job reasonably well. Here it simply describes the texts, so that a rally speech, a policy paper and a debate answer can sit side by side on the same scale. Nothing more is claimed for it.`;

export function ReadabilityPlayground() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [speaker, setSpeaker] = useState("The Candidate");
  const stored = text.replaceAll("\n\n", "\\n\\n");
  const clean = cleanDocument(stored, speaker);
  const fk = fleschKincaid(clean.text);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fk-input" className="kicker">
            Text (blank lines separate paragraphs)
          </label>
          <textarea
            id="fk-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            className="w-full rounded-md border border-input bg-card p-3 text-sm leading-relaxed"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fk-speaker" className="kicker">
            Document speaker
          </label>
          <input
            id="fk-speaker"
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            className={controlClass}
          />
          <p className="text-xs text-muted-foreground">
            A label keeps its paragraphs if it contains the speaker&apos;s surname (here the last
            word of this box) or an office such as “THE PRESIDENT:”; any other label drops the
            paragraphs that follow it.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Output label="Kept paragraphs" mono={false}>
          {clean.keptParagraphs} kept · {clean.droppedParagraphs} dropped
        </Output>
        <Output label="Words">{fk.words}</Output>
        <Output label="Sentences">{fk.sentences}</Output>
        <Output label="Syllables">{fk.syllables}</Output>
        <Output label="Grade">
          {fk.grade === null
            ? `needs ${100 - fk.words > 0 ? 100 - fk.words : 0} more words`
            : fk.grade.toFixed(2)}
        </Output>
      </div>
    </div>
  );
}
