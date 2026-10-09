/**
 * Tokeniser, document cleaning and Flesch-Kincaid readability.
 *
 * TypeScript twin of `scripts/textkit.py`, which built the numbers in
 * `analytics.db`. The parity suite recomputes every document's token,
 * sentence and syllable counts here and compares them with the database.
 * Regexes avoid `\b`, `\s` and case-insensitive classes whose meaning differs
 * between Python and JavaScript.
 */

const WS = "[ \\t\\n\\r\\f\\v\\u00a0]";
const LETTER = "A-Za-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u00ff";
const TOKEN_SOURCE = `[${LETTER}]+(?:'[${LETTER}]+)*`;

export const LITERAL_PARA_SEP = "\\n\\n";

const STAGE_WORDS =
  "applause|laughter|laughs|laughing|cheers|cheering|crosstalk|cross-talk|cross talk|" +
  "inaudible|unintelligible|indiscernible|boos|booing|chanting|chants|audience|crowd|" +
  "music|bell|bells|commercial break|break|begin video clip|end video clip|video clip|" +
  "off-mike|off mike|interpreting|speaks spanish|in spanish|silence|pause|sic";
const STAGE_SOURCE = `[(\\[]${WS}*(?:${STAGE_WORDS})[^()\\[\\]]{0,40}[)\\]]`;
const DOC_LABEL_RE = new RegExp(`^([A-Z][A-Z.'\\- ]{0,40}):${WS}*`);

export const FIELD_LABELS: ReadonlySet<string> = new Set([
  "FACT", "FACTS", "TIME", "TIMES", "LOCATION", "LOCATIONS", "ADDRESS", "EVENT", "EVENTS",
  "DATE", "DATES", "WHEN", "WHERE", "WHO", "WHAT", "WHY", "HOW", "NOTE", "NOTES", "MYTH",
  "CLAIM", "REALITY", "TRUTH", "CONTACT", "RELEASE", "TITLE", "AD", "SCRIPT", "VIDEO",
  "AUDIO", "TEXT", "GRAPHIC", "NARRATOR", "ANNOUNCER", "VOICEOVER", "VO", "DOORS OPEN",
  "PROGRAM BEGINS", "PROGRAM START", "WATCH", "LIVESTREAM", "ON SCREEN", "ONSCREEN",
  "SUPER", "CHYRON", "FULL SCREEN", "LOWER THIRD", "TAGLINE", "PAID FOR BY",
  "MEDIA CONTACT", "PRESS CONTACT", "RSVP", "TITLE CARD", "DISCLAIMER", "UPDATE",
  "EDITOR'S NOTE", "BACKGROUND", "QUOTE", "HEADLINE", "SUBJECT", "TRANSCRIPT",
  "VOICE-OVER", "VOICE OVER",
]); // prettier-ignore

export const OFFICE_LABELS: ReadonlySet<string> = new Set([
  "THE PRESIDENT",
  "THE VICE PRESIDENT",
  "THE FORMER PRESIDENT",
  "PRESIDENT",
  "VICE PRESIDENT",
  "FORMER PRESIDENT",
  "THE FIRST LADY",
]);

const ABBREV_RE =
  /(?<![A-Za-z])(Mr|Mrs|Ms|Dr|Jr|Sr|St|Sen|Gov|Rep|Gen|Lt|Col|Sgt|Capt|Mt|Ft|vs|etc|No|Inc|Co|Corp|Ltd|Messrs|Rev|Hon|Prof)\./g;
const INITIALS_RE = /(?<![A-Za-z])((?:[A-Za-z]\.){2,})/g;
const SINGLE_INITIAL_RE = new RegExp(`(?<![A-Za-z])([A-Z])\\.(?=${WS}+[A-Z])`, "g");
const SENTENCE_END_RE = new RegExp(`[.!?]+(?=${WS}|["'\\u201d\\u2019)\\]]|$)`, "g");

export interface Token {
  text: string;
  start: number;
  end: number;
}

export function normaliseQuotes(text: string): string {
  return text.replaceAll("’", "'").replaceAll("‘", "'");
}

