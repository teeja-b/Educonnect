"""
Canonical vocabularies and normalisers for EduConnect matching.

Every comparison in the matcher happens on canonical values produced here, never on
raw free text, so "Maths", "maths" and "Mathematics" are the same subject and
"A Level" / "Advanced Level" are the same academic level. Matching is exact on the
canonical value: there are no substring comparisons, so "art" never matches
"particle physics" and "chemistry" never matches "biochemistry".

A normaliser returns None when it does not recognise the input. Callers must treat
None as "unknown" - never guess.
"""

import json
import re

LEVELS = ['primary', 'secondary', 'a-level', 'university']
ALL_LEVELS = 'all levels'

LEVEL_ALIASES = {
    'primary': ['primary', 'elementary', 'grade 1', 'grade 2', 'grade 3', 'grade 4', 'grade 5',
                'grade 6', 'standard 1', 'standard 2', 'standard 3', 'standard 4', 'standard 5',
                'standard 6', 'cpe'],
    'secondary': ['secondary', 'high school', 'igcse', 'gcse', 'o-level', 'o level', 'olevel',
                  'ordinary level', 'sc', 'school certificate', 'form 1', 'form 2', 'form 3',
                  'form 4', 'form 5', 'grade 7', 'grade 8', 'grade 9', 'grade 10', 'grade 11'],
    'a-level': ['a-level', 'a level', 'alevel', 'a-levels', 'a levels', 'advanced level', 'as level',
                'as-level', 'as/a level', 'as and a level', 'form 6', 'lower sixth', 'upper sixth',
                'hsc', 'ib', 'international baccalaureate', 'grade 12', 'grade 13'],
    'university': ['university', 'undergraduate', 'undergrad', 'postgraduate', 'masters', "master's",
                   'degree', 'bachelor', 'college', 'tertiary', 'first year university'],
}

BOARD_ALIASES = {
    'cambridge': ['cambridge', 'cie', 'caie', 'cambridge international', 'cambridge assessment',
                  'cambridge igcse', 'cambridge a level', 'cambridge a-level'],
    'edexcel': ['edexcel', 'pearson', 'pearson edexcel'],
    'aqa': ['aqa'],
    'ocr': ['ocr'],
    'ib': ['ib', 'international baccalaureate'],
    'mauritius': ['mes', 'mauritius examinations syndicate', 'mauritius examination syndicate',
                  'hsc mauritius', 'mes hsc'],
}

SUBJECT_ALIASES = {
    'mathematics': ['maths', 'math', 'mathematics', 'mathematic', 'pure maths', 'pure mathematics',
                    'further maths', 'further mathematics', 'additional maths',
                    'additional mathematics', 'add maths'],
    'physics': ['physics', 'physic'],
    'chemistry': ['chemistry', 'chem'],
    'biology': ['biology', 'bio'],
    'science': ['science', 'sciences', 'general science', 'integrated science'],
    'statistics': ['statistics', 'stats', 'statistic', 'probability', 'econometrics'],
    'computer science': ['computer science', 'cs', 'computing', 'ict', 'programming', 'coding',
                         'informatics', 'information technology'],
    'english': ['english', 'english language', 'english literature', 'literature in english'],
    'languages': ['languages', 'language', 'foreign languages', 'french', 'spanish', 'mandarin',
                  'hindi', 'arabic', 'portuguese', 'russian', 'creole', 'kreol'],
    'history': ['history'],
    'geography': ['geography'],
    'art': ['art', 'art & design', 'art and design', 'drawing', 'painting'],
    'music': ['music', 'music theory'],
    'business': ['business', 'business studies', 'economics', 'accounting', 'accounts',
                 'finance', 'marketing', 'management'],
}

# A request for the umbrella subject is satisfied by a tutor of any member subject.
# The reverse is not true: a "Science" tutor is not assumed to be a Physics specialist.
SUBJECT_UMBRELLAS = {
    'science': {'physics', 'chemistry', 'biology', 'science'},
}

# A requested topic is covered when the tutor lists the topic itself or its parent.
TOPIC_PARENTS = {
    'differentiation': 'calculus', 'integration': 'calculus', 'derivatives': 'calculus',
    'limits': 'calculus', 'differential equations': 'calculus',
    'quadratics': 'algebra', 'simultaneous equations': 'algebra', 'logarithms': 'algebra',
    'matrices': 'algebra', 'sine rule': 'trigonometry', 'cosine rule': 'trigonometry',
    'vectors': 'mechanics', 'kinematics': 'mechanics', 'forces': 'mechanics',
    'organic chemistry': 'chemistry', 'stoichiometry': 'chemistry',
    'genetics': 'biology', 'ecology': 'biology', 'anatomy': 'biology',
}

KNOWN_TOPICS = sorted(set(TOPIC_PARENTS) | set(TOPIC_PARENTS.values()) | {
    'complex numbers', 'object-oriented programming', 'discrete mathematics', 'hypothesis testing',
    'probability distributions', 'regression analysis', 'practical investigations', 'cell biology',
    'homeostasis', 'experimental design', 'fractions', 'word problems', 'decimals', 'multiplication',
    'number sense', 'reading comprehension', 'spelling', 'vocabulary', 'written expression', 'plants',
    'human body', 'ecosystems', 'simple experiments', 'linear algebra', 'databases',
    'statistics', 'probability', 'geometry', 'trigonometry', 'calculus', 'algebra',
    'mechanics', 'thermodynamics', 'electromagnetism', 'python', 'javascript', 'java',
    'web development', 'sql', 'algorithms', 'data structures', 'essay writing', 'grammar',
    'comprehension', 'accounting', 'economics', 'finance', 'electricity', 'waves',
})

