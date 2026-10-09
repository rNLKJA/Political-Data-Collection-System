"use client";

import { cn } from "@/lib/utils";

/** Floating tooltip positioned inside a `relative` chart container. */
export function ChartTooltip({
  x,
  y,
  width,
  children,
  className,
}: {
  x: number;
  y: number;
  /** container width, used to flip the tooltip near the right edge */
  width: number;
  children: React.ReactNode;
  className?: string;
}) {
  const flip = x > width * 0.62;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute z-20 max-w-[16rem] rounded-md border border-border bg-popover px-3 py-2 text-xs leading-snug text-popover-foreground shadow-md",
        className,
      )}
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 8),
      }}
    >
      {children}
    </div>
  );
}

export function LegendSwatch({ color, shape = "square" }: { color: string; shape?: "square" | "line" | "dot" }) {
  if (shape === "line") {
    return <span aria-hidden className="inline-block h-0.5 w-4 rounded-full align-middle" style={{ background: color }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 align-middle", shape === "dot" ? "rounded-full" : "rounded-[2px]")}
      style={{ background: color }}
    />
  );
}
