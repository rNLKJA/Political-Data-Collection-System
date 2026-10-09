import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/common/markdown";
import { SITE } from "@/lib/site";
import { getDecision, listDecisions } from "@/server/docs";

export function generateStaticParams() {
  return listDecisions().map((d) => ({ slug: d.slug }));
}

// Every record is known at build time. Keeping the page static makes an unknown
// slug wait for the full render, so notFound() can set a real 404 status.
export const ensureStatic = "navigation";

export async function generateMetadata({
  params,
}: PageProps<"/methods/decisions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const d = getDecision(slug);
  return d
    ? { title: `${d.id}: ${d.title}`, description: d.decision }
    : { title: "Decision record not found" };
}

export default async function DecisionPage({ params }: PageProps<"/methods/decisions/[slug]">) {
  const { slug } = await params;
  const d = getDecision(slug);
  if (!d) notFound();
  const all = listDecisions();
  const i = all.findIndex((x) => x.slug === slug);
  const file = `docs/decisions/${d.file}`;
  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
      <Link
        href="/methods#decisions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> All decision records
      </Link>
      <p className="kicker mt-6">
        Decision record {d.id} · {d.status} · decided {d.decided}
        {d.recorded && d.recorded !== d.decided ? ` · recorded ${d.recorded}` : ""}
      </p>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-medium tracking-tight sm:text-[2.5rem]">
        {d.title}
      </h1>
      <div className="mt-8">
        <Markdown>{d.body}</Markdown>
      </div>
      <nav
        aria-label="Other decision records"
        className="mt-14 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-sm"
      >
        {i > 0 ? (
          <Link href={`/methods/decisions/${all[i - 1].slug}`} className="hover:underline">
            ← {all[i - 1].id}: {all[i - 1].title}
          </Link>
        ) : (
          <span />
        )}
        {i < all.length - 1 ? (
          <Link
            href={`/methods/decisions/${all[i + 1].slug}`}
            className="text-right hover:underline"
          >
            {all[i + 1].id}: {all[i + 1].title} →
          </Link>
        ) : null}
      </nav>
      <p className="mt-6 text-xs text-muted-foreground">
        Source:{" "}
        <a href={`${SITE.repo}/blob/main/${file}`} className="inline-link">
          {file}
        </a>
        . Records are never edited once accepted; a change of mind gets a new record.
      </p>
    </article>
  );
}
