/**
 * TutorProfile.native.jsx — Enhanced
 * Fixes: typing focus loss, calendar persistence, full schedule save/restore
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
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
    Image,
    Animated,
    useWindowDimensions,
} from 'react-native';
import { Text, colors as C, font, radius, shadow, useCompact } from '../theme';
import { storage } from '../utils/storage';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather as Icon } from '@expo/vector-icons';

import { API_URL } from '../utils/config';

// Page column width shared by header, body and footer.
const CONTENT_WIDTH = 720;

// ─── Calendar Constants ────────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_SLOTS = [
    { key: 'early_morning', label: '6–9 AM', color: '#fef3c7' },
    { key: 'morning', label: '9–12 PM', color: '#E8EEFD' },
    { key: 'afternoon', label: '12–3 PM', color: '#E6F7EF' },
    { key: 'late_afternoon', label: '3–6 PM', color: '#E8EEFD' },
    { key: 'evening', label: '6–9 PM', color: '#fee2e2' },
    { key: 'night', label: '9–12 AM', color: '#f1f5f9' },
];

const buildDefaultSchedule = () => {
    const s = {};
    DAY_KEYS.forEach(d => TIME_SLOTS.forEach(({ key }) => { s[`${d}_${key}`] = false; }));
    return s;
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ title, icon, children, accent = '#059669' }) => (
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
const FieldBlock = ({ label, required, children, style }) => (
    <View style={[styles.fieldBlock, style]}>
        <Text style={styles.fieldLabel}>
            {label}
            {required && <Text style={styles.required}> *</Text>}
        </Text>
        {children}
    </View>
);

const ValueText = ({ value, fallback = 'Not set' }) => (
    <Text style={styles.fieldValue} numberOfLines={6}>{value || fallback}</Text>
);

// ─── Option chip row ──────────────────────────────────────────────────────────
const ChipRow = ({ options, value, onChange, accent = '#059669' }) => (
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

// ─── Multi-select chips ───────────────────────────────────────────────────────
const SUPPORT_NEEDS = [
    'ADHD', 'Dyslexia', 'Autism', 'Dyscalculia', 'Anxiety',
    'Hearing impairment', 'Visual impairment', 'Physical disability',
];

const MultiChipRow = ({ options, values = [], onChange, accent = '#059669' }) => (
    <View style={styles.chipOptions}>
        {options.map(opt => {
            const active = values.includes(opt);
            return (
                <TouchableOpacity
                    key={opt}
                    style={[styles.optionChip, active && { borderColor: accent, backgroundColor: accent + '15' }]}
                    onPress={() => onChange(active ? values.filter(v => v !== opt) : [...values, opt])}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                >
                    <Text style={[styles.optionChipText, active && { color: accent, fontWeight: '700' }]}>{opt}</Text>
                </TouchableOpacity>
            );
        })}
    </View>
);

// ─── Tag display ──────────────────────────────────────────────────────────────
const TagDisplay = ({ items, color = '#E6F7EF', textColor = '#14532d' }) => (
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
        <Icon name={icon} size={14} color={color} />
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
);

// ─── Main Component ───────────────────────────────────────────────────────────

// Alert.alert works on web for a plain message, but window.alert is more reliable there
const notify = (title, message) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
};

const TutorProfile = ({ onClose, onAccountDeleted, visible = true, token: tokenProp }) => {
    // Responsive sizing: phones get one column, wider screens put short fields
    // side by side; the availability grid is sized to fit the screen width.
    const { width: winWidth } = useWindowDimensions();
    const compact = useCompact();
    const col = compact ? styles.colFull : styles.colHalf;
    // Android draws modals edge-to-edge (under the status bar and the
    // navigation buttons), and React Native's SafeAreaView only pads on iOS,
    // so pad by the system-bar insets ourselves - same approach as App.jsx.
    const insets = useSafeAreaInsets();
    const sysPad = Platform.OS === 'android' ? { paddingTop: insets.top, paddingBottom: insets.bottom } : null;
    const timeColWidth = compact ? 50 : 60;
    const gridWidth = Math.min(winWidth, CONTENT_WIDTH) - 24 /* page padding */ - 2 /* rounding */;
    const cellWidth = Math.max(30, Math.min(52, Math.floor((gridWidth - timeColWidth) / 7)));
    const cellHeight = Math.max(26, Math.min(34, Math.round(cellWidth * 0.75)));
    const calendarFits = timeColWidth + cellWidth * 7 <= gridWidth;
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [profileImage, setProfileImage] = useState(null);
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'schedule'
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // ── TYPING FIX: controlled local state refs so RN doesn't re-render parent ──
    const [localName, setLocalName] = useState('');
    const [localBio, setLocalBio] = useState('');
    const [localRate, setLocalRate] = useState('');
    const [localExp, setLocalExp] = useState('');
    const [localExpertise, setLocalExpertise] = useState('');
    const [localLanguages, setLocalLanguages] = useState('');
    const [localEducation, setLocalEducation] = useState('');
    const [localCerts, setLocalCerts] = useState('');
    const [localSpec, setLocalSpec] = useState('');
    const [localPhilo, setLocalPhilo] = useState('');
    const [localMaxStudents, setLocalMaxStudents] = useState('');

    const [formData, setFormData] = useState({
        full_name: '', email: '', bio: '',
        expertise: [], hourly_rate: '', languages: [],
        schedule: buildDefaultSchedule(),
        teaching_style: 'adaptive', years_experience: '',
        education: '', certifications: '', specializations: '',
        teaching_philosophy: '', min_session_length: '30',
        max_students: '10', preferred_age_groups: [], gender: '', support_needs: [],
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
            full_name: localName,
            bio: localBio,
            hourly_rate: localRate,
            years_experience: localExp,
            expertise: localExpertise.split(',').map(s => s.trim()).filter(Boolean),
            languages: localLanguages.split(',').map(s => s.trim()).filter(Boolean),
            education: localEducation,
            certifications: localCerts,
            specializations: localSpec,
            teaching_philosophy: localPhilo,
            max_students: localMaxStudents,
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
            const userData = await userRes.json();
            const profileData = await profileRes.json();

            // Restore full granular schedule
            const savedSchedule = profileData.profile?.availability || {};
            const mergedSchedule = { ...buildDefaultSchedule(), ...savedSchedule };

            setProfileImage(profileData.profile?.profile_picture || null);

            const p = profileData.profile || {};
            const u = userData.user || {};

            setFormData({
                full_name: u.full_name || '',
                email: u.email || '',
                bio: p.bio || '',
                expertise: p.expertise || [],
                hourly_rate: p.hourly_rate?.toString() || '',
                languages: p.languages || [],
                schedule: mergedSchedule,
                teaching_style: p.teaching_style || 'adaptive',
                years_experience: p.years_experience || '',
                education: p.education || '',
                certifications: p.certifications || '',
                specializations: p.specializations || '',
                teaching_philosophy: p.teaching_philosophy || '',
                min_session_length: p.min_session_length || '30',
                max_students: p.max_students || '10',
                preferred_age_groups: p.preferred_age_groups || [],
                support_needs: p.support_needs || [],
                gender: u.gender || '',
            });
        } catch {
            notify('Error', 'Failed to load profile');
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
        if (!data.full_name?.trim()) errs.push('Full name');
        if (!data.bio?.trim() || data.bio.length < 20) errs.push('Bio (min 20 chars)');
        if (!data.expertise || data.expertise.length === 0) errs.push('At least one expertise');
        if (!data.hourly_rate || parseFloat(data.hourly_rate) <= 0) errs.push('Hourly rate > 0');
        if (!data.languages || data.languages.length === 0) errs.push('At least one language');
        if (!data.years_experience) errs.push('Years of experience');
        if (!data.education?.trim()) errs.push('Education');
        if (!Object.values(data.schedule).some(Boolean)) errs.push('At least one availability slot');
        return errs;
    };

    const handleSave = async () => {
        // flush all local text states first
        flushLocals();

        // build final data inline (useState is async so read locals directly)
        const finalData = {
            ...formData,
            full_name: localName,
            bio: localBio,
            hourly_rate: localRate,
            years_experience: localExp,
            expertise: localExpertise.split(',').map(s => s.trim()).filter(Boolean),
            languages: localLanguages.split(',').map(s => s.trim()).filter(Boolean),
            education: localEducation,
            certifications: localCerts,
            specializations: localSpec,
            teaching_philosophy: localPhilo,
            max_students: localMaxStudents,
        };

        const errs = validateRequiredFields(finalData);
        if (errs.length > 0) {
            notify('Missing required fields', errs.join('\n'));
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
            if (!userRes.ok) {
                const d = await userRes.json().catch(() => ({}));
                throw new Error(d.error || `Failed to update user info (server returned ${userRes.status})`);
            }

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
                    bio: finalData.bio,
                    expertise: finalData.expertise,
                    hourly_rate: parseFloat(finalData.hourly_rate),
                    languages: finalData.languages,
                    gender: finalData.gender,
                    availability: finalData.schedule,   // ← full granular schedule
                    teaching_style: finalData.teaching_style,
                    years_experience: finalData.years_experience,
                    education: finalData.education,
                    certifications: finalData.certifications,
                    specializations: finalData.specializations,
                    teaching_philosophy: finalData.teaching_philosophy,
                    min_session_length: finalData.min_session_length,
                    max_students: finalData.max_students,
                    preferred_age_groups: finalData.preferred_age_groups,
                    support_needs: finalData.support_needs,
                    ...(profile_picture_url && { profile_picture: profile_picture_url }),
                }),
            });
            if (!profileRes.ok) {
                const d = await profileRes.json().catch(() => ({}));
                throw new Error(d.error || `Failed to update profile (server returned ${profileRes.status})`);
            }

            notify('Saved', 'Profile updated successfully!');
            setEditing(false);
            fetchProfile();
        } catch (err) {
            notify('Error', err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = () => {
        const doDelete = async () => {
            try {
                const token = await getToken();
                const res = await fetch(`${API_URL}/api/user/delete-account`, {
                    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `Server returned ${res.status}`);
                }
                notify('Account deleted', 'Your account has been permanently deleted.');
                // Log out: the old token belongs to a user that no longer exists
                if (onAccountDeleted) onAccountDeleted(); else onClose?.();
            } catch (e) {
                notify('Error', `Failed to delete account: ${e.message}`);
            }
        };

        const title = 'Delete account';
        const message = 'This will permanently delete your account, your courses, and all related data. This cannot be undone.';
        // Alert.alert buttons do nothing on web, so use the browser's dialog there
        if (Platform.OS === 'web') {
            if (window.confirm(`${title}\n\n${message}`)) doDelete();
        } else {
            Alert.alert(`⚠️ ${title}`, message, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete permanently', style: 'destructive', onPress: doDelete },
            ]);
        }
    };

    // ── active slot count ──────────────────────────────────────────────────────
    const activeSlots = Object.values(formData.schedule).filter(Boolean).length;

    // ─── Loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <Modal visible={visible} animationType="fade">
                <SafeAreaView style={[styles.loadingScreen, sysPad]}>
                    <View style={styles.loadingCard}>
                        <ActivityIndicator size="large" color="#059669" />
                        <Text style={styles.loadingText}>Loading profile…</Text>
                    </View>
                </SafeAreaView>
            </Modal>
        );
    }

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={[styles.container, sysPad]}>

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
                                    <Text style={styles.rateText}>RS{formData.hourly_rate}/hr</Text>
                                ) : null}
                            </View>
                        </View>

                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Icon name="x" size={20} color={C.text} />
                        </TouchableOpacity>
                    </View>

                    {/* Stats row */}
                    {!editing && (
                        <View style={styles.statsRow}>
                            <StatBadge icon="book-open" value={formData.expertise.length} label="Subjects" color="#059669" />
                            <View style={styles.statDivider} />
                            <StatBadge icon="globe" value={formData.languages.length} label="Languages" color="#2F5BEA" />
                            <View style={styles.statDivider} />
                            <StatBadge icon="calendar" value={activeSlots} label="Slots" color="#2F5BEA" />
                        </View>
                    )}

                    {/* Tab bar */}
                    <View style={styles.tabBar}>
                        {[
                            { key: 'profile', label: 'Profile', icon: 'user' },
                            { key: 'schedule', label: 'Schedule', icon: 'calendar' },
                        ].map(tab => (
                            <TouchableOpacity
                                key={tab.key}
                                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                                onPress={() => setActiveTab(tab.key)}
                            >
                                <Icon name={tab.icon} size={13} color={activeTab === tab.key ? '#059669' : '#9ca3af'} />
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
                                <Section title="Personal Information" icon="user" accent="#059669">
                                    <View style={styles.grid}>
                                    <FieldBlock label="Full Name" required style={col}>
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

                                    <FieldBlock label="Gender" style={col}>
                                        {editing
                                            ? <ChipRow
                                                value={formData.gender}
                                                onChange={v => update('gender', v)}
                                                accent="#059669"
                                                options={[
                                                    { value: 'male', label: 'Male' },
                                                    { value: 'female', label: 'Female' },
                                                    { value: 'other', label: 'Other' },
                                                    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                                                ]}
                                            />
                                            : <ValueText value={formData.gender} />}
                                    </FieldBlock>
                                    </View>
                                </Section>

                                {/* ── Professional ── */}
                                <Section title="Professional Details" icon="briefcase" accent="#2F5BEA">
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
                                            <FieldBlock label="Hourly Rate" required>
                                                {editing
                                                    ? <TextInput
                                                        style={styles.input}
                                                        value={localRate}
                                                        onChangeText={setLocalRate}
                                                        keyboardType="numeric"
                                                        placeholder="e.g. 40"
                                                        placeholderTextColor="#9ca3af"
                                                    />
                                                    : <ValueText value={formData.hourly_rate ? `RS${formData.hourly_rate}/hr` : ''} />}
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
                                            : <TagDisplay items={formData.expertise} color="#E6F7EF" textColor="#14532d" />}
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
                                            : <TagDisplay items={formData.languages} color="#E8EEFD" textColor="#1E45C8" />}
                                    </FieldBlock>

                                    <FieldBlock label="Teaching Style">
                                        <ChipRow
                                            value={formData.teaching_style}
                                            onChange={v => update('teaching_style', v)}
                                            accent="#2F5BEA"
                                            options={[
                                                { value: 'adaptive', label: 'Adaptive' },
                                                { value: 'structured', label: 'Structured' },
                                                { value: 'interactive', label: 'Interactive' },
                                                { value: 'hands-on', label: 'Hands-on' },
                                            ]}
                                        />
                                    </FieldBlock>

                                    <FieldBlock label="Learning needs you can support">
                                        {editing
                                            ? <>
                                                <MultiChipRow
                                                    options={SUPPORT_NEEDS}
                                                    values={formData.support_needs}
                                                    onChange={v => update('support_needs', v)}
                                                    accent="#059669"
                                                />
                                                <Text style={styles.hint}>
                                                    Only pick ones you have real experience with. Students who mention these needs will see you ranked higher.
                                                </Text>
                                            </>
                                            : <TagDisplay items={formData.support_needs || []} color="#E6F7EF" textColor="#14532d" />}
                                    </FieldBlock>

                                    <View style={styles.twoCol}>
                                        <View style={styles.colLeft}>
                                            <FieldBlock label="Min Session">
                                                <ChipRow
                                                    value={formData.min_session_length}
                                                    onChange={v => update('min_session_length', v)}
                                                    accent="#2F5BEA"
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
                                <Section title="Background" icon="award" accent="#2F5BEA">
                                    <View style={styles.grid}>
                                    <FieldBlock label="Education" required style={col}>
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

                                    <FieldBlock label="Certifications" style={col}>
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

                                    <FieldBlock label="Specializations" style={col}>
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

                                    <FieldBlock label="Teaching Philosophy" style={col}>
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
                                    </View>
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
                                        <View style={[styles.legendDot, { backgroundColor: '#E6F7EF', borderColor: '#059669' }]} />
                                        <Text style={styles.legendText}>Available</Text>
                                    </View>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: '#F3F5FA', borderColor: '#E6EAF2' }]} />
                                        <Text style={styles.legendText}>Unavailable</Text>
                                    </View>
                                </View>

                                {/* Calendar grid */}
                                {/* Sized to the screen; only scrolls sideways on very narrow screens. */}
                                <ScrollView
                                    horizontal
                                    scrollEnabled={!calendarFits}
                                    showsHorizontalScrollIndicator={!calendarFits}
                                    style={styles.calScroll}
                                    contentContainerStyle={calendarFits ? styles.calCentered : undefined}
                                >
                                    <View>
                                        {/* Day headers */}
                                        <View style={styles.calRow}>
                                            <View style={[styles.timeHeaderCell, { width: timeColWidth }]} />
                                            {DAYS.map(day => (
                                                <View key={day} style={[styles.dayHeaderCell, { width: cellWidth }]}>
                                                    <Text style={styles.dayHeaderText}>{day}</Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Time rows */}
                                        {TIME_SLOTS.map(({ key: slotKey, label, color: slotColor }) => {
                                            const rowActive = DAY_KEYS.some(d => formData.schedule[`${d}_${slotKey}`]);
                                            return (
                                                <View key={slotKey} style={styles.calRow}>
                                                    <View style={[styles.timeCell, { width: timeColWidth }, rowActive && styles.timeCellActive]}>
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
                                                                    { width: cellWidth - 3, height: cellHeight },
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
                        <View style={styles.footerInner}>
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
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    flex: { flex: 1, minHeight: 0 },
    scrollContent: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },

    // Loading
    loadingScreen: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
    loadingCard: { alignItems: 'center', gap: 12 },
    loadingText: { color: C.textMuted, fontSize: 14 },

    // Header (each row is held to the page column so it lines up with the body)
    header: { backgroundColor: '#FFFFFF', paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: C.border },
    headerGradientBar: { height: 0 },
    headerContent: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
    avatarWrap: { position: 'relative', flexShrink: 0 },
    avatarImage: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.primaryRing },
    avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.primaryRing },
    avatarInitial: { color: C.text, fontSize: 18, fontWeight: '800' },
    avatarBadge: { position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderRadius: 8, backgroundColor: C.successText, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    headerInfo: { flex: 1, minWidth: 0 },
    headerName: { color: C.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
    headerMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    stylePill: { backgroundColor: C.primarySoft, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 1 },
    stylePillText: { color: C.textMuted, fontSize: 11, textTransform: 'capitalize' },
    rateText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
    closeBtn: { padding: 6, backgroundColor: C.tile, borderRadius: 18, flexShrink: 0 },

    // Stats: one compact line per stat (icon, value, label)
    statsRow: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.tile },
    statBadge: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    statValue: { fontSize: 14, fontWeight: '800' },
    statLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500', flexShrink: 1 },
    statDivider: { width: 1, height: 18, backgroundColor: C.border },

    // Tab bar
    tabBar: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', backgroundColor: '#fff' },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
    tabActive: { borderBottomWidth: 2, borderBottomColor: C.successText },
    tabText: { fontSize: 13, color: C.textSubtle, fontWeight: '500' },
    tabTextActive: { color: C.successText, fontWeight: '700' },

    // Section
    section: { backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, marginBottom: 10, borderTopWidth: 3, borderWidth: 1, borderColor: C.border, ...shadow },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sectionIconWrap: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: C.text, letterSpacing: -0.2, flexShrink: 1 },

    // Responsive field grid: colHalf on wide screens, colFull on phones
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
    colHalf: { flexBasis: '45%', flexGrow: 1, flexShrink: 1, minWidth: 0 },
    colFull: { width: '100%', minWidth: 0 },

    // Fields
    fieldBlock: { marginBottom: 10, minWidth: 0 },
    fieldLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    fieldValue: { fontSize: 13, color: C.text, lineHeight: 19 },
    required: { color: '#ef4444' },
    input: { width: '100%', minWidth: 0, borderWidth: 1.5, borderColor: C.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.text, backgroundColor: '#fafafa', fontFamily: font },
    textarea: { minHeight: 64, textAlignVertical: 'top', lineHeight: 19 },
    hint: { fontSize: 11, color: C.textSubtle, marginTop: 3 },

    // Two columns (side by side on phones too; minWidth 0 stops inputs overflowing)
    twoCol: { flexDirection: 'row', gap: 10 },
    colLeft: { flex: 1, minWidth: 0 },
    colRight: { flex: 1, minWidth: 0 },

    // Chip options
    chipOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    optionChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fafafa' },
    optionChipText: { fontSize: 12, color: C.textMuted },

    // Tags
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 3 },
    tagText: { fontSize: 12, fontWeight: '500' },

    // Danger
    dangerSection: { marginBottom: 8 },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#fca5a5', backgroundColor: '#fff5f5', borderRadius: radius.md, paddingVertical: 10 },
    deleteBtnText: { color: C.danger, fontWeight: '600', fontSize: 13 },

    // Schedule tab
    scheduleTab: { paddingVertical: 2 },
    scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    scheduleTitle: { fontSize: 15, fontWeight: '800', color: C.text },
    slotCountBadge: { backgroundColor: C.tile, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    slotCountBadgeActive: { backgroundColor: C.successSoft },
    slotCountText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
    slotCountTextActive: { color: '#15803d', fontWeight: '700' },
    scheduleTip: { fontSize: 12, color: C.textSubtle, marginBottom: 6, fontStyle: 'italic' },

    // Legend
    legend: { flexDirection: 'row', gap: 16, marginBottom: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
    legendText: { fontSize: 11, color: C.textMuted },

    // Calendar (cell sizes are computed from the screen width at render time)
    calScroll: { marginBottom: 10, flexGrow: 0 },
    calCentered: { flexGrow: 1, justifyContent: 'center' },
    calRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
    timeHeaderCell: { width: 60 },
    dayHeaderCell: { width: 42, alignItems: 'center', paddingVertical: 4 },
    dayHeaderText: { fontSize: 11, fontWeight: '800', color: '#374151' },
    timeCell: { width: 60, paddingRight: 6, paddingVertical: 2 },
    timeCellActive: {},
    timeCellText: { fontSize: 9, color: C.textSubtle, textAlign: 'right', lineHeight: 12 },
    timeCellTextActive: { color: '#15803d', fontWeight: '700' },
    slotCell: { width: 39, height: 30, marginHorizontal: 1.5, borderRadius: 7, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border },
    slotCellActive: { backgroundColor: C.successSoft, borderColor: C.successText },
    slotCheck: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.successText },

    // Quick select
    quickSelectRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
    quickBtn: { flex: 1, backgroundColor: C.tile, borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border },
    quickBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },

    // Footer
    footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.tile, paddingHorizontal: 12, paddingVertical: 10, elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { height: -2, width: 0 } },
    footerInner: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center' },
    footerRow: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
    cancelBtnText: { fontSize: 14, color: '#374151', fontWeight: '500' },
    saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.successText, borderRadius: radius.md, paddingVertical: 10 },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#15803d', borderRadius: radius.md, paddingVertical: 10 },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default TutorProfile;