/** Alphabetic word tokens (Latin-1 letters, internal apostrophes), lower-cased. */
export function tokenize(text: string): Token[] {
  const re = new RegExp(TOKEN_SOURCE, "g");
  const norm = normaliseQuotes(text);
  const out: Token[] = [];
  for (const m of norm.matchAll(re)) {
    out.push({ text: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function words(text: string): string[] {
  const re = new RegExp(TOKEN_SOURCE, "g");
  return Array.from(normaliseQuotes(text).matchAll(re), (m) => m[0].toLowerCase());
}

export function countSentences(text: string): number {
  let t = text.replace(ABBREV_RE, "$1");
  t = t.replace(INITIALS_RE, (_m, g: string) => g.replaceAll(".", ""));
  t = t.replace(SINGLE_INITIAL_RE, "$1");
  const n = t.match(SENTENCE_END_RE)?.length ?? 0;
  return Math.max(1, n);
}

/** Heuristic English syllable count for a lower-cased token. */
export function syllables(token: string): number {
  let w = token.replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");
  return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length ?? 0);
}

export const MIN_WORDS_FOR_GRADE = 100;

export interface Readability {
  words: number;
  sentences: number;
  syllables: number;
  /** Flesch-Kincaid grade level; null below {@link MIN_WORDS_FOR_GRADE} words. */
  grade: number | null;
}

export function fleschKincaid(text: string): Readability {
  const toks = words(text);
  const n = toks.length;
  const s = n ? countSentences(text) : 0;
  let syl = 0;
  for (const t of toks) syl += syllables(t);
  const grade = n >= MIN_WORDS_FOR_GRADE ? 0.39 * (n / s) + 11.8 * (syl / n) - 15.59 : null;
  return { words: n, sentences: s, syllables: syl, grade };
}

export function stripStageDirections(text: string): string {
  return text.replace(new RegExp(STAGE_SOURCE, "gi"), " ");
}

/** "Joseph R. Biden, Jr." -> "BIDEN"; "Donald J. Trump (1st Term)" -> "TRUMP". */
export function ownerSurname(speaker: string): string {
  let s = speaker.replace(/\([^)]*\)/g, "");
  if (/, (?:Jr|Sr|II|III)\.?$/.test(pyLikeStrip(s))) s = s.replace(/,[^,]*$/, "");
  const parts = pyLikeStrip(s)
    .split(" ")
    .filter((p) => p);
  return parts.length ? parts[parts.length - 1].toUpperCase() : "";
}

// Python's str.strip() for the plain ASCII names used here.
function pyLikeStrip(s: string): string {
  return s.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, "");
}

export interface CleanResult {
  text: string;
  keptParagraphs: number;
  droppedParagraphs: number;
  droppedLabels: string[];
}

/**
 * Paragraphs of a stored document that belong to its own speaker; see
 * `clean_document` in scripts/textkit.py for the rules.
 */
export function cleanDocument(content: string, speaker: string): CleanResult {
  if (!content) return { text: "", keptParagraphs: 0, droppedParagraphs: 0, droppedLabels: [] };
  const surname = ownerSurname(speaker);
  let keep = true;
  const kept: string[] = [];
  let dropped = 0;
  const droppedLabels: string[] = [];
  for (const para of content.split(LITERAL_PARA_SEP)) {
    const m = DOC_LABEL_RE.exec(para);
    let body = para;
    if (m) {
      const label = pyLikeStrip(m[1]);
      if (!FIELD_LABELS.has(label)) {
        keep = (surname !== "" && label.includes(surname)) || OFFICE_LABELS.has(label);
        body = para.slice(m[0].length);
        if (!keep) droppedLabels.push(label);
      }
    }
    if (keep) kept.push(stripStageDirections(body));
    else dropped++;
  }
  return {
    text: kept.join("\n"),
    keptParagraphs: kept.length,
    droppedParagraphs: dropped,
    droppedLabels,
  };
}

const startsUpper = (w: string) => w.slice(0, 1) !== w.slice(0, 1).toLowerCase();

/**
 * Concept patterns are lists of space-separated token sequences. `tokens` are
 * lower-cased; `cased` holds the same tokens as spelled in the source. Words are
 * compared lower-cased, but a pattern word starting with a capital ("Democratic")
 * only matches a source word that also starts with one, so without `cased` it
 * never matches. Mirrors `match_concepts` in `scripts/textkit.py`.
 */
export function matchConcept(
  tokens: string[],
  patterns: string[],
  cased?: string[],
): Array<[number, number]> {
  const seqs = patterns.map((p) => {
    const seq = p.split(" ");
    return { seq, low: seq.map((w) => w.toLowerCase()) };
  });
  const hits: Array<[number, number]> = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = 0;
    for (const { seq, low } of seqs) {
      const L = seq.length;
      if (i + L <= tokens.length && tokens[i] === low[0]) {
        let ok = true;
        for (let k = 0; k < L; k++) {
          const caseOk = !startsUpper(seq[k]) || (!!cased && startsUpper(cased[i + k] ?? ""));
          if (tokens[i + k] !== low[k] || !caseOk) {
            ok = false;
            break;
          }
        }
        if (ok) matched = Math.max(matched, L);
      }
    }
    if (matched) {
      hits.push([i, matched]);
      i += matched;
    } else i++;
  }
  return hits;
}

/**
 * Character ranges in `text` where a concept matches, merged with an optional
 * primary range (the stored highlight of a snippet) and sorted.
 */
export function conceptRanges(
  text: string,
  patterns: string[],
  primary?: [number, number],
): Array<[number, number]> {
  const toks = tokenize(text);
  const hits = matchConcept(
    toks.map((t) => t.text),
    patterns,
    toks.map((t) => text.slice(t.start, t.end)),
  );
  const ranges: Array<[number, number]> = hits.map(([ti, tl]) => [
    toks[ti].start,
    toks[ti + tl - 1].end,
  ]);
  if (primary && primary[1] > primary[0]) {
    const [a, b] = primary;
    const rest = ranges.filter(([s, e]) => e <= a || s >= b);
    return [...rest, primary].sort((x, y) => x[0] - y[0]);
  }
  return ranges;
}

/** Normalise a user-typed search term the same way the index was built. */
export function normaliseTerm(input: string): string {
  return words(input).join(" ");
}
