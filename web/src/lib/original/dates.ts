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
 * Python's `datetime.fromisoformat`, `strptime` and `strftime` are emulated for
 * the formats these functions use.
 */

import { pyStrip } from "@/lib/py";

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
  /** UTC offset in seconds, or null for a naive datetime. */
  offsetSeconds: number | null;
}

class PyValueError extends Error {}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function checkDate(year: number, month: number, day: number): void {
  if (year < 1 || year > 9999) throw new PyValueError("year out of range");
  if (month < 1 || month > 12) throw new PyValueError("month must be in 1..12");
  if (day < 1 || day > daysInMonth(year, month)) throw new PyValueError("day is out of range");
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[\s\S](\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d{1,6}))?)?)?(?:(Z)|([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?)?)?$/;

/** Python 3.11+ `datetime.fromisoformat` for the common extended formats. */
export function fromIsoFormat(s: string): PyDateTime {
  const m = ISO_RE.exec(s);
  if (!m) throw new PyValueError(`Invalid isoformat string: '${s}'`);
  const [, y, mo, d, hh, mi, ss, frac, z, sign, oh, om, os] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  checkDate(year, month, day);
  const hour = hh ? Number(hh) : 0;
  const minute = mi ? Number(mi) : 0;
  const second = ss ? Number(ss) : 0;
  if (hour > 23 || minute > 59 || second > 59) throw new PyValueError("time out of range");
  const microsecond = frac ? Number(frac.padEnd(6, "0")) : 0;
  let offsetSeconds: number | null = null;
  if (z) offsetSeconds = 0;
  else if (sign) {
    const total = Number(oh) * 3600 + Number(om) * 60 + (os ? Number(os) : 0);
    offsetSeconds = sign === "-" ? -total : total;
  }
  return { year, month, day, hour, minute, second, microsecond, offsetSeconds };
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
  if (dt.offsetSeconds !== null) {
    const sign = dt.offsetSeconds < 0 ? "-" : "+";
    const abs = Math.abs(dt.offsetSeconds);
    out += `${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}`;
    if (abs % 60) out += `:${pad(abs % 60)}`;
  }
  return out;
}

// Regex fragments copied from CPython's _strptime.TimeRE.
const STRPTIME_PARTS: Record<string, string> = {
  "%Y": "(?<Y>\\d\\d\\d\\d)",
  "%m": "(?<m>1[0-2]|0[1-9]|[1-9])",
  "%d": "(?<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])",
  "%B": `(?<B>${MONTHS.map((m) => m.toLowerCase()).join("|")})`,
};

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
      pattern += "\\s+";
      while (i + 1 < format.length && /\s/.test(format[i + 1])) i++;
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  const re = new RegExp(`^(?:${pattern})`, "i");
  const m = re.exec(s);
  if (!m || m[0].length !== s.length) {
    throw new PyValueError(`time data '${s}' does not match format '${format}'`);
  }
  const g = m.groups ?? {};
  const year = g.Y ? Number(g.Y) : 1900;
  const month = g.B
    ? MONTHS.findIndex((x) => x.toLowerCase() === g.B.toLowerCase()) + 1
    : g.m
      ? Number(g.m)
      : 1;
  const day = g.d ? Number(g.d.trim()) : 1;
  checkDate(year, month, day);
  return {
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    microsecond: 0,
    offsetSeconds: null,
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
