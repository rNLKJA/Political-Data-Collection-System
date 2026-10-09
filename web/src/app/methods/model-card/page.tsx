import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Markdown } from "@/components/common/markdown";
import { SITE } from "@/lib/site";
import { getModelCard } from "@/server/docs";

export const metadata: Metadata = {
  title: "Model card: policy-topic labellers",
  description:
    "Intended use, data provenance, evaluation with intervals, known failure modes and ethical considerations for the keyword rules and the bring-your-own-key LLM that label policy topics on /topics.",
};

export default function ModelCardPage() {
  const doc = getModelCard();
  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
      <Link
        href="/methods#model-card"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> Methods
      </Link>
      <p className="kicker mt-6">Model card</p>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-medium tracking-tight sm:text-[2.5rem]">
        {doc.title.replace(/^Model card:\s*/i, "")}
      </h1>
      <div className="mt-8">
        <Markdown>{doc.body}</Markdown>
      </div>
      <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        Source:{" "}
        <a href={`${SITE.repo}/blob/main/docs/model-card.md`} className="inline-link">
          docs/model-card.md
        </a>
        . Try the labellers on the{" "}
        <Link href="/topics" className="inline-link">
          topic labels
        </Link>{" "}
        page.
      </p>
    </article>
  );
}
