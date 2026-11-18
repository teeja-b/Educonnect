import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, colors as C, font, radius, shadow, useCompact } from '../theme';
import { Brain, BookOpen, Languages, Code, Zap, Clock, Star, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react-native';
import { storage } from '../utils/storage';

import { API_URL } from '../utils/config';

const StudentSurvey = ({ onComplete, onClose }) => {
    const [step, setStep] = useState(1);
    // Size the sheet from the viewport so header, content and footer always fit.
    const { height: winHeight } = useWindowDimensions();
    const compact = useCompact();
    // Android draws this sheet under the status bar and navigation buttons,
    // so keep it clear of both (same approach as App.jsx).
    const insets = useSafeAreaInsets();
    const padTop = Platform.OS === 'android' ? insets.top : 0;
    const padBottom = Platform.OS === 'android' ? insets.bottom : 0;
    const sheetMaxHeight = Math.min((winHeight - padTop - padBottom) * (compact ? 0.92 : 0.86), 640);
    const [surveyData, setSurveyData] = useState({
        mathScore: 5, scienceScore: 5, languageScore: 5, techScore: 5,
        motivationLevel: 5, learningStyle: '', preferredSubjects: [],
        skillLevel: '', availableTime: '', preferredLanguages: [], learningGoals: '',
        tutorGenderPreference: '',
        selectedGoals: [],
    });

    const totalSteps = 4;
    const update = (field, value) => setSurveyData(prev => ({ ...prev, [field]: value }));
    const toggleArr = (field, item) => setSurveyData(prev => {
        const arr = prev[field];
        return { ...prev, [field]: arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item] };
    });

    const handleSubmit = async () => {
        try {
            const token = await storage.getItem('token');
            if (!token) { alert('Please log in first'); return; }
            const body = {
                math_score: surveyData.mathScore, science_score: surveyData.scienceScore,
                language_score: surveyData.languageScore, tech_score: surveyData.techScore,
                motivation_level: surveyData.motivationLevel, learning_style: surveyData.learningStyle,
                preferred_subjects: surveyData.preferredSubjects, skill_level: surveyData.skillLevel,
                available_time: surveyData.availableTime, preferred_languages: surveyData.preferredLanguages,

                selected_goals: surveyData.selectedGoals,
                tutor_gender_preference: surveyData.tutorGenderPreference,
            };
            const [r1, r2] = await Promise.all([
                fetch(`${API_URL}/api/student/survey`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(body),
                }),
                fetch(`${API_URL}/api/student/profile`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(body),
                }),
            ]);
            if (!r1.ok || !r2.ok) throw new Error('Submission failed');
            alert('Survey completed successfully! 🎉');
            onComplete();
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    const canProceed = () => {
        if (step === 1) return true;
        if (step === 2) return surveyData.learningStyle && surveyData.skillLevel && surveyData.availableTime;
        if (step === 3) return surveyData.preferredSubjects.length > 0 && surveyData.preferredLanguages.length > 0;
        if (step === 4) return surveyData.selectedGoals?.length > 0 && surveyData.tutorGenderPreference !== '';
        return false;
    };

    // ── STEP 1: Skill Sliders ──────────────────────────────────────────────────
    const Slider = ({ label, field, value, color }) => (
        <View style={styles.sliderWrap}>
            <View style={styles.sliderLabelRow}>
                <Text style={styles.sliderLabel}>{label}</Text>
                <Text style={[styles.sliderValue, { color }]}>{value}/10</Text>
            </View>
            <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${value * 10}%`, backgroundColor: color }]} />
            </View>
            <View style={styles.sliderBtnRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <TouchableOpacity
                        key={n}
                        style={[styles.sliderDot, value >= n && { backgroundColor: color }]}
                        onPress={() => update(field, n)}
                    />
                ))}
            </View>
        </View>
    );

    const Step1 = () => (
        <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.stepHeader}>
                <Brain size={26} color="#2F5BEA" />
                <Text style={styles.stepTitle}>Rate Your Skills</Text>
                <Text style={styles.stepSub}>Help us understand your current abilities</Text>
            </View>
            <Slider label="Mathematics" field="mathScore" value={surveyData.mathScore} color="#2F5BEA" />
            <Slider label="Science" field="scienceScore" value={surveyData.scienceScore} color="#059669" />
            <Slider label="Language Arts" field="languageScore" value={surveyData.languageScore} color="#2F5BEA" />
            <Slider label="Technology" field="techScore" value={surveyData.techScore} color="#ea580c" />
            <Slider label="Motivation Level" field="motivationLevel" value={surveyData.motivationLevel} color="#ca8a04" />
        </ScrollView>
    );

    // ── STEP 2: Learning Preferences ──────────────────────────────────────────
    const Step2 = () => (
        <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.stepHeader}>
                <BookOpen size={26} color="#2F5BEA" />
                <Text style={styles.stepTitle}>Learning Preferences</Text>
                <Text style={styles.stepSub}>Tell us how you learn best</Text>
            </View>
            <Text style={styles.sectionLabel}>How do you learn best?</Text>
            {[
                { value: 'visual', desc: 'Diagrams, videos, and written content' },
                { value: 'auditory', desc: 'Listening and discussing' },
                { value: 'kinesthetic', desc: 'Doing and hands-on practice' },
            ].map(s => (
                <TouchableOpacity
                    key={s.value}
                    style={[styles.optionCard, surveyData.learningStyle === s.value && styles.optionCardActive]}
                    onPress={() => update('learningStyle', s.value)}
                >
                    <Text style={[styles.optionTitle, surveyData.learningStyle === s.value && styles.optionTitleActive]}>
                        {s.value.charAt(0).toUpperCase() + s.value.slice(1)}
                    </Text>
                    <Text style={styles.optionDesc}>{s.desc}</Text>
                </TouchableOpacity>
            ))}

            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Overall Skill Level</Text>
            <View style={styles.chipRow}>
                {['beginner', 'intermediate', 'advanced'].map(l => (
                    <TouchableOpacity
                        key={l}
                        style={[styles.chip, surveyData.skillLevel === l && styles.chipActivePurple]}
                        onPress={() => update('skillLevel', l)}
                    >
                        <Text style={[styles.chipText, surveyData.skillLevel === l && { color: '#2F5BEA' }]}>
                            {l.charAt(0).toUpperCase() + l.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>When can you study?</Text>
            <View style={styles.chipRow}>
                {['morning', 'afternoon', 'evening'].map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.chip, surveyData.availableTime === t && styles.chipActiveGreen]}
                        onPress={() => update('availableTime', t)}
                    >
                        <Text style={[styles.chipText, surveyData.availableTime === t && { color: '#059669' }]}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );

    // ── STEP 3: Subjects & Languages ──────────────────────────────────────────
    const Step3 = () => (
        <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.stepHeader}>
                <Text style={styles.stepTitle}>Subjects & Languages</Text>
                <Text style={styles.stepSub}>What interests you?</Text>
            </View>
            <Text style={styles.sectionLabel}>Subjects to learn</Text>
            <View style={styles.tagGrid}>
                {['Mathematics', 'Science', 'English', 'Physics', 'Chemistry', 'Biology',
                    'Computer Science', 'History', 'Art', 'Music', 'Business', 'Languages'].map(s => {
                        const active = surveyData.preferredSubjects.includes(s);
                        return (
                            <TouchableOpacity
                                key={s}
                                style={[styles.tagChip, active && styles.tagChipActive]}
                                onPress={() => toggleArr('preferredSubjects', s)}
                            >
                                {active && <CheckCircle size={12} color="#2F5BEA" style={{ marginRight: 4 }} />}
                                <Text style={[styles.tagText, active && { color: '#2F5BEA' }]}>{s}</Text>
                            </TouchableOpacity>
                        );
                    })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Languages you speak</Text>
            <View style={styles.tagGrid}>
                {['English', 'Spanish', 'French', 'Mandarin', 'Hindi', 'Arabic', 'Portuguese', 'Russian'].map(l => {
                    const active = surveyData.preferredLanguages.includes(l);
                    return (
                        <TouchableOpacity
                            key={l}
                            style={[styles.tagChip, active && styles.tagChipActiveGreen]}
                            onPress={() => toggleArr('preferredLanguages', l)}
                        >
                            {active && <CheckCircle size={12} color="#059669" style={{ marginRight: 4 }} />}
                            <Text style={[styles.tagText, active && { color: '#059669' }]}>{l}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );

    // ── STEP 4: Goals ─────────────────────────────────────────────────────────
    const Step4 = () => (
        <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.stepHeader}>
                <Star size={26} color="#ca8a04" />
                <Text style={styles.stepTitle}>Your Learning Goals</Text>
                <Text style={styles.stepSub}>What do you want to achieve?</Text>
            </View>

            {/* Learning Goals Options */}
            <Text style={styles.sectionLabel}>Select your learning goals</Text>
            <View style={styles.tagGrid}>
                {[
                    'Improve grades',
                    'Prepare for exams',
                    'Learn a new skill',
                    'Career advancement',
                    'University entrance',
                    'Personal enrichment',
                    'Catch up on coursework',
                    'Get ahead in class',
                    'Build confidence',
                    'Professional certification',
                    'Hobby & interest',
                    'Language fluency',
                ].map(goal => {
                    const active = surveyData.selectedGoals?.includes(goal);
                    return (
                        <TouchableOpacity
                            key={goal}
                            style={[styles.tagChip, active && styles.tagChipActive]}
                            onPress={() => toggleArr('selectedGoals', goal)}
                        >
                            {active && <CheckCircle size={12} color="#2F5BEA" style={{ marginRight: 4 }} />}
                            <Text style={[styles.tagText, active && { color: '#2F5BEA' }]}>{goal}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Additional Details */}
            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Anything else to add? (optional)</Text>
            <TextInput
                style={styles.textarea}
                placeholder="E.g. I have an exam in 3 months and need focused help..."
                multiline
                numberOfLines={2}
                value={surveyData.learningGoals}
                onChangeText={v => update('learningGoals', v)}
            />

            {/* Tutor Gender Preference */}
            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Preferred tutor gender</Text>
            <View style={styles.chipRow}>
                {[
                    { value: 'female', label: '👩 Female' },
                    { value: 'male', label: '👨 Male' },
                    { value: 'no_preference', label: 'No preference' },
                ].map(opt => (
                    <TouchableOpacity
                        key={opt.value}
                        style={[
                            styles.chip,
                            surveyData.tutorGenderPreference === opt.value && styles.chipActiveBlue,
                        ]}
                        onPress={() => update('tutorGenderPreference', opt.value)}
                    >
                        <Text style={[
                            styles.chipText,
                            surveyData.tutorGenderPreference === opt.value && { color: '#2F5BEA' },
                        ]}>
                            {opt.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Summary</Text>
                <Text style={styles.summaryItem}>✓ Skill ratings completed</Text>
                <Text style={styles.summaryItem}>✓ Learning style: {surveyData.learningStyle || 'Not set'}</Text>
                <Text style={styles.summaryItem}>✓ Subjects: {surveyData.preferredSubjects.length} selected</Text>
                <Text style={styles.summaryItem}>✓ Languages: {surveyData.preferredLanguages.length} selected</Text>
                <Text style={styles.summaryItem}>
                    ✓ Goals: {surveyData.selectedGoals?.length || 0} selected
                </Text>
                <Text style={styles.summaryItem}>
                    ✓ Tutor preference: {
                        { female: 'Female', male: 'Male', no_preference: 'No preference' }
                        [surveyData.tutorGenderPreference] || 'Not set'
                    }
                </Text>
            </View>
        </ScrollView>
    );

    return (
        <Modal transparent animationType="slide" visible>
            <View style={[styles.overlay, !compact && styles.overlayCentered, padTop ? { paddingTop: padTop } : null]}>
                <View style={[styles.sheet, !compact && styles.sheetFloating, { maxHeight: sheetMaxHeight }]}>
                    {/* Header */}
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Student Learning Survey</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                        <View style={styles.progressRow}>
                            {[1, 2, 3, 4].map(i => (
                                <View key={i} style={[styles.progressBar, i <= step && styles.progressBarActive]} />
                            ))}
                        </View>
                        <Text style={styles.stepCount}>Step {step} of {totalSteps}</Text>
                    </View>

                    {/* Content */}
                    <View style={styles.sheetContent}>
                        {step === 1 && Step1()}
                        {step === 2 && Step2()}
                        {step === 3 && Step3()}
                        {step === 4 && Step4()}
                    </View>

                    {/* Footer */}
                    <View style={[styles.footer, { paddingBottom: 10 + padBottom }]}>
                        {step > 1 && (
                            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
                                <ArrowLeft size={16} color="#374151" />
                                <Text style={styles.backBtnText}>Back</Text>
                            </TouchableOpacity>
                        )}
                        {step < totalSteps ? (
                            <TouchableOpacity
                                style={[styles.nextBtn, !canProceed() && { opacity: 0.4 }]}
                                onPress={() => setStep(step + 1)}
                                disabled={!canProceed()}
                            >
                                <Text style={styles.nextBtnText}>Next</Text>
                                <ArrowRight size={16} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.submitBtn, !canProceed() && { opacity: 0.4 }]}
                                onPress={handleSubmit}
                                disabled={!canProceed()}
                            >
                                <CheckCircle size={16} color="#fff" />
                                <Text style={styles.submitBtnText}>Complete Survey</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    // Tablets / desktop: a centred card instead of a full-width bottom sheet.
    overlayCentered: { justifyContent: 'center', padding: 16 },
    sheet: {
        width: '100%', maxWidth: 480, alignSelf: 'center',
        backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18,
        flexShrink: 1, overflow: 'hidden',
    },
    sheetFloating: { borderRadius: 18, ...shadow },
    chipActiveBlue: { borderColor: C.primary, backgroundColor: C.primarySoft },
    sheetHeader: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    sheetTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8, paddingRight: 28 },
    closeBtn: { position: 'absolute', top: 8, right: 8, padding: 6 },
    closeBtnText: { fontSize: 16, color: C.textMuted },
    progressRow: { flexDirection: 'row', gap: 5, marginBottom: 4 },
    progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.border },
    progressBarActive: { backgroundColor: C.primary },
    stepCount: { fontSize: 11, color: C.textSubtle },
    // Content takes whatever height is left between header and footer and scrolls inside it.
    sheetContent: { flexShrink: 1, minHeight: 0 },
    stepScroll: { flexGrow: 0 },
    stepScrollContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
    stepHeader: { alignItems: 'center', marginBottom: 10 },
    stepTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 4 },
    stepSub: { fontSize: 12, color: C.textMuted, marginTop: 2, textAlign: 'center' },
    sliderWrap: { marginBottom: 10 },
    sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    sliderLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
    sliderValue: { fontSize: 13, fontWeight: '700' },
    sliderTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, marginBottom: 6 },
    sliderFill: { height: 4, borderRadius: 2 },
    sliderBtnRow: { flexDirection: 'row', gap: 4 },
    sliderDot: { flex: 1, height: 14, borderRadius: 7, backgroundColor: C.border },
    sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
    optionCard: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
    optionCardActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    optionTitle: { fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },
    optionTitleActive: { color: C.primary },
    optionDesc: { fontSize: 11, color: C.textMuted, marginTop: 1 },
    chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    chip: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    chipActivePurple: { borderColor: C.primary, backgroundColor: C.primarySoft },
    chipActiveGreen: { borderColor: C.successText, backgroundColor: C.successSoft },
    chipText: { fontSize: 12, fontWeight: '500', color: '#374151', textTransform: 'capitalize' },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tagChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
    tagChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    tagChipActiveGreen: { borderColor: C.successText, backgroundColor: C.successSoft },
    tagText: { fontSize: 12, color: '#374151' },
    textarea: { borderWidth: 1.5, borderColor: C.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.text, minHeight: 64, textAlignVertical: 'top', marginBottom: 4, fontFamily: font },
    summaryBox: { backgroundColor: C.primarySoft, borderRadius: 10, padding: 10, marginTop: 12 },
    summaryTitle: { fontSize: 13, fontWeight: '600', color: C.primaryDark, marginBottom: 4 },
    summaryItem: { fontSize: 11, color: C.primaryDark, marginBottom: 1 },
    footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: '#fff' },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.tile, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
    backBtnText: { fontSize: 13, fontWeight: '500', color: '#374151' },
    nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
    nextBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    submitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.successText, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
    submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

export default StudentSurvey;