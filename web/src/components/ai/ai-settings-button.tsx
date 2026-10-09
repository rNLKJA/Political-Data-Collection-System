"use client";

import { KeyRound } from "lucide-react";

import { PROVIDERS } from "@/lib/ai/providers";
import { cn } from "@/lib/utils";

import { useAi } from "./ai-context";

/**
 * Header button: opens AI settings; a dot shows when a key is set for the
 * chosen provider. The server render (and hydration) always shows "no key".
 */
export function AiSettingsButton() {
  const { settings, hasKey, openSettings } = useAi();
  const label = hasKey
    ? `AI settings: ${PROVIDERS[settings.provider].label} key set`
    : "AI settings (optional, bring your own key)";
  return (
    <button
      type="button"
      onClick={openSettings}
      aria-label={label}
      title={label}
      className="relative inline-flex size-9 items-center justify-center rounded-md border border-border/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <KeyRound className="size-4" aria-hidden />
      <span
        aria-hidden
        className={cn(
          "absolute top-1 right-1 size-2 rounded-full bg-series-2 ring-2 ring-background transition-opacity",
          hasKey ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}
