import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Star, ThumbsUp, ThumbsDown, Clock, CheckCircle, AlertCircle } from 'lucide-react-native';
import { storage } from '../utils/storage';
import { API_URL } from '../utils/config';

// ── FEEDBACK MODAL ────────────────────────────────────────────────────────────
export const TutorFeedbackModal = ({ tutor, onClose, onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [completed, setCompleted] = useState(true);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [responseTime, setResponseTime] = useState('fast');
  const [punctuality, setPunctuality] = useState('excellent');
  const [submitting, setSubmitting] = useState(false);

  const responseTimeMap = { instant: 0.5, fast: 2, moderate: 6, slow: 12, 'very-slow': 24 };
  const punctualityMap = { excellent: 1.0, good: 0.9, okay: 0.7, poor: 0.4 };

  const handleSubmit = async () => {
    if (rating === 0) { alert('Please select a rating'); return; }
    setSubmitting(true);
    try {
      const token = await storage.getItem('token');
      const res = await fetch(`${API_URL}/api/match/quick-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tutor_id: tutor.id,
          outcome: {
            satisfaction_rating: rating,
            completed,
            would_recommend: wouldRecommend,
            response_time: responseTimeMap[responseTime],
            punctuality_score: punctualityMap[punctuality],
          },
        }),
      });
      if (res.ok) {
        alert('✅ Thank you! Your feedback helps improve recommendations.');
        if (onSubmit) onSubmit();
        onClose();
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch {
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const ratingLabels = { 5: '🌟 Excellent!', 4: '👍 Very Good!', 3: '👌 Good', 2: '😐 Could be better', 1: '😞 Not satisfied' };

  const SelectRow = ({ label, options, value, onChange }) => (
    <View style={styles.selectWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.selectGrid}>
        {options.map(o => (
          <TouchableOpacity
            key={o.value}
            style={[styles.selectOption, value === o.value && styles.selectOptionActive]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[styles.selectText, value === o.value && styles.selectTextActive]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <Modal transparent animationType="slide" visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Rate Your Experience</Text>
            <Text style={styles.sub}>
              with <Text style={styles.tutorName}>{tutor.name}</Text>
            </Text>

            {/* Stars */}
            <Text style={styles.sectionLabel}>Overall Satisfaction</Text>
            <View style={styles.starsRow}>
              {[1,2,3,4,5].map(s => (
                <TouchableOpacity key={s} onPress={() => setRating(s)}>
                  <Star size={36} color="#facc15" fill={s <= rating ? '#facc15' : 'transparent'} />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && <Text style={styles.ratingLabel}>{ratingLabels[rating]}</Text>}

            {/* Completed */}
            <Text style={styles.sectionLabel}>Did you complete your learning goal?</Text>
            <View style={styles.twoBtn}>
              <TouchableOpacity
                style={[styles.toggleBtn, completed && styles.toggleBtnGreen]}
                onPress={() => setCompleted(true)}
              >
                <CheckCircle size={18} color={completed ? '#15803d' : '#6b7280'} />
                <Text style={[styles.toggleText, completed && { color: '#15803d' }]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, !completed && styles.toggleBtnOrange]}
                onPress={() => setCompleted(false)}
              >
                <AlertCircle size={18} color={!completed ? '#c2410c' : '#6b7280'} />
                <Text style={[styles.toggleText, !completed && { color: '#c2410c' }]}>Still ongoing</Text>
              </TouchableOpacity>
            </View>

            {/* Recommend */}
            <Text style={styles.sectionLabel}>Would you recommend this tutor?</Text>
            <View style={styles.twoBtn}>
              <TouchableOpacity
                style={[styles.toggleBtn, wouldRecommend && styles.toggleBtnBlue]}
                onPress={() => setWouldRecommend(true)}
              >
                <ThumbsUp size={18} color={wouldRecommend ? '#1d4ed8' : '#6b7280'} />
                <Text style={[styles.toggleText, wouldRecommend && { color: '#1d4ed8' }]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, !wouldRecommend && styles.toggleBtnRed]}
                onPress={() => setWouldRecommend(false)}
              >
                <ThumbsDown size={18} color={!wouldRecommend ? '#dc2626' : '#6b7280'} />
                <Text style={[styles.toggleText, !wouldRecommend && { color: '#dc2626' }]}>No</Text>
              </TouchableOpacity>
            </View>

            <SelectRow
              label="Response Time"
              value={responseTime}
              onChange={setResponseTime}
              options={[
                { value: 'instant', label: '⚡ Instant' },
                { value: 'fast', label: '🚀 Fast' },
                { value: 'moderate', label: '👍 Moderate' },
                { value: 'slow', label: '⏰ Slow' },
                { value: 'very-slow', label: '🐌 Very Slow' },
              ]}
            />

            <SelectRow
              label="Punctuality"
              value={punctuality}
              onChange={setPunctuality}
              options={[
                { value: 'excellent', label: '⭐ Excellent' },
                { value: 'good', label: '✅ Good' },
                { value: 'okay', label: '👌 Okay' },
                { value: 'poor', label: '❌ Poor' },
              ]}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Your feedback is anonymous and helps improve tutor recommendations for you and other students.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, (submitting || rating === 0) && { opacity: 0.5 }]}
                onPress={handleSubmit}
                disabled={submitting || rating === 0}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitText}>Submit Feedback</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ── TUTOR MATCH CARD ──────────────────────────────────────────────────────────
export const TutorMatchCard = ({ match, onFeedback, showPerformance = true }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.topRow}>
        <View>
          <Text style={cardStyles.name}>{match.tutor_name}</Text>
          <View style={cardStyles.starsRow}>
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={14}
                color="#facc15"
                fill={i < Math.round(match.breakdown.rating / 20) ? '#facc15' : 'transparent'}
              />
            ))}
          </View>
        </View>
        <View style={cardStyles.scoreBox}>
          <Text style={cardStyles.score}>{match.match_score}%</Text>
          <Text style={cardStyles.scoreLabel}>Match Score</Text>
        </View>
      </View>

      {showPerformance && match.breakdown.performance_score && (
        <View style={cardStyles.perfBadge}>
          <Text style={cardStyles.perfText}>
            🏆 Performance Score: {match.breakdown.performance_score}%
          </Text>
        </View>
      )}

      <View style={cardStyles.statsRow}>
        {[
          { label: 'Subject', value: match.breakdown.subject_match, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Skills', value: match.breakdown.skill_compatibility, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Schedule', value: match.breakdown.schedule_match, color: '#7c3aed', bg: '#f5f3ff' },
        ].map(s => (
          <View key={s.label} style={[cardStyles.statBox, { backgroundColor: s.bg }]}>
            <Text style={[cardStyles.statValue, { color: s.color }]}>{s.value}%</Text>
            <Text style={cardStyles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={cardStyles.actions}>
        <TouchableOpacity
          style={cardStyles.detailsBtn}
          onPress={() => setShowDetails(v => !v)}
        >
          <Text style={cardStyles.detailsBtnText}>
            {showDetails ? 'Hide Details' : 'View Details'}
          </Text>
        </TouchableOpacity>
        {onFeedback && (
          <TouchableOpacity style={cardStyles.rateBtn} onPress={() => onFeedback(match)}>
            <Text style={cardStyles.rateBtnText}>Rate</Text>
          </TouchableOpacity>
        )}
      </View>

      {showDetails && (
        <View style={cardStyles.details}>
          {Object.entries(match.breakdown).map(([key, value]) => (
            <View key={key} style={cardStyles.detailRow}>
              <Text style={cardStyles.detailKey}>{key.replace(/_/g, ' ')}</Text>
              <View style={cardStyles.barTrack}>
                <View style={[cardStyles.barFill, { width: `${value}%` }]} />
              </View>
              <Text style={cardStyles.detailValue}>{value}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '90%' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  tutorName: { color: '#2563eb', fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 14, color: '#6b7280', marginBottom: 8 },
  twoBtn: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12,
  },
  toggleBtnGreen: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  toggleBtnOrange: { borderColor: '#ea580c', backgroundColor: '#fff7ed' },
  toggleBtnBlue: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  toggleBtnRed: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  toggleText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  selectWrap: { marginBottom: 4 },
  selectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectOption: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  selectOptionActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  selectText: { fontSize: 12, color: '#374151' },
  selectTextActive: { color: '#2563eb' },
  infoBox: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 12, marginTop: 12, marginBottom: 4 },
  infoText: { fontSize: 12, color: '#1e40af' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '500' },
  submitBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600' },
});

const cardStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.08, elevation: 3 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  starsRow: { flexDirection: 'row', gap: 2 },
  scoreBox: { alignItems: 'flex-end' },
  score: { fontSize: 28, fontWeight: 'bold', color: '#2563eb' },
  scoreLabel: { fontSize: 11, color: '#6b7280' },
  perfBadge: { backgroundColor: '#f5f3ff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 12 },
  perfText: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, borderRadius: 8, padding: 8, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#6b7280' },
  actions: { flexDirection: 'row', gap: 8 },
  detailsBtn: { flex: 1, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  detailsBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  rateBtn: { borderWidth: 2, borderColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  rateBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  details: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detailKey: { flex: 1, fontSize: 12, color: '#6b7280', textTransform: 'capitalize' },
  barTrack: { width: 80, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: '#2563eb', borderRadius: 3 },
  detailValue: { width: 36, fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'right' },
});

export { TutorFeedbackModal as default };