"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { buildHref, type QueryState } from "@/lib/url";

export type { QueryState };

/**
 * Navigate by patching the current query string. The server re-renders the
 * page for the new parameters; `pending` is true while that happens. Each
 * change is a history entry, so Back undoes the last filter change.
 */
export function useQueryNav(pathname: string, current: QueryState) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (patch: QueryState, opts: { resetPage?: boolean } = { resetPage: true }) => {
    const next: QueryState = { ...current, ...patch };
    if (opts.resetPage && !("page" in patch)) delete next.page;
    startTransition(() => router.push(buildHref(pathname, next), { scroll: false }));
  };
  return { go, pending };
}
