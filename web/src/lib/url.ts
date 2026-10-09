export type QueryState = Record<string, string | undefined>;

/** `/path?k=v` from a query object, skipping empty values. */
export function buildHref(pathname: string, state: QueryState): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}
