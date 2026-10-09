/**
 * Date normalisation from the August 2025 notebooks, ported to TypeScript.
 *
 * Three functions in the original code touch dates:
 *
 * - `CampaignDocumentsScraper.parse_date` (documents.ipynb, phase 1) turns the
 *   listing page's ISO `content` attribute into "September 29, 2024".
 * - `OptimizedDocumentExtractor._parse_date` (documents.ipynb, phase 2) turns a
 *   document page's date into an ISO timestamp, trying four formats.
 * - `scrape_debates_data` (debates.ipynb) applies the same ISO-to-"%B %d, %Y"
 *   conversion to the debate listing.
 *
 * Python 3.11's `datetime.fromisoformat` is ported in full (checked against
 * CPython on a few thousand generated strings); `strptime` and `strftime` are
 * emulated for the formats these functions use.
 */

import { PY_WS, pyStrip } from "@/lib/py";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface PyDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
  /** UTC offset in microseconds, or null for a naive datetime. */
  offsetMicros: number | null;
}

class PyValueError extends Error {}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function checkDate(year: number, month: number, day: number): void {
  if (!(year >= 1 && year <= 9999)) throw new PyValueError("year out of range");
  if (!(month >= 1 && month <= 12)) throw new PyValueError("month must be in 1..12");
  if (!(day >= 1 && day <= daysInMonth(year, month))) {
    throw new PyValueError("day is out of range");
  }
}

// Proleptic Gregorian ordinals, 0001-01-01 = 1 (CPython's ymd_to_ord / ord_to_ymd).
const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function daysBeforeYear(year: number): number {
  const y = year - 1;
  return y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
}

function ymdToOrd(year: number, month: number, day: number): number {
  return (
    daysBeforeYear(year) + DAYS_BEFORE_MONTH[month] + (month > 2 && isLeap(year) ? 1 : 0) + day
  );
}

function ordToYmd(ordinal: number): [number, number, number] {
  // CPython's _ord2ymd, with floor division.
  let n = ordinal - 1;
  const n400 = Math.floor(n / 146097);
  n -= n400 * 146097;
  const n100 = Math.floor(n / 36524);
  n -= n100 * 36524;
  const n4 = Math.floor(n / 1461);
  n -= n4 * 1461;
  const n1 = Math.floor(n / 365);
  n -= n1 * 365;
  const year = n400 * 400 + 1 + n100 * 100 + n4 * 4 + n1;
  if (n1 === 4 || n100 === 4) return [year - 1, 12, 31];
  const leap = n1 === 3 && (n4 !== 24 || n100 === 3);
  let month = (n + 50) >> 5;
  let preceding = DAYS_BEFORE_MONTH[month] + (month > 2 && leap ? 1 : 0);
  if (preceding > n) {
    month -= 1;
    preceding -=
      [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] + (month === 2 && leap ? 1 : 0);
  }
  return [year, month, n - preceding + 1];
}

/** CPython iso_to_ymd: ISO year, week and weekday to a calendar date. */
function isoToYmd(isoYear: number, week: number, weekday: number): [number, number, number] {
  if (week <= 0 || week >= 53) {
    let outOfRange = true;
    if (week === 53) {
      const firstWeekday = (ymdToOrd(isoYear, 1, 1) + 6) % 7;
      if (firstWeekday === 3 || (firstWeekday === 2 && isLeap(isoYear))) outOfRange = false;
    }
    if (outOfRange) throw new PyValueError(`Invalid week: ${week}`);
  }
  if (weekday <= 0 || weekday >= 8) throw new PyValueError(`Invalid weekday: ${weekday}`);
  const firstDay = ymdToOrd(isoYear, 1, 1);
  const firstWeekday = (firstDay + 6) % 7;
  let week1Monday = firstDay - firstWeekday;
  if (firstWeekday > 3) week1Monday += 7;
  return ordToYmd(week1Monday + (week - 1) * 7 + weekday - 1);
}

