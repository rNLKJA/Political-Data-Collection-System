import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/common/bits";
import { PageIntro, Section } from "@/components/common/page-intro";
import { ScreenshotGallery, type GalleryItem } from "@/components/tour/screenshot-gallery";
import { WalkthroughPlayer } from "@/components/tour/walkthrough-player";
import media from "@/data/showcase-media.json";
import { clockTime, JOURNEYS, SCREENS, type ShowcaseMedia } from "@/lib/showcase";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Guided tour",
  description:
    "Three recorded walkthroughs of Campaign Text Lab (comparing two speakers, sixty years of debates, and classical against LLM topic labels) with step-by-step transcripts, plus screenshots of every tool.",
};

const MEDIA = media as ShowcaseMedia;

export default function TourPage() {
  const gallery: GalleryItem[] = SCREENS.flatMap((s) => {
    const m = MEDIA.screens.find((x) => x.file === s.file);
    if (!m) return [];
    return [
      {
        file: s.file,
        title: s.title,
        caption: s.caption,
        src: m.webp,
        width: m.width,
        height: m.height,
        mobile: s.viewport === "mobile",
      },
    ];
  });

  return (
    <>
      <PageIntro kicker="Guided tour" title="The site in three walkthroughs">
        <p>
          Each walkthrough is a scripted recording of the site, captioned step by step. The steps
          beside each video are the full transcript: select one to play from there. Every tool works
          without an account or an API key.
        </p>
      </PageIntro>

      <nav aria-label="Walkthroughs" className="mx-auto max-w-6xl px-4 sm:px-6">
        <ol className="grid gap-3 sm:grid-cols-3">
          {JOURNEYS.map((j, i) => {
            const m = MEDIA.journeys[j.slug];
            return (
              <li key={j.slug}>
                <a
                  href={`#${j.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <span className="kicker">
                    {String(i + 1).padStart(2, "0")}
                    {m ? ` · ${clockTime(m.durationS)}` : ""}
                  </span>
                  <span className="mt-1.5 font-serif text-lg font-medium">{j.title}</span>
                  <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {j.summary}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {JOURNEYS.map((j, i) => {
        const m = MEDIA.journeys[j.slug];
        if (!m) return null;
        const steps = j.steps.map((text, k) => ({
          step: k + 1,
          text,
          atS: m.steps.find((s) => s.step === k + 1)?.atS ?? 0,
        }));
        return (
          <Section
            key={j.slug}
            id={j.slug}
            kicker={`Walkthrough ${i + 1} of ${JOURNEYS.length} · ${clockTime(m.durationS)}`}
            title={j.title}
            description={j.summary}
            className="mt-16"
          >
            {j.note ? (
              <Callout title="Mocked AI response for illustration" className="mb-5">
                {j.note} To see a real run, add your own key in{" "}
                <Link href="/topics" className="inline-link">
                  Topic labels
                </Link>
                , or try its simulated demo, which needs no key.
              </Callout>
            ) : null}
            <WalkthroughPlayer
              title={j.title}
              src={m.mp4}
              poster={m.poster}
              captions={m.vtt}
              width={m.width}
              height={m.height}
              steps={steps}
            />
            <p className="mt-4">
              <Link
                href={j.path}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Try it yourself <ArrowRight className="size-4" aria-hidden />
              </Link>
            </p>
          </Section>
        );
      })}

      <Section
        id="screenshots"
        kicker="Screenshots"
        title="Every tool at a glance"
        description="Captured by the same script at 1440 by 900 pixels, and on a 390-pixel phone. Select one to see it full size."
        className="mt-16"
      >
        <ScreenshotGallery items={gallery} />
      </Section>

      <Section
        id="how-made"
        kicker="How this tour was made"
        title="Reproducible, and a test"
        className="mt-16"
      >
        <div className="prose-archive max-w-3xl space-y-3 text-sm">
          <p>
            A Playwright script in the repository (<code>web/e2e/showcase.spec.ts</code>) opens the
            site in Chrome, takes the screenshots and records the walkthroughs, drawing the captions
            and the cursor ring on the page as it goes. Each step also checks what it shows, so the
            tour doubles as an end-to-end test. <code>pnpm showcase</code> runs it against
            production, or against any address in <code>BASE_URL</code>, and a second script
            converts the recordings to the MP4 files here, the GIFs in the README and the caption
            files, cutting out page-load pauses.
          </p>
          <p>
            Data and seeds are fixed, so a re-run shows the same numbers. The AI walkthrough never
            uses a real key: it types a placeholder and answers the provider request inside the
            browser with a mocked response, which is labelled on screen. Source:{" "}
            <a href={`${SITE.repo}/tree/main/web/e2e`} className="inline-link">
              web/e2e
            </a>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
