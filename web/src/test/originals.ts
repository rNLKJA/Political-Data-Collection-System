/**
 * Test-only helpers: load the original CSVs from ../original and open the
 * analytics database read-only. Parity suites skip themselves when the
 * originals are not present (e.g. a sparse checkout).
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import Papa from "papaparse";

export const ORIGINAL_DIR = path.resolve(process.cwd(), "..", "original");
export const DB_FILE = path.resolve(process.cwd(), "data", "analytics.db");

export function originalPath(name: string): string {
  return path.join(ORIGINAL_DIR, name);
}

export function hasOriginal(name: string): boolean {
  return fs.existsSync(originalPath(name));
}

const cache = new Map<string, Record<string, string>[]>();

/** Parse a CSV into rows of strings ("" for pandas NaN). */
export function readCsv(name: string): Record<string, string>[] {
  const hit = cache.get(name);
  if (hit) return hit;
  const text = fs.readFileSync(originalPath(name), "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    throw new Error(`CSV parse errors in ${name}: ${JSON.stringify(parsed.errors.slice(0, 3))}`);
  }
  cache.set(name, parsed.data);
  return parsed.data;
}

export function openAnalytics(): DatabaseSync {
  return new DatabaseSync(DB_FILE, { readOnly: true });
}
