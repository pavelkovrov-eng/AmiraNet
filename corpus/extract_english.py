"""
Extracts the English sections from NITE practice psychometric exams.

Each exam holds two English sections of 22 questions: 8 sentence completions,
4 restatements, and 10 reading questions split across two texts. The answer
key is a table near the back, one run of 22 concatenated digits per section.

Output is a raw corpus — exactly what the PDFs contain and nothing invented.
Mapping onto the app's QuestionItem schema is a separate step, because the
schema also wants per-option explanations, target lexemes and a trap type,
none of which exist in the source.
"""
import glob
import json
import os
import re
import sys
from pypdf import PdfReader

SRC = '/Users/pavelkovrov/Desktop/Amiranet/PsycoExamTakeOnlyEnglish/'
SECTION_TITLES = ['אנגלית - פרק ראשון', 'אנגלית - פרק שני']

# Every page repeats the same Hebrew banner and copyright footer.
HEBREW_LINE = re.compile(r'[֐-׿]')


def page_english(text: str) -> str:
    """Drops the Hebrew furniture, keeping only the exam's English body."""
    return '\n'.join(l for l in text.split('\n') if not HEBREW_LINE.search(l))


def section_pages(reader) -> dict:
    """Maps section title -> concatenated English text of its pages."""
    out = {t: [] for t in SECTION_TITLES}
    for page in reader.pages:
        raw = page.extract_text() or ''
        for title in SECTION_TITLES:
            if title in raw:
                out[title].append(page_english(raw))
                break
    return {k: '\n'.join(v) for k, v in out.items() if v}


# Three layouts of the same table across the set: the row label is sometimes
# "מספר" alone and sometimes "מספר / השאלה", and the digits are sometimes run
# together and sometimes spaced (see SPACED_BLOCK).
ANSWER_BLOCK = re.compile(
    r'אנגלית\s*-\s*פרק\s*(ראשון|שני)\s*\n?\s*מספר\s*\n?\s*(?:השאלה)?\s*([\d]+)\s*\n?\s*'
    r'התשובה\s*\n?\s*הנכונה\s*([1-4]+)'
)


# Some exams print the same table with the digits spaced out. Those extract
# right-to-left, so the row reads from question 22 down to question 1 and has
# to be reversed. Orientation is not assumed - `main` cross-checks it below.
SPACED_BLOCK = re.compile(
    r'אנגלית\s*-\s*פרק\s*(ראשון|שני)\s*\n([^\n]*)\n([^\n]*)\n([^\n]*)'
)


def answer_keys(reader) -> dict:
    """Section title -> list of 1-based correct option numbers."""
    keys = {}
    for page in reader.pages:
        raw = page.extract_text() or ''
        if 'מפתח תשובות' not in raw:
            continue
        for which, _numbers, digits in ANSWER_BLOCK.findall(raw):
            title = 'אנגלית - פרק ראשון' if which == 'ראשון' else 'אנגלית - פרק שני'
            keys[title] = [int(d) for d in digits]
        if keys:
            continue
        for which, numbers_row, _mid, answers_row in SPACED_BLOCK.findall(raw):
            digits = re.findall(r'[1-4]', answers_row)
            if len(digits) != 22:
                continue
            # The number row descends (22 ... 2) when the table came out
            # right-to-left; the answers share that order.
            nums = [int(n) for n in re.findall(r'\d+', numbers_row)]
            descending = len(nums) > 2 and nums[0] > nums[-1]
            seq = [int(d) for d in digits]
            title = 'אנגלית - פרק ראשון' if which == 'ראשון' else 'אנגלית - פרק שני'
            keys[title] = seq[::-1] if descending else seq
    return keys


PART_HEADER = re.compile(
    r'(Sentence Completions?|Restatements?|Text\s+[IVX]+)\s*\(Questions?\s*(\d+)\s*[-–]\s*(\d+)\s*\)'
)
QUESTION_START = re.compile(r'(?m)^\s*(\d{1,2})\.\s+')
OPTION = re.compile(r'(?m)^\s*\((\d)\)\s+')


try:
    WORDS = {w.strip().lower() for w in open('/usr/share/dict/words')}
except OSError:
    WORDS = set()

# The exam PDFs kern some glyph pairs apart far enough that extraction reads a
# space inside a word: "liv e", "f act", "monarch y", "W atkins". Rejoined only
# when the fragment that would be swallowed is not itself a word, so "a bout"
# and "I ran" are left alone.
# Words common enough that seeing one alone is ordinary prose rather than a
# kerning artefact. Deliberately a short hand-written list and not the system
# dictionary, which carries obscure entries ("liv") that block real repairs.
COMMON = set('a an and are as at be been but by can could did do for from had has have he her his how i if in into is it its me my no not of on or our out she so than that the their them then there these they this to too up us was we were what when which who will with would you your'.split())

repairs = []


def _is_word(w: str) -> bool:
    w = w.lower()
    # Plurals are often absent from the dictionary ("driver" yes, "drivers" no).
    return w in WORDS or (w.endswith("s") and w[:-1] in WORDS)


