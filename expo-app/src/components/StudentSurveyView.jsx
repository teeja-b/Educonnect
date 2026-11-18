/**
 * StudentSurveyView.jsx
 *
 * Shows a student's learning-survey answers, and only those:
 *   skill ratings, motivation, learning style, skill level, study time,
 *   subjects, languages, learning goals and preferred tutor gender.
 *
 * Exports
 *   SurveyDetails                 - the sections; read-only, or editable when `editing`
 *   default StudentProfileViewer  - read-only modal a tutor opens from the chat
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather as Icon } from '@expo/vector-icons';
import { Text, colors as C, radius, shadow, useCompact } from '../theme';
import { storage } from '../utils/storage';
import { API_URL } from '../utils/config';

// ── The options offered in StudentSurvey.jsx ────────────────────────────────
export const SKILLS = [
  { field: 'math_score', label: 'Mathematics', color: '#2F5BEA' },
  { field: 'science_score', label: 'Science', color: '#059669' },
  { field: 'language_score', label: 'Language Arts', color: '#2F5BEA' },
  { field: 'tech_score', label: 'Technology', color: '#EA580C' },
  { field: 'motivation_level', label: 'Motivation Level', color: '#CA8A04' },
];
export const LEARNING_STYLES = [
  { value: 'visual', label: 'Visual' },
  { value: 'auditory', label: 'Auditory' },
  { value: 'kinesthetic', label: 'Kinesthetic' },
];
export const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
export const STUDY_TIMES = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];
export const SUBJECTS = ['Mathematics', 'Science', 'English', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'History', 'Art', 'Music', 'Business', 'Languages'];
export const LANGUAGES = ['English', 'Spanish', 'French', 'Mandarin', 'Hindi', 'Arabic', 'Portuguese', 'Russian'];
export const GOALS = ['Improve grades', 'Prepare for exams', 'Learn a new skill', 'Career advancement',
  'University entrance', 'Personal enrichment', 'Catch up on coursework', 'Get ahead in class',
  'Build confidence', 'Professional certification', 'Hobby & interest', 'Language fluency'];
export const GENDER_PREFS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'no_preference', label: 'No preference' },
];

/** Survey fields only, from an /api/student/profile or tutor-view response. */
export const pickSurvey = (p = {}) => ({
  math_score: p.math_score || 5,
  science_score: p.science_score || 5,
  language_score: p.language_score || 5,
  tech_score: p.tech_score || 5,
  motivation_level: p.motivation_level || 5,
  learning_style: p.learning_style || '',
  skill_level: p.skill_level || '',
  available_time: p.available_time || '',
  preferred_subjects: p.preferred_subjects || [],
  preferred_languages: p.preferred_languages || [],
  selected_goals: p.selected_goals || [],
  tutor_gender_preference: p.tutor_gender_preference || 'no_preference',
});

const labelOf = (options, value) => options.find(o => o.value === value)?.label || 'Not set';