/*
 * datetime.fromisoformat as implemented in C by CPython 3.11
 * (Modules/_datetimemodule.c), which is what the notebooks ran. It works on
 * the UTF-8 bytes of the string; a position past the end reads as NUL, as in C.
 * The separator may be any single character, including a non-ASCII one.
 */
const NUL = 0;
const ch = (c: string) => c.charCodeAt(0);
const [DASH, COLON, DOT, COMMA, PLUS, W, Z] = ["-", ":", ".", ",", "+", "W", "Z"].map(ch);
const isDigit = (b: number) => b >= 48 && b <= 57;

class Bytes {
  constructor(readonly b: Uint8Array) {}
  at(i: number): number {
    return i < this.b.length ? this.b[i] : NUL;
  }
}

/** parse_digits: read exactly n ASCII digits at i; returns [value, next] or null. */
function digits(s: Bytes, i: number, n: number): [number, number] | null {
  let v = 0;
  for (let k = 0; k < n; k++) {
    const b = s.at(i + k);
    if (!isDigit(b)) return null;
    v = v * 10 + (b - 48);
  }
  return [v, i + n];
}

function findSeparator(s: Bytes, len: number): number {
  if (len === 7) return 7;
  if (s.at(4) === DASH) {
    if (s.at(5) === W) {
      if (len < 8) return -1;
      if (len > 8 && s.at(8) === DASH) {
        if (len === 9) return -1;
        if (len > 10 && isDigit(s.at(10))) return 8;
        return 10;
      }
      return 8;
    }
    return 10;
  }
  if (s.at(4) === W) {
    let idx = 7;
    while (idx < len && isDigit(s.at(idx))) idx++;
    if (idx < 9) return idx;
    return idx % 2 === 0 ? 7 : 8;
  }
  return 8;
}

function parseIsoDate(s: Bytes, len: number): [number, number, number] {
  const fail = () => new PyValueError("Invalid isoformat date");
  let r = digits(s, 0, 4);
  if (!r) throw fail();
  const year = r[0];
  let p = r[1];
  const usesSep = s.at(p) === DASH;
  if (usesSep) p++;
  if (s.at(p) === W) {
    p++;
    r = digits(s, p, 2);
    if (!r) throw fail();
    const week = r[0];
    p = r[1];
    let weekday = 1;
    if (p < len) {
      if (usesSep && s.at(p++) !== DASH) throw fail();
      r = digits(s, p, 1);
      if (!r) throw fail();
      weekday = r[0];
    }
    return isoToYmd(year, week, weekday);
  }
  r = digits(s, p, 2);
  if (!r) throw fail();
  const month = r[0];
  p = r[1];
  if (usesSep && s.at(p++) !== DASH) throw fail();
  r = digits(s, p, 2);
  if (!r) throw fail();
  return [year, month, r[0]];
}

/** parse_hh_mm_ss_ff over [start, end): returns the fields and 0 (done) or 1 (more follows). */
function parseHhMmSsFf(s: Bytes, start: number, end: number): [number[], 0 | 1] {
  const fail = () => new PyValueError("Invalid isoformat time");
  const vals = [0, 0, 0];
  let p = start;
  let hasSep = true;
  let i = 0;
  for (; i < 3; i++) {
    const r = digits(s, p, 2);
    if (!r) throw fail();
    vals[i] = r[0];
    p = r[1];
    const c = s.at(p++);
    if (i === 0) hasSep = c === COLON;
    if (p >= end) return [[...vals, 0], c !== NUL ? 1 : 0];
    if (hasSep && c === COLON) continue;
    if (c === DOT || c === COMMA) break;
    if (!hasSep) {
      p--;
      continue;
    }
    throw fail();
  }
  const remains = end - p;
  const toParse = Math.min(remains, 6);
  const r = digits(s, p, toParse);
  if (!r) throw fail();
  let micro = r[0];
  p = r[1];
  if (toParse < 6) micro *= [100000, 10000, 1000, 100, 10][toParse - 1];
  while (isDigit(s.at(p))) p++;
  return [[...vals, micro], s.at(p) !== NUL ? 1 : 0];
}

