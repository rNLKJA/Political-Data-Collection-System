import { blindRelabelCsv } from "@/lib/topics/relabel";

/** The blind coding sheet for the gold set (ids and excerpts only), built at build time. */
export function GET() {
  return new Response(blindRelabelCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="topic-gold-blind-relabel.csv"',
    },
  });
}