// ── Building blocks ─────────────────────────────────────────────────────────
const Section = ({ icon, title, children }) => (
  <View style={s.section}>
    <View style={s.sectionHeader}>
      <Icon name={icon} size={15} color={C.primary} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const Field = ({ label, style, children }) => (
  <View style={[s.field, style]}>
    <Text style={s.fieldLabel}>{label}</Text>
    {children}
  </View>
);

// Same 1–10 tap control as the survey
const Rating = ({ label, value, color, editing, onChange, style }) => (
  <View style={[s.rating, style]}>
    <View style={s.ratingHeader}>
      <Text style={s.ratingLabel}>{label}</Text>
      <Text style={[s.ratingValue, { color }]}>{value}/10</Text>
    </View>
    {editing ? (
      <View style={s.dotRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <TouchableOpacity
            key={n}
            style={[s.dot, value >= n && { backgroundColor: color }]}
            onPress={() => onChange(n)}
            accessibilityLabel={`${label} ${n} of 10`}
          />
        ))}
      </View>
    ) : (
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${value * 10}%`, backgroundColor: color }]} />
      </View>
    )}
  </View>
);

const SingleChoice = ({ options, value, onChange }) => (
  <View style={s.chipRow}>
    {options.map(o => {
      const active = value === o.value;
      return (
        <TouchableOpacity key={o.value} style={[s.option, active && s.optionActive]} onPress={() => onChange(o.value)}>
          <Text style={[s.optionText, active && s.optionTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const MultiChoice = ({ options, values, onChange }) => (
  <View style={s.chipRow}>
    {options.map(o => {
      const active = values.includes(o);
      return (
        <TouchableOpacity
          key={o}
          style={[s.option, active && s.optionActive]}
          onPress={() => onChange(active ? values.filter(v => v !== o) : [...values, o])}
        >
          <Text style={[s.optionText, active && s.optionTextActive]}>{o}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const Chips = ({ items, empty = 'None selected' }) => (
  items.length > 0 ? (
    <View style={s.chipRow}>
      {items.map((t, i) => <View key={i} style={s.chip}><Text style={s.chipText}>{t}</Text></View>)}
    </View>
  ) : <Text style={s.notSet}>{empty}</Text>
);

// ── Survey sections ─────────────────────────────────────────────────────────
export const SurveyDetails = ({ survey, editing = false, onChange = () => {} }) => {
  const compact = useCompact();
  const col = compact ? s.colFull : s.colHalf;
  const set = (field) => (value) => onChange({ ...survey, [field]: value });

  return (
    <>
      <Section icon="trending-up" title="Skills & Motivation">
        <View style={s.grid}>
          {SKILLS.map(k => (
            <Rating key={k.field} label={k.label} color={k.color} value={survey[k.field]}
              editing={editing} onChange={set(k.field)} style={col} />
          ))}
        </View>
      </Section>

      <Section icon="book-open" title="Learning Preferences">
        <View style={s.grid}>
          <Field label="Learning Style" style={col}>
            {editing ? <SingleChoice options={LEARNING_STYLES} value={survey.learning_style} onChange={set('learning_style')} />
              : <Text style={s.value}>{labelOf(LEARNING_STYLES, survey.learning_style)}</Text>}
          </Field>
          <Field label="Skill Level" style={col}>
            {editing ? <SingleChoice options={SKILL_LEVELS} value={survey.skill_level} onChange={set('skill_level')} />
              : <Text style={s.value}>{labelOf(SKILL_LEVELS, survey.skill_level)}</Text>}
          </Field>
          <Field label="Study Time" style={col}>
            {editing ? <SingleChoice options={STUDY_TIMES} value={survey.available_time} onChange={set('available_time')} />
              : <Text style={s.value}>{labelOf(STUDY_TIMES, survey.available_time)}</Text>}
          </Field>
        </View>
      </Section>

      <Section icon="layers" title="Subjects & Languages">
        <Field label="Subjects to learn">
          {editing ? <MultiChoice options={SUBJECTS} values={survey.preferred_subjects} onChange={set('preferred_subjects')} />
            : <Chips items={survey.preferred_subjects} />}
        </Field>
        <Field label="Languages spoken">
          {editing ? <MultiChoice options={LANGUAGES} values={survey.preferred_languages} onChange={set('preferred_languages')} />
            : <Chips items={survey.preferred_languages} />}
        </Field>
      </Section>

      <Section icon="target" title="Goals & Tutor Preference">
        <Field label="Learning goals">
          {editing ? <MultiChoice options={GOALS} values={survey.selected_goals} onChange={set('selected_goals')} />
            : <Chips items={survey.selected_goals} />}
        </Field>
        <Field label="Preferred tutor gender">
          {editing ? <SingleChoice options={GENDER_PREFS} value={survey.tutor_gender_preference} onChange={set('tutor_gender_preference')} />
            : <Text style={s.value}>{labelOf(GENDER_PREFS, survey.tutor_gender_preference)}</Text>}
        </Field>
      </Section>
    </>
  );
};

// ── Tutor's read-only view of a student ─────────────────────────────────────
const StudentProfileViewer = ({ studentId, studentName, visible = true, onClose }) => {
  const insets = useSafeAreaInsets();
  // Android draws modals under the status / navigation bars; RN's SafeAreaView only pads on iOS.
  const sysPad = Platform.OS === 'android' ? { paddingTop: insets.top, paddingBottom: insets.bottom } : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState(studentName || 'Student');
  const [survey, setSurvey] = useState(null);

  useEffect(() => {
    if (!visible || !studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const token = await storage.getItem('token');
        const res = await fetch(`${API_URL}/api/tutor/students/${studentId}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
        if (cancelled) return;
        if (data.student?.full_name) setName(data.student.full_name);
        setSurvey(data.survey ? pickSurvey(data.survey) : null);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, studentId]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[s.container, sysPad]}>
        <View style={s.header}>
          <View style={s.headerInner}>
            <View style={s.avatar}><Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
            <View style={s.headerText}>
              <Text style={s.headerName} numberOfLines={1}>{name}</Text>
              <Text style={s.headerSub}>Learning survey</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityLabel="Close">
              <Icon name="x" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={s.centered}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : error ? (
          <View style={s.centered}>
            <Icon name="alert-circle" size={32} color={C.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : !survey ? (
          <View style={s.centered}>
            <Icon name="clipboard" size={32} color={C.textSubtle} />
            <Text style={s.notSet}>This student hasn't completed the survey yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll}>
            <SurveyDetails survey={survey} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

export default StudentProfileViewer;

const CONTENT_WIDTH = 720;

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorText: { color: C.danger, fontSize: 13, textAlign: 'center' },

  header: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  headerInner: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: C.text, fontSize: 17, fontWeight: '700' },
  headerText: { flex: 1, minWidth: 0 },
  headerName: { color: C.text, fontWeight: '700', fontSize: 15 },
  headerSub: { color: C.textMuted, fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 6, flexShrink: 0 },

  scroll: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },

  section: { backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, marginBottom: 10, borderWidth: 1, borderColor: C.tile, ...shadow },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontWeight: '700', fontSize: 13, color: '#374151', flexShrink: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  colHalf: { flexBasis: '45%', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  colFull: { width: '100%', minWidth: 0 },

  field: { marginBottom: 10, minWidth: 0 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.textMuted, marginBottom: 4 },
  value: { fontSize: 13, color: C.text },
  notSet: { fontSize: 13, color: C.textSubtle, fontStyle: 'italic', textAlign: 'center' },

  rating: { backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  ratingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ratingLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  ratingValue: { fontSize: 12, fontWeight: '700' },
  barBg: { height: 5, backgroundColor: C.border, borderRadius: 3 },
  barFill: { height: 5, borderRadius: 3 },
  dotRow: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 14, borderRadius: 7, backgroundColor: C.border },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  chipText: { fontSize: 12, color: C.primaryDark },
  option: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.bg },
  optionActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  optionText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  optionTextActive: { color: C.primary, fontWeight: '700' },
});
