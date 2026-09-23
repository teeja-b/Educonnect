/**
 * StudentProfile.native.jsx
 * React Native conversion
 *
 * Dependencies:
 *   npm install @react-native-community/slider
 *   npm install react-native-vector-icons
 *
 * Replace localStorage.getItem('token') with:
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *   const token = await AsyncStorage.getItem('token');
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather as Icon } from '@expo/vector-icons';

const API_URL = 'https://hult-663884308553.europe-west9.run.app';

const StudentProfile = ({ onClose, visible = true }) => {
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    location: '',
    date_of_birth: '',
    bio: '',
    learning_style: '',
    preferred_subjects: [],
    skill_level: '',
    learning_goals: '',
    available_time: '',
    preferred_languages: [],
    motivation_level: 5,
    weekly_study_hours: '',
    preferred_session_length: '60',
    learning_pace: 'moderate',
    math_score: 5,
    science_score: 5,
    language_score: 5,
    tech_score: 5,
    // Optional academic details
    college: '',
    grade: '',
    country: '',
    district: '',
    state: '',
  });

  useEffect(() => { fetchProfile(); }, []);

  const getToken = async () => {
    // Replace with AsyncStorage.getItem('token') in production
    return null;
  };

  const fetchProfile = async () => {
    try {
      const token = await getToken();
      const [userRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/api/user/info`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/student/profile`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const userData = await userRes.json();
      const profileData = await profileRes.json();

      if (profileData.profile) {
        setFormData({
          full_name: userData.user?.full_name || '',
          email: userData.user?.email || '',
          phone: userData.user?.phone || '',
          location: userData.user?.location || '',
          date_of_birth: userData.user?.date_of_birth || '',
          bio: profileData.profile.bio || '',
          learning_style: profileData.profile.learning_style || '',
          preferred_subjects: profileData.profile.preferred_subjects || [],
          skill_level: profileData.profile.skill_level || '',
          learning_goals: profileData.profile.learning_goals || '',
          available_time: profileData.profile.available_time || '',
          preferred_languages: profileData.profile.preferred_languages || [],
          motivation_level: profileData.profile.motivation_level || 5,
          weekly_study_hours: profileData.profile.weekly_study_hours || '',
          preferred_session_length: profileData.profile.preferred_session_length || '60',
          learning_pace: profileData.profile.learning_pace || 'moderate',
          math_score: profileData.profile.math_score || 5,
          science_score: profileData.profile.science_score || 5,
          language_score: profileData.profile.language_score || 5,
          tech_score: profileData.profile.tech_score || 5,
          // Optional academic details
          college: profileData.profile.college || '',
          grade: profileData.profile.grade || '',
          country: userData.user?.country || profileData.profile.country || '',
          district: userData.user?.district || profileData.profile.district || '',
          state: userData.user?.state || profileData.profile.state || '',
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/user/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: formData.full_name,
          phone: formData.phone,
          location: formData.location,
          date_of_birth: formData.date_of_birth,
          country: formData.country,
          district: formData.district,
          state: formData.state,
        }),
      });
      const res = await fetch(`${API_URL}/api/student/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bio: formData.bio,
          learning_style: formData.learning_style,
          preferred_subjects: formData.preferred_subjects,
          skill_level: formData.skill_level,
          learning_goals: formData.learning_goals,
          available_time: formData.available_time,
          preferred_languages: formData.preferred_languages,
          motivation_level: formData.motivation_level,
          weekly_study_hours: formData.weekly_study_hours,
          preferred_session_length: formData.preferred_session_length,
          learning_pace: formData.learning_pace,
          math_score: formData.math_score,
          science_score: formData.science_score,
          language_score: formData.language_score,
          tech_score: formData.tech_score,
          college: formData.college,
          grade: formData.grade,
          country: formData.country,
          district: formData.district,
          state: formData.state,
        }),
      });
      if (res.ok) {
        Alert.alert('Success', 'Profile updated successfully!');
        setEditing(false);
        fetchProfile();
      } else throw new Error();
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'This will permanently delete your profile, enrollments, progress, and messages. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              const token = await getToken();
              const res = await fetch(`${API_URL}/api/user/delete-account`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) { Alert.alert('Deleted', 'Account deleted.'); onClose?.(); }
              else throw new Error();
            } catch { Alert.alert('Error', 'Failed to delete account'); }
          }
        },
      ]
    );
  };

  const update = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  // ─── Select field ─────────────────────────────────────────────────
  const SelectRow = ({ label, field, options }) => (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editing ? (
        <View style={styles.optionRow}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionChip, formData[field] === opt.value && styles.optionChipActive]}
              onPress={() => update(field, opt.value)}
            >
              <Text style={[styles.optionChipText, formData[field] === opt.value && styles.optionChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.fieldValue}>{formData[field] || 'Not set'}</Text>
      )}
    </View>
  );

  // ─── Skill bar ────────────────────────────────────────────────────
  const SkillBar = ({ label, field, color }) => (
    <View style={styles.skillCard}>
      <View style={styles.skillHeader}>
        <Text style={styles.skillLabel}>{label}</Text>
        <Text style={[styles.skillScore, { color }]}>{formData[field]}/10</Text>
      </View>
      {editing ? (
        <Slider
          minimumValue={1} maximumValue={10} step={1}
          value={formData[field]}
          onValueChange={val => update(field, val)}
          minimumTrackTintColor={color} maximumTrackTintColor="#E5E7EB"
          thumbTintColor={color}
          style={styles.slider}
        />
      ) : (
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${formData[field] * 10}%`, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide">
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{formData.full_name?.charAt(0)?.toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{formData.full_name || 'Student'}</Text>
            <Text style={styles.headerEmail}>{formData.email}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Personal Info */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="user" size={15} color="#2563EB" />
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>
              {[
                { label: 'Full Name', field: 'full_name', placeholder: 'Your name' },
                { label: 'Phone', field: 'phone', placeholder: 'Phone number', keyboardType: 'phone-pad' },
                { label: 'Location', field: 'location', placeholder: 'City, Country' },
              ].map(({ label, field, placeholder, keyboardType }) => (
                <View key={field} style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  {editing
                    ? <TextInput style={styles.input} value={formData[field]} onChangeText={t => update(field, t)} placeholder={placeholder} placeholderTextColor="#9CA3AF" keyboardType={keyboardType} />
                    : <Text style={styles.fieldValue}>{formData[field] || 'Not set'}</Text>}
                </View>
              ))}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Bio</Text>
                {editing
                  ? <TextInput style={[styles.input, styles.textarea]} value={formData.bio} onChangeText={t => update('bio', t)} placeholder="Tell us about yourself…" placeholderTextColor="#9CA3AF" multiline numberOfLines={3} />
                  : <Text style={styles.fieldValue}>{formData.bio || 'No bio yet'}</Text>}
              </View>
            </View>

            {/* Academic Details (Optional) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="book" size={15} color="#2563EB" />
                <Text style={styles.sectionTitle}>Academic Details</Text>
                <View style={styles.optionalBadge}>
                  <Text style={styles.optionalBadgeText}>Optional</Text>
                </View>
              </View>

              {[
                { label: 'College / School', field: 'college', placeholder: 'e.g. MIT, Harvard, Lincoln High' },
                { label: 'Grade / Year', field: 'grade', placeholder: 'e.g. Grade 10, Freshman, 2nd Year' },
              ].map(({ label, field, placeholder }) => (
                <View key={field} style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  {editing
                    ? <TextInput style={styles.input} value={formData[field]} onChangeText={t => update(field, t)} placeholder={placeholder} placeholderTextColor="#9CA3AF" />
                    : <Text style={styles.fieldValue}>{formData[field] || <Text style={styles.notSet}>Not set</Text>}</Text>}
                </View>
              ))}

              <View style={styles.locationRow}>
                <View style={[styles.fieldBlock, styles.flex]}>
                  <Text style={styles.fieldLabel}>Country</Text>
                  {editing
                    ? <TextInput style={styles.input} value={formData.country} onChangeText={t => update('country', t)} placeholder="e.g. USA" placeholderTextColor="#9CA3AF" />
                    : <Text style={styles.fieldValue}>{formData.country || <Text style={styles.notSet}>Not set</Text>}</Text>}
                </View>
                <View style={styles.locationGap} />
                <View style={[styles.fieldBlock, styles.flex]}>
                  <Text style={styles.fieldLabel}>State / Province</Text>
                  {editing
                    ? <TextInput style={styles.input} value={formData.state} onChangeText={t => update('state', t)} placeholder="e.g. California" placeholderTextColor="#9CA3AF" />
                    : <Text style={styles.fieldValue}>{formData.state || <Text style={styles.notSet}>Not set</Text>}</Text>}
                </View>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>District</Text>
                {editing
                  ? <TextInput style={styles.input} value={formData.district} onChangeText={t => update('district', t)} placeholder="e.g. Los Angeles Unified" placeholderTextColor="#9CA3AF" />
                  : <Text style={styles.fieldValue}>{formData.district || <Text style={styles.notSet}>Not set</Text>}</Text>}
              </View>
            </View>

            {/* Learning Profile */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="book-open" size={15} color="#2563EB" />
                <Text style={styles.sectionTitle}>Learning Profile</Text>
              </View>
              <SelectRow
                label="Learning Style" field="learning_style"
                options={[{ value: 'visual', label: 'Visual' }, { value: 'auditory', label: 'Auditory' }, { value: 'kinesthetic', label: 'Kinesthetic' }]}
              />
              <SelectRow
                label="Skill Level" field="skill_level"
                options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]}
              />
              <SelectRow
                label="Available Time" field="available_time"
                options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]}
              />
              <SelectRow
                label="Learning Pace" field="learning_pace"
                options={[{ value: 'slow', label: 'Slow' }, { value: 'moderate', label: 'Moderate' }, { value: 'fast', label: 'Fast' }]}
              />

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Preferred Subjects</Text>
                {editing
                  ? <TextInput style={styles.input} value={formData.preferred_subjects.join(', ')} onChangeText={t => update('preferred_subjects', t.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Math, Science, English…" placeholderTextColor="#9CA3AF" />
                  : <View style={styles.chipRow}>
                      {formData.preferred_subjects.length > 0
                        ? formData.preferred_subjects.map((s, i) => <View key={i} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>)
                        : <Text style={styles.fieldValue}>None selected</Text>}
                    </View>}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Learning Goals</Text>
                {editing
                  ? <TextInput style={[styles.input, styles.textarea]} value={formData.learning_goals} onChangeText={t => update('learning_goals', t)} placeholder="What do you want to achieve?" placeholderTextColor="#9CA3AF" multiline numberOfLines={3} />
                  : <Text style={styles.fieldValue}>{formData.learning_goals || 'Not set'}</Text>}
              </View>
            </View>

            {/* Skills Assessment */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="trending-up" size={15} color="#2563EB" />
                <Text style={styles.sectionTitle}>Skills Assessment</Text>
              </View>
              <SkillBar label="Mathematics" field="math_score" color="#2563EB" />
              <SkillBar label="Science" field="science_score" color="#16A34A" />
              <SkillBar label="Language Arts" field="language_score" color="#7C3AED" />
              <SkillBar label="Technology" field="tech_score" color="#EA580C" />
            </View>

            {/* Delete */}
            <View style={styles.section}>
              <View style={styles.dividerRed} />
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
                <Text style={styles.deleteBtnText}>Delete My Account Permanently</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {editing ? (
              <View style={styles.footerRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); fetchProfile(); }} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Icon name="save" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Changes</Text></>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Icon name="edit-2" size={16} color="#fff" />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#6B7280', marginTop: 10, fontSize: 13 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerInfo: { flex: 1 },
  headerName: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerEmail: { color: '#BFDBFE', fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 6 },

  scrollContent: { padding: 14, paddingBottom: 24 },

  section: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontWeight: '700', fontSize: 13, color: '#374151' },

  optionalBadge: { marginLeft: 'auto', backgroundColor: '#EFF6FF', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  optionalBadgeText: { fontSize: 10, color: '#2563EB', fontWeight: '600' },

  locationRow: { flexDirection: 'row', alignItems: 'flex-start' },
  locationGap: { width: 10 },

  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  fieldValue: { fontSize: 13, color: '#1F2937' },
  notSet: { color: '#9CA3AF', fontStyle: 'italic' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#1F2937', backgroundColor: '#F9FAFB' },
  textarea: { minHeight: 72, textAlignVertical: 'top' },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  optionChipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  optionChipText: { fontSize: 12, color: '#6B7280', fontWeight: '500', textTransform: 'capitalize' },
  optionChipTextActive: { color: '#2563EB', fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  chipText: { fontSize: 12, color: '#1D4ED8' },

  skillCard: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 8 },
  skillHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  skillLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  skillScore: { fontSize: 13, fontWeight: '700' },
  slider: { width: '100%', height: 30 },
  barBg: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },

  dividerRed: { height: 1, backgroundColor: '#FEE2E2', marginBottom: 12 },
  deleteBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },

  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingHorizontal: 14, paddingVertical: 12 },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 12 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 12 },
  editBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default StudentProfile;