/**
 * Small Python built-ins re-implemented with Python semantics.
 *
 * The ports in `lib/original` must produce byte-identical output to the
 * notebooks, and JavaScript's `trim()` / `\s` disagree with Python's
 * `str.strip()` / `str.split()` on a handful of code points (U+001C-U+001F,
 * U+0085 and U+FEFF). Everything here follows CPython's `str.isspace()`.
 */

/** Character class body for Python's Unicode whitespace (`str.isspace()`). */
export const PY_WS_CLASS =
  "\\t\\n\\x0b\\x0c\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/** Equivalent of Python's `\s` in a `str` regular expression. */
export const PY_WS = `[${PY_WS_CLASS}]`;

const WS_SET = new Set<number>([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
  0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000,
]);

export function isPySpace(ch: string): boolean {
  return WS_SET.has(ch.charCodeAt(0));
}

function makePredicate(chars?: string): (ch: string) => boolean {
  if (chars === undefined) return isPySpace;
  const set = new Set(chars.split(""));
  return (ch) => set.has(ch);
}

/** Python `s.strip(chars)`. */
export function pyStrip(s: string, chars?: string): string {
  const drop = makePredicate(chars);
  let start = 0;
  let end = s.length;
  while (start < end && drop(s[start])) start++;
  while (end > start && drop(s[end - 1])) end--;
  return s.slice(start, end);
}

/** Python `s.rstrip(chars)`. */
export function pyRstrip(s: string, chars?: string): string {
  const drop = makePredicate(chars);
  let end = s.length;
  while (end > 0 && drop(s[end - 1])) end--;
  return s.slice(0, end);
}

/** Python `s.split()` with no arguments: split on whitespace runs, drop empties. */
export function pySplit(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of s) {
    if (isPySpace(ch)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}
