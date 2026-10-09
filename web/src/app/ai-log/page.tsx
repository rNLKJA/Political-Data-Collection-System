import type { Metadata } from "next";
import Link from "next/link";

import { AuditLogView } from "@/components/ai-log/audit-log-view";
import { Callout } from "@/components/common/bits";
import { PageIntro } from "@/components/common/page-intro";

export const metadata: Metadata = {
  title: "AI audit log",
  description:
    "Every AI call made from this browser: what was sent, what came back, how long it took, the tokens used and your decision on the output. Stored only in your browser; never includes your key.",
};

export default function AiLogPage() {
  return (
    <>
      <PageIntro kicker="Transparency · AI audit log" title="Every AI call, kept in your browser">
        <p>
          Each request to a language model from this site is recorded here: when it ran, which
          provider and model, the exact prompt, the answer, latency, the tokens the provider
          reported and what you decided about the output. The log lives in this browser&apos;s
          IndexedDB; this site has no database to send it to, and it never holds your API key.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        <AuditLogView />
        <Callout title="What the log is for">
          It lets you check what the AI features did and export a record (JSON or CSV) for your own
          files. You can accept or reject any call that returned an answer, with a note; each
          decision is added to that call&apos;s history, so changing your mind never erases the
          earlier one. Corrections to single labels are made on the run itself, on{" "}
          <Link href="/topics" className="inline-link">
            Topic labels
          </Link>
          . Simulated runs from the no-key demo are logged too, marked &ldquo;simulated&rdquo;: no
          model was called for them. Clearing the log deletes it from this browser only. See the{" "}
          <Link href="/methods#ai-use" className="inline-link">
            AI use statement
          </Link>
          .
        </Callout>
      </div>
    </>
  );
}
