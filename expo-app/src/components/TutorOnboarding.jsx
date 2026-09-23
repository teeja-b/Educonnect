/**
 * TutorOnboarding.native.jsx
 * React Native conversion
 *
 * Dependencies:
 *   npm install react-native-vector-icons
 *
 * Replace localStorage.getItem('token') with AsyncStorage in production.
 */
import { storage } from '../utils/storage';
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather as Icon } from '@expo/vector-icons';

const API_URL = 'https://hult-663884308553.europe-west9.run.app';

const TutorOnboarding = ({ onComplete, onSkip, visible = true }) => {
  useEffect(() => {
  const test = async () => {
    const token = await storage.getItem('token');
    console.log('STORAGE TEST on mount:', token);
  };
  test();
}, []);
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const totalSteps = 5;
  

  const [formData, setFormData] = useState({
    expertise: [],
    bio: '',
    hourly_rate: '',
    languages: [],
    availability: { morning: false, afternoon: false, evening: false, weekends: false },
    teaching_style: 'adaptive',
    years_experience: '',
    education: '',
    gender: '',
  });

  const [expertiseInput, setExpertiseInput] = useState('');
  const [languageInput, setLanguageInput] = useState('');

 const getToken = () => storage.getItem('token');

  // Load saved progress
  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/tutor/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setFormData({
              expertise: data.profile.expertise || [],
              bio: data.profile.bio || '',
              hourly_rate: data.profile.hourly_rate?.toString() || '',
              languages: data.profile.languages || [],
              availability: data.profile.availability || { morning: false, afternoon: false, evening: false, weekends: false },
              teaching_style: data.profile.teaching_style || 'adaptive',
              years_experience: data.profile.years_experience || '',
              education: data.profile.education || '',
              gender: data.profile.gender || '',
            });
          }
        }
      } catch {}
    };
    load();
  }, []);

  // Auto-save
  useEffect(() => {
    if (currentStep <= 1) return;
    const timer = setTimeout(async () => {
      setAutoSaving(true);
      try {
        const token = await getToken();
        await fetch(`${API_URL}/api/tutor/profile`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, hourly_rate: parseFloat(formData.hourly_rate) || 0 }),
        });
      } catch {} finally { setTimeout(() => setAutoSaving(false), 1000); }
    }, 2000);
    return () => clearTimeout(timer);
  }, [formData]);

  const update = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const addExpertise = () => {
    const t = expertiseInput.trim();
    if (t && !formData.expertise.includes(t)) { update('expertise', [...formData.expertise, t]); setExpertiseInput(''); }
  };

  const removeExpertise = (s) => update('expertise', formData.expertise.filter(x => x !== s));

  const addLanguage = () => {
    const t = languageInput.trim();
    if (t && !formData.languages.includes(t)) { update('languages', [...formData.languages, t]); setLanguageInput(''); }
  };

  const removeLanguage = (l) => update('languages', formData.languages.filter(x => x !== l));

  const toggleAvailability = (key) => update('availability', { ...formData.availability, [key]: !formData.availability[key] });

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.expertise.length > 0;
      case 2: return formData.bio.length >= 20;
      case 3: return formData.hourly_rate && parseFloat(formData.hourly_rate) > 0;
      case 4: return formData.languages.length > 0;
      case 5: return Object.values(formData.availability).some(Boolean);
      default: return false;
    }
  };

  const handleComplete = async () => {
    if (formData.expertise.length === 0) { Alert.alert('Missing', 'Add at least one subject'); setCurrentStep(1); return; }
    if (!formData.bio || formData.bio.length < 20) { Alert.alert('Missing', 'Write a bio (min 20 chars)'); setCurrentStep(2); return; }
    if (!formData.hourly_rate || parseFloat(formData.hourly_rate) <= 0) { Alert.alert('Missing', 'Set your hourly rate'); setCurrentStep(3); return; }
    if (formData.languages.length === 0) { Alert.alert('Missing', 'Add at least one language'); setCurrentStep(4); return; }

    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/tutor/onboarding`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, hourlyRate: parseFloat(formData.hourly_rate) }),
      });
      if (res.ok) {
        const data = await res.json();
        onComplete && onComplete(data);
      } else {
        const err = await res.json();
        Alert.alert('Error', err.error || 'Failed to complete onboarding');
      }
    } catch { Alert.alert('Error', 'Please try again'); }
    finally { setSaving(false); }
  };

  // ─── Step renderers ───────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeading}>
        <Icon name="book-open" size={32} color="#16A34A" />
        <View>
          <Text style={styles.stepTitle}>Your Expertise</Text>
          <Text style={styles.stepSubtitle}>What subjects can you teach?</Text>
        </View>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.tagInput}
          value={expertiseInput}
          onChangeText={setExpertiseInput}
          onSubmitEditing={addExpertise}
          placeholder="e.g. Math, Physics, English"
          placeholderTextColor="#9CA3AF"
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addExpertise}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagList}>
        {formData.expertise.map((s, i) => (
          <View key={i} style={styles.tag}>
            <Text style={styles.tagText}>{s}</Text>
            <TouchableOpacity onPress={() => removeExpertise(s)}>
              <Text style={styles.tagRemove}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {formData.expertise.length === 0 && <Text style={styles.tagEmpty}>No subjects added yet</Text>}
      </View>
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>💡 Add all subjects you're qualified to teach</Text>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeading}>
        <Icon name="user" size={32} color="#16A34A" />
        <View>
          <Text style={styles.stepTitle}>Your Bio</Text>
          <Text style={styles.stepSubtitle}>Tell students about yourself</Text>
        </View>
      </View>
      <TextInput
        style={styles.bioInput}
        value={formData.bio}
        onChangeText={t => update('bio', t)}
        placeholder="Write a compelling bio that describes your teaching experience, approach, and what makes you unique…"
        placeholderTextColor="#9CA3AF"
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{formData.bio.length} characters {formData.bio.length < 20 && '(min 20)'}</Text>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Years of Experience</Text>
        <TextInput
          style={styles.input}
          value={formData.years_experience}
          onChangeText={t => update('years_experience', t)}
          placeholder="e.g. 5 years"
          placeholderTextColor="#9CA3AF"
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Education</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={formData.education}
          onChangeText={t => update('education', t)}
          placeholder="Your degrees and certifications"
          placeholderTextColor="#9CA3AF"
          multiline numberOfLines={3} textAlignVertical="top"
        />
      </View>
      <View style={styles.fieldBlock}>
  <Text style={styles.fieldLabel}>Your gender</Text>
  <Text style={styles.fieldHint}>This helps students find tutors that match their preference</Text>
  <View style={styles.genderRow}>
    {[
      { value: 'female', label: '👩 Female' },
      { value: 'male', label: '👨 Male' },
      { value: 'non_binary', label: '⚧ Non-binary' },
      { value: 'prefer_not', label: 'Prefer not to say' },
    ].map(opt => (
      <TouchableOpacity
        key={opt.value}
        style={[
          styles.genderChip,
          formData.gender === opt.value && styles.genderChipActive,
        ]}
        onPress={() => update('gender', opt.value)}
      >
        <Text style={[
          styles.genderChipText,
          formData.gender === opt.value && styles.genderChipTextActive,
        ]}>
          {opt.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
</View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeading}>
        <Icon name="dollar-sign" size={32} color="#16A34A" />
        <View>
          <Text style={styles.stepTitle}>Set Your Rate</Text>
          <Text style={styles.stepSubtitle}>How much do you charge per hour?</Text>
        </View>
      </View>
      <View style={styles.rateInputRow}>
        <Text style={styles.rateCurrency}>$</Text>
        <TextInput
          style={styles.rateInput}
          value={formData.hourly_rate}
          onChangeText={t => update('hourly_rate', t)}
          placeholder="0"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
        />
        <Text style={styles.rateUnit}>/hr</Text>
      </View>
      <Text style={styles.sectionLabel}>Quick Select</Text>
      {[
        ['Entry Level', 15], ['Standard', 25], ['Experienced', 40],
        ['Expert', 60], ['Premium', 80], ['Elite', 100],
      ].map(([level, rate]) => (
        <TouchableOpacity
          key={rate}
          style={styles.rateSuggestion}
          onPress={() => update('hourly_rate', rate.toString())}
        >
          <Text style={styles.rateSuggestionLevel}>{level}</Text>
          <Text style={styles.rateSuggestionRate}>${rate}/hr</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Teaching Style</Text>
        <View style={styles.optionCol}>
          {[
            { value: 'adaptive', label: 'Adaptive — Adjust to student needs' },
            { value: 'structured', label: 'Structured — Follow curriculum closely' },
            { value: 'interactive', label: 'Interactive — Lots of discussions' },
            { value: 'hands-on', label: 'Hands-on — Practical exercises' },
          ].map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionRow, formData.teaching_style === opt.value && styles.optionRowActive]}
              onPress={() => update('teaching_style', opt.value)}
            >
              <Text style={[styles.optionText, formData.teaching_style === opt.value && styles.optionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeading}>
        <Icon name="globe" size={32} color="#16A34A" />
        <View>
          <Text style={styles.stepTitle}>Languages</Text>
          <Text style={styles.stepSubtitle}>What languages can you teach in?</Text>
        </View>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.tagInput}
          value={languageInput}
          onChangeText={setLanguageInput}
          onSubmitEditing={addLanguage}
          placeholder="e.g. English, Spanish, French"
          placeholderTextColor="#9CA3AF"
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addLanguage}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagList}>
        {formData.languages.map((l, i) => (
          <View key={i} style={[styles.tag, styles.tagBlue]}>
            <Text style={[styles.tagText, styles.tagTextBlue]}>{l}</Text>
            <TouchableOpacity onPress={() => removeLanguage(l)}>
              <Text style={styles.tagRemove}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {formData.languages.length === 0 && <Text style={styles.tagEmpty}>No languages added yet</Text>}
      </View>
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>💡 Adding multiple languages helps you reach more students</Text>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeading}>
        <Icon name="clock" size={32} color="#16A34A" />
        <View>
          <Text style={styles.stepTitle}>Availability</Text>
          <Text style={styles.stepSubtitle}>When are you available to teach?</Text>
        </View>
      </View>
      <View style={styles.availGrid}>
        {[
          { key: 'morning', label: 'Morning', emoji: '🌅' },
          { key: 'afternoon', label: 'Afternoon', emoji: '☀️' },
          { key: 'evening', label: 'Evening', emoji: '🌙' },
          { key: 'weekends', label: 'Weekends', emoji: '📅' },
        ].map(({ key, label, emoji }) => (
          <TouchableOpacity
            key={key}
            style={[styles.availCard, formData.availability[key] && styles.availCardActive]}
            onPress={() => toggleAvailability(key)}
          >
            <Text style={styles.availEmoji}>{emoji}</Text>
            <Text style={[styles.availLabel, formData.availability[key] && styles.availLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Review Your Profile</Text>
        <Text style={styles.summaryLine}>✓ Expertise: {formData.expertise.join(', ') || 'None'}</Text>
        <Text style={styles.summaryLine}>✓ Rate: ${formData.hourly_rate}/hour</Text>
        <Text style={styles.summaryLine}>✓ Languages: {formData.languages.join(', ') || 'None'}</Text>
        <Text style={styles.summaryLine}>✓ Available: {Object.entries(formData.availability).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None'}</Text>
        <Text style={styles.summaryLine}>
  ✓ Gender: {
    { female: 'Female', male: 'Male', non_binary: 'Non-binary', prefer_not: 'Prefer not to say' }
    [formData.gender] || 'Not set'
  }
</Text>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onSkip}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderTop}>
            <Text style={styles.modalTitle}>Complete Your Tutor Profile</Text>
            {autoSaving && (
              <View style={styles.autoSaveBadge}>
                <Icon name="save" size={14} color="#fff" />
                <Text style={styles.autoSaveText}>Saving…</Text>
              </View>
            )}
          </View>
          <View style={styles.progressBar}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={[styles.progressSegment, i < currentStep && styles.progressSegmentActive]} />
            ))}
          </View>
          <Text style={styles.stepCounter}>Step {currentStep} of {totalSteps}</Text>
        </View>

        {/* Content */}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {renderCurrentStep()}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              {currentStep > 1 && (
                <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentStep(s => s - 1)}>
                  <Icon name="chevron-left" size={20} color="#374151" />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
                <Text style={styles.skipBtnText}>Skip for now</Text>
              </TouchableOpacity>
            </View>

            {currentStep < totalSteps ? (
              <TouchableOpacity
                style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
                onPress={() => setCurrentStep(s => s + 1)}
                disabled={!canProceed()}
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <Icon name="chevron-right" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.completeBtn, (!canProceed() || saving) && styles.nextBtnDisabled]}
                onPress={handleComplete}
                disabled={saving || !canProceed()}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.nextBtnText}>Complete Profile</Text>}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
genderChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
genderChipActive: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
genderChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
genderChipTextActive: { color: '#14532D', fontWeight: '600' },
fieldHint: { fontSize: 12, color: '#9CA3AF', marginTop: 2, marginBottom: 4 },
  modalHeader: { backgroundColor: '#16A34A', paddingHorizontal: 16, paddingVertical: 14 },
  modalHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: '#fff', fontWeight: '700', fontSize: 18, flex: 1 },
  autoSaveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  autoSaveText: { color: '#fff', fontSize: 12 },
  progressBar: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  progressSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressSegmentActive: { backgroundColor: '#fff' },
  stepCounter: { color: '#BBF7D0', fontSize: 12 },

  scrollContent: { padding: 16, paddingBottom: 24 },
  stepContent: { gap: 16 },
  stepHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  stepSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },

  inputRow: { flexDirection: 'row', gap: 8 },
  tagInput: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1F2937', backgroundColor: '#F9FAFB' },
  addBtn: { backgroundColor: '#16A34A', paddingHorizontal: 18, borderRadius: 10, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 44 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  tagText: { color: '#14532D', fontSize: 13, fontWeight: '500' },
  tagBlue: { backgroundColor: '#DBEAFE' },
  tagTextBlue: { color: '#1D4ED8' },
  tagRemove: { color: '#374151', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  tagEmpty: { color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 },

  tipBox: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 12 },
  tipText: { fontSize: 13, color: '#92400E' },

  bioInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 14, color: '#1F2937', minHeight: 130, textAlignVertical: 'top', backgroundColor: '#F9FAFB' },
  charCount: { fontSize: 12, color: '#9CA3AF', textAlign: 'right' },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1F2937', backgroundColor: '#F9FAFB' },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },

  rateInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#16A34A', borderRadius: 12, overflow: 'hidden', backgroundColor: '#F0FDF4' },
  rateCurrency: { paddingHorizontal: 14, fontSize: 24, fontWeight: '700', color: '#16A34A' },
  rateInput: { flex: 1, fontSize: 28, fontWeight: '700', color: '#1F2937', paddingVertical: 10 },
  rateUnit: { paddingHorizontal: 14, fontSize: 16, color: '#16A34A', fontWeight: '600' },

  rateSuggestion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 6 },
  rateSuggestionLevel: { color: '#374151', fontSize: 14 },
  rateSuggestionRate: { color: '#16A34A', fontWeight: '700', fontSize: 14 },

  optionCol: { gap: 6 },
  optionRow: { padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  optionRowActive: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  optionText: { fontSize: 13, color: '#374151' },
  optionTextActive: { color: '#14532D', fontWeight: '600' },

  availGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  availCard: { width: '46%', padding: 16, borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', alignItems: 'center' },
  availCardActive: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  availEmoji: { fontSize: 28, marginBottom: 6 },
  availLabel: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  availLabelActive: { color: '#14532D' },

  summaryBox: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 12, padding: 14, marginTop: 8 },
  summaryTitle: { fontWeight: '700', color: '#14532D', fontSize: 14, marginBottom: 8 },
  summaryLine: { fontSize: 13, color: '#166534', marginBottom: 4 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#F9FAFB' },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', gap: 4 },
  backBtnText: { fontSize: 14, color: '#374151' },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  skipBtnText: { fontSize: 14, color: '#6B7280' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#16A34A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  completeBtn: { backgroundColor: '#16A34A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, alignItems: 'center', minWidth: 150 },
});

export default TutorOnboarding;