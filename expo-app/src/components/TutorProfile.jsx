/**
 * TutorProfile.native.jsx — Enhanced
 * Fixes: typing focus loss, calendar persistence, full schedule save/restore
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, Image, Animated, Dimensions,
} from 'react-native';
import { storage } from '../utils/storage';
import * as ImagePicker from 'expo-image-picker';
import { Feather as Icon } from '@expo/vector-icons';

const API_URL = 'https://hult-663884308553.europe-west9.run.app';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Calendar Constants ────────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_SLOTS = [
  { key: 'early_morning', label: '6–9 AM',  color: '#fef3c7' },
  { key: 'morning',       label: '9–12 PM', color: '#dbeafe' },
  { key: 'afternoon',     label: '12–3 PM', color: '#dcfce7' },
  { key: 'late_afternoon',label: '3–6 PM',  color: '#ede9fe' },
  { key: 'evening',       label: '6–9 PM',  color: '#fee2e2' },
  { key: 'night',         label: '9–12 AM', color: '#f1f5f9' },
];

const buildDefaultSchedule = () => {
  const s = {};
  DAY_KEYS.forEach(d => TIME_SLOTS.forEach(({ key }) => { s[`${d}_${key}`] = false; }));
  return s;
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ title, icon, children, accent = '#16a34a' }) => (
  <View style={[styles.section, { borderTopColor: accent }]}>
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconWrap, { backgroundColor: accent + '18' }]}>
        <Icon name={icon} size={14} color={accent} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

// ─── Field label + content ────────────────────────────────────────────────────
const FieldBlock = ({ label, required, children }) => (
  <View style={styles.fieldBlock}>
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
    {children}
  </View>
);

const ValueText = ({ value, fallback = 'Not set' }) => (
  <Text style={styles.fieldValue}>{value || fallback}</Text>
);

// ─── Option chip row ──────────────────────────────────────────────────────────
const ChipRow = ({ options, value, onChange, accent = '#16a34a' }) => (
  <View style={styles.chipOptions}>
    {options.map(opt => {
      const active = value === opt.value;
      return (
        <TouchableOpacity
          key={opt.value}
          style={[styles.optionChip, active && { borderColor: accent, backgroundColor: accent + '15' }]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
        >
          <Text style={[styles.optionChipText, active && { color: accent, fontWeight: '700' }]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── Tag display ──────────────────────────────────────────────────────────────
const TagDisplay = ({ items, color = '#dcfce7', textColor = '#14532d' }) => (
  <View style={styles.tagRow}>
    {items.length > 0
      ? items.map((item, i) => (
          <View key={i} style={[styles.tag, { backgroundColor: color }]}>
            <Text style={[styles.tagText, { color: textColor }]}>{item}</Text>
          </View>
        ))
      : <Text style={styles.fieldValue}>Not set</Text>}
  </View>
);

// ─── Stat badge ───────────────────────────────────────────────────────────────
const StatBadge = ({ icon, value, label, color }) => (
  <View style={styles.statBadge}>
    <Icon name={icon} size={16} color={color} />
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const TutorProfile = ({ onClose, visible = true, token: tokenProp }) => {
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [activeTab, setActiveTab]   = useState('profile'); // 'profile' | 'schedule'
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── TYPING FIX: controlled local state refs so RN doesn't re-render parent ──
  const [localName, setLocalName]             = useState('');
  const [localBio, setLocalBio]               = useState('');
  const [localRate, setLocalRate]             = useState('');
  const [localExp, setLocalExp]               = useState('');
  const [localExpertise, setLocalExpertise]   = useState('');
  const [localLanguages, setLocalLanguages]   = useState('');
  const [localEducation, setLocalEducation]   = useState('');
  const [localCerts, setLocalCerts]           = useState('');
  const [localSpec, setLocalSpec]             = useState('');
  const [localPhilo, setLocalPhilo]           = useState('');
  const [localMaxStudents, setLocalMaxStudents] = useState('');

  const [formData, setFormData] = useState({
    full_name: '', email: '', bio: '',
    expertise: [], hourly_rate: '', languages: [],
    schedule: buildDefaultSchedule(),
    teaching_style: 'adaptive', years_experience: '',
    education: '', certifications: '', specializations: '',
    teaching_philosophy: '', min_session_length: '30',
    max_students: '10', preferred_age_groups: [], gender: '',
  });

  const getToken = useCallback(async () => tokenProp || await storage.getItem('token'), [tokenProp]);

  // sync local states → formData when entering edit mode
  useEffect(() => {
    if (editing) {
      setLocalName(formData.full_name);
      setLocalBio(formData.bio);
      setLocalRate(formData.hourly_rate);
      setLocalExp(formData.years_experience);
      setLocalExpertise(formData.expertise.join(', '));
      setLocalLanguages(formData.languages.join(', '));
      setLocalEducation(formData.education);
      setLocalCerts(formData.certifications);
      setLocalSpec(formData.specializations);
      setLocalPhilo(formData.teaching_philosophy);
      setLocalMaxStudents(formData.max_students);
    }
  }, [editing]);

  // flush local text states → formData just before saving
  const flushLocals = () => {
    setFormData(prev => ({
      ...prev,
      full_name:          localName,
      bio:                localBio,
      hourly_rate:        localRate,
      years_experience:   localExp,
      expertise:          localExpertise.split(',').map(s => s.trim()).filter(Boolean),
      languages:          localLanguages.split(',').map(s => s.trim()).filter(Boolean),
      education:          localEducation,
      certifications:     localCerts,
      specializations:    localSpec,
      teaching_philosophy:localPhilo,
      max_students:       localMaxStudents,
    }));
  };

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = await getToken();
      const [userRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/api/user/info`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/tutor/profile`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const userData    = await userRes.json();
      const profileData = await profileRes.json();

      // Restore full granular schedule
      const savedSchedule  = profileData.profile?.availability || {};
      const mergedSchedule = { ...buildDefaultSchedule(), ...savedSchedule };

      setProfileImage(profileData.profile?.profile_picture || null);

      const p = profileData.profile || {};
      const u = userData.user || {};

      setFormData({
        full_name:           u.full_name || '',
        email:               u.email || '',
        bio:                 p.bio || '',
        expertise:           p.expertise || [],
        hourly_rate:         p.hourly_rate?.toString() || '',
        languages:           p.languages || [],
        schedule:            mergedSchedule,
        teaching_style:      p.teaching_style || 'adaptive',
        years_experience:    p.years_experience || '',
        education:           p.education || '',
        certifications:      p.certifications || '',
        specializations:     p.specializations || '',
        teaching_philosophy: p.teaching_philosophy || '',
        min_session_length:  p.min_session_length || '30',
        max_students:        p.max_students || '10',
        preferred_age_groups:p.preferred_age_groups || [],
        gender:              u.gender || '',
      });
    } catch {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const update = useCallback((field, value) =>
    setFormData(prev => ({ ...prev, [field]: value })), []);

  const toggleSlot = useCallback((day, slot) => {
    const key = `${day}_${slot}`;
    setFormData(prev => ({
      ...prev,
      schedule: { ...prev.schedule, [key]: !prev.schedule[key] },
    }));
  }, []);

  const handlePickImage = async () => {
    if (!editing) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.75,
    });
    if (!result.canceled) setProfileImage(result.assets[0].uri);
  };

  const validateRequiredFields = (data) => {
    const errs = [];
    if (!data.full_name?.trim())                            errs.push('Full name');
    if (!data.bio?.trim() || data.bio.length < 20)         errs.push('Bio (min 20 chars)');
    if (!data.expertise || data.expertise.length === 0)    errs.push('At least one expertise');
    if (!data.hourly_rate || parseFloat(data.hourly_rate) <= 0) errs.push('Hourly rate > 0');
    if (!data.languages || data.languages.length === 0)    errs.push('At least one language');
    if (!data.years_experience)                            errs.push('Years of experience');
    if (!data.education?.trim())                           errs.push('Education');
    if (!Object.values(data.schedule).some(Boolean))       errs.push('At least one availability slot');
    return errs;
  };

  const handleSave = async () => {
    // flush all local text states first
    flushLocals();

    // build final data inline (useState is async so read locals directly)
    const finalData = {
      ...formData,
      full_name:           localName,
      bio:                 localBio,
      hourly_rate:         localRate,
      years_experience:    localExp,
      expertise:           localExpertise.split(',').map(s => s.trim()).filter(Boolean),
      languages:           localLanguages.split(',').map(s => s.trim()).filter(Boolean),
      education:           localEducation,
      certifications:      localCerts,
      specializations:     localSpec,
      teaching_philosophy: localPhilo,
      max_students:        localMaxStudents,
    };

    const errs = validateRequiredFields(finalData);
    if (errs.length > 0) {
      Alert.alert('Missing Required Fields', errs.join('\n'));
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();

      const userRes = await fetch(`${API_URL}/api/user/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: finalData.full_name }),
      });
      if (!userRes.ok) throw new Error('Failed to update user info');

      // Profile picture upload (if new local image selected)
      let profile_picture_url = typeof profileImage === 'string' && profileImage.startsWith('http')
        ? profileImage : null;

      if (profileImage && !profileImage.startsWith('http')) {
        const imgForm = new FormData();
        imgForm.append('file', { uri: profileImage, name: 'avatar.jpg', type: 'image/jpeg' });
        const imgRes = await fetch(`${API_URL}/api/user/upload-avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: imgForm,
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          profile_picture_url = imgData.url || null;
        }
      }

      const profileRes = await fetch(`${API_URL}/api/tutor/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bio:                 finalData.bio,
          expertise:           finalData.expertise,
          hourly_rate:         parseFloat(finalData.hourly_rate),
          languages:           finalData.languages,
          gender:              finalData.gender,
          availability:        finalData.schedule,   // ← full granular schedule
          teaching_style:      finalData.teaching_style,
          years_experience:    finalData.years_experience,
          education:           finalData.education,
          certifications:      finalData.certifications,
          specializations:     finalData.specializations,
          teaching_philosophy: finalData.teaching_philosophy,
          min_session_length:  finalData.min_session_length,
          max_students:        finalData.max_students,
          preferred_age_groups:finalData.preferred_age_groups,
          ...(profile_picture_url && { profile_picture: profile_picture_url }),
        }),
      });
      if (!profileRes.ok) throw new Error('Failed to update profile');

      Alert.alert('✓ Saved', 'Profile updated successfully!');
      setEditing(false);
      fetchProfile();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert('⚠️ Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently', style: 'destructive',
          onPress: async () => {
            try {
              const token = await getToken();
              const res = await fetch(`${API_URL}/api/user/delete-account`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) { Alert.alert('Deleted', 'Account deleted.'); onClose?.(); }
              else throw new Error();
            } catch { Alert.alert('Error', 'Failed to delete account'); }
          },
        },
      ]
    );
  };

  // ── active slot count ──────────────────────────────────────────────────────
  const activeSlots = Object.values(formData.schedule).filter(Boolean).length;

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Modal visible={visible} animationType="fade">
        <SafeAreaView style={styles.loadingScreen}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerGradientBar} />
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handlePickImage}
              activeOpacity={editing ? 0.7 : 1}
            >
              {profileImage
                ? <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                : <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>
                      {formData.full_name?.charAt(0)?.toUpperCase() || 'T'}
                    </Text>
                  </View>}
              {editing && (
                <View style={styles.avatarBadge}>
                  <Icon name="camera" size={9} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.headerInfo}>
              <Text style={styles.headerName} numberOfLines={1}>
                {formData.full_name || 'Tutor'}
              </Text>
              <View style={styles.headerMeta}>
                {formData.teaching_style ? (
                  <View style={styles.stylePill}>
                    <Text style={styles.stylePillText}>{formData.teaching_style}</Text>
                  </View>
                ) : null}
                {formData.hourly_rate ? (
                  <Text style={styles.rateText}>${formData.hourly_rate}/hr</Text>
                ) : null}
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name="x" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          {!editing && (
            <View style={styles.statsRow}>
              <StatBadge icon="book-open" value={formData.expertise.length} label="Subjects" color="#16a34a" />
              <View style={styles.statDivider} />
              <StatBadge icon="globe" value={formData.languages.length} label="Languages" color="#2563eb" />
              <View style={styles.statDivider} />
              <StatBadge icon="calendar" value={activeSlots} label="Slots" color="#7c3aed" />
            </View>
          )}

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {[
              { key: 'profile',  label: 'Profile',  icon: 'user' },
              { key: 'schedule', label: 'Schedule', icon: 'calendar' },
            ].map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Icon name={tab.icon} size={13} color={activeTab === tab.key ? '#16a34a' : '#9ca3af'} />
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'profile' ? (
              <>
                {/* ── Personal ── */}
                <Section title="Personal Information" icon="user" accent="#16a34a">
                  <FieldBlock label="Full Name" required>
                    {editing
                      ? <TextInput
                          style={styles.input}
                          value={localName}
                          onChangeText={setLocalName}
                          placeholderTextColor="#9ca3af"
                          placeholder="Your full name"
                          autoCorrect={false}
                        />
                      : <ValueText value={formData.full_name} />}
                  </FieldBlock>

                  <FieldBlock label="Gender">
                    {editing
                      ? <ChipRow
                          value={formData.gender}
                          onChange={v => update('gender', v)}
                          accent="#16a34a"
                          options={[
                            { value: 'male',              label: 'Male' },
                            { value: 'female',            label: 'Female' },
                            { value: 'other',             label: 'Other' },
                            { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                          ]}
                        />
                      : <ValueText value={formData.gender} />}
                  </FieldBlock>
                </Section>

                {/* ── Professional ── */}
                <Section title="Professional Details" icon="briefcase" accent="#2563eb">
                  <FieldBlock label="Bio" required>
                    {editing
                      ? <TextInput
                          style={[styles.input, styles.textarea]}
                          value={localBio}
                          onChangeText={setLocalBio}
                          placeholder="Write your bio (min 20 chars)…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          numberOfLines={4}
                          textAlignVertical="top"
                          autoCorrect={false}
                        />
                      : <ValueText value={formData.bio} />}
                  </FieldBlock>

                  <View style={styles.twoCol}>
                    <View style={styles.colLeft}>
                      <FieldBlock label="Hourly Rate (USD)" required>
                        {editing
                          ? <TextInput
                              style={styles.input}
                              value={localRate}
                              onChangeText={setLocalRate}
                              keyboardType="numeric"
                              placeholder="e.g. 40"
                              placeholderTextColor="#9ca3af"
                            />
                          : <ValueText value={formData.hourly_rate ? `$${formData.hourly_rate}/hr` : ''} />}
                      </FieldBlock>
                    </View>
                    <View style={styles.colRight}>
                      <FieldBlock label="Years of Experience" required>
                        {editing
                          ? <TextInput
                              style={styles.input}
                              value={localExp}
                              onChangeText={setLocalExp}
                              placeholder="e.g. 5 years"
                              placeholderTextColor="#9ca3af"
                              autoCorrect={false}
                            />
                          : <ValueText value={formData.years_experience} />}
                      </FieldBlock>
                    </View>
                  </View>

                  <FieldBlock label="Expertise & Subjects" required>
                    {editing
                      ? <>
                          <TextInput
                            style={styles.input}
                            value={localExpertise}
                            onChangeText={setLocalExpertise}
                            placeholder="Math, Physics, Programming…"
                            placeholderTextColor="#9ca3af"
                            autoCorrect={false}
                            autoCapitalize="words"
                          />
                          <Text style={styles.hint}>Separate with commas</Text>
                        </>
                      : <TagDisplay items={formData.expertise} color="#dcfce7" textColor="#14532d" />}
                  </FieldBlock>

                  <FieldBlock label="Languages" required>
                    {editing
                      ? <>
                          <TextInput
                            style={styles.input}
                            value={localLanguages}
                            onChangeText={setLocalLanguages}
                            placeholder="English, Spanish…"
                            placeholderTextColor="#9ca3af"
                            autoCorrect={false}
                            autoCapitalize="words"
                          />
                          <Text style={styles.hint}>Separate with commas</Text>
                        </>
                      : <TagDisplay items={formData.languages} color="#dbeafe" textColor="#1d4ed8" />}
                  </FieldBlock>

                  <FieldBlock label="Teaching Style">
                    <ChipRow
                      value={formData.teaching_style}
                      onChange={v => update('teaching_style', v)}
                      accent="#2563eb"
                      options={[
                        { value: 'adaptive',     label: 'Adaptive' },
                        { value: 'structured',   label: 'Structured' },
                        { value: 'interactive',  label: 'Interactive' },
                        { value: 'hands-on',     label: 'Hands-on' },
                      ]}
                    />
                  </FieldBlock>

                  <View style={styles.twoCol}>
                    <View style={styles.colLeft}>
                      <FieldBlock label="Min Session">
                        <ChipRow
                          value={formData.min_session_length}
                          onChange={v => update('min_session_length', v)}
                          accent="#2563eb"
                          options={[
                            { value: '30', label: '30m' },
                            { value: '45', label: '45m' },
                            { value: '60', label: '60m' },
                            { value: '90', label: '90m' },
                          ]}
                        />
                      </FieldBlock>
                    </View>
                    <View style={styles.colRight}>
                      <FieldBlock label="Max Students">
                        {editing
                          ? <TextInput
                              style={styles.input}
                              value={localMaxStudents}
                              onChangeText={setLocalMaxStudents}
                              keyboardType="numeric"
                              placeholder="10"
                              placeholderTextColor="#9ca3af"
                            />
                          : <ValueText value={formData.max_students} />}
                      </FieldBlock>
                    </View>
                  </View>
                </Section>

                {/* ── Background ── */}
                <Section title="Background" icon="award" accent="#7c3aed">
                  <FieldBlock label="Education" required>
                    {editing
                      ? <TextInput
                          style={[styles.input, styles.textarea]}
                          value={localEducation}
                          onChangeText={setLocalEducation}
                          placeholder="Degrees and qualifications…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                          autoCorrect={false}
                        />
                      : <ValueText value={formData.education} />}
                  </FieldBlock>

                  <FieldBlock label="Certifications">
                    {editing
                      ? <TextInput
                          style={[styles.input, styles.textarea]}
                          value={localCerts}
                          onChangeText={setLocalCerts}
                          placeholder="List any relevant certifications…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          numberOfLines={2}
                          textAlignVertical="top"
                          autoCorrect={false}
                        />
                      : <ValueText value={formData.certifications} />}
                  </FieldBlock>

                  <FieldBlock label="Specializations">
                    {editing
                      ? <TextInput
                          style={[styles.input, styles.textarea]}
                          value={localSpec}
                          onChangeText={setLocalSpec}
                          placeholder="Any specialized areas…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          numberOfLines={2}
                          textAlignVertical="top"
                          autoCorrect={false}
                        />
                      : <ValueText value={formData.specializations} />}
                  </FieldBlock>

                  <FieldBlock label="Teaching Philosophy">
                    {editing
                      ? <TextInput
                          style={[styles.input, styles.textarea]}
                          value={localPhilo}
                          onChangeText={setLocalPhilo}
                          placeholder="Your approach to teaching…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                          autoCorrect={false}
                        />
                      : <ValueText value={formData.teaching_philosophy} />}
                  </FieldBlock>
                </Section>

                {/* ── Danger ── */}
                <View style={styles.dangerSection}>
                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
                    <Icon name="trash-2" size={16} color="#dc2626" />
                    <Text style={styles.deleteBtnText}>Delete Account Permanently</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* ── Schedule Tab ─────────────────────────────────────── */
              <View style={styles.scheduleTab}>
                <View style={styles.scheduleHeader}>
                  <Text style={styles.scheduleTitle}>Weekly Availability</Text>
                  <View style={[styles.slotCountBadge, activeSlots > 0 && styles.slotCountBadgeActive]}>
                    <Text style={[styles.slotCountText, activeSlots > 0 && styles.slotCountTextActive]}>
                      {activeSlots} slot{activeSlots !== 1 ? 's' : ''} selected
                    </Text>
                  </View>
                </View>

                {editing && (
                  <Text style={styles.scheduleTip}>Tap any cell to toggle availability</Text>
                )}

                {/* Legend */}
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#dcfce7', borderColor: '#16a34a' }]} />
                    <Text style={styles.legendText}>Available</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' }]} />
                    <Text style={styles.legendText}>Unavailable</Text>
                  </View>
                </View>

                {/* Calendar grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calScroll}>
                  <View>
                    {/* Day headers */}
                    <View style={styles.calRow}>
                      <View style={styles.timeHeaderCell} />
                      {DAYS.map(day => (
                        <View key={day} style={styles.dayHeaderCell}>
                          <Text style={styles.dayHeaderText}>{day}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Time rows */}
                    {TIME_SLOTS.map(({ key: slotKey, label, color: slotColor }) => {
                      const rowActive = DAY_KEYS.some(d => formData.schedule[`${d}_${slotKey}`]);
                      return (
                        <View key={slotKey} style={styles.calRow}>
                          <View style={[styles.timeCell, rowActive && styles.timeCellActive]}>
                            <Text style={[styles.timeCellText, rowActive && styles.timeCellTextActive]}>
                              {label}
                            </Text>
                          </View>
                          {DAY_KEYS.map(day => {
                            const active = formData.schedule[`${day}_${slotKey}`];
                            return (
                              <TouchableOpacity
                                key={day}
                                style={[
                                  styles.slotCell,
                                  active && styles.slotCellActive,
                                ]}
                                onPress={() => editing && toggleSlot(day, slotKey)}
                                activeOpacity={editing ? 0.6 : 1}
                              >
                                {active && <View style={styles.slotCheck} />}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Quick select buttons */}
                {editing && (
                  <View style={styles.quickSelectRow}>
                    <TouchableOpacity
                      style={styles.quickBtn}
                      onPress={() => {
                        const all = {};
                        DAY_KEYS.forEach(d => TIME_SLOTS.forEach(({ key }) => { all[`${d}_${key}`] = true; }));
                        update('schedule', all);
                      }}
                    >
                      <Text style={styles.quickBtnText}>Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickBtn}
                      onPress={() => update('schedule', buildDefaultSchedule())}
                    >
                      <Text style={styles.quickBtnText}>Clear All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickBtn}
                      onPress={() => {
                        const weekdays = {};
                        DAY_KEYS.forEach(d => TIME_SLOTS.forEach(({ key }) => {
                          weekdays[`${d}_${key}`] = !['saturday', 'sunday'].includes(d);
                        }));
                        update('schedule', weekdays);
                      }}
                    >
                      <Text style={styles.quickBtnText}>Weekdays</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            {editing ? (
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setEditing(false)}
                  disabled={saving}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Icon name="check" size={16} color="#fff" />
                        <Text style={styles.saveBtnText}>Save Changes</Text>
                      </>}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafc' },
  flex:         { flex: 1 },
  scrollContent:{ padding: 14, paddingBottom: 32 },

  // Loading
  loadingScreen:{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  loadingCard:  { alignItems: 'center', gap: 12 },
  loadingText:  { color: '#6b7280', fontSize: 14 },

  // Header
  header:       { backgroundColor: '#15803d', paddingBottom: 0, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { height: 3, width: 0 } },
  headerGradientBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerContent:{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  avatarWrap:   { position: 'relative' },
  avatarImage:  { width: 54, height: 54, borderRadius: 27, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  avatarPlaceholder: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  avatarInitial:{ color: '#fff', fontSize: 22, fontWeight: '800' },
  avatarBadge:  { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#16a34a', borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  headerInfo:   { flex: 1 },
  headerName:   { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  headerMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  stylePill:    { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  stylePillText:{ color: 'rgba(255,255,255,0.9)', fontSize: 11, textTransform: 'capitalize' },
  rateText:     { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  closeBtn:     { padding: 6, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 18 },

  // Stats
  statsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.1)' },
  statBadge:    { flex: 1, alignItems: 'center', gap: 2 },
  statValue:    { fontSize: 18, fontWeight: '800' },
  statLabel:    { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  statDivider:  { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Tab bar
  tabBar:       { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: '#16a34a' },
  tabText:      { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  tabTextActive:{ color: '#16a34a', fontWeight: '700' },

  // Section
  section:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderTopWidth: 3, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { height: 2, width: 0 } },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },

  // Fields
  fieldBlock:   { marginBottom: 14 },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue:   { fontSize: 14, color: '#111827', lineHeight: 20 },
  required:     { color: '#ef4444' },
  input:        { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#fafafa' },
  textarea:     { minHeight: 80, textAlignVertical: 'top', lineHeight: 20 },
  hint:         { fontSize: 11, color: '#9ca3af', marginTop: 3 },

  // Two columns
  twoCol:       { flexDirection: 'row', gap: 10 },
  colLeft:      { flex: 1 },
  colRight:     { flex: 1 },

  // Chip options
  chipOptions:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fafafa' },
  optionChipText:{ fontSize: 12, color: '#6b7280' },

  // Tags
  tagRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:          { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText:      { fontSize: 12, fontWeight: '500' },

  // Danger
  dangerSection:{ marginBottom: 12 },
  deleteBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#fca5a5', backgroundColor: '#fff5f5', borderRadius: 12, paddingVertical: 14 },
  deleteBtnText:{ color: '#dc2626', fontWeight: '600', fontSize: 14 },

  // Schedule tab
  scheduleTab:  { padding: 4 },
  scheduleHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  scheduleTitle:{ fontSize: 16, fontWeight: '800', color: '#111827' },
  slotCountBadge:{ backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  slotCountBadgeActive: { backgroundColor: '#dcfce7' },
  slotCountText:{ fontSize: 12, color: '#6b7280', fontWeight: '500' },
  slotCountTextActive: { color: '#15803d', fontWeight: '700' },
  scheduleTip:  { fontSize: 12, color: '#9ca3af', marginBottom: 10, fontStyle: 'italic' },

  // Legend
  legend:       { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:    { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5 },
  legendText:   { fontSize: 11, color: '#6b7280' },

  // Calendar
  calScroll:    { marginBottom: 14 },
  calRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  timeHeaderCell:{ width: 62 },
  dayHeaderCell:{ width: 42, alignItems: 'center', paddingVertical: 6 },
  dayHeaderText:{ fontSize: 11, fontWeight: '800', color: '#374151' },
  timeCell:     { width: 62, paddingRight: 6, paddingVertical: 4 },
  timeCellActive:{ },
  timeCellText: { fontSize: 9, color: '#9ca3af', textAlign: 'right', lineHeight: 13 },
  timeCellTextActive: { color: '#15803d', fontWeight: '700' },
  slotCell:     { width: 42, height: 34, marginHorizontal: 0, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#e5e7eb' },
  slotCellActive:{ backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  slotCheck:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16a34a' },

  // Quick select
  quickSelectRow:{ flexDirection: 'row', gap: 8, marginTop: 4 },
  quickBtn:     { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  quickBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },

  // Footer
  footer:       { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 14, paddingVertical: 12, elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { height: -2, width: 0 } },
  footerRow:    { flexDirection: 'row', gap: 10 },
  cancelBtn:    { flex: 1, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText:{ fontSize: 14, color: '#374151', fontWeight: '500' },
  saveBtn:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 13 },
  saveBtnDisabled:{ opacity: 0.6 },
  saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  editBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#15803d', borderRadius: 12, paddingVertical: 13 },
  editBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default TutorProfile;