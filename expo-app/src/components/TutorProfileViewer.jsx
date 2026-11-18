/**
 * TutorProfileViewer.native.jsx
 * React Native conversion
 *
 * Dependencies:
 *   npm install react-native-vector-icons
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, colors as C, font, radius, shadow } from '../theme';
import { Feather as Icon } from '@expo/vector-icons';
import { API_URL as CONFIG_API_URL } from '../utils/config';

// Rates are stored in the tutor's currency (Mauritian rupees unless set otherwise).
const CURRENCY_SYMBOL = { MUR: 'Rs', USD: 'US$', EUR: '€', GBP: '£', INR: '₹' };
const formatRate = (amount, currency) => {
  const sym = CURRENCY_SYMBOL[(currency || 'MUR').toUpperCase()] || (currency || 'Rs');
  return `${sym} ${Number(amount || 0).toLocaleString('en-US')}`;
};

const TutorProfileViewer = ({
  tutorId,
  onClose,
  onMessageTutor,
  API_URL = CONFIG_API_URL,
  visible = true,
}) => {
  // Android draws modals under the status bar and navigation buttons;
  // React Native's SafeAreaView only pads on iOS (same fix as App.jsx).
  const insets = useSafeAreaInsets();
  const sysPad = Platform.OS === 'android' ? { paddingTop: insets.top, paddingBottom: insets.bottom } : null;
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    about: true,
    expertise: true,
    education: false,
    availability: false,
    reviews: false,
  });

  useEffect(() => {
    if (tutorId) fetchTutorProfile();
  }, [tutorId]);

  const fetchTutorProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/tutors/${tutorId}/profile`);
      if (!res.ok) throw new Error('Failed to fetch tutor profile');
      const data = await res.json();
      setTutor(data.tutor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const renderStars = (rating) => {
    const count = Math.round(rating * 2) / 2;
    return Array.from({ length: 5 }).map((_, i) => {
      const filled = i < Math.floor(count);
      return <Icon key={i} name="star" size={16} color={filled ? '#F59E0B' : '#D5DCEA'} style={filled ? { color: '#F59E0B' } : {}} />;
    });
  };

  const formatAvailability = (availability) => {
    if (!availability || Object.keys(availability).length === 0) return 'No availability set';
    const dayMap = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
    return Object.entries(availability)
      .filter(([, v]) => v)
      .map(([day]) => dayMap[day] || day)
      .join(', ') || 'No availability set';
  };

  // ─── Section accordion ────────────────────────────────────────────
  const Section = ({ id, iconName, title, children }) => (
    <View style={styles.sectionCard}>
      <TouchableOpacity style={styles.sectionBtn} onPress={() => toggleSection(id)}>
        <View style={styles.sectionBtnLeft}>
          <Icon name={iconName} size={18} color="#6B7280" />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Icon name={expandedSections[id] ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
      </TouchableOpacity>
      {expandedSections[id] && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );

  // ─── Loading / error ──────────────────────────────────────────────
  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={[styles.centered, sysPad]}>
          <ActivityIndicator size="large" color="#2F5BEA" />
          <Text style={styles.loadingText}>Loading tutor profile…</Text>
        </SafeAreaView>
      </Modal>
    );
  }

  if (error) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={[styles.centered, sysPad]}>
          <Icon name="alert-circle" size={36} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.closeBtnLarge} onPress={onClose}>
            <Text style={styles.closeBtnLargeText}>Close</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    );
  }

  if (!tutor) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, sysPad]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{tutor.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.tutorName} numberOfLines={1}>{tutor.name}</Text>
              <View style={styles.badgeRow}>
                {tutor.verified && (
                  <View style={styles.badge}>
                    <Icon name="check-circle" size={12} color={C.primary} />
                    <Text style={styles.badgeText}>Verified</Text>
                  </View>
                )}
                {tutor.teaching_style && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {tutor.teaching_style.charAt(0).toUpperCase() + tutor.teaching_style.slice(1)} Style
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.ratingRow}>
                <View style={styles.starsRow}>{renderStars(tutor.rating || 0)}</View>
                <Text style={styles.ratingText}>{tutor.rating ? tutor.rating.toFixed(1) : 'New'}</Text>
                <Text style={styles.sessionsText}>({tutor.total_sessions || 0} sessions)</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Icon name="x" size={20} color={C.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#E8EEFD' }]}>
              <Icon name="tag" size={18} color="#2F5BEA" />
              <Text style={[styles.statValue, { color: '#2F5BEA' }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatRate(tutor.hourly_rate, tutor.price_currency)}
              </Text>
              <Text style={styles.statLabel}>per hour</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#E6F7EF' }]}>
              <Icon name="briefcase" size={18} color="#059669" />
              <Text style={[styles.statValue, { color: '#059669' }]}>{tutor.years_experience || '0'}</Text>
              <Text style={styles.statLabel}>experience</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FFF7ED' }]}>
              <Icon name="users" size={18} color="#EA580C" />
              <Text style={[styles.statValue, { color: '#EA580C' }]}>{tutor.total_sessions || 0}</Text>
              <Text style={styles.statLabel}>sessions</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FEF9C3' }]}>
              <Icon name="star" size={18} color="#CA8A04" />
              <Text style={[styles.statValue, { color: '#CA8A04' }]}>{tutor.rating ? tutor.rating.toFixed(1) : 'New'}</Text>
              <Text style={styles.statLabel}>rating</Text>
            </View>
          </View>

          {/* About */}
          <Section id="about" iconName="user" title="About">
            {tutor.bio ? (
              <Text style={styles.bodyText}>{tutor.bio}</Text>
            ) : (
              <Text style={styles.emptyText}>No bio provided</Text>
            )}
            {tutor.teaching_philosophy && (
              <View style={styles.philosophyBlock}>
                <Text style={styles.subLabel}>Teaching Philosophy</Text>
                <Text style={styles.bodyText}>{tutor.teaching_philosophy}</Text>
              </View>
            )}
          </Section>

          {/* Expertise & Languages */}
          <Section id="expertise" iconName="book-open" title="Expertise & Languages">
            <Text style={styles.subLabel}>Subjects I Teach:</Text>
            {tutor.expertise && tutor.expertise.length > 0 ? (
              <View style={styles.chipRow}>
                {tutor.expertise.map((s, i) => <View key={i} style={styles.chipBlue}><Text style={styles.chipBlueText}>{s}</Text></View>)}
              </View>
            ) : <Text style={styles.emptyText}>No subjects listed</Text>}

            {tutor.specializations && (
              <View style={styles.subsection}>
                <Text style={styles.subLabel}>Specializations:</Text>
                <Text style={styles.bodyText}>{tutor.specializations}</Text>
              </View>
            )}

            <View style={styles.subsection}>
              <Text style={styles.subLabel}>Languages:</Text>
              {tutor.languages && tutor.languages.length > 0 ? (
                <View style={styles.chipRow}>
                  {tutor.languages.map((l, i) => (
                    <View key={i} style={styles.chipGreen}>
                      <Icon name="globe" size={12} color="#14532D" />
                      <Text style={styles.chipGreenText}>{l}</Text>
                    </View>
                  ))}
                </View>
              ) : <Text style={styles.emptyText}>No languages listed</Text>}
            </View>
          </Section>

          {/* Education */}
          <Section id="education" iconName="award" title="Education & Experience">
            {tutor.years_experience && (
              <View style={styles.infoRow}>
                <Icon name="clock" size={16} color="#2F5BEA" />
                <View style={styles.infoRowText}>
                  <Text style={styles.subLabel}>Experience</Text>
                  <Text style={styles.bodyText}>{tutor.years_experience}</Text>
                </View>
              </View>
            )}
            {tutor.education && (
              <View style={styles.infoRow}>
                <Icon name="book" size={16} color="#2F5BEA" />
                <View style={styles.infoRowText}>
                  <Text style={styles.subLabel}>Education</Text>
                  <Text style={styles.bodyText}>{tutor.education}</Text>
                </View>
              </View>
            )}
            {tutor.certifications && (
              <View style={styles.infoRow}>
                <Icon name="award" size={16} color="#CA8A04" />
                <View style={styles.infoRowText}>
                  <Text style={styles.subLabel}>Certifications</Text>
                  <Text style={styles.bodyText}>{tutor.certifications}</Text>
                </View>
              </View>
            )}
            {!tutor.years_experience && !tutor.education && !tutor.certifications && (
              <Text style={styles.emptyText}>No education details provided</Text>
            )}
          </Section>

          {/* Availability */}
          <Section id="availability" iconName="calendar" title="Availability & Preferences">
            <View style={styles.subsection}>
              <Text style={styles.subLabel}>Available Days:</Text>
              <Text style={styles.bodyText}>{formatAvailability(tutor.availability)}</Text>
            </View>
            {tutor.min_session_length && (
              <View style={styles.subsection}>
                <Text style={styles.subLabel}>Minimum Session Length:</Text>
                <Text style={styles.bodyText}>{tutor.min_session_length} minutes</Text>
              </View>
            )}
            {tutor.max_students && (
              <View style={styles.subsection}>
                <Text style={styles.subLabel}>Max Students per Session:</Text>
                <Text style={styles.bodyText}>{tutor.max_students}</Text>
              </View>
            )}
            {tutor.preferred_age_groups && tutor.preferred_age_groups.length > 0 && (
              <View style={styles.subsection}>
                <Text style={styles.subLabel}>Preferred Age Groups:</Text>
                <View style={styles.chipRow}>
                  {tutor.preferred_age_groups.map((age, i) => (
                    <View key={i} style={styles.chipPurple}><Text style={styles.chipPurpleText}>{age}</Text></View>
                  ))}
                </View>
              </View>
            )}
          </Section>
        </ScrollView>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.closeActionBtn} onPress={onClose}>
            <Text style={styles.closeActionBtnText}>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.messageBtn}
            onPress={() => { onClose(); if (onMessageTutor) onMessageTutor(tutor.user_id); }}
          >
            <Icon name="message-square" size={18} color="#fff" />
            <Text style={styles.messageBtnText}>Message Tutor</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: C.textMuted, fontSize: 13 },
  errorText: { color: '#EF4444', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  closeBtnLarge: { marginTop: 16, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  closeBtnLargeText: { color: '#fff', fontWeight: '600' },

  // Header
  header: { backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  headerContent: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 36 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitial: { color: C.text, fontSize: 20, fontWeight: '700' },
  headerInfo: { flex: 1, minWidth: 0 },
  tutorName: { color: C.text, fontWeight: '700', fontSize: 17, marginBottom: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { color: C.text, fontSize: 11 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  starsRow: { flexDirection: 'row', gap: 2 },
  ratingText: { color: C.text, fontSize: 13 },
  sessionsText: { color: C.textMuted, fontSize: 12 },
  closeBtn: { position: 'absolute', top: 8, right: 8, padding: 6 },

  scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 12, paddingBottom: 16 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statCard: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  statValue: { fontSize: 15, fontWeight: '700', marginTop: 3 },
  statLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },

  // Section accordion
  sectionCard: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: C.border, marginBottom: 8, overflow: 'hidden', ...shadow },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11 },
  sectionBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 14, color: C.text },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.tile },

  subLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
  bodyText: { fontSize: 13, color: '#4B5563', lineHeight: 19 },
  emptyText: { fontSize: 13, color: C.textSubtle, fontStyle: 'italic' },
  subsection: { marginTop: 10 },
  philosophyBlock: { marginTop: 12, backgroundColor: C.bg, borderRadius: 12, padding: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chipBlue: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  chipBlueText: { color: C.primaryDark, fontSize: 12, fontWeight: '500' },
  chipGreen: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.successSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  chipGreenText: { color: '#14532D', fontSize: 12, fontWeight: '500' },
  chipPurple: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  chipPurpleText: { color: C.primaryDark, fontSize: 12 },

  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10 },
  infoRowText: { flex: 1 },

  // Actions
  actions: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.tile, paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  messageBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: radius.md, paddingVertical: 11 },
  messageBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  closeActionBtn: { flex: 1, backgroundColor: C.tile, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  closeActionBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
});

export default TutorProfileViewer;