def repair_kerning(text: str) -> str:
    """Rejoins words the PDF split mid-word ("liv e", "pre vent", "f act").

    A token-pair walk rather than a regex sweep: a regex consumes the span it
    matches, so "can pre vent" tested "can pre", failed, and skipped straight
    past the pair that actually needed joining.
    """
    tokens = text.split(" ")
    out, i = [], 0
    while i < len(tokens):
        a = tokens[i]
        b = tokens[i + 1] if i + 1 < len(tokens) else ""
        ca, cb = a.strip('.,;:()"\''), b.strip('.,;:()"\'')
        # A stranded single letter is the signature of the artefact. "f act",
        # "liv e", "w as" - the dictionary lists f, e and w as entries, so the
        # both-are-words guard below would otherwise refuse to repair them.
        lone = (len(ca) == 1 and ca.lower() not in "aio") or (
            len(cb) == 1 and cb.lower() not in "aio"
        )
        if (
            ca and cb and ca.isalpha() and cb.isalpha()
            and (lone or (
                ca.lower() not in COMMON and cb.lower() not in COMMON
                and not (_is_word(ca) and _is_word(cb))
            ))
            and _is_word(ca + cb)
        ):
            repairs.append(ca + " " + cb + " -> " + ca + cb)
            out.append(a + b)
            i += 2
            continue
        out.append(a)
        i += 1
    return " ".join(out)


# A page footer or the next section's banner sometimes trails into the last
# option on the page. Cut at the marker rather than keeping the debris.
BLEED = re.compile(
    r'\s+(?:ENGLISH\b|This section contains|Sentence Completions?\s*\(|Restatements?\s*\(|Text\s+[IVX]+\s*\().*$',
    re.S,
)


def clean(s: str) -> str:
    s = re.sub(r'\s+', ' ', s).strip()
    s = BLEED.sub('', s)
    # Trailing page furniture ("- 40 -") lands in the last option on a page.
    s = re.sub(r'\s*-\s*\d{1,3}\s*-\s*$', '', s)
    return repair_kerning(s).strip()


def parse_items(section_text: str):
    """Yields (number, kind, passage_or_None, stem, [4 options])."""
    headers = list(PART_HEADER.finditer(section_text))
    for i, h in enumerate(headers):
        label = h.group(1)
        kind = (
            'sentence-completion' if label.lower().startswith('sentence')
            else 'restatement' if label.lower().startswith('restatement')
            else 'reading'
        )
        body = section_text[h.end(): headers[i + 1].start() if i + 1 < len(headers) else len(section_text)]

        starts = list(QUESTION_START.finditer(body))
        if not starts:
            continue

        # For a reading text, everything before the first numbered question is
        # the passage itself.
        passage = clean(body[:starts[0].start()]) if kind == 'reading' else None
        if kind == 'reading' and passage:
            # Strip the leading line-number markers the passage is printed with.
            passage = re.sub(r'\(\d{1,2}\)\s+', '', passage)

        for j, s in enumerate(starts):
            chunk = body[s.end(): starts[j + 1].start() if j + 1 < len(starts) else len(body)]
            opts = list(OPTION.finditer(chunk))
            if len(opts) != 4:
                continue
            stem = clean(chunk[:opts[0].start()])
            options = [
                clean(chunk[o.end(): opts[k + 1].start() if k + 1 < len(opts) else len(chunk)])
                for k, o in enumerate(opts)
            ]
            if not stem or any(not o for o in options):
                continue
            yield int(s.group(1)), kind, passage, stem, options


def main():
    corpus, stats = [], []
    for path in sorted(glob.glob(SRC + '*.pdf')):
        name = os.path.basename(path)
        if name == 'psychometric_spring_2022_acc (1).pdf':
            continue  # byte-identical duplicate of spring_2022
        exam = name.replace('psychometric_', '').replace('_acc.pdf', '').replace('.pdf', '')
        try:
            reader = PdfReader(path)
        except Exception as e:
            stats.append((exam, 'UNREADABLE', str(e)[:40]))
            continue

        sections = section_pages(reader)
        if not sections:
            stats.append((exam, 0, 'no English section'))
            continue
        keys = answer_keys(reader)

        found = 0
        for title, text in sections.items():
            key = keys.get(title)
            for number, kind, passage, stem, options in parse_items(text):
                correct = key[number - 1] if key and 1 <= number <= len(key) else None
                corpus.append({
                    'exam': exam,
                    'section': 1 if 'ראשון' in title else 2,
                    'number': number,
                    'type': kind,
                    'passage': passage,
                    'stem': stem,
                    'options': options,
                    'correctOneBased': correct,
                })
                found += 1
        stats.append((exam, found, 'key' if keys else 'NO KEY'))

    with open('english-corpus-raw.json', 'w') as f:
        json.dump(corpus, f, ensure_ascii=False, indent=1)

    for exam, n, note in stats:
        print(f'{exam:16} {str(n):>4}  {note}')
    print(f'\nTOTAL {len(corpus)} questions')
    from collections import Counter
    print('by type:', dict(Counter(c['type'] for c in corpus)))
    print('missing answer:', sum(1 for c in corpus if c['correctOneBased'] is None))
    print('kerning repairs:', len(repairs), '| sample:', repairs[:6])


if __name__ == '__main__':
    sys.exit(main())
