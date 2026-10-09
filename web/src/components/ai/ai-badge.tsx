import { FlaskConical, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The visible label on every piece of model output. The simulated labeller of
 * the no-key demo gets its own label: its output is not from any model.
 */
export function AiGeneratedBadge({
  className,
  model,
  simulated = false,
}: {
  className?: string;
  model?: string;
  simulated?: boolean;
}) {
  const Icon = simulated ? FlaskConical : Sparkles;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 font-mono text-[0.68rem] font-medium tracking-wide whitespace-nowrap uppercase",
        simulated
          ? "border-muted-foreground/60 text-muted-foreground"
          : "border-primary/60 bg-primary/5 text-primary",
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {simulated ? "Simulated, not AI" : "AI-generated"}
      {model ? (
        <span className="font-normal tracking-normal text-muted-foreground normal-case">
          · {model}
        </span>
      ) : null}
    </span>
  );
}
