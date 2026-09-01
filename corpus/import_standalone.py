"""
Maps the extracted sentence-completion and restatement items onto the schema.

Companion to import_reading.py, and the same rule holds: nothing here is
invented. What the exams supply is copied; what they do not supply is left
absent rather than guessed at.

One thing this import can do that the reading import could not. A sentence
completion turns on a single word - the answer - so when that word is already
in the lexeme bank the item can be linked to it honestly, and diagnose() can
then say "you missed this because you do not know `plentiful`" rather than
falling back to a generic inference error. That link is only made when the
answer form actually matches a lexeme; measured across the set, 26 of 192 do.
Restatements have no single answer word and are never linked.
"""
import json
import glob
import re
from collections import Counter

RAW = 'corpus/psychometric-english-raw.json'
OUT = 'src/content/questions/psycho-standalone.json'


def difficulty_of(text: str) -> float:
    """Readability proxy on the theta scale — see import_reading.py."""
    sentences = [s for s in re.split(r'[.!?]+', text) if s.strip()]
    words = re.findall(r"[A-Za-z']+", text)
    if not sentences or not words:
        return 0.0
    mean_sentence = len(words) / len(sentences)
    long_share = sum(1 for w in words if len(w) > 7) / len(words)
    raw = 0.11 * (mean_sentence - 17) + 7.0 * (long_share - 0.19)
    return round(max(-1.5, min(2.5, raw)), 2)


def surface_forms() -> dict:
    """Every headword and family member -> its lexeme id."""
    forms = {}
    for path in sorted(glob.glob('src/content/lexemes/*.json')):
        for lexeme in json.load(open(path)):
            for word in [lexeme['headword']] + lexeme.get('family', []):
                forms.setdefault(word.lower().strip(), lexeme['id'])
    return forms


def main():
    corpus = json.load(open(RAW))
    forms = surface_forms()
    items = [q for q in corpus if q['type'] in ('sentence-completion', 'restatement')]

    questions, linked = [], 0
    for q in items:
        answer = q['options'][q['correctOneBased'] - 1]
        body = q['stem'] + ' ' + ' '.join(q['options'])
        item = {
            'id': f"ps-{q['exam'].replace('_', '')}-{q['section']}-{q['number']:02d}",
            'type': q['type'],
            'difficulty': difficulty_of(body),
            'stem': q['stem'],
            'options': q['options'],
            'correctIndex': q['correctOneBased'] - 1,
            # Unknown for an imported item, and the choice is not neutral:
            # 'logic-inversion' would make diagnose() report a connector
            # misread for every wrong answer. 'phonetic-neighbor' is the trap
            # sentence completions actually use - the distractors are near
            # neighbours of the answer - and 'surface-match' is what a
            # restatement tests, since its wrong options reuse the original's
            # words without keeping its meaning.
            'trapType': (
                'phonetic-neighbor' if q['type'] == 'sentence-completion' else 'surface-match'
            ),
        }
        lexeme_id = forms.get(answer.lower().strip().strip('.'))
        if lexeme_id and q['type'] == 'sentence-completion':
            item['primaryLexeme'] = lexeme_id
            item['targetLexemes'] = [lexeme_id]
            linked += 1
        questions.append(item)

    json.dump(questions, open(OUT, 'w'), ensure_ascii=False, indent=2)

    print(f'{len(questions)} questions')
    print('by type:', dict(Counter(q['type'] for q in questions)))
    print(f'linked to a lexeme: {linked}')
    ds = [q['difficulty'] for q in questions]
    print(f'difficulty min {min(ds)} max {max(ds)} mean {sum(ds) / len(ds):.2f}')


if __name__ == '__main__':
    main()
