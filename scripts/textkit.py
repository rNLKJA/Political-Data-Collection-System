"""Text utilities shared by the analytics build.

Every function here has a line-for-line TypeScript twin in
``web/src/lib/textkit.ts``; the vitest parity suite runs the TS version over
the original CSV and compares with the numbers this module wrote into
``analytics.db``. Keep the two in sync: no ``\\b``, ``\\s`` or IGNORECASE
shortcuts whose meaning differs between Python ``re`` and JavaScript.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Explicit whitespace class (Python ``\s`` and JS ``\s`` disagree on a few
# code points, so neither is used).
WS = "[ \\t\\n\\r\\f\\v\\u00a0]"

LETTER = "A-Za-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u00ff"
TOKEN_RE = re.compile(f"[{LETTER}]+(?:'[{LETTER}]+)*")

# The original notebook joined paragraphs with a literal backslash-n pair.
LITERAL_PARA_SEP = "\\n\\n"

STAGE_WORDS = (
    "applause|laughter|laughs|laughing|cheers|cheering|crosstalk|cross-talk|cross talk|"
    "inaudible|unintelligible|indiscernible|boos|booing|chanting|chants|audience|crowd|"
    "music|bell|bells|commercial break|break|begin video clip|end video clip|video clip|"
    "off-mike|off mike|interpreting|speaks spanish|in spanish|silence|pause|sic"
)
STAGE_RE = re.compile(
    f"[(\\[]{WS}*(?:{STAGE_WORDS})[^()\\[\\]]{{0,40}}[)\\]]",
    re.IGNORECASE,
)
CROSSTALK_RE = re.compile("[(\\[]" + WS + "*(?:crosstalk|cross-talk|cross talk)", re.IGNORECASE)

# A line-initial speaker label inside a document transcript, e.g. "THE VICE PRESIDENT:".
DOC_LABEL_RE = re.compile("^([A-Z][A-Z.'\\- ]{0,40}):" + WS + "*")

# Labels that are fields of a press release, not a change of speaker.
FIELD_LABEL_SET = frozenset(
    [
        "FACT", "FACTS", "TIME", "TIMES", "LOCATION", "LOCATIONS", "ADDRESS", "EVENT", "EVENTS",
        "DATE", "DATES", "WHEN", "WHERE", "WHO", "WHAT", "WHY", "HOW", "NOTE", "NOTES", "MYTH",
        "CLAIM", "REALITY", "TRUTH", "CONTACT", "RELEASE", "TITLE", "AD", "SCRIPT", "VIDEO",
        "AUDIO", "TEXT", "GRAPHIC", "NARRATOR", "ANNOUNCER", "VOICEOVER", "VO", "DOORS OPEN",
        "PROGRAM BEGINS", "PROGRAM START", "WATCH", "LIVESTREAM", "ON SCREEN", "ONSCREEN",
        "SUPER", "CHYRON", "FULL SCREEN", "LOWER THIRD", "TAGLINE", "PAID FOR BY",
        "MEDIA CONTACT", "PRESS CONTACT", "RSVP", "TITLE CARD", "DISCLAIMER", "UPDATE",
        "EDITOR'S NOTE", "BACKGROUND", "QUOTE", "HEADLINE", "SUBJECT", "TRANSCRIPT",
        "VOICE-OVER", "VOICE OVER",
    ]
)
OFFICE_LABELS = frozenset(
    [
        "THE PRESIDENT", "THE VICE PRESIDENT", "THE FORMER PRESIDENT", "PRESIDENT",
        "VICE PRESIDENT", "FORMER PRESIDENT", "THE FIRST LADY",
    ]
)

ABBREV_RE = re.compile(
    "(?<![A-Za-z])(Mr|Mrs|Ms|Dr|Jr|Sr|St|Sen|Gov|Rep|Gen|Lt|Col|Sgt|Capt|Mt|Ft|vs|etc|No|Inc|Co|Corp|Ltd|Messrs|Rev|Hon|Prof)\\."
)
INITIALS_RE = re.compile("(?<![A-Za-z])((?:[A-Za-z]\\.){2,})")
SINGLE_INITIAL_RE = re.compile("(?<![A-Za-z])([A-Z])\\.(?=" + WS + "+[A-Z])")
SENTENCE_END_RE = re.compile("[.!?]+(?=" + WS + "|[\"'\\u201d\\u2019)\\]]|$)")


def normalise_quotes(text: str) -> str:
    return text.replace("’", "'").replace("‘", "'")


@dataclass
class Token:
    text: str  # lower-cased
    start: int
    end: int


def tokenize(text: str) -> list[Token]:
    """Alphabetic word tokens (Latin-1 letters, internal apostrophes)."""
    norm = normalise_quotes(text)
    return [Token(m.group(0).lower(), m.start(), m.end()) for m in TOKEN_RE.finditer(norm)]


def words(text: str) -> list[str]:
    return [m.group(0).lower() for m in TOKEN_RE.finditer(normalise_quotes(text))]


def count_sentences(text: str) -> int:
    t = ABBREV_RE.sub(lambda m: m.group(1), text)
    t = INITIALS_RE.sub(lambda m: m.group(1).replace(".", ""), t)
    t = SINGLE_INITIAL_RE.sub(lambda m: m.group(1), t)
    return max(1, len(SENTENCE_END_RE.findall(t)))


_NON_ASCII_LOWER = re.compile("[^a-z]")
_SILENT_END = re.compile("(?:[^laeiouy]es|ed|[^laeiouy]e)$")
_LEADING_Y = re.compile("^y")
_VOWEL_GROUP = re.compile("[aeiouy]{1,2}")


def syllables(token: str) -> int:
    """Heuristic English syllable count for a lower-cased token."""
    w = _NON_ASCII_LOWER.sub("", token)
    if len(w) <= 3:
        return 1
    w = _SILENT_END.sub("", w)
    w = _LEADING_Y.sub("", w)
    return max(1, len(_VOWEL_GROUP.findall(w)))


@dataclass
class Readability:
    words: int
    sentences: int
    syllables: int
    grade: float | None  # Flesch-Kincaid grade level; None below MIN_WORDS


MIN_WORDS_FOR_GRADE = 100


def flesch_kincaid(text: str) -> Readability:
    toks = words(text)
    n = len(toks)
    s = count_sentences(text) if n else 0
    syl = sum(syllables(t) for t in toks)
    grade = None
    if n >= MIN_WORDS_FOR_GRADE:
        grade = 0.39 * (n / s) + 11.8 * (syl / n) - 15.59
    return Readability(n, s, syl, grade)


def strip_stage_directions(text: str) -> str:
    return STAGE_RE.sub(" ", text)


def owner_surname(speaker: str) -> str:
    """'Joseph R. Biden, Jr.' -> 'BIDEN'; 'Donald J. Trump (1st Term)' -> 'TRUMP'."""
    s = re.sub("\\([^)]*\\)", "", speaker)
    s = re.sub(",[^,]*$", "", s) if re.search(", (?:Jr|Sr|II|III)\\.?$", s.strip()) else s
    parts = [p for p in s.strip().split(" ") if p]
    return parts[-1].upper() if parts else ""


@dataclass
class CleanResult:
    text: str
    kept_paragraphs: int
    dropped_paragraphs: int
    dropped_labels: list[str]


def clean_document(content: str, speaker: str) -> CleanResult:
    """Paragraphs of a stored document that belong to its own speaker.

    Paragraphs are separated by the literal backslash-n pair. A line-initial
    upper-case label ("ROGAN:") switches the current speaker until the next
    label. Labels naming the document's speaker, an office the speaker held
    ("THE VICE PRESIDENT") or a press-release field ("FACT", "TIME") keep the
    text; any other label (interviewers, audience, moderators) drops it.
    Stage directions such as "(Applause.)" are removed.
    """
    if not content:
        return CleanResult("", 0, 0, [])
    surname = owner_surname(speaker)
    keep = True
    kept: list[str] = []
    dropped = 0
    dropped_labels: list[str] = []
    for para in content.split(LITERAL_PARA_SEP):
        m = DOC_LABEL_RE.match(para)
        body = para
        if m:
            label = m.group(1).strip()
            if label in FIELD_LABEL_SET:
                pass  # a field of the release, not a new speaker
            else:
                keep = (
                    (surname != "" and surname in label)
                    or label in OFFICE_LABELS
                )
                body = para[m.end():]
                if not keep:
                    dropped_labels.append(label)
        if keep:
            kept.append(strip_stage_directions(body))
        else:
            dropped += 1
    return CleanResult("\n".join(kept), len(kept), dropped, dropped_labels)


# ---------------------------------------------------------------------------
# Controlled vocabulary for the term timeline.
# Each concept is a list of token sequences; a match is any sequence. Words are
# compared lower-cased, except that a pattern word starting with a capital
# letter only matches a source word that also starts with one.
# Chosen to cover policy areas both major parties campaign on, plus both party
# names, so no side is privileged. The two party topics are defined the same
# way: the party's noun and its party adjective, counted only when capitalised
# (Democrat, Democrats, Democratic; Republican, Republicans). Capitalisation
# separates the parties from the generic words "democratic" ("democratic
# values") and "republican", which are left out for both.
# ---------------------------------------------------------------------------
CONCEPTS: list[tuple[str, str, list[str]]] = [
    ("economy", "Economy", ["economy", "economic", "economies"]),
    ("jobs", "Jobs", ["job", "jobs"]),
    ("inflation", "Inflation", ["inflation"]),
    ("taxes", "Taxes", ["tax", "taxes", "taxpayer", "taxpayers"]),
    ("wages", "Wages", ["wage", "wages", "minimum wage"]),
    ("middle-class", "Middle class", ["middle class"]),
    ("debt", "Debt and deficit", ["debt", "deficit", "deficits"]),
    ("trade", "Trade and tariffs", ["trade", "tariff", "tariffs"]),
    ("manufacturing", "Manufacturing", ["manufacturing"]),
    ("energy", "Energy", ["energy"]),
    ("climate", "Climate", ["climate"]),
    ("health-care", "Health care", ["health care", "healthcare", "health insurance"]),
    ("medicare", "Medicare", ["medicare"]),
    ("social-security", "Social Security", ["social security"]),
    ("education", "Education", ["education", "school", "schools", "teachers"]),
    ("housing", "Housing", ["housing"]),
    ("infrastructure", "Infrastructure", ["infrastructure"]),
    ("immigration", "Immigration", ["immigration", "immigrant", "immigrants"]),
    ("border", "Border", ["border", "borders"]),
    ("crime", "Crime", ["crime", "crimes", "criminal", "criminals"]),
    ("police", "Police", ["police", "policing", "law enforcement"]),
    ("guns", "Guns", ["gun", "guns", "firearm", "firearms", "second amendment"]),
    ("abortion", "Abortion", ["abortion", "abortions"]),
    ("opioids", "Opioids and fentanyl", ["opioid", "opioids", "fentanyl"]),
    ("covid", "COVID-19 and pandemic", ["covid", "coronavirus", "pandemic"]),
    ("veterans", "Veterans", ["veteran", "veterans"]),
    ("military", "Military", ["military"]),
    ("terrorism", "Terrorism", ["terror", "terrorism", "terrorist", "terrorists", "isis"]),
    ("china", "China", ["china", "chinese"]),
    ("russia", "Russia", ["russia", "russian", "putin"]),
    ("ukraine", "Ukraine", ["ukraine", "ukrainian"]),
    ("israel", "Israel", ["israel", "israeli"]),
    ("iran", "Iran", ["iran", "iranian"]),
    ("democracy", "Democracy", ["democracy"]),
    ("freedom", "Freedom and liberty", ["freedom", "freedoms", "liberty"]),
    ("constitution", "Constitution", ["constitution", "constitutional"]),
    ("supreme-court", "Supreme Court", ["supreme court"]),
    ("corruption", "Corruption", ["corruption", "corrupt"]),
    ("families", "Families", ["family", "families"]),
    ("women", "Women", ["women"]),
    ("children", "Children", ["child", "children", "kids"]),
    ("faith", "Faith", ["faith"]),
    ("democrats", "Democrats (party)", ["Democrat", "Democrats", "Democratic"]),
    ("republicans", "Republicans (party)", ["Republican", "Republicans"]),
]


def concept_patterns() -> list[tuple[int, list[list[str]]]]:
    return [(i, [p.split(" ") for p in pats]) for i, (_, _, pats) in enumerate(CONCEPTS)]


def starts_upper(word: str) -> bool:
    return word[:1] != word[:1].lower()


def match_concepts(
    tokens: list[str], cased: list[str] | None = None
) -> dict[int, list[tuple[int, int]]]:
    """Return {concept_index: [(token_start, token_len), ...]} (non-overlapping per concept).

    ``tokens`` are lower-cased; ``cased`` holds the same tokens as spelled in the
    source. A capitalised pattern word needs a capitalised source word, so it
    never matches without ``cased``.
    """
    out: dict[int, list[tuple[int, int]]] = {}
    pats = concept_patterns()
    n = len(tokens)
    for ci, seqs in pats:
        lowered = [(seq, [w.lower() for w in seq]) for seq in seqs]
        hits: list[tuple[int, int]] = []
        i = 0
        while i < n:
            matched = 0
            for seq, low in lowered:
                L = len(seq)
                if (
                    i + L <= n
                    and tokens[i] == low[0]
                    and tokens[i : i + L] == low
                    and all(
                        not starts_upper(w) or (cased is not None and starts_upper(cased[i + k]))
                        for k, w in enumerate(seq)
                    )
                ):
                    matched = max(matched, L)
            if matched:
                hits.append((i, matched))
                i += matched
            else:
                i += 1
        if hits:
            out[ci] = hits
    return out


STOPWORDS = frozenset(
    """a about above after again against all am an and any are aren't as at be because been before
being below between both but by can can't cannot could couldn't did didn't do does doesn't doing
don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll
he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it
it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our
ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than
that that's the their theirs them themselves then there there's these they they'd they'll they're
they've this those through to too under until up very was wasn't we we'd we'll we're we've were
weren't what what's when when's where where's which while who who's whom why why's with won't would
wouldn't you you'd you'll you're you've your yours yourself yourselves also just will said says say
one two us like get got going go know think well yes oh mr mrs ms re ve ll t s d m don isn
""".split()
)
