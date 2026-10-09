"""Turn segmentation for the stored debate transcripts.

The transcripts on The American Presidency Project use several conventions
across six decades, so a turn starts at any of:

* a bold/strong/italic label as the first thing in a paragraph or line
  (``<b>WALZ:</b>``, ``<strong>TRUMP</strong>:``, ``<i>The President.</i>``);
* a plain upper-case label ending in a colon (``MR. NIXON:``,
  ``HOWARD K. SMITH, MODERATOR:``) or a short title-case one (``Hal Bruno:``);
* in transcripts that use neither, a short name ending in a full stop
  (``Mr. Newman.``, ``THE MODERATOR.``, ``Jim Lehrer.``).

Lines (split at ``<br>``) with no label continue the current speaker. Labels
are reduced to a surname key ("Moderator Jim Lehrer" -> LEHRER); "THE
PRESIDENT" and "THE VICE PRESIDENT" are resolved to the office holder in that
year. A speaker is a *candidate* if the key is in the curated list of people
who took part in debates in that election cycle (``CANDIDATES`` below, public
record); every other named speaker is a moderator, panellist or questioner,
and audience members or unidentified voices are *other*.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

from textkit import CROSSTALK_RE, STAGE_RE, flesch_kincaid, strip_stage_directions, words

# People who took part as candidates in the debates held in each cycle
# (general-election, vice-presidential and primary debates in the dataset).
CANDIDATES: dict[int, set[str]] = {
    1960: {"KENNEDY", "NIXON"},
    1976: {"FORD", "CARTER", "DOLE", "MONDALE"},
    1980: {"CARTER", "REAGAN", "ANDERSON"},
    1984: {"REAGAN", "MONDALE", "BUSH", "FERRARO", "HART", "JACKSON"},
    1988: {"BUSH", "DUKAKIS", "QUAYLE", "BENTSEN"},
    1992: {"BUSH", "CLINTON", "PEROT", "GORE", "QUAYLE", "STOCKDALE"},
    1996: {
        "CLINTON", "DOLE", "GORE", "KEMP", "ALEXANDER", "BUCHANAN", "DORNAN", "FORBES",
        "GRAMM", "KEYES", "LUGAR", "TAYLOR",
    },
    2000: {
        "BUSH", "GORE", "CHENEY", "LIEBERMAN", "BRADLEY", "MCCAIN", "KEYES", "FORBES", "BAUER",
        "HATCH",
    },
    2004: {"BUSH", "KERRY", "CHENEY", "EDWARDS", "DEAN", "CLARK", "LIEBERMAN", "KUCINICH",
           "SHARPTON"},
    2008: {
        "OBAMA", "MCCAIN", "BIDEN", "PALIN", "CLINTON", "EDWARDS", "RICHARDSON", "DODD",
        "KUCINICH", "GRAVEL", "ROMNEY", "GIULIANI", "HUCKABEE", "THOMPSON", "PAUL",
        "BROWNBACK", "TANCREDO", "HUNTER", "GILMORE", "KEYES", "COX",
    },
    2012: {
        "OBAMA", "ROMNEY", "BIDEN", "RYAN", "GINGRICH", "SANTORUM", "PAUL", "PERRY",
        "BACHMANN", "CAIN", "HUNTSMAN", "PAWLENTY", "JOHNSON",
    },
    2016: {
        "TRUMP", "CLINTON", "PENCE", "KAINE", "CRUZ", "RUBIO", "KASICH", "CARSON", "BUSH",
        "CHRISTIE", "FIORINA", "PAUL", "HUCKABEE", "WALKER", "PERRY", "JINDAL", "SANTORUM",
        "GRAHAM", "PATAKI", "GILMORE", "SANDERS", "O'MALLEY", "WEBB", "CHAFEE",
    },
    2020: {
        "TRUMP", "BIDEN", "PENCE", "HARRIS", "SANDERS", "WARREN", "BUTTIGIEG", "KLOBUCHAR",
        "BOOKER", "YANG", "CASTRO", "O'ROURKE", "GABBARD", "STEYER", "BLOOMBERG", "BENNET",
        "BULLOCK", "BLASIO", "DELANEY", "GILLIBRAND", "HICKENLOOPER", "INSLEE", "RYAN",
        "SWALWELL", "WILLIAMSON",
    },
    2024: {
        "TRUMP", "BIDEN", "HARRIS", "VANCE", "WALZ", "DESANTIS", "HALEY", "RAMASWAMY",
        "CHRISTIE", "SCOTT", "PENCE", "BURGUM", "HUTCHINSON",
    },
}

# Office holders, used to resolve "THE PRESIDENT." / "THE VICE PRESIDENT." labels.
PRESIDENT = {1976: "FORD", 1980: "CARTER", 1984: "REAGAN", 1992: "BUSH", 1996: "CLINTON",
             2004: "BUSH", 2012: "OBAMA", 2020: "TRUMP", 2024: "BIDEN"}
VICE_PRESIDENT = {1980: "MONDALE", 1984: "BUSH", 1988: "BUSH", 1992: "QUAYLE", 1996: "GORE",
                  2000: "GORE", 2004: "CHENEY", 2012: "BIDEN", 2020: "PENCE", 2024: "HARRIS",
                  1960: "NIXON"}

HONORIFICS = {
    "MR", "MRS", "MS", "MISS", "DR", "SEN", "SENATOR", "GOV", "GOVERNOR", "PRESIDENT", "VICE",
    "FORMER", "FMR", "REP", "REPRESENTATIVE", "CONGRESSMAN", "CONGRESSWOMAN", "AMBASSADOR",
    "SECRETARY", "MAYOR", "GENERAL", "GEN", "ADMIRAL", "MODERATOR", "THE", "REVEREND", "REV",
    "BISHOP", "JUDGE", "LT", "COL", "MESSRS", "HON", "CO-MODERATOR", "PANELIST", "PANELLIST",
}
SUFFIXES = {"JR", "SR", "II", "III", "IV"}
OTHER_KEYS = {
    "AUDIENCE", "AUDIENCE MEMBER", "AUDIENCE MEMBERS", "UNIDENTIFIED", "UNIDENTIFIED MALE",
    "UNIDENTIFIED FEMALE", "UNIDENTIFIED SPEAKER", "UNKNOWN", "CROWD", "MEMBER OF AUDIENCE",
    "ANNOUNCER", "VOICE", "VOICES", "PARTICIPANTS", "CANDIDATES", "ALL", "SEVERAL",
    "UNIDENTIFIED PARTICIPANT", "UNIDENTIFIED CANDIDATE", "UNIDENTIFIED MODERATOR",
    "VIDEO", "VIDEO CLIP", "NARRATOR", "CROSSTALK", "MALE", "FEMALE", "PROTESTER",
    "PROTESTERS", "PROTESTOR", "PROTESTORS", "UNIDENTIFIABLE", "TRANSLATOR", "INTERPRETER",
}
MODERATOR_ROLE_KEYS = {"MODERATOR", "MODERATORS", "QUESTIONER", "QUESTION", "Q", "PANELIST",
                       "PANELISTS", "PANEL", "HOST"}
HEADER_LABELS = ("participants", "moderators", "moderator", "panelists", "panelist",
                 "questioners", "panel", "sponsor", "sponsors")

TAG_LABEL_NAMES = {"b", "strong", "i", "em"}
CAPS_COLON_RE = re.compile(r"^([A-Z][A-Za-z0-9 .,'\"\-&()/\[\]]{0,90}?):\s+(\S[\s\S]*)$")
TITLE_COLON_RE = re.compile(r"^([A-Z][a-z]+(?: [A-Z][a-z'\-]+){1,2}):\s+(\S[\s\S]*)$")
PERIOD_RE = re.compile(
    r"^((?:THE|The) (?:MODERATOR|Moderator|PRESIDENT|President|VICE PRESIDENT|Vice President)"
    r"|(?:MR|MRS|MS|MISS|DR|Mr|Mrs|Ms|Miss|Dr)\. ?[A-Z][A-Za-z'\-]+"
    r"|(?:Senator|Governor|President|Vice President|Congressman|Congresswoman|Representative"
    r"|Admiral|Secretary|Ambassador|Mayor|General|Moderator|Reverend"
    r"|SENATOR|GOVERNOR|PRESIDENT|VICE PRESIDENT|CONGRESSMAN|CONGRESSWOMAN|REPRESENTATIVE"
    r"|ADMIRAL|SECRETARY|AMBASSADOR|MAYOR|GENERAL|MODERATOR|REVEREND)(?: [A-Z][A-Za-z'\-]+){1,3}"
    r"|[A-Z][a-z]+ (?!(?:Mr|Mrs|Ms|Dr|Jr|Sr|St)\.)[A-Z][a-z'\-]+)\.\s+(\S[\s\S]*)$"
)
INTERRUPT_END_RE = re.compile(r"(?:--|—|–|-)\s*[\"'”]?\s*$")


def cycle_of(year: int) -> int:
    return year if year % 4 == 0 else year + (4 - year % 4)


def mostly_upper(label: str) -> bool:
    letters = [c for c in label if c.isalpha()]
    if len(letters) < 1:
        return False
    return sum(1 for c in letters if c.isupper()) / len(letters) >= 0.7


def speaker_key(label: str, year: int) -> str:
    l = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", label).strip().strip(":.").strip()
    l = l.split(",")[0].strip()
    toks = [t for t in re.split(r"[\s.]+", l.upper()) if t]
    joined = " ".join(toks)
    if joined in OTHER_KEYS or joined.startswith("UNIDENTIFIED") or joined.startswith("AUDIENCE"):
        return "AUDIENCE"
    if joined in ("THE PRESIDENT", "PRESIDENT", "MR PRESIDENT"):
        return PRESIDENT.get(cycle_of(year), "THE PRESIDENT")
    if joined in ("THE VICE PRESIDENT", "VICE PRESIDENT", "MR VICE PRESIDENT"):
        return VICE_PRESIDENT.get(cycle_of(year), "THE VICE PRESIDENT")
    if joined in MODERATOR_ROLE_KEYS or joined in ("THE MODERATOR", "CO-MODERATOR"):
        return "MODERATOR" if "MODERATOR" in joined else "QUESTIONER"
    toks = [re.sub(r"[^A-Z'\-]", "", t) for t in toks]
    toks = [t for t in toks if re.search("[A-Z]", t)]
    while toks and toks[0] in HONORIFICS:
        toks.pop(0)
    while toks and toks[-1] in SUFFIXES:
        toks.pop()
    if not toks:
        return "UNKNOWN"
    return toks[-1]


@dataclass
class Segment:
    label: str | None
    text: str


@dataclass
class Turn:
    key: str
    labels: list[str] = field(default_factory=list)
    texts: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.texts)


def _first_meaningful(node: Tag):
    for c in node.children:
        if isinstance(c, NavigableString) and not str(c).strip():
            continue
        return c
    return None


def _segments_of_paragraph(p: Tag) -> list[tuple[str | None, str, str]]:
    """Split a <p> at <br> into lines; return (tag_label, rest_text, full_text) per line."""
    inner = p.decode_contents()
    pieces = re.split(r"<br\s*/?>", inner, flags=re.IGNORECASE)
    out = []
    for piece in pieces:
        frag = BeautifulSoup(piece, "html.parser")
        full = frag.get_text(" ").strip()
        full = re.sub(r"\s+", " ", full)
        if not full:
            continue
        tag_label = None
        rest = full
        first = _first_meaningful(frag)
        # Unwrap nested emphasis such as <i><i>Mr. Schieffer. </i>text</i>.
        while isinstance(first, Tag) and first.name in TAG_LABEL_NAMES:
            inner_first = _first_meaningful(first)
            if isinstance(inner_first, Tag) and inner_first.name in TAG_LABEL_NAMES:
                first = inner_first
            else:
                break
        if isinstance(first, Tag) and first.name in TAG_LABEL_NAMES:
            t = re.sub(r"\s+", " ", first.get_text(" ").strip())
            after = re.sub(r"\s+", " ", full[len(t):].strip()) if full.startswith(t) else None
            if after is not None and t and not t.startswith(("[", "(")) and len(t) <= 90:
                if t.endswith(":"):
                    tag_label, rest = t[:-1].strip(), after
                elif after.startswith(":"):
                    tag_label, rest = t.strip(), after[1:].strip()
                elif t.endswith(".") and len(t.split()) <= 6 and after:
                    tag_label, rest = t[:-1].strip(), after
        out.append((tag_label, rest, full))
    return out


def segment_transcript(html: str, year: int) -> tuple[list[Turn], dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    lines: list[tuple[str | None, str, str]] = []
    for p in soup.find_all("p"):
        bold = p.find(["b", "strong"])
        if bold is not None:
            lt = bold.get_text(strip=True).rstrip(":").strip().lower()
            if lt.startswith(HEADER_LABELS):
                continue
        lines.extend(_segments_of_paragraph(p))

    # Decide whether the full-stop label style is in use for this transcript.
    tag_hits = sum(1 for tl, _, _ in lines if tl)
    colon_hits = sum(
        1 for tl, _, full in lines
        if not tl and (
            (lambda m: m and mostly_upper(m.group(1)))(CAPS_COLON_RE.match(full))
            or TITLE_COLON_RE.match(full)
        )
    )
    period_hits = sum(1 for tl, _, full in lines if not tl and PERIOD_RE.match(full))
    use_period = tag_hits + colon_hits < 5 and period_hits >= 5

    turns: list[Turn] = []
    current: Turn | None = None
    crosstalk = 0
    stage_markers = 0
    unattributed_words = 0
    for tag_label, rest, full in lines:
        label, body = tag_label, rest
        if label is None:
            m = CAPS_COLON_RE.match(full)
            if m and mostly_upper(m.group(1)):
                label, body = m.group(1), m.group(2)
            else:
                m = TITLE_COLON_RE.match(full)
                if m:
                    label, body = m.group(1), m.group(2)
                elif use_period:
                    m = PERIOD_RE.match(full)
                    if m:
                        label, body = m.group(1), m.group(2)
        crosstalk += len(CROSSTALK_RE.findall(full))
        stage_markers += len(STAGE_RE.findall(full))
        if label is not None:
            key = speaker_key(label, year)
            if current is None or current.key != key:
                current = Turn(key)
                turns.append(current)
            current.labels.append(label)
            current.texts.append(body)
        elif current is not None:
            current.texts.append(body)
        else:
            unattributed_words += len(words(strip_stage_directions(body)))
    stats = {
        "crosstalk": crosstalk,
        "stage_markers": stage_markers,
        "unattributed_words": unattributed_words,
        "label_style": "period" if use_period else ("tag" if tag_hits >= colon_hits else "colon"),
    }
    return turns, stats


def role_of(key: str, year: int) -> str:
    if key in ("AUDIENCE", "UNKNOWN"):
        return "other"
    if key in CANDIDATES.get(cycle_of(year), set()):
        return "candidate"
    return "moderator"


def turn_words(turn: Turn) -> int:
    return len(words(strip_stage_directions(turn.text)))


def is_interrupted(turn: Turn) -> bool:
    return bool(INTERRUPT_END_RE.search(strip_stage_directions(turn.texts[-1]) if turn.texts else ""))


def speaker_readability(texts: list[str]):
    return flesch_kincaid(strip_stage_directions("\n".join(texts)))
