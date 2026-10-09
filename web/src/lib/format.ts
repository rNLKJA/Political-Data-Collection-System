const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
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

const intFmt = new Intl.NumberFormat("en-AU");

export function formatInt(n: number): string {
  return intFmt.format(Math.round(n));
}

/** Fixed decimals with a typographic minus sign (U+2212), and no "−0.0". */
export function formatDecimal(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const s = n.toFixed(digits);
  if (/^-0(\.0*)?$/.test(s)) return s.slice(1);
  return s.replace("-", "\u2212");
}

/** "+0.12" / "−0.75" / "0.00": an explicit sign for differences and slopes. */
export function formatSigned(n: number | null | undefined, digits = 1): string {
  const s = formatDecimal(n, digits);
  return n !== null && n !== undefined && !Number.isNaN(n) && n > 0 && !/^0(\.0*)?$/.test(s)
    ? `+${s}`
    : s;
}

export function formatPercent(share: number, digits = 1): string {
  if (Number.isNaN(share)) return "–";
  return `${(share * 100).toFixed(digits)}%`;
}

/** 4,534,052 -> "4.5M"; 43,662 -> "43.7K". */
export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return formatInt(n);
}

/** "2024-09-29" -> "29 Sep 2024" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return d ? `${d} ${MONTHS_SHORT[m - 1]} ${y}` : `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "2024-09-29" -> "29 September 2024" */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return d ? `${d} ${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "2024-09" -> "Sep 2024" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}
