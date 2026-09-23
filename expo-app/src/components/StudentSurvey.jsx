import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, Modal, ScrollView,
    ActivityIndicator, StyleSheet,
} from 'react-native';
import { Brain, BookOpen, Languages, Code, Zap, Clock, Star, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react-native';
import { storage } from '../utils/storage';

const API_URL = 'https://hult-663884308553.europe-west9.run.app';

const StudentSurvey = ({ onComplete, onClose }) => {
    const [step, setStep] = useState(1);
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
        <ScrollView>
            <View style={styles.stepHeader}>
                <Brain size={36} color="#7c3aed" />
                <Text style={styles.stepTitle}>Rate Your Skills</Text>
                <Text style={styles.stepSub}>Help us understand your current abilities</Text>
            </View>
            <Slider label="Mathematics" field="mathScore" value={surveyData.mathScore} color="#2563eb" />
            <Slider label="Science" field="scienceScore" value={surveyData.scienceScore} color="#16a34a" />
            <Slider label="Language Arts" field="languageScore" value={surveyData.languageScore} color="#7c3aed" />
            <Slider label="Technology" field="techScore" value={surveyData.techScore} color="#ea580c" />
            <Slider label="Motivation Level" field="motivationLevel" value={surveyData.motivationLevel} color="#ca8a04" />
        </ScrollView>
    );

    // ── STEP 2: Learning Preferences ──────────────────────────────────────────
    const Step2 = () => (
        <ScrollView>
            <View style={styles.stepHeader}>
                <BookOpen size={36} color="#2563eb" />
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

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Overall Skill Level</Text>
            <View style={styles.chipRow}>
                {['beginner', 'intermediate', 'advanced'].map(l => (
                    <TouchableOpacity
                        key={l}
                        style={[styles.chip, surveyData.skillLevel === l && styles.chipActivePurple]}
                        onPress={() => update('skillLevel', l)}
                    >
                        <Text style={[styles.chipText, surveyData.skillLevel === l && { color: '#7c3aed' }]}>
                            {l.charAt(0).toUpperCase() + l.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>When can you study?</Text>
            <View style={styles.chipRow}>
                {['morning', 'afternoon', 'evening'].map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.chip, surveyData.availableTime === t && styles.chipActiveGreen]}
                        onPress={() => update('availableTime', t)}
                    >
                        <Text style={[styles.chipText, surveyData.availableTime === t && { color: '#16a34a' }]}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );

    // ── STEP 3: Subjects & Languages ──────────────────────────────────────────
    const Step3 = () => (
        <ScrollView>
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
                                {active && <CheckCircle size={12} color="#2563eb" style={{ marginRight: 4 }} />}
                                <Text style={[styles.tagText, active && { color: '#2563eb' }]}>{s}</Text>
                            </TouchableOpacity>
                        );
                    })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Languages you speak</Text>
            <View style={styles.tagGrid}>
                {['English', 'Spanish', 'French', 'Mandarin', 'Hindi', 'Arabic', 'Portuguese', 'Russian'].map(l => {
                    const active = surveyData.preferredLanguages.includes(l);
                    return (
                        <TouchableOpacity
                            key={l}
                            style={[styles.tagChip, active && styles.tagChipActiveGreen]}
                            onPress={() => toggleArr('preferredLanguages', l)}
                        >
                            {active && <CheckCircle size={12} color="#16a34a" style={{ marginRight: 4 }} />}
                            <Text style={[styles.tagText, active && { color: '#16a34a' }]}>{l}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );

    // ── STEP 4: Goals ─────────────────────────────────────────────────────────
    const Step4 = () => (
        <ScrollView>
            <View style={styles.stepHeader}>
                <Star size={36} color="#ca8a04" />
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
                            {active && <CheckCircle size={12} color="#2563eb" style={{ marginRight: 4 }} />}
                            <Text style={[styles.tagText, active && { color: '#2563eb' }]}>{goal}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Additional Details */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Anything else to add? (optional)</Text>
            <TextInput
                style={styles.textarea}
                placeholder="E.g. I have an exam in 3 months and need focused help..."
                multiline
                numberOfLines={3}
                value={surveyData.learningGoals}
                onChangeText={v => update('learningGoals', v)}
            />

            {/* Tutor Gender Preference */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Preferred tutor gender</Text>
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
                            surveyData.tutorGenderPreference === opt.value && { color: '#2563eb' },
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
            <View style={styles.overlay}>
                <View style={styles.sheet}>
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
                    <View style={styles.footer}>
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
    sheet: {
        width: '100%', maxWidth: 560, alignSelf: 'center',
        backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        maxHeight: '92%', flexShrink: 1,
    },
    chipActiveBlue: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
    sheetHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    sheetTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
    closeBtn: { position: 'absolute', top: 16, right: 16 },
    closeBtnText: { fontSize: 16, color: '#6b7280' },
    progressRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#e5e7eb' },
    progressBarActive: { backgroundColor: '#2563eb' },
    stepCount: { fontSize: 12, color: '#9ca3af' },
    sheetContent: { flexShrink: 1, maxHeight: 440, padding: 16 },
    stepHeader: { alignItems: 'center', marginBottom: 16 },
    stepTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginTop: 8 },
    stepSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },
    sliderWrap: { marginBottom: 16 },
    sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    sliderLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
    sliderValue: { fontSize: 15, fontWeight: 'bold' },
    sliderTrack: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, marginBottom: 8 },
    sliderFill: { height: 6, borderRadius: 3 },
    sliderBtnRow: { flexDirection: 'row', gap: 4 },
    sliderDot: { flex: 1, height: 16, borderRadius: 8, backgroundColor: '#e5e7eb' },
    sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
    optionCard: {
        borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10,
        padding: 12, marginBottom: 8,
    },
    optionCardActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
    optionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },
    optionTitleActive: { color: '#2563eb' },
    optionDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    chipActivePurple: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
    chipActiveGreen: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
    chipText: { fontSize: 13, fontWeight: '500', color: '#374151', textTransform: 'capitalize' },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 6,
    },
    tagChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
    tagChipActiveGreen: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
    tagText: { fontSize: 12, color: '#374151' },
    textarea: {
        borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10,
        padding: 12, fontSize: 13, color: '#111827', minHeight: 120,
        textAlignVertical: 'top', marginBottom: 12,
    },
    summaryBox: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 14 },
    summaryTitle: { fontSize: 14, fontWeight: '600', color: '#1e40af', marginBottom: 6 },
    summaryItem: { fontSize: 12, color: '#1d4ed8', marginBottom: 2 },
    footer: {
        flexDirection: 'row', justifyContent: 'flex-end', gap: 10,
        paddingHorizontal: 16, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: '#e5e7eb',
    },
    backBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    },
    backBtnText: { fontSize: 13, fontWeight: '500', color: '#374151' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    },
    nextBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    submitBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    },
    submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

export default StudentSurvey;