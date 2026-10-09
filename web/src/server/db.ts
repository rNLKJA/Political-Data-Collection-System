import "server-only";

import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/**
 * The read-only analytics database built by scripts/build_analytics.py.
 * It is bundled with every server function (see outputFileTracingIncludes in
 * next.config.ts) and opened once per process.
 */
export const DB_PATH = path.join(process.cwd(), "data", "analytics.db");

const globalForDb = globalThis as unknown as { __ctlDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__ctlDb) {
    globalForDb.__ctlDb = new DatabaseSync(DB_PATH, { readOnly: true });
  }
  return globalForDb.__ctlDb;
}

// node:sqlite returns null-prototype rows; React refuses to pass those to
// Client Components, so copy them into plain objects.
export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return getDb()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row })) as T[];
}

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  const row = getDb()
    .prepare(sql)
    .get(...params);
  return row ? ({ ...row } as T) : undefined;
}
