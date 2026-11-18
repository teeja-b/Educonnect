"""
EduConnect tutor matching engine.

Eligibility and ranking are deliberately separate:

  1. ELIGIBILITY (hard filters, `check_eligibility`)
     A tutor is eligible only if every requirement the student actually stated is
     verifiably met by the tutor's own profile data: subject, academic level, exam
     board, specific topics, budget (same currency), teaching modality, location for
     in-person lessons, and a gender preference if one was set. Missing tutor data
     FAILS a stated requirement (it can't be verified) and is ignored for requirements
     the student never stated. No score can rescue an ineligible tutor.

  2. RANKING (`rank_tutor`)
     Eligible tutors get a 0-100 compatibility score from a fixed weighted average:
       - student-stated preferences (schedule, language, learning style) count only
         when the student stated them; a tutor with no data for a stated preference
         scores 0 on it
       - tutor quality (rating, experience, qualifications) always counts; missing
         data scores 0, so missing information is never rewarded
     Weights are renormalised over the factors that apply, so percentages are
     comparable between students who gave different amounts of information.

  3. RL FEEDBACK (kept from the original design)
     Student feedback updates per-tutor performance stats and per-student weight
     preferences. Once a tutor has enough real ratings (`calculate_rl_gate`), the
     RL performance score is used ONLY to break ties between equal compatibility
     scores and never changes the displayed percentage.

AI never touches scores. It is used in ai_prompt_matcher.py to interpret what the
student wrote and to phrase explanations.
"""

import pickle
from collections import defaultdict
from datetime import datetime

import numpy as np

from normalize import (
    ALL_LEVELS, json_list, normalize_board, normalize_level, normalize_modality,
    normalize_subject, normalize_subject_or_raw, normalize_topic, subject_satisfied,
    text_supports_board, text_supports_level, topic_covered, without_negated, years_from_text,
)

# Order in which requirements are checked (and reported in the funnel).
REQUIREMENTS = ('subject', 'level', 'exam_board', 'topics', 'budget', 'modality', 'location', 'gender')

# Fixed ranking weights. Student-side factors apply only when stated.
COUNTRY_WIDE = {'mauritius', 'island', 'maurice', 'the island', 'anywhere', 'everywhere'}

SOFT_WEIGHTS = {
    'schedule': 0.20,
    'language': 0.15,
    'learning_style': 0.15,
    'rating': 0.20,
    'experience': 0.15,
    'qualifications': 0.15,
    'coverage': 0.25,   # only when several subjects/topics were requested
    # Learning-support needs the learner stated (ADHD, dyslexia, ...). When present this is the most
    # important ranking criterion: tutors with DOCUMENTED experience of the stated need rank well
    # above those without. When the learner states no need it is absent, so it affects nobody else.
    'support': 1.20,
}
STUDENT_SIDE = ('schedule', 'language', 'learning_style')

# Min real ratings / matches before RL performance may break ties
RL_MIN_MATCHES = 10
RL_MIN_RATINGS = 5


def _new_tutor_perf():
    return {
        'total_matches': 0, 'successful_matches': 0, 'avg_satisfaction': 0.0,
        'completion_rate': 0.0, 'student_retention': 0.0,
        'response_time_score': 1.0, 'reliability_score': 1.0, 'n_ratings': 0,
    }


def _new_student_prefs():
    return {'weight_adjustments': {}, 'preferred_tutor_traits': {},
            'match_history': [], 'satisfaction_history': []}


