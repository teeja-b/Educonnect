"""
Conversational layer for EduConnect tutor matching.

This module holds NO database or Flask code. It turns one student message into:
  * an updated requirements profile (via the existing Groq/keyword interpreter),
  * conversation state (what was asked, what the student allowed, last results),
  * assistant messages (clarification / results / explanation / error).

All tutor data comes from the injected `run_match` callable, which is the real matching engine.
Reply wording is built from verified match data. The language model is used for understanding the
student (ai_prompt_matcher.interpret_message) and for the one-line tutor reasons
(ai_prompt_matcher.explain_matches, which verifies them against tutor data). It never decides
eligibility, scores, order or prices.

When to search (kept deliberately small so the chat never turns into a questionnaire):
  required before the first search : subject, academic level, and for A-level the exam board
                                     (plus the currency if a budget was given without one)
  everything else is optional      : searched immediately; afterwards at most ONE optional
                                     follow-up question per reply (budget, then lesson type)
Budget: tutors within the limit come first; verified tutors up to ALT_MARGIN above it are shown
automatically under "Alternative options"; anything further above is offered, never hidden.
A message that changes nothing does not re-run the search.
"""
import re

import ai_prompt_matcher as apm
from normalize import normalize_currency

WELCOME = ("Hi! I'm EduConnect AI. Tell me what you need help with, in your own words: the subject and level, "
           "and anything else that matters to you, like your budget or online lessons. I'll find tutors as soon as "
           "I know the subject and level.")

OPENERS = ['Of course!', 'Great!', 'Thanks!', 'Understood!', 'Got it!']

LEVEL_LABEL = {'primary': 'primary', 'secondary': 'secondary', 'a-level': 'A-level', 'university': 'university'}

# per-conversation state defaults (stored as JSON next to the requirements)
DEFAULT_STATE = {
    'asked': {'topics': False, 'budget': False, 'modality': False},
    'awaiting': None,              # 'above_budget_offer' | 'explain_offer' | 'support_approach' | None
    'last_question_field': None,
    'allow_above_budget': False,
    'sort_by': None,               # 'price' | 'experience'
    'require_all_subjects': False,
    'available_days': [],          # 'weekend' | 'weekday'
    'min_experience': None,
    'preferred_rate': None,
    'min_rate': None,
    'budget_declined': False,
    'support_acknowledged': False,
    'matched_once': False,
    'turns': 0,
    'last_results': [],            # [{tutor_id, name, group}]
}

MAX_PER_GROUP = {'within': 5, 'slightly_above': 3, 'alternatives': 3, 'unconfirmed': 3}

# Tutors up to this fraction above the student's limit are shown automatically as alternatives.
ALT_MARGIN = 0.25

# State keys that change which tutors are shown (used to skip pointless re-runs).
_SEARCH_STATE_KEYS = ('allow_above_budget', 'sort_by', 'require_all_subjects', 'available_days',
                      'min_experience', 'preferred_rate', 'min_rate')