function parseIsoTime(
  s: Bytes,
  start: number,
  len: number,
): { time: number[]; offsetMicros: number | null } {
  const fail = () => new PyValueError("Invalid isoformat time");
  let tz = start;
  do {
    const b = s.at(tz);
    if (b === Z || b === PLUS || b === DASH) break;
  } while (++tz < len);
  const [time, more] = parseHhMmSsFf(s, start, tz);
  if (tz === len) {
    if (more) throw fail();
    return { time, offsetMicros: null };
  }
  if (s.at(tz) === Z) {
    if (s.at(tz + 1) !== NUL) throw fail();
    return { time, offsetMicros: 0 };
  }
  const sign = s.at(tz) === DASH ? -1 : 1;
  const [[th, tm, ts, tus], rest] = parseHhMmSsFf(s, tz + 1, len);
  if (rest) throw fail();
  const seconds = th * 3600 + tm * 60 + ts;
  // tzinfo_from_isoformat_results: a whole-second offset of 0 is UTC, even
  // when a fraction of a second follows.
  const offsetMicros = seconds === 0 ? 0 : sign * (seconds * 1_000_000 + tus);
  return { time, offsetMicros };
}

/** Python 3.11 `datetime.fromisoformat` (the C implementation). */
export function fromIsoFormat(str: string): PyDateTime {
  const invalid = () => new PyValueError(`Invalid isoformat string: '${str}'`);
  // CPython only accepts a lone surrogate as the separator; such strings cannot
  // be UTF-8 encoded otherwise.
  if (/[\uD800-\uDFFF]/.test(str)) throw invalid();
  const s = new Bytes(new TextEncoder().encode(str));
  const len = s.b.length;
  if ([...str].length < 7) throw invalid();
  const sep = findSeparator(s, len);
  if (sep < 0) throw invalid();
  let year: number, month: number, day: number;
  try {
    [year, month, day] = parseIsoDate(s, sep);
  } catch {
    throw invalid();
  }
  let time = [0, 0, 0, 0];
  let offsetMicros: number | null = null;
  if (len > sep) {
    // Skip the whole separator character (1 to 4 UTF-8 bytes).
    const lead = s.at(sep);
    const width = lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
    try {
      ({ time, offsetMicros } = parseIsoTime(s, sep + width, len));
    } catch {
      throw invalid();
    }
  }
  const [hour, minute, second, microsecond] = time;
  checkDate(year, month, day);
  if (hour > 23) throw new PyValueError("hour must be in 0..23");
  if (minute > 59) throw new PyValueError("minute must be in 0..59");
  if (second > 59) throw new PyValueError("second must be in 0..59");
  if (offsetMicros !== null && Math.abs(offsetMicros) >= 86_400_000_000) {
    throw new PyValueError("offset must be a timedelta strictly between -24h and 24h");
  }
  return { year, month, day, hour, minute, second, microsecond, offsetMicros };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** `strftime("%B %d, %Y")`. */
export function strftimeLong(dt: PyDateTime): string {
  return `${MONTHS[dt.month - 1]} ${pad(dt.day)}, ${pad(dt.year, 4)}`;
}

/** `datetime.isoformat()`. */
export function isoformat(dt: PyDateTime): string {
  let out = `${pad(dt.year, 4)}-${pad(dt.month)}-${pad(dt.day)}T${pad(dt.hour)}:${pad(dt.minute)}:${pad(dt.second)}`;
  if (dt.microsecond) out += `.${pad(dt.microsecond, 6)}`;
  if (dt.offsetMicros !== null) {
    const sign = dt.offsetMicros < 0 ? "-" : "+";
    const abs = Math.abs(dt.offsetMicros);
    const secs = Math.floor(abs / 1_000_000);
    const micros = abs % 1_000_000;
    out += `${sign}${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}`;
    if (secs % 60 || micros) {
      out += `:${pad(secs % 60)}`;
      if (micros) out += `.${pad(micros, 6)}`;
    }
  }
  return out;
}

// Regex fragments copied from CPython's _strptime.TimeRE. Python's `\d` matches
// any Unicode decimal digit (and int() reads them), so `\p{Nd}` stands in for it.
const STRPTIME_PARTS: Record<string, string> = {
  "%Y": "(?<Y>\\p{Nd}\\p{Nd}\\p{Nd}\\p{Nd})",
  "%m": "(?<m>1[0-2]|0[1-9]|[1-9])",
  "%d": "(?<d>3[01]|[12]\\p{Nd}|0[1-9]|[1-9]| [1-9])",
  "%B": `(?<B>${MONTHS.map((m) => m.toLowerCase()).join("|")})`,
};

const ND = /\p{Nd}/u;

/** Python int() over a run of Unicode decimal digits (after str.strip()). */
function pyInt(text: string): number {
  let v = 0;
  for (const c of pyStrip(text)) {
    const cp = c.codePointAt(0)!;
    // Unicode keeps every decimal digit set as a contiguous run starting at 0.
    let start = cp;
    while (start > 0 && ND.test(String.fromCodePoint(start - 1))) start--;
    v = v * 10 + ((cp - start) % 10);
  }
  return v;
}

/** Python `datetime.strptime` for formats built from %Y %m %d %B and literals. */
export function strptime(s: string, format: string): PyDateTime {
  let pattern = "";
  for (let i = 0; i < format.length; i++) {
    const ch = format[i];
    if (ch === "%") {
      const directive = format.slice(i, i + 2);
      const part = STRPTIME_PARTS[directive];
      if (!part) throw new Error(`unsupported directive ${directive}`);
      pattern += part;
      i++;
    } else if (/\s/.test(ch)) {
      pattern += `${PY_WS}+`;
      while (i + 1 < format.length && /\s/.test(format[i + 1])) i++;
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  const re = new RegExp(`^(?:${pattern})`, "iu");
  const m = re.exec(s);
  if (!m || m[0].length !== s.length) {
    throw new PyValueError(`time data '${s}' does not match format '${format}'`);
  }
  const g = m.groups ?? {};
  const year = g.Y ? pyInt(g.Y) : 1900;
  const month = g.B
    ? MONTHS.findIndex((x) => new RegExp(`^${x}$`, "iu").test(g.B)) + 1
    : g.m
      ? pyInt(g.m)
      : 1;
  const day = g.d ? pyInt(g.d) : 1;
  checkDate(year, month, day);
  return {
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    microsecond: 0,
    offsetMicros: null,
  };
}

/**
 * documents.ipynb `CampaignDocumentsScraper.parse_date` (listing phase).
 * Returns `null` for an empty input, like the original's `None`.
 */
export function parseListingDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  try {
    if (dateString.includes("T")) {
      return strftimeLong(fromIsoFormat(dateString.replaceAll("Z", "+00:00")));
    }
    return strftimeLong(strptime(dateString, "%Y-%m-%d"));
  } catch {
    return pyStrip(dateString);
  }
}

export const DOCUMENT_DATE_FORMATS = ["%B %d, %Y", "%m/%d/%Y", "%Y-%m-%d", "%d %B %Y"] as const;

/** documents.ipynb `OptimizedDocumentExtractor._parse_date` (content phase). */
export function normaliseDocumentDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    if (dateString.includes("T") && dateString.includes("+")) {
      return isoformat(fromIsoFormat(dateString.replaceAll("Z", "+00:00")));
    }
    for (const fmt of DOCUMENT_DATE_FORMATS) {
      try {
        return isoformat(strptime(dateString, fmt));
      } catch {
        continue;
      }
    }
    return dateString;
  } catch {
    return dateString;
  }
}

/**
 * debates.ipynb `scrape_debates_data`: the `dc:date` span's ISO `content`
 * becomes "%B %d, %Y"; if that fails (or there is no content) the span's text
 * is used.
 */
export function normaliseDebateListingDate(content: string | null, spanText: string): string {
  if (content) {
    try {
      return strftimeLong(fromIsoFormat(content.replaceAll("Z", "+00:00")));
    } catch {
      return pyStrip(spanText);
    }
  }
  return pyStrip(spanText);
}