MODALITIES = ['online', 'in_person', 'hybrid']
MODALITY_ALIASES = {
    'online': ['online', 'virtual', 'remote', 'zoom', 'video call', 'video lessons', 'internet'],
    'in_person': ['in person', 'in-person', 'face to face', 'face-to-face', 'physical',
                  'at home', 'home visits', 'home tuition'],
    'hybrid': ['hybrid', 'both', 'online and in person', 'online or in person'],
}

CURRENCIES = ['MUR', 'USD', 'EUR', 'GBP', 'INR']
CURRENCY_ALIASES = {
    'MUR': ['mur', 'rs', 'rs.', 'rupee', 'rupees', 'mauritian rupees', 'mauritian rupee'],
    'USD': ['usd', 'us dollar', 'us dollars', 'dollar', 'dollars', '$'],
    'EUR': ['eur', 'euro', 'euros', '€'],
    'GBP': ['gbp', 'pound', 'pounds', '£'],
    'INR': ['inr', 'indian rupees', 'indian rupee'],
}


def _clean(value):
    return re.sub(r'\s+', ' ', str(value or '').strip().lower())


def _lookup(value, table):
    v = _clean(value)
    if not v:
        return None
    for canon, aliases in table.items():
        if v == canon or v in aliases:
            return canon
    return None


def normalize_level(value):
    v = _clean(value)
    if v in (ALL_LEVELS, 'all', 'any level', 'all level'):
        return ALL_LEVELS
    return _lookup(v, LEVEL_ALIASES)


def normalize_board(value):
    return _lookup(value, BOARD_ALIASES)


def normalize_subject(value):
    """Canonical subject, or None when unrecognised (never a guess)."""
    return _lookup(value, SUBJECT_ALIASES)


def normalize_subject_or_raw(value):
    """For tutor-listed expertise: unrecognised subjects are kept (cleaned) so that
    a tutor who lists 'Statistics' can still match a student asking for 'statistics'."""
    return normalize_subject(value) or (_clean(value) or None)


def normalize_modality(value):
    """Exact alias first, then clear keywords, so 'virtual lessons' / 'online classes' work."""
    exact = _lookup(value, MODALITY_ALIASES)
    if exact:
        return exact
    v = _clean(value)
    if re.search(r'\bhybrid\b', v):
        return 'hybrid'
    if re.search(r'\b(online|virtual|remote)\b', v):
        return 'online'
    if re.search(r'\b(in[- ]person|face[- ]to[- ]face|physical)\b', v):
        return 'in_person'
    return None


def normalize_currency(value):
    return _lookup(value, CURRENCY_ALIASES)


def normalize_topic(value):
    v = _clean(value)
    return v or None


def subject_satisfied(requested, tutor_subjects):
    """True if the tutor's canonical subject set covers the requested canonical subject."""
    if requested in tutor_subjects:
        return True
    return bool(SUBJECT_UMBRELLAS.get(requested, set()) & set(tutor_subjects))


def topic_covered(topic, evidence_text, tutor_topics):
    """A topic is covered if the tutor lists it (or its parent) as a topic, or the topic
    appears as a whole word/phrase in the tutor's own expertise/specialisation/bio text."""
    t = normalize_topic(topic)
    if not t:
        return True
    candidates = {t}
    if t in TOPIC_PARENTS:
        candidates.add(TOPIC_PARENTS[t])
    listed = {normalize_topic(x) for x in tutor_topics}
    if candidates & listed:
        return True
    text = _clean(evidence_text)
    return any(re.search(r'(?<![a-z])' + re.escape(c) + r'(?![a-z])', text) for c in candidates)


_AMBIGUOUS_ALIASES = {'sc', 'ib', 'cs', 'college', 'degree', 'mes', 'both', 'all', 'masters', 'grade 1',
                      'grade 2', 'grade 3', 'grade 4', 'grade 5', 'grade 6', 'ict'}
_NEGATION = re.compile(r"\b(no|not|never|without|except|excluding|only)\b[^.;]{0,25}$")


def _text_mentions(aliases, text):
    t = ' ' + _clean(text) + ' '
    for a in aliases:
        if a in _AMBIGUOUS_ALIASES or len(a) < 3:
            continue
        for m in re.finditer(r'(?<![a-z0-9])' + re.escape(a) + r'(?![a-z0-9])', t):
            if not _NEGATION.search(t[max(0, m.start() - 30):m.start()]):
                return True
    return False


def without_negated(text):
    """Drop clauses that deny something ("No ADHD experience", "not qualified for A-level") so a
    denial in a tutor's free text is never read as a claim."""
    parts = re.split(r'[.;\n]', str(text or ''))
    neg = re.compile(r"\b(no|not|never|without|lacks?|none|cannot|can't|don't|doesn't|isn't|unable|n/a)\b", re.I)
    return '. '.join(p for p in parts if not neg.search(p))


def text_supports_level(level, evidence_text):
    """The tutor's own free text (bio, specialisations, certifications) names this level. Used only
    when the structured teaching_levels field is empty, and always reported as 'from profile text'."""
    return _text_mentions(LEVEL_ALIASES.get(level, []) + [level], evidence_text)


def text_supports_board(board, evidence_text):
    return _text_mentions(BOARD_ALIASES.get(board, []) + [board], evidence_text)


def json_list(value):
    """Parse a JSON-text column (or pass a list through). Always returns a list."""
    if value is None or value == '':
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            # Plain comma-separated text saved by an older form
            return [p.strip() for p in value.split(',') if p.strip()]
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, str):
            return [parsed]
    return []


def years_from_text(value):
    """'5', '5 years', '5+' -> 5.0; unknown -> None."""
    m = re.search(r'\d+(?:\.\d+)?', str(value or ''))
    return float(m.group(0)) if m else None