def clean_state(raw):
    st = {k: (dict(v) if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
          for k, v in DEFAULT_STATE.items()}
    if isinstance(raw, dict):
        for k in st:
            if k in raw:
                st[k] = raw[k]
        if not isinstance(st['asked'], dict):
            st['asked'] = dict(DEFAULT_STATE['asked'])
        for k in DEFAULT_STATE['asked']:
            st['asked'].setdefault(k, False)
        if not isinstance(st['last_results'], list):
            st['last_results'] = []
        if not isinstance(st['available_days'], list):
            st['available_days'] = []
    return st


# ------------------------------------------------------------------------ formatting

def money(currency, amount):
    if amount is None:
        return ''
    n = f'{float(amount):,.0f}' if float(amount) == int(float(amount)) else f'{float(amount):,.2f}'
    return f"Rs {n}" if currency in (None, 'MUR') else f'{currency} {n}'


def describe_search(req):
    board = req.get('board')
    board = (board.upper() if board and len(board) <= 3 else (board or '').title())
    level = LEVEL_LABEL.get(req.get('level'), req.get('level') or '')
    subj = ' and '.join(s.title() for s in req.get('subjects') or [])
    return ' '.join(x for x in (board, level, subj) if x) or 'your requirements'


def _plural(n, one, many=None):
    return one if n == 1 else (many or one + 's')


# ------------------------------------------------------------------------ intents

_RE = {
    'new_chat': re.compile(r'\b(new (search|chat|conversation)|start (over|again|afresh)|begin again|reset (everything|the search|my search))\b'),
    'explain': re.compile(r"(^|\b)(why (was|is|did|were|are|has|have|would)|how come|explain|what makes|reason (for|why)|"
                          r"differences?|compare|comparison)\b|^\s*(and |so )?why\b"),
    'cheaper': re.compile(r'\b(cheaper|cheapest|less expensive|lower (price|prices|rate|rates|cost)|more affordable|'
                          r'affordable|lowest (price|rate)|low[- ]cost)\b'),
    'experienced': re.compile(r'\b(more experienced|most experienced|experienced|senior|veteran|'
                              r'more experience|years of experience)\b'),
    'above_budget': re.compile(r'(\b(above|over|beyond|higher than|exceed\w*)\s+(my|the|our)?\s*(preferred\s+)?(budget|limit)\b|'
                               r'\b(pricier|costlier|more expensive|higher[- ]priced|higher rates?)\b)'),
    'go': re.compile(r"\b(show me (the )?(tutors|matches|results)|find (me )?(a )?tutors?( now)?|search now|that'?s (all|it)|"
                     r"nothing else|go ahead and (search|match|find)|just (show|find))\b"),
    'weekend': re.compile(r'\b(weekends?|saturdays?|sundays?)\b'),
    'weekday': re.compile(r'\bweekdays?\b'),
    'both': re.compile(r'\b(both|all of|as well as)\b'),
    'yes': re.compile(r"^\s*(yes|yeah|yep|yup|sure|ok(ay)?|please( do)?|go ahead|sounds good|definitely|y|show (them|me)( them)?)\b[^a-z]*(please|show (them|me)( them)?|go ahead|thanks|thank you)?[\s.!]*$"),
    'no': re.compile(r"^\s*(no|nope|nah|not now|no thanks|no thank you|not really)\b[\s.!]*$"),
    'skip': re.compile(r"\b(skip|no preference|not sure|don'?t (mind|care|know)|doesn'?t matter|either|any(thing)?( is fine| works)?|"
                       r"flexible|no limit|no budget|not really|none|nothing specific|no)\b"),
    'min_exp': re.compile(r'\bat least\s+(\d{1,2})\s*\+?\s*years?\b|\b(\d{1,2})\s*\+\s*years?\b'),
    'thanks': re.compile(r"^\s*(thanks|thank you|thx|ty|cheers|great|perfect|awesome|cool|nice|ok(ay)? thanks?)\b[\s.!]*(so much|a lot)?[\s.!]*$"),
}

_ORDINALS = [(r'\b(first|1st|top|number one|#1)\b', 0), (r'\b(second|2nd|#2)\b', 1), (r'\b(third|3rd|#3)\b', 2)]


def detect_intents(text, state, last_results):
    t = (text or '').lower().strip()
    it = {k: bool(rx.search(t)) for k, rx in _RE.items() if k != 'min_exp'}
    m = _RE['min_exp'].search(t)
    it['min_experience'] = int(m.group(1) or m.group(2)) if m else None
    # "why/explain" only counts as a question about results when there are results to talk about
    it['explain'] = it['explain'] and bool(last_results)
    # A yes/no only means something when it answers a pending offer
    it['yes'] = it['yes'] and bool(state.get('awaiting'))
    it['no'] = it['no'] and bool(state.get('awaiting'))
    it['tutor_index'] = resolve_tutor(t, last_results)
    return it


def resolve_tutor(t, last_results):
    """Index into last_results of the tutor the student is asking about, or None. Names only."""
    for i, r in enumerate(last_results or []):
        full = (r.get('name') or '').lower()
        first = full.split()[0] if full else ''
        if full and full in t:
            return i
        if first and len(first) > 2 and re.search(r'\b' + re.escape(first) + r'\b', t):
            return i
    for pat, idx in _ORDINALS:
        if re.search(pat, t) and idx < len(last_results or []):
            return idx
    if re.search(r'\b(this|that|the) (tutor|one)\b', t) and len(last_results or []) == 1:
        return 0
    return None


# ------------------------------------------------------------------------ budget

_MONEY = re.compile(r'(\bMUR\b|\bRs\.?|\brupees?\b|\bUSD\b|\bEUR\b|\bGBP\b|\bINR\b|\$|€|£)\s*(\d+(?:[.,]\d+)*)|'
                    r'(\d+(?:[.,]\d+)*)\s*(MUR|Rs\.?|rupees?|USD|EUR|GBP|INR|dollars?|euros?|pounds?)\b', re.I)
_LIMIT_CUE = re.compile(r'(up to|could go|can go|could pay|can pay|could stretch|stretch|absolute|maximum|\bmax\b|at most|'
                        r'no more than|cannot exceed|can\'t exceed|top limit|ceiling|limit)', re.I)
_REPLACE_CUE = re.compile(r'\b(increase|raise|change|actually|instead|make it|lower|reduce|decrease|bump)\b', re.I)
_PROMOTE_CUE = re.compile(r'(up to|could go|can go|could stretch|stretch to|if (needed|necessary)|for the right tutor)', re.I)


def _amount(m):
    return float((m.group(2) or m.group(3)).replace(',', ''))


def _num(s):
    return float(s.replace(',', ''))


def parse_budget(message, prior_req, state, awaiting_budget=False):
    """Interpret money statements. Returns a dict with any of max_rate, preferred_rate, min_rate,
    currency, plus 'declined'. Empty dict when the message says nothing about money.
    max_rate is the absolute spending limit (hard filter); preferred_rate is the amount the student
    would like to pay (used to group results, never to exclude)."""
    text = message or ''
    out = {}
    low = text.lower()
    if re.search(r"\b(no (budget )?limit|budget (is )?(flexible|not (an issue|important))|money (is )?no (issue|object)|"
                 r"any budget|don'?t have a budget|no budget)\b", low):
        out['declined'] = True
        return out
    amounts = list(_MONEY.finditer(text))
    cur = None
    if amounts:
        tok = amounts[0].group(1) or amounts[0].group(4)
        cur = normalize_currency(tok.rstrip('.')) if tok else None
        if tok and tok.strip().lower() in ('rs', 'rs.', 'rupee', 'rupees'):
            cur = 'MUR'
    else:
        # bare number answering a budget question ("around 1000", "1,500")
        if awaiting_budget or re.search(r'\b(budget|per hour|an hour|/hour|hourly)\b', low):
            nums = [m for m in re.finditer(r'(?<![\d.,])(\d{2,5}(?:,\d{3})?)(?![\d])', text)]
            if nums:
                class _M:  # tiny adapter so the logic below is shared
                    def __init__(s, m): s.m = m
                    def group(s, i): return s.m.group(1) if i in (2,) else None
                    def start(s): return s.m.start()
                    def end(s): return s.m.end()
                amounts = [_M(m) for m in nums]
    if not amounts:
        return out
    vals = [(_amount(m), m) for m in amounts]
    if cur:
        out['currency'] = cur
    nums_only = sorted({v for v, _ in vals})

    rng = re.search(r'\bbetween\b.*?\band\b|\bfrom\b.*?\bto\b|\d\s*[-–]\s*(?:Rs\.?\s*|MUR\s*)?\d', text, re.I)
    if len(nums_only) >= 2 and rng and not _LIMIT_CUE.search(text):
        out['min_rate'], out['max_rate'] = nums_only[0], nums_only[-1]
        return out
    if len(nums_only) >= 2:
        # lower amount = preferred, higher = absolute limit ("around 1,000, up to 1,500")
        out['preferred_rate'], out['max_rate'] = nums_only[0], nums_only[-1]
        return out
    amt = nums_only[0]
    ctx = low
    prior_max = (prior_req or {}).get('max_rate')
    prior_pref = state.get('preferred_rate')
    if _PROMOTE_CUE.search(ctx) and prior_max is not None and prior_max < amt and not _REPLACE_CUE.search(ctx):
        # "I could go up to 1,500" after "around 1,000": 1,000 becomes the preference, 1,500 the limit
        out['preferred_rate'], out['max_rate'] = (prior_pref or prior_max), amt
    elif _REPLACE_CUE.search(ctx) or _LIMIT_CUE.search(ctx) or prior_max is not None:
        out['max_rate'] = amt
        if prior_pref is not None and prior_pref > amt:
            out['preferred_rate'] = 0     # sentinel: clear
    else:
        out['max_rate'] = amt
    return out


# ------------------------------------------------------------------------ profile view

def public_profile(req, state):
    """Everything the interface shows as 'what I understood'. Budget is split into the
    preferred / minimum / absolute limit the student actually gave."""
    return {
        **{k: req.get(k) for k in apm.LIST_FIELDS + apm.SCALAR_FIELDS if k != 'max_rate'},
        'board_declined': req.get('board_declined'),
        'preferred_rate': state.get('preferred_rate'),
        'min_rate': state.get('min_rate'),
        'absolute_max_rate': req.get('max_rate'),
        'available_days': state.get('available_days') or [],
        'sort_by': state.get('sort_by'),
        'require_all_subjects': state.get('require_all_subjects'),
        'min_experience': state.get('min_experience'),
        'allow_above_budget': state.get('allow_above_budget'),
    }


def describe_changes(old_req, new_req, old_state, new_state):
    c = []
    def lst(k): return [x for x in new_req[k] if x not in old_req[k]]
    if lst('subjects'):
        c.append('subject: ' + ', '.join(s.title() for s in new_req['subjects']))
    if new_req['level'] != old_req['level'] and new_req['level']:
        c.append('level: ' + LEVEL_LABEL.get(new_req['level'], new_req['level']))
    if new_req['board'] != old_req['board'] and new_req['board']:
        c.append('exam board: ' + new_req['board'].title())
    if lst('topics'):
        c.append('topics: ' + ', '.join(new_req['topics']))
    if (new_req['max_rate'], new_state.get('preferred_rate'), new_state.get('min_rate')) != \
       (old_req['max_rate'], old_state.get('preferred_rate'), old_state.get('min_rate')) and new_req['max_rate']:
        c.append('budget: ' + budget_phrase(new_req, new_state))
    if new_req['modality'] != old_req['modality'] and new_req['modality']:
        c.append('lessons: ' + new_req['modality'].replace('_', '-'))
    if new_req['location'] != old_req['location'] and new_req['location']:
        c.append('location: ' + new_req['location'])
    if new_req['gender_pref'] != old_req['gender_pref'] and new_req['gender_pref']:
        c.append('tutor gender: ' + new_req['gender_pref'])
    if lst('languages'):
        c.append('language: ' + ', '.join(new_req['languages']))
    if new_req['available_time'] != old_req['available_time'] and new_req['available_time']:
        c.append('time of day: ' + new_req['available_time'])
    if new_state.get('available_days') != old_state.get('available_days') and new_state.get('available_days'):
        c.append('days: ' + ' and '.join(new_state['available_days']))
    if new_req['learning_style'] != old_req['learning_style'] and new_req['learning_style']:
        c.append('learning style: ' + new_req['learning_style'])
    if lst('support_needs'):
        c.append('learning-support needs noted')
    if new_state.get('require_all_subjects') and not old_state.get('require_all_subjects'):
        c.append('tutor must teach all of these subjects')
    if new_state.get('min_experience') != old_state.get('min_experience') and new_state.get('min_experience'):
        c.append(f"at least {new_state['min_experience']} years of experience")
    return c


def budget_phrase(req, state):
    cur, mx, pref, mn = req.get('currency'), req.get('max_rate'), state.get('preferred_rate'), state.get('min_rate')
    if mx is None:
        return ''

    def amt(a):   # no currency known yet: show the plain number, don't assume rupees
        return money(cur, a) if cur else f'{float(a):,.0f}'
    if mn:
        return f'{amt(mn)} to {amt(mx)} per hour'
    if pref and pref < mx:
        return f'around {amt(pref)}, up to {amt(mx)} per hour'
    return f'up to {amt(mx)} per hour'


# ------------------------------------------------------------------------ questions

def followup_question(req, state):
    """One optional refinement asked AFTER results are shown (never before the first search), each at
    most once: budget first (it splits results into within-budget and alternatives), then lesson type.
    Topics are never asked for; the student can mention them and they are used."""
    asked = state['asked']
    if not asked['budget'] and req['max_rate'] is None and not state.get('budget_declined'):
        return {'field': 'budget',
                'text': "What's your budget per hour? I'll put the tutors within it first.",
                'options': ['Up to Rs 500', 'Up to Rs 800', 'Up to Rs 1,200', 'No budget limit']}
    if not asked['modality'] and not req['modality']:
        return {'field': 'modality', 'text': 'Do you prefer online or in-person lessons?',
                'options': ['Online', 'In person', 'Either is fine']}
    return None


SUPPORT_ACK = ("Thank you for telling me that. Every learner is different, so I won't assume what works for "
               "{who}. What teaching approaches or accommodations help most (for example shorter lessons with "
               "breaks, visual or step-by-step explanations, or a slower pace)? I will only recommend specialist "
               "tutors whose profiles show relevant experience, and I can't make medical or diagnostic decisions.")


def _who(text):
    t = (text or '').lower()
    if re.search(r'\b(my (child|son|daughter|kid)|our (child|son|daughter))\b', t):
        return 'your child'
    return 'you'


# ------------------------------------------------------------------------ filtering / grouping

def _years(m):
    try:
        return float(re.findall(r'\d+(?:\.\d+)?', str(m.get('years_experience') or ''))[0])
    except (IndexError, ValueError):
        return None


def _slots(m):
    av = m.get('availability_slots') or []
    return [s.lower() for s in av]


def apply_chat_filters(matches, req, state):
    """Refinements the engine does not own. Each one is validated against real tutor fields.
    Returns (kept, notes). A tutor whose profile lacks the field is excluded and counted, never guessed."""
    notes = []
    out = list(matches)
    if state.get('require_all_subjects') and len(req['subjects']) > 1:
        kept = [m for m in out if not ((m.get('coverage') or {}).get('subjects') or {}).get('missing', ['x'])]
        if len(kept) < len(out):
            notes.append(f"{len(out) - len(kept)} {_plural(len(out) - len(kept), 'tutor')} did not list all of "
                         f"{' and '.join(s.title() for s in req['subjects'])}.")
        out = kept
    days = state.get('available_days') or []
    if days:
        def has(m, d):
            wk = ('saturday', 'sunday', 'weekend')
            return any((any(w in s for w in wk) if d == 'weekend' else not any(w in s for w in wk)) for s in _slots(m))
        kept = [m for m in out if any(has(m, d) for d in days)]
        no_data = [m for m in out if not _slots(m)]
        if len(kept) < len(out):
            notes.append(f"{len(out) - len(kept)} {_plural(len(out) - len(kept), 'tutor')} {_plural(len(out) - len(kept), 'does', 'do')} "
                         f"not list {' / '.join(days)} availability"
                         + (f" ({len(no_data)} listed no availability at all)." if no_data else '.'))
        out = kept
    me = state.get('min_experience')
    if me:
        kept = [m for m in out if (_years(m) or 0) >= me]
        if len(kept) < len(out):
            notes.append(f"{len(out) - len(kept)} {_plural(len(out) - len(kept), 'tutor')} listed fewer than {me} years "
                         "(or no experience figure).")
        out = kept
    return out, notes


def sort_matches(matches, sort_by):
    if sort_by == 'price':
        return sorted(matches, key=lambda m: (m.get('hourly_rate') is None, m.get('hourly_rate') or 0, -m.get('match_score', 0)))
    if sort_by == 'experience':
        return sorted(matches, key=lambda m: (_years(m) is None, -(_years(m) or 0), -m.get('match_score', 0)))
    return list(matches)


def _verified(m):
    return (m.get('verification') or {}).get('status') == 'verified'


def build_groups(matches, req, state, alternatives):
    """1 within budget, 2 slightly above the preferred amount (still within the limit),
    3 'Alternative options' above the limit (already chosen by the caller),
    plus 'unconfirmed' for tutors whose profile doesn't confirm every requirement."""
    pref, cap, cur = state.get('preferred_rate'), req.get('max_rate'), req.get('currency')
    verified = [m for m in matches if _verified(m)]
    unconfirmed = [m for m in matches if not _verified(m)]
    within, above = [], []
    for m in verified:
        r = m.get('hourly_rate')
        if pref and cap and r is not None and pref < r <= cap:
            above.append(m)
        else:
            within.append(m)
    have = {m['tutor_id'] for m in matches}
    alts = [m for m in alternatives if m['tutor_id'] not in have]
    s = state.get('sort_by')
    groups = []
    title_within = ('Within your budget' if cap else 'Recommended tutors')
    alt_note = ''
    if cap and alts:
        alt_note = (f"Above your {money(cur, cap)} budget" if state.get('allow_above_budget')
                    else f"Slightly above your {money(cur, cap)} budget")
    for key, title, note, items in (
            ('within', title_within, '', within),
            ('slightly_above', 'Slightly above your preferred budget', 'Still within your limit', above),
            ('alternatives', 'Alternative options', alt_note, alts),
            ('unconfirmed', 'Possible matches, some details not confirmed', '', unconfirmed)):
        items = sort_matches(items, s if key != 'alternatives' else (s or 'price'))[:MAX_PER_GROUP[key]]
        if items:
            groups.append({'key': key, 'title': title, 'subtitle': note, 'matches': items})
    return groups


# ------------------------------------------------------------------------ explanations

_FACTOR_LABEL = {'schedule': 'availability', 'language': 'language', 'learning_style': 'teaching style',
                 'rating': 'student ratings', 'experience': 'experience', 'qualifications': 'qualifications',
                 'coverage': 'coverage of your subjects and topics', 'support': 'learning-support experience'}


def explain_tutor(m, req, state):
    """Why this tutor, built only from this tutor's stored fields and the matcher's own breakdown."""
    name = m.get('tutor_name') or 'This tutor'
    pts = []
    cov = m.get('coverage') or {}
    subj_cov = (cov.get('subjects') or {}).get('covered') or []
    if req.get('subjects') and subj_cov:
        pts.append('teaches ' + ' and '.join(s.title() for s in subj_cov))
    if req.get('level') and req['level'] in [str(x).lower() for x in (m.get('teaching_levels') or [])] + \
            [apm_level(x) for x in (m.get('teaching_levels') or [])]:
        pts.append(f"lists {LEVEL_LABEL.get(req['level'], req['level'])} level")
    if req.get('board') and any(req['board'] == apm_board(x) for x in (m.get('exam_boards') or [])):
        pts.append(f"lists {req['board'].title()} among their exam boards")
    top_cov = (cov.get('topics') or {}).get('covered') or []
    if top_cov:
        pts.append('covers ' + ', '.join(top_cov[:4]))
    if m.get('hourly_rate') is not None and m.get('price_currency'):
        rate = money(m['price_currency'], m['hourly_rate'])
        cap, pref = req.get('max_rate'), state.get('preferred_rate')
        if cap and m['price_currency'] == req.get('currency'):
            if pref and m['hourly_rate'] <= pref:
                pts.append(f'charges {rate}/hour, within your preferred budget')
            elif m['hourly_rate'] <= cap:
                pts.append(f'charges {rate}/hour, above your preferred budget but within your limit' if pref
                           else f'charges {rate}/hour, within your budget')
            else:
                pts.append(f'charges {rate}/hour, above your stated limit')
        else:
            pts.append(f'charges {rate}/hour')
    if m.get('modality'):
        pts.append('teaches ' + m['modality'].replace('_', '-'))
    if m.get('support_match'):
        pts.append('lists experience supporting ' + ' and '.join(m['support_match']))
    if m.get('rating'):
        pts.append(f"is rated {m['rating']:.1f}/5")
    y = _years(m)
    if y:
        pts.append(f'has {y:g} years of experience')
    text = f'{name} ({m.get("match_score", 0):.0f}% compatibility): '
    text += ('; '.join(pts) + '.') if pts else 'meets the requirements you gave.'
    bd = {k: v for k, v in (m.get('breakdown') or {}).items() if k in _FACTOR_LABEL and v is not None}
    if not m.get('rating'):
        bd.pop('rating', None)            # no ratings yet is not a low rating
    if _years(m) is None:
        bd.pop('experience', None)
    if not (m.get('education') or m.get('certifications')):
        bd.pop('qualifications', None)
    if len(bd) >= 2:
        best = max(bd, key=bd.get)
        worst = min(bd, key=bd.get)
        if bd[worst] < 60 and worst != best:
            text += (f" Strongest on {_FACTOR_LABEL[best]} ({bd[best]:.0f}%); weakest on {_FACTOR_LABEL[worst]} "
                     f"({bd[worst]:.0f}%), which is what holds the score back.")
    if m.get('reason_source') == 'ai' and m.get('ai_reason'):
        text += ' ' + m['ai_reason']
    nsb = (m.get('verification') or {}).get('not_stated_by_tutor') or []
    if nsb:
        text += (" Not confirmed by their profile: " + ', '.join(sorted(nsb)) +
                 ". Please check with the tutor before booking.")
    return text


def apm_level(x):
    from normalize import normalize_level
    return normalize_level(x) or ''


def apm_board(x):
    from normalize import normalize_board
    return normalize_board(x) or ''


def compare_tutors(group_matches, req, state):
    ms = group_matches[:3]
    if not ms:
        return None
    lines = []
    for m in ms:
        bits = []
        if m.get('hourly_rate') is not None:
            bits.append(money(m.get('price_currency'), m['hourly_rate']) + '/hour')
        if _years(m):
            bits.append(f'{_years(m):g} yrs experience')
        if m.get('modality'):
            bits.append(m['modality'].replace('_', '-'))
        if m.get('rating'):
            bits.append(f"rated {m['rating']:.1f}")
        if m.get('support_match'):
            bits.append('supports ' + ' & '.join(m['support_match']))
        lines.append(f"• {m['tutor_name']} ({m['match_score']:.0f}%): " + (', '.join(bits) or 'few details listed'))
    out = 'Here is how they differ:\n' + '\n'.join(lines)
    priced = [m for m in ms if m.get('hourly_rate') is not None]
    exp = [m for m in ms if _years(m)]
    tips = []
    if len(priced) > 1:
        cheapest = min(priced, key=lambda m: m['hourly_rate'])
        tips.append(f"{cheapest['tutor_name']} is the most affordable")
    if len(exp) > 1:
        top = max(exp, key=_years)
        tips.append(f"{top['tutor_name']} has the most experience")
    if tips:
        out += '\n' + ' and '.join(tips) + '. Ask me why any of them was recommended.'
    return out


# ------------------------------------------------------------------------ the turn

def _result_quick_replies(req, state):
    q = ['Explain the differences', 'Show cheaper tutors', 'Show more experienced tutors']
    q.append('Show me in-person tutors' if req.get('modality') != 'in_person' else 'Show me online tutors')
    q.append('Any tutors available on weekends?')
    return q


def process_turn(message, requirements, state, *, interpret, run_match, explain):
    """One student message in, assistant messages out. See module docstring.

    interpret(message, prior_requirements, last_question_field) -> (extraction, source)
    run_match(requirements) -> (profile, matches, diagnostics)   # the real engine, verified tutors only
    explain(message, profile, matches) -> (matches, source)
    """
    state = clean_state(state)
    req = apm.clean_requirements(requirements)
    old_req, old_state = apm.clean_requirements(requirements), clean_state(state)
    text = (message or '').strip()
    state['turns'] = int(state.get('turns') or 0) + 1
    opener = OPENERS[(state['turns'] - 1) % len(OPENERS)]
    last = state.get('last_results') or []
    it = detect_intents(text, state, last)
    awaiting = state.get('awaiting')
    result = {'messages': [], 'matching_triggered': False, 'requirements_updated': False, 'changes': [],
              'interpretation_source': 'none', 'new_conversation': False, 'diagnostics': None}

    def say(kind, body, **payload):
        result['messages'].append({'role': 'assistant', 'kind': kind, 'text': body, 'payload': payload})

    if it['new_chat']:
        result['new_conversation'] = True
        return _finish(result, req, state)

    # ----- replies to a pending offer ------------------------------------------------------------
    if awaiting == 'above_budget_offer' and it['yes']:
        state['allow_above_budget'], state['awaiting'] = True, None
        text_for_ai = ''
        return _match_and_reply(result, say, req, state, old_req, old_state, run_match, explain, it,
                                lead='Sure, here is what I found including tutors above your budget.', message=text_for_ai)
    if awaiting == 'above_budget_offer' and it['no']:
        state['awaiting'] = None
        say('message', "No problem, I'll keep to your budget. Tell me if you'd like to change anything.",
            quick_replies=_result_quick_replies(req, state))
        return _finish(result, req, state)
    if awaiting == 'explain_offer' and it['yes']:
        state['awaiting'] = None
        return _explain_reply(result, say, req, state, last, run_match, explain, None, compare=True)
    if awaiting == 'explain_offer' and it['no']:
        state['awaiting'] = None
        say('message', 'Okay. Tell me if you want to refine the search, for example a different budget or lesson type.',
            quick_replies=_result_quick_replies(req, state))
        return _finish(result, req, state)

    # ----- explanation questions: no re-interpretation, facts only ---------------------------------
    if it['explain'] and not it['yes']:
        return _explain_reply(result, say, req, state, last, run_match, explain, it['tutor_index'],
                              compare=(it['tutor_index'] is None))

    # ----- understand the message -----------------------------------------------------------------
    last_field = state.get('last_question_field')
    extraction, source = interpret(text, requirements=req, last_question_field=last_field) if text else ({}, 'none')
    result['interpretation_source'] = source
    extraction = dict(extraction or {})

    # soft-question answers
    short = len(text.split()) <= 6
    if last_field == 'topics':
        state['asked']['topics'] = True
        if (not extraction.get('topics') and short and not it['skip'] and not it['go'] and not it['thanks'] and text
                and not _MONEY.search(text) and not re.search(r'\d', text)
                and not re.search(r'\b(tutors?|show|find|search|match|cheaper|experienced|weekend|budget|online|in[- ]person)\b', text.lower())):
            extraction['topics'] = [t.strip().lower() for t in re.split(r',| and ', text) if 1 < len(t.strip()) <= 40]
    if last_field == 'budget':
        state['asked']['budget'] = True
    if last_field == 'modality':
        state['asked']['modality'] = True

    budget = parse_budget(text, req, state, awaiting_budget=(last_field in ('budget', 'currency')))
    if budget.get('declined'):
        state['budget_declined'] = True
        state['asked']['budget'] = True
    for k in ('max_rate', 'currency'):
        if budget.get(k) is not None:
            extraction[k] = budget[k]
    if 'max_rate' in budget:
        state['asked']['budget'] = True
        state['budget_declined'] = False
        if budget.get('preferred_rate') == 0:
            state['preferred_rate'] = None
        elif budget.get('preferred_rate') is not None:
            state['preferred_rate'] = budget['preferred_rate']
        elif 'preferred_rate' not in budget and not _PROMOTE_CUE.search(text.lower()):
            # a fresh single figure replaces the old preference
            if state.get('preferred_rate') and state['preferred_rate'] > budget['max_rate']:
                state['preferred_rate'] = None
        state['min_rate'] = budget.get('min_rate')

    merged = apm.merge_requirements(req, extraction)
    # replace-currency edge: budget amount without a currency keeps the earlier currency
    if merged['max_rate'] is not None and not merged['currency'] and req.get('currency'):
        merged['currency'] = req['currency']
    req = merged
    if state.get('preferred_rate') and req['max_rate'] is None:
        req['max_rate'] = state['preferred_rate']
    if req['modality'] and last_field == 'modality':
        state['asked']['modality'] = True

    # ----- refinement intents ---------------------------------------------------------------------
    if it['cheaper']:
        state['sort_by'] = 'price'
    elif it['experienced']:
        state['sort_by'] = 'experience'
    if it['weekend'] and not re.search(r'\b(not|no|except|exclude)\b[^.]{0,15}weekends?', text.lower()):
        state['available_days'] = ['weekend']
    elif it['weekday']:
        state['available_days'] = ['weekday']
    if it['both'] and len(req['subjects']) > 1 and extraction.get('subjects'):
        state['require_all_subjects'] = True
    if it['min_experience']:
        state['min_experience'] = it['min_experience']
    if it['above_budget'] and req.get('max_rate'):
        state['allow_above_budget'] = True
    if awaiting == 'support_approach':
        state['awaiting'] = None

    changes = describe_changes(old_req, req, old_state, state)
    refinement_notes = []
    if it['cheaper'] and old_state.get('sort_by') != 'price':
        refinement_notes.append('sorted by price, lowest first')
    if it['experienced'] and old_state.get('sort_by') != 'experience':
        refinement_notes.append('sorted by years of experience')
    if it['above_budget'] and req.get('max_rate') and not old_state.get('allow_above_budget'):
        refinement_notes.append('including tutors above your budget')
    result['changes'] = changes + refinement_notes
    result['requirements_updated'] = bool(result['changes'])

    new_support = [s for s in req['support_needs'] if s not in old_req['support_needs']]
    support_line = None
    if new_support and not state.get('support_acknowledged'):
        support_line = SUPPORT_ACK.format(who=_who(text))
        state['support_acknowledged'] = True

    # ----- decide: ask for a required detail, or search --------------------------------------------
    # Only what the search cannot run without is asked before the first results: subject, level,
    # the exam board for A-level, and the currency of a budget given without one. Everything else
    # (topics, budget, lesson type, ...) is optional: we search now and refine afterwards.
    q = apm.next_question(req)
    if q and q['field'] == 'location':
        q = None             # in chat, an area is optional: asking would block the search the student expects
    if q:
        state['last_question_field'] = q['field']
        lead = _ack(opener, result['changes'], req, state, for_question=True)
        body = ' '.join(x for x in (lead, q['text']) if x)
        if support_line:
            body = support_line + ' ' + body if not lead else lead + ' ' + support_line + ' ' + q['text']
        say('clarification', body, field=q['field'], options=q.get('options') or [], changes=result['changes'])
        return _finish(result, req, state)

    answered_followup = last_field in ('budget', 'modality')
    state['last_question_field'] = None

    # Nothing that affects the search changed (small talk, "either is fine", a repeat):
    # keep the results already on screen instead of searching again.
    if (state.get('matched_once') and not it['go'] and not support_line
            and _search_key(req, state) == _search_key(old_req, old_state)):
        return _unchanged_reply(result, say, req, state, it, answered_followup)

    # First search: the results sentence already says what was searched for.
    lead = _ack(opener, result['changes'], req, state) if old_state.get('matched_once') else opener
    if not text:
        lead = ''
    return _match_and_reply(result, say, req, state, old_req, old_state, run_match, explain, it,
                            lead=lead, support_line=support_line, message=text)


def _search_key(req, state):
    """Everything that changes which tutors are shown, as a comparable value."""
    r = apm.clean_requirements(req)
    return (repr(sorted(r.items())), repr([state.get(k) for k in _SEARCH_STATE_KEYS]))


def _ask_followup(state, q):
    state['asked'][q['field']] = True
    state['last_question_field'] = q['field']
    return q


def _unchanged_reply(result, say, req, state, it, answered_followup):
    have_results = bool(state.get('last_results'))
    parts = []
    if it.get('thanks'):
        parts.append("You're welcome!")
    elif answered_followup:
        parts.append("No problem, I'll leave that open.")
    if have_results:
        parts.append('Your search is the same, so the tutors above are still your best matches.')
    else:
        parts.append('Nothing has changed since my last search.')
    q = followup_question(req, state)
    if q:
        _ask_followup(state, q)
        parts.append(q['text'])
        say('clarification', ' '.join(parts), field=q['field'], options=q.get('options') or [], changes=[])
    else:
        parts.append('You can change the budget, lesson type, level or subject'
                     + (', or ask me to compare them.' if have_results else '.'))
        say('message', ' '.join(parts), quick_replies=_result_quick_replies(req, state) if have_results else [])
    return _finish(result, req, state)


def _ack(opener, changes, req, state, for_question=False):
    """Short, natural acknowledgement of what changed. Budget gets the spec's wording; a single plain
    answer to the question just asked needs no echo."""
    if not changes:
        return ''
    notes = []
    for c in changes:
        if c.startswith('budget:'):
            if state.get('preferred_rate') and req.get('max_rate') and state['preferred_rate'] < req['max_rate']:
                cur = req.get('currency')
                return (f"{opener} I'll prioritise tutors around {money(cur, state['preferred_rate'])} and also consider "
                        f"suitable tutors up to {money(cur, req['max_rate'])}.")
            notes.append('budget ' + c[len('budget: '):])
        elif c != 'learning-support needs noted':
            notes.append(c)
    if not notes:
        return opener
    if for_question and len(notes) == 1 and notes[0].split(':')[0] in ('subject', 'level', 'exam board', 'topics', 'lessons'):
        return opener
    if for_question:
        return f"{opener} I've noted: " + '; '.join(notes) + '.'
    return 'Updated: ' + '; '.join(notes) + '.'


def _match_and_reply(result, say, req, state, old_req, old_state, run_match, explain, it,
                     lead='', support_line=None, message=''):
    result['matching_triggered'] = True
    profile, matches, diag = run_match(req)
    result['diagnostics'] = diag
    cap, cur = req.get('max_rate'), req.get('currency')

    # Verified tutors who fit everything except the price. Same currency only: a rate in another
    # currency is never converted or compared.
    over_cap = []
    if cap:
        _, wide, _ = run_match(dict(req, max_rate=None, currency=None))
        over_cap = [m for m in wide if _verified(m) and m.get('hourly_rate') is not None
                    and m.get('price_currency') == cur and m['hourly_rate'] > cap]
        over_cap, _ = apply_chat_filters(over_cap, req, state)
        over_cap = sort_matches(over_cap, 'price')
    if state.get('allow_above_budget'):
        alternatives = over_cap
    else:   # slightly above the limit: shown automatically, never hidden
        alternatives = [m for m in over_cap if m['hourly_rate'] <= cap * (1 + ALT_MARGIN)]

    kept, notes = apply_chat_filters(matches, req, state)
    groups = build_groups(kept, req, state, alternatives)
    displayed = [m for g in groups for m in g['matches']]
    if displayed:
        explain(message, profile, displayed)

    state['matched_once'] = True
    state['last_results'] = [{'tutor_id': m['tutor_id'], 'name': m['tutor_name'], 'group': g['key']}
                             for g in groups for m in g['matches']]
    n = {g['key']: len(g['matches']) for g in groups}
    shown_ids = {m['tutor_id'] for m in displayed}
    further_above = [m for m in over_cap if m['tutor_id'] not in shown_ids]
    desc = describe_search(req)
    within_n, above_n, alt_n = n.get('within', 0), n.get('slightly_above', 0), n.get('alternatives', 0)
    in_budget = within_n + above_n
    budget_txt = money(cur, cap) if cap else ''
    question = None          # at most ONE question per reply
    quick = []

    if in_budget or alt_n:
        if cap and in_budget:
            body = (f"I found {in_budget} {_plural(in_budget, 'tutor')} for {desc} within your budget "
                    f"({_bud(req, state)}).")
            if above_n:
                body += (f" {within_n} {_plural(within_n, 'is', 'are')} at or below your preferred amount and {above_n} "
                         f"{_plural(above_n, 'is', 'are')} slightly above it.")
            if alt_n:
                body += (f" I've also listed {alt_n} {_plural(alt_n, 'tutor')} just above your budget under "
                         "Alternative options.")
        elif cap:
            body = (f"I couldn't find a tutor for {desc} within your budget of {budget_txt}. "
                    f"{_plural(alt_n, 'This tutor charges', 'These tutors charge')} a little more and "
                    f"{_plural(alt_n, 'is', 'are')} listed under Alternative options.")
        else:
            body = (f"I found {in_budget} {_plural(in_budget, 'tutor')} who "
                    f"{_plural(in_budget, 'teaches', 'teach')} {desc}.")
        if n.get('unconfirmed'):
            body += (f" {n['unconfirmed']} more {_plural(n['unconfirmed'], 'tutor has', 'tutors have')} not listed every "
                     "detail, so they are shown separately.")
        kind = 'results'
    elif displayed:  # only unconfirmed tutors
        body = ("No tutor's profile confirms every requirement you gave. These tutors don't contradict any of them but "
                "have not listed some details, so please check with them before booking.")
        kind = 'results'
    else:
        body = _no_match_text(req, state, diag, run_match, notes, further_above)
        kind = 'no_match'

    if notes and displayed:
        body += ' Note: ' + ' '.join(notes)
    if req.get('modality') == 'in_person' and not req.get('location') and displayed:
        body += ' Tell me your area if you want tutors who teach near you.'
    sp = req.get('support_needs') or []
    if sp and displayed:
        with_support = [m for m in displayed if m.get('support_match')]
        body += (f" {len(with_support)} of these {_plural(len(displayed), 'tutor lists', 'tutors list')} "
                 f"experience with {' / '.join(sp)}; the others don't list it, so I haven't claimed it for them.")

    # ----- the single follow-up --------------------------------------------------------------
    state['awaiting'] = None
    if further_above and cap and not state.get('allow_above_budget'):
        k = len(further_above)
        lo = money(cur, further_above[0]['hourly_rate'])
        body += ((f" There {_plural(k, 'is', 'are')} also {k} qualified {_plural(k, 'tutor')} from {lo} per hour."
                  if displayed else
                  f" I did find {k} qualified {_plural(k, 'tutor')} from {lo} per hour.")
                 + ' Would you like to see them?')
        state['awaiting'] = 'above_budget_offer'
        quick = ['Yes, show them', 'No thanks']
    elif displayed:
        question = followup_question(req, state)
        if question:
            _ask_followup(state, question)
            body += ' ' + question['text']
        elif len(displayed) > 1:
            body += ' Would you like me to explain the differences between them?'
            state['awaiting'] = 'explain_offer'
        else:
            body += ' Ask me why this tutor was recommended.'
        quick = (question.get('options') if question else _result_quick_replies(req, state))
    else:
        quick = _relax_quick_replies(req, diag)

    parts = [p for p in (support_line, lead, body) if p]
    say('results' if kind == 'results' else 'message', ' '.join(parts),
        groups=[{'key': g['key'], 'title': g['title'], 'subtitle': g.get('subtitle', ''), 'matches': g['matches']}
                for g in groups],
        status='ok' if kind == 'results' else 'no_match',
        changes=result['changes'], notes=notes, counts=n,
        suggestions=_failure_hints(diag) if not displayed else [],
        field=question['field'] if question else None,
        quick_replies=quick or [],
        search=desc)
    return _finish(result, req, state)


def _no_match_text(req, state, diag, run_match, notes, further_above):
    """Explain why nothing matched, using only real tutor data: the blocking requirement, what
    EduConnect does have for this subject, and anyone who fits except for price."""
    desc = describe_search(req)
    cap, cur = req.get('max_rate'), req.get('currency')
    if further_above and cap:      # the follow-up offer says how many and from what price
        return f"I couldn't find a tutor for {desc} within your budget of {money(cur, cap)}, or just above it."
    body = f"I couldn't find a tutor for {desc} who meets all your requirements right now."
    hints = _failure_hints(diag)
    if hints:
        body += ' The main blocker: ' + hints[0] + '.'
    pool = _subject_pool(req, run_match)
    if req.get('subjects'):
        subj = ' and '.join(x.title() for x in req['subjects'])
        if pool:
            levels = sorted({LEVEL_LABEL.get(apm_level(l), apm_level(l)) for m in pool for l in (m.get('teaching_levels') or [])
                             if apm_level(l)})
            rates = sorted(m['hourly_rate'] for m in pool if m.get('hourly_rate') is not None and m.get('price_currency') == 'MUR')
            facts = []
            if levels:
                facts.append('teaching ' + ', '.join(levels))
            if rates:
                facts.append(f"from {money('MUR', rates[0])} to {money('MUR', rates[-1])} per hour" if rates[0] != rates[-1]
                             else f"at {money('MUR', rates[0])} per hour")
            body += (f" EduConnect has {len(pool)} {subj} {_plural(len(pool), 'tutor')}"
                     + (f" ({'; '.join(facts)})" if facts else '') + '.')
            body += ' Would you like to change your level, budget or lesson type?'
        else:
            body += f" There are no verified {subj} tutors on EduConnect yet. Would you like to try a related subject?"
    if notes:
        body += ' ' + ' '.join(notes)
    return body


def _subject_pool(req, run_match):
    """Verified tutors for the same subject(s) with every other requirement removed."""
    if not req.get('subjects'):
        return []
    loose = apm.empty_requirements()
    loose['subjects'] = list(req['subjects'])
    try:
        _, ms, _ = run_match(loose)
    except Exception:
        return []
    return [m for m in ms if _verified(m)]


def _relax_quick_replies(req, diag):
    failed = (diag or {}).get('failed') or {}
    q = []
    if 'budget' in failed and req.get('max_rate'):
        q.append('No budget limit')
    if 'modality' in failed and req.get('modality'):
        q.append('Either online or in person')
    if 'level' in failed:
        q += [lv for lv in ('Secondary', 'A-level', 'University') if lv.lower() != (req.get('level') or '')][:2]
    if 'exam_board' in failed and req.get('board'):
        q.append('No specific board')
    return q[:4]


def _bud(req, state):
    return budget_phrase(req, state)


_FAIL_WORDS = {'subject': 'subject', 'level': 'academic level', 'exam_board': 'exam board', 'topics': 'topics',
               'budget': 'budget', 'modality': 'lesson type', 'location': 'location', 'gender': 'tutor gender'}


_STAGE_WORDS = {'after_subject': 'subject', 'after_level': 'academic level', 'after_exam_board': 'exam board',
                'after_topics': 'topics', 'after_budget': 'budget', 'after_modality': 'lesson type',
                'after_location': 'location', 'after_gender': 'tutor gender'}


def _failure_hints(diag):
    """Where the search ran out of tutors, then the requirements that excluded the most."""
    hints = []
    for st in (diag or {}).get('funnel') or []:
        if st.get('remaining') == 0 and st.get('stage') in _STAGE_WORDS:
            hints.append(f"no tutor is left once your {_STAGE_WORDS[st['stage']]} requirement is applied")
            break
    failed = sorted(((diag or {}).get('failed') or {}).items(), key=lambda kv: -kv[1])
    hints += [f"{_FAIL_WORDS.get(k, k)} ({n} of {diag['considered']} tutors don't fit)" for k, n in failed[:2]]
    return hints


def _explain_reply(result, say, req, state, last, run_match, explain, idx, compare=False):
    if not last:
        say('message', 'I have no results to explain yet. Tell me what you need help with and I will find tutors.')
        return _finish(result, req, state)
    profile, matches, diag = run_match(req)
    by_id = {m['tutor_id']: m for m in matches}
    wide = None
    pool = []
    for r in last:
        m = by_id.get(r['tutor_id'])
        if m is None:                       # an above-budget alternative the capped search doesn't return
            if wide is None:
                wide = {m2['tutor_id']: m2 for m2 in run_match(dict(req, max_rate=None, currency=None))[1]}
            m = wide.get(r['tutor_id'])
        if m:
            pool.append(m)
    if not pool:
        say('message', "Those tutors don't match the current requirements any more. Ask me to search again.")
        return _finish(result, req, state)
    explain('', profile, pool)
    if idx is not None and not compare and idx < len(last):
        target = next((m for m in pool if m['tutor_id'] == last[idx]['tutor_id']), None)
        if target:
            say('message', explain_tutor(target, req, state), tutor_id=target['tutor_id'])
            state['awaiting'] = None
            return _finish(result, req, state)
    text = compare_tutors(pool, req, state) or 'I could not find details to compare.'
    say('message', text, quick_replies=_result_quick_replies(req, state))
    state['awaiting'] = None
    return _finish(result, req, state)


def _finish(result, req, state):
    result['requirements'] = req
    result['state'] = state
    return result