/**
 * TutorProfileViewer.native.jsx
 * React Native conversion
 *
 * Dependencies:
 *   npm install react-native-vector-icons
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Feather as Icon } from '@expo/vector-icons';

const TutorProfileViewer = ({
  tutorId,
  onClose,
  onMessageTutor,
  API_URL = 'https://hult-663884308553.europe-west9.run.app',
  visible = true,
}) => {
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
      return <Icon key={i} name="star" size={16} color={filled ? '#F59E0B' : '#D1D5DB'} style={filled ? { color: '#F59E0B' } : {}} />;
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
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading tutor profile…</Text>
        </SafeAreaView>
      </Modal>
    );
  }

  if (error) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.centered}>
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
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{tutor.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.tutorName}>{tutor.name}</Text>
              <View style={styles.badgeRow}>
                {tutor.verified && (
                  <View style={styles.badge}>
                    <Icon name="check-circle" size={12} color="#fff" />
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
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
              <Icon name="dollar-sign" size={20} color="#2563EB" />
              <Text style={[styles.statValue, { color: '#2563EB' }]}>${tutor.hourly_rate || 0}</Text>
              <Text style={styles.statLabel}>per hour</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}>
              <Icon name="briefcase" size={20} color="#16A34A" />
              <Text style={[styles.statValue, { color: '#16A34A' }]}>{tutor.years_experience || '0'}</Text>
              <Text style={styles.statLabel}>experience</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FFF7ED' }]}>
              <Icon name="users" size={20} color="#EA580C" />
              <Text style={[styles.statValue, { color: '#EA580C' }]}>{tutor.total_sessions || 0}</Text>
              <Text style={styles.statLabel}>sessions</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FEF9C3' }]}>
              <Icon name="star" size={20} color="#CA8A04" />
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
                <Icon name="clock" size={16} color="#2563EB" />
                <View style={styles.infoRowText}>
                  <Text style={styles.subLabel}>Experience</Text>
                  <Text style={styles.bodyText}>{tutor.years_experience}</Text>
                </View>
              </View>
            )}
            {tutor.education && (
              <View style={styles.infoRow}>
                <Icon name="book" size={16} color="#7C3AED" />
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
          <TouchableOpacity
            style={styles.messageBtn}
            onPress={() => { onClose(); if (onMessageTutor) onMessageTutor(tutor.user_id); }}
          >
            <Icon name="message-square" size={18} color="#fff" />
            <Text style={styles.messageBtnText}>Message Tutor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeActionBtn} onPress={onClose}>
            <Text style={styles.closeActionBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6B7280', fontSize: 13 },
  errorText: { color: '#EF4444', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  closeBtnLarge: { marginTop: 16, backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  closeBtnLargeText: { color: '#fff', fontWeight: '600' },

  // Header
  header: { backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 16 },
  headerContent: { flexDirection: 'row', gap: 12, paddingRight: 36 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitial: { color: '#fff', fontSize: 26, fontWeight: '700' },
  headerInfo: { flex: 1 },
  tutorName: { color: '#fff', fontWeight: '700', fontSize: 20, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText: { color: '#fff', fontSize: 11 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  starsRow: { flexDirection: 'row', gap: 2 },
  ratingText: { color: '#fff', fontSize: 13 },
  sessionsText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  closeBtn: { position: 'absolute', top: 16, right: 14, padding: 6 },

  scrollContent: { padding: 12, paddingBottom: 16 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10 },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  statLabel: { fontSize: 10, color: '#6B7280', marginTop: 2 },

  // Section accordion
  sectionCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 8, overflow: 'hidden' },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  sectionBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 15, color: '#1F2937' },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },

  subLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
  bodyText: { fontSize: 13, color: '#4B5563', lineHeight: 19 },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  subsection: { marginTop: 10 },
  philosophyBlock: { marginTop: 12, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chipBlue: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  chipBlueText: { color: '#1D4ED8', fontSize: 12, fontWeight: '500' },
  chipGreen: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  chipGreenText: { color: '#14532D', fontSize: 12, fontWeight: '500' },
  chipPurple: { backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  chipPurpleText: { color: '#5B21B6', fontSize: 12 },

  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10 },
  infoRowText: { flex: 1 },

  // Actions
  actions: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  messageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14 },
  messageBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeActionBtn: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  closeActionBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
});

export default TutorProfileViewer;