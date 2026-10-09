import { z } from "zod";

import { CONCEPT_SLUG_RE } from "@/lib/concepts";
import { DOC_TYPES } from "@/lib/corpus-types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a possibly repeated query parameter. */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const month = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/);

const explorerSchema = z.object({
  speaker: slug.optional().catch(undefined),
  type: z.enum(DOC_TYPES).optional().catch(undefined),
  from: month.optional().catch(undefined),
  to: month.optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(5000).catch(1),
});

export type ExplorerParams = z.infer<typeof explorerSchema>;

export function parseExplorerParams(sp: RawSearchParams): ExplorerParams {
  return explorerSchema.parse({
    speaker: first(sp.speaker) || undefined,
    type: first(sp.type) || undefined,
    from: first(sp.from) || undefined,
    to: first(sp.to) || undefined,
    q: first(sp.q) || undefined,
    page: first(sp.page) ?? 1,
  });
}

const groupToken = z.string().regex(/^(rest|cycle-\d{4}|[a-z0-9-]{1,80}(@\d{4})?)$/);
// "Everyone else" is defined relative to group A, so A itself cannot be "rest".
const groupTokenA = groupToken.refine((t) => t !== "rest");
export const ALPHA_OPTIONS = [1_000, 10_000, 100_000] as const;

const distinctiveSchema = z.object({
  a: groupTokenA.catch("cycle-2016"),
  b: groupToken.catch("cycle-2024"),
  prior: z.coerce
    .number()
    .refine((v) => (ALPHA_OPTIONS as readonly number[]).includes(v))
    .catch(10_000),
  word: z
    .string()
    .regex(/^[a-zà-öø-ÿ']{2,40}$/)
    .optional()
    .catch(undefined),
});

export type DistinctiveParams = z.infer<typeof distinctiveSchema>;

export function parseDistinctiveParams(sp: RawSearchParams): DistinctiveParams {
  return distinctiveSchema.parse({
    a: first(sp.a) ?? "cycle-2016",
    b: first(sp.b) ?? "cycle-2024",
    prior: first(sp.prior) ?? 10_000,
    word: first(sp.word) || undefined,
  });
}

export const GRANULARITIES = ["month", "quarter", "year"] as const;

const timelineSchema = z.object({
  concept: z.string().regex(CONCEPT_SLUG_RE).optional().catch(undefined),
  term: z.string().trim().toLowerCase().max(40).optional().catch(undefined),
  speakers: z
    .string()
    .max(300)
    .transform((s) =>
      Array.from(new Set(s.split(",").filter((x) => /^[a-z0-9-]{1,80}$/.test(x)))).slice(0, 3),
    )
    .catch([]),
  by: z.enum(GRANULARITIES).catch("quarter"),
});

export type TimelineParams = z.infer<typeof timelineSchema>;

export function parseTimelineParams(sp: RawSearchParams): TimelineParams {
  return timelineSchema.parse({
    concept: first(sp.concept) || undefined,
    term: first(sp.term) || undefined,
    speakers: first(sp.speakers) ?? "",
    by: first(sp.by) ?? "quarter",
  });
}
