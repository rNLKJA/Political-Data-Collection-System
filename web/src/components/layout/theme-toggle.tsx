"use client";

import { Film, ScrollText } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Paper (light) or microfilm (dark). Renders a stable placeholder until mounted. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Switch to paper (light) theme" : "Switch to microfilm (dark) theme";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={mounted ? label : "Toggle colour theme"}
      title={mounted ? label : undefined}
      className="inline-flex size-9 items-center justify-center rounded-md border border-border/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {dark ? <ScrollText className="size-4" aria-hidden /> : <Film className="size-4" aria-hidden />}
    </button>
  );
}
