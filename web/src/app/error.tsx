"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { NAV } from "@/lib/site";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <p className="kicker">Error · the reading room hit a snag</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
        This shelf could not be read.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Something went wrong while preparing this page. Trying again usually works; if it does not,
        another tool may still be open.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <RotateCcw className="size-4" aria-hidden />
        Try again
      </button>
      <ul className="mt-10 divide-y divide-border border-y border-border">
        <li>
          <Link href="/" className="block py-3 font-serif text-lg hover:underline">
            Home
          </Link>
        </li>
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className="block py-3 hover:underline">
              <span className="font-serif text-lg">{n.label}</span>
              <span className="block text-sm text-muted-foreground">{n.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