class RLTutorMatchingSystem:

    def __init__(self, learning_rate=0.1, discount_factor=0.9, epsilon=0.15):
        self.learning_rate = learning_rate
        self.discount_factor = discount_factor
        self.epsilon = epsilon
        self.base_weights = dict(SOFT_WEIGHTS)
        self.q_table = defaultdict(lambda: defaultdict(float))
        self.tutor_performance = defaultdict(_new_tutor_perf)
        self.student_preferences = defaultdict(_new_student_prefs)
        self.feature_rewards = defaultdict(list)

    # ------------------------------------------------------------------ features

    def prepare_student_features(self, profile):
        """Normalise a student profile (survey and/or interpreted prompt) to canonical
        values. Absent fields stay None / []: nothing is defaulted."""
        profile = profile or {}
        subjects = []
        for s in profile.get('preferred_subjects') or []:
            c = normalize_subject(s)
            if c and c not in subjects:
                subjects.append(c)
        level = normalize_level(profile.get('academic_level'))
        board = normalize_board(profile.get('exam_board'))
        rate = profile.get('max_hourly_rate')
        try:
            rate = float(rate) if rate is not None else None
        except (TypeError, ValueError):
            rate = None
        currency = (profile.get('budget_currency') or '').upper() or None
        return {
            'subjects': subjects,
            'level': level,
            'board': board,
            'topics': [t for t in (normalize_topic(x) for x in profile.get('preferred_topics') or []) if t],
            'max_rate': rate,
            'currency': currency if currency in ('MUR', 'USD', 'EUR', 'GBP', 'INR') else None,
            'modality': normalize_modality(profile.get('modality')),
            'location': (profile.get('location') or '').strip().lower() or None,
            'available_time': (profile.get('available_time') or '').strip().lower() or None,
            'learning_style': (profile.get('learning_style') or '').strip().lower() or None,
            'languages': [l.strip().lower() for l in profile.get('preferred_languages') or [] if l],
            'gender_pref': (profile.get('tutor_gender_preference') or 'no_preference').lower(),
            'teaching_methods': [m.lower() for m in profile.get('preferred_teaching_methods') or []],
            'support_needs': [n for n in json_list(profile.get('support_needs')) if n],
        }

    def prepare_tutor_features(self, t):
        evidence = ' '.join(str(t.get(k) or '') for k in
                            ('specializations', 'bio', 'teaching_philosophy')) + ' ' + \
                   ' '.join(str(x) for x in (t.get('course_titles') or [])) + ' ' + \
                   ' '.join(str(x) for x in (t.get('expertise') or []))
        rating = t.get('rating')
        try:
            rating = max(0.0, min(5.0, float(rating))) if rating is not None else None
        except (TypeError, ValueError):
            rating = None
        rate = t.get('hourly_rate')
        try:
            rate = float(rate) if rate is not None else None
        except (TypeError, ValueError):
            rate = None
        levels = {normalize_level(x) for x in json_list(t.get('teaching_levels'))}
        levels |= {normalize_level(x) for x in (t.get('course_levels') or [])}
        return {
            'subjects': {normalize_subject_or_raw(x) for x in json_list(t.get('expertise'))} - {None},
            'levels': levels - {None},
            'boards': {normalize_board(x) for x in json_list(t.get('exam_boards'))} - {None},
            'topics': [normalize_topic(x) for x in json_list(t.get('topics')) if normalize_topic(x)],
            'evidence_text': evidence,
            'rate': rate,
            'currency': (t.get('price_currency') or '').upper() or None,
            'modality': normalize_modality(t.get('modality')),
            'location': (t.get('location') or '').strip().lower(),
            'languages': {str(l).strip().lower() for l in json_list(t.get('languages')) if l},
            'availability': t.get('availability') if isinstance(t.get('availability'), dict) else {},
            'teaching_style': (t.get('teaching_style') or '').strip().lower(),
            'gender': (t.get('gender') or '').strip().lower(),
            'rating': rating,
            'years': years_from_text(t.get('years_experience')),
            'support': self._tutor_support(t),
            'has_education': bool(str(t.get('education') or '').strip()),
            'has_certs': bool(str(t.get('certifications') or '').strip()),
        }

    # --------------------------------------------------------------- eligibility

    def assess(self, s, t):
        """Three-state check of every requirement the student stated.

        Returns (failed, unknown, inferred):
          failed   requirements the tutor's profile EXPLICITLY contradicts -> tutor is excluded
          unknown  mandatory requirements the tutor's profile says nothing about -> the tutor is
                   NOT proven suitable, so is offered only as 'unverified' with the gap disclosed
          inferred requirements met according to the tutor's free text (not a structured field)

        Missing information is never treated as proof of incompatibility, and never as proof of
        suitability either.
        """
        failed, unknown, inferred = [], [], []

        if s['subjects']:
            if not t['subjects']:
                unknown.append('subject')
            elif not any(subject_satisfied(x, t['subjects']) for x in s['subjects']):
                failed.append('subject')

        if s['level']:
            if ALL_LEVELS in t['levels'] or s['level'] in t['levels']:
                pass
            elif t['levels']:
                failed.append('level')                       # tutor lists levels and not this one
            elif text_supports_level(s['level'], t['evidence_text']):
                inferred.append('level')
            else:
                unknown.append('level')

        if s['board']:
            if s['board'] in t['boards']:
                pass
            elif t['boards']:
                failed.append('exam_board')
            elif text_supports_board(s['board'], t['evidence_text']):
                inferred.append('exam_board')
            else:
                unknown.append('exam_board')

        if s['topics']:
            if any(topic_covered(tp, t['evidence_text'], t['topics']) for tp in s['topics']):
                pass
            elif t['topics']:
                failed.append('topics')                      # tutor lists topics and none match
            else:
                unknown.append('topics')

        if s['max_rate'] is not None:
            if t['rate'] is None:
                unknown.append('budget')
            elif t['currency'] and s['currency'] and t['currency'] != s['currency']:
                failed.append('budget')                      # priced in another currency: never converted
            elif not t['currency'] or not s['currency']:
                unknown.append('budget')                     # price without a stated currency: can't compare
            elif t['rate'] > s['max_rate']:
                failed.append('budget')

        if s['modality']:
            if t['modality'] is None:
                unknown.append('modality')
            elif not (s['modality'] == 'hybrid' or t['modality'] == s['modality'] or t['modality'] == 'hybrid'):
                failed.append('modality')
            elif s['modality'] == 'in_person' and s['location'] and s['location'] not in COUNTRY_WIDE \
                    and t['modality'] in ('in_person', 'hybrid'):
                if not t['location']:
                    unknown.append('location')
                elif s['location'] not in t['location']:
                    failed.append('location')

        if s['gender_pref'] != 'no_preference':
            if not t['gender']:
                unknown.append('gender')
            elif t['gender'] != s['gender_pref']:
                failed.append('gender')

        return failed, unknown, inferred

    def check_eligibility(self, s, t):
        """Back-compat: (fully_verified, failed). Unknown requirements make a tutor non-verified."""
        failed, unknown, _ = self.assess(s, t)
        return (not failed and not unknown), failed

    # ------------------------------------------------------------------- ranking

    @staticmethod
    def _time_bucket(slot):
        s = str(slot).lower()
        if s.endswith('morning'):
            return 'morning'
        if s.endswith('afternoon'):
            return 'afternoon'
        if s.endswith('evening') or s.endswith('night'):
            return 'evening'
        return s

    def schedule_score(self, wanted, availability):
        slots = {self._time_bucket(k) for k, v in (availability or {}).items() if v}
        return 1.0 if wanted in slots else 0.0

    def language_score(self, wanted, have):
        if not wanted:
            return None
        return len(set(wanted) & set(have)) / len(set(wanted))

    def style_score(self, student_style, tutor_style):
        if not tutor_style:
            return 0.0
        if tutor_style == student_style:
            return 1.0
        if tutor_style == 'adaptive':
            return 0.8
        close = {('kinesthetic', 'hands-on'), ('hands-on', 'kinesthetic')}
        return 0.6 if (student_style, tutor_style) in close else 0.0

    @staticmethod
    def _tutor_support(t):
        """Support needs the tutor's own profile documents: the structured list, plus any named in
        their own bio / specialisations / certifications. Nothing is inferred beyond their words."""
        from ai_prompt_matcher import detect_support_needs      # lazy: avoids a circular import
        listed = {str(n).strip().lower() for n in json_list(t.get('support_needs')) if n}
        text = ' '.join(str(t.get(k) or '') for k in ('bio', 'teaching_philosophy', 'specializations', 'certifications'))
        return listed | {n.lower() for n in detect_support_needs(without_negated(text))}

    def factor_scores(self, s, t):
        """0..1 per applicable factor. Absent key = factor not applicable."""
        f = {}
        if s['available_time']:
            f['schedule'] = self.schedule_score(s['available_time'], t['availability'])
        if s['languages']:
            f['language'] = self.language_score(s['languages'], t['languages'])
        if s['learning_style']:
            f['learning_style'] = self.style_score(s['learning_style'], t['teaching_style'])
        if s['support_needs']:
            wanted = {n.lower() for n in s['support_needs']}
            f['support'] = len(wanted & t['support']) / len(wanted)
        cov = self.coverage(s, t)
        if len(s['subjects']) > 1 or len(s['topics']) > 1:
            req_total = sum(c['requested'] for c in (cov['subjects'], cov['topics']) if c['requested'])
            got_total = sum(len(c['covered']) for c in (cov['subjects'], cov['topics']) if c['requested'])
            f['coverage'] = got_total / req_total if req_total else None
        f['rating'] = (t['rating'] / 5.0) if t['rating'] is not None else 0.0
        f['experience'] = min(1.0, t['years'] / 10.0) if t['years'] is not None else 0.0
        f['qualifications'] = (0.5 if t['has_education'] else 0.0) + (0.5 if t['has_certs'] else 0.0)
        return f

    def coverage(self, s, t):
        subj_cov = [x for x in s['subjects'] if subject_satisfied(x, t['subjects'])]
        top_cov = [x for x in s['topics'] if topic_covered(x, t['evidence_text'], t['topics'])]
        return {
            'subjects': {'requested': len(s['subjects']), 'covered': subj_cov,
                         'missing': [x for x in s['subjects'] if x not in subj_cov]},
            'topics': {'requested': len(s['topics']), 'covered': top_cov,
                       'missing': [x for x in s['topics'] if x not in top_cov]},
        }

    def get_personalized_weights(self, student_id):
        """Student-specific weights, learned from that student's own feedback history."""
        weights = dict(self.base_weights)
        prefs = self.student_preferences.get(student_id)
        if prefs and len(prefs['match_history']) >= 3:
            for feature, adj in prefs['weight_adjustments'].items():
                if feature in weights:
                    weights[feature] *= (1 + adj)
        return weights

    def rank_tutor(self, s, t, weights):
        f = self.factor_scores(s, t)
        used = {k: v for k, v in f.items() if v is not None}
        total_w = sum(weights[k] for k in used)
        score = sum(weights[k] * v for k, v in used.items()) / total_w if total_w else 0.0
        return score, used

    # ----------------------------------------------------------------------- RL

    def calculate_rl_gate(self, tutor_id):
        perf = self.tutor_performance[tutor_id]
        return min(1.0, perf['total_matches'] / RL_MIN_MATCHES) * min(1.0, perf['n_ratings'] / RL_MIN_RATINGS)

    def calculate_tutor_performance_score(self, tutor_id):
        perf = self.tutor_performance[tutor_id]
        if perf['total_matches'] == 0:
            return 0.0
        success = perf['successful_matches'] / perf['total_matches']
        score = (0.35 * success + 0.30 * perf['avg_satisfaction'] + 0.20 * perf['completion_rate']
                 + 0.075 * perf['response_time_score'] + 0.075 * perf['reliability_score'])
        conf = min(1.0, perf['total_matches'] / 20)
        return conf * score

    def get_state_representation(self, student_profile, tutor_profile):
        s = self.prepare_student_features(student_profile)
        t = self.prepare_tutor_features(tutor_profile)
        return (tuple(sorted(s['subjects'])), s['level'], s['learning_style'], s['available_time'],
                tuple(sorted(t['subjects'])), t['teaching_style'])

    def update_q_value(self, state, action, reward, next_state):
        current_q = self.q_table[state][action]
        max_next_q = max(self.q_table[next_state].values()) if self.q_table[next_state] else 0
        self.q_table[state][action] = current_q + self.learning_rate * (
            reward + self.discount_factor * max_next_q - current_q)

    def record_match_outcome(self, student_id, tutor_id, student_profile, tutor_profile, outcome_data):
        """Learn from student feedback. Reward is built only from signals actually supplied."""
        outcome_data = outcome_data or {}
        rating = outcome_data.get('satisfaction_rating')
        satisfaction = (float(rating) / 5.0) if rating is not None else 0.6
        completed = 1.0 if outcome_data.get('completed', False) else 0.0
        recommend = 1.0 if outcome_data.get('would_recommend', False) else 0.0
        reward = 0.4 * satisfaction + 0.3 * completed + 0.3 * recommend

        perf = self.tutor_performance[tutor_id]
        perf['total_matches'] += 1
        if rating is not None:
            perf['n_ratings'] += 1
        if reward > 0.6:
            perf['successful_matches'] += 1
        n = perf['total_matches']
        perf['avg_satisfaction'] = (perf['avg_satisfaction'] * (n - 1) + satisfaction) / n
        perf['completion_rate'] = (perf['completion_rate'] * (n - 1) + completed) / n
        if 'response_time' in outcome_data:
            rs = max(0.0, 1 - (float(outcome_data['response_time']) / 24))
            perf['response_time_score'] = (perf['response_time_score'] * (n - 1) + rs) / n
        if 'punctuality_score' in outcome_data:
            perf['reliability_score'] = (perf['reliability_score'] * (n - 1)
                                         + float(outcome_data['punctuality_score'])) / n

        state = self.get_state_representation(student_profile, tutor_profile)
        self.update_q_value(state, tutor_id, reward, state)

        prefs = self.student_preferences[student_id]
        prefs['match_history'].append({'tutor_id': tutor_id, 'reward': reward,
                                       'timestamp': datetime.now().isoformat()})
        prefs['satisfaction_history'].append(satisfaction)
        self._update_feature_importance(student_id, student_profile, tutor_profile, reward)
        return reward

    def _update_feature_importance(self, student_id, student_profile, tutor_profile, reward):
        s = self.prepare_student_features(student_profile)
        t = self.prepare_tutor_features(tutor_profile)
        prefs = self.student_preferences[student_id]
        for feature, score in self.factor_scores(s, t).items():
            if score is None:
                continue
            key = f"{student_id}_{feature}"
            self.feature_rewards[key].append({'score': score, 'reward': reward})
            history = self.feature_rewards[key][-10:]
            if len(history) >= 5:
                scores = [h['score'] for h in history]
                rewards = [h['reward'] for h in history]
                if np.std(scores) > 0 and np.std(rewards) > 0:
                    corr = np.corrcoef(scores, rewards)[0, 1]
                    if not np.isnan(corr):
                        prefs['weight_adjustments'][feature] = float(corr) * 0.2

    # ----------------------------------------------------------------- main API

    def match_student_to_tutors(self, student_id, student_profile, tutors_list, use_rl=True,
                                return_diagnostics=False):
        """
        Returns ranked matches (eligible tutors only). With return_diagnostics=True returns
        (matches, diagnostics) where diagnostics = {'considered': n, 'failed': {req: count}}
        so the caller can tell the student which requirement to relax.
        """
        s = self.prepare_student_features(student_profile)
        weights = self.get_personalized_weights(student_id) if (use_rl and student_id is not None) \
            else dict(self.base_weights)

        verified, unverified = [], []
        failed_counts, unknown_counts = defaultdict(int), defaultdict(int)
        survivors = {r: 0 for r in REQUIREMENTS}       # funnel: tutors not explicitly failing up to each stage
        for tutor in tutors_list:
            t = self.prepare_tutor_features(tutor)
            failed, unknown, inferred = self.assess(s, t)
            for req in failed:
                failed_counts[req] += 1
            for req in unknown:
                unknown_counts[req] += 1
            alive = True
            for r in REQUIREMENTS:                      # sequential funnel counts
                alive = alive and r not in failed
                if alive:
                    survivors[r] += 1
            if failed:
                continue
            score, used = self.rank_tutor(s, t, weights)
            tutor_id = tutor.get('id')
            gate = self.calculate_rl_gate(tutor_id) if use_rl else 0.0
            stated = {'subject': bool(s['subjects']), 'level': bool(s['level']), 'exam_board': bool(s['board']),
                      'topics': bool(s['topics']), 'budget': s['max_rate'] is not None,
                      'modality': bool(s['modality']), 'gender': s['gender_pref'] != 'no_preference'}
            met = [r for r, on in stated.items() if on and r not in unknown and r not in inferred]
            match = {
                'tutor_id': tutor_id,
                'tutor_name': tutor.get('name'),
                'match_score': int(round(score * 100)),
                'rl_gate': round(gate, 3),
                '_rl_tiebreak': gate * self.calculate_tutor_performance_score(tutor_id),
                'breakdown': {
                    **{k: int(round(v * 100)) for k, v in used.items()},
                    'scored_on': sorted(used),
                    'rating_source': 'verified' if t['rating'] is not None else 'missing',
                },
                'coverage': self.coverage(s, t),
                'verification': {
                    'status': 'unverified' if (unknown or inferred) else 'verified',
                    'confirmed': met,                     # stated requirements the profile explicitly satisfies
                    'from_profile_text': inferred,        # satisfied only according to the tutor's free text
                    'not_stated_by_tutor': unknown,       # stated requirements the profile says nothing about
                },
                'requirements_verified': {
                    'subjects': s['subjects'] if 'subject' in met else [],
                    'level': s['level'] if 'level' in met else None,
                    'exam_board': s['board'] if 'exam_board' in met else None,
                    'topics': s['topics'] if 'topics' in met else [],
                    'modality': s['modality'] if 'modality' in met else None,
                },
            }
            (unverified if (unknown or inferred) else verified).append(match)

        def _order(m):
            return (-m['match_score'], -m['_rl_tiebreak'], str(m['tutor_name'] or '').casefold(), str(m['tutor_id']))
        verified.sort(key=_order)
        unverified.sort(key=_order)
        matches = verified + unverified                 # fully verified tutors always come first
        for m in matches:
            m.pop('_rl_tiebreak', None)
        if return_diagnostics:
            # Tutors NOT explicitly contradicted, cumulatively after each requirement. Only stated
            # requirements can remove anyone, so unstated ones repeat the previous number.
            funnel = [{'stage': 'verified_tutors_loaded', 'remaining': len(tutors_list)}] + [
                {'stage': f'after_{r}', 'remaining': survivors[r]} for r in REQUIREMENTS]
            return matches, {'considered': len(tutors_list), 'eligible': len(verified),
                             'unverified': len(unverified), 'failed': dict(failed_counts),
                             'unknown': dict(unknown_counts), 'funnel': funnel}
        return matches

    # -------------------------------------------------------------- persistence

    def save_model(self, filepath):
        data = {
            'q_table': {k: dict(v) for k, v in self.q_table.items()},
            'tutor_performance': dict(self.tutor_performance),
            'student_preferences': dict(self.student_preferences),
            'feature_rewards': dict(self.feature_rewards),
            'learning_rate': self.learning_rate, 'discount_factor': self.discount_factor,
            'epsilon': self.epsilon, 'version': '4.0', 'last_updated': datetime.now().isoformat(),
        }
        with open(filepath, 'wb') as f:
            pickle.dump(data, f)

    def load_model(self, filepath):
        with open(filepath, 'rb') as f:
            data = pickle.load(f)
        self.q_table = defaultdict(lambda: defaultdict(float),
                                   {k: defaultdict(float, v) for k, v in data.get('q_table', {}).items()})
        self.tutor_performance = defaultdict(_new_tutor_perf, data.get('tutor_performance', {}))
        self.student_preferences = defaultdict(_new_student_prefs, data.get('student_preferences', {}))
        self.feature_rewards = defaultdict(list, data.get('feature_rewards', {}))