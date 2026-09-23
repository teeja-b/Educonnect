import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Modal, TextInput,
} from 'react-native';
import {
  Search, Star, TrendingUp, Brain, Users,
  Calendar, Globe, BookOpen, Zap, AlertCircle,
  ChevronDown, ChevronUp, DollarSign,
  Award, Briefcase, MessageSquare, CheckCircle, X,
} from 'lucide-react-native';
import { storage } from '../utils/storage';
import { API_URL } from '../utils/config';

// ─── Score helpers ────────────────────────────────────────────────────────────

const getScoreColor = (score, source) => {
  if (!source || source === 'missing') return '#9ca3af';
  if (score >= 75) return '#16a34a';
  if (score >= 55) return '#2563eb';
  if (score >= 35) return '#ca8a04';
  return '#6b7280';
};

const getScoreLabel = (score, confidence) => {
  const conf = confidence ?? 1;
  if (conf < 0.25) return 'Unverified';
  if (conf < 0.50) return 'Low confidence';
  if (score >= 75) return 'Strong match';
  if (score >= 55) return 'Good match';
  if (score >= 35) return 'Partial match';
  return 'Weak match';
};

const getScoreBadgeColor = (score, confidence) => {
  const conf = confidence ?? 1;
  if (conf < 0.25) return '#6b7280';
  if (conf < 0.50) return '#ca8a04';
  if (score >= 75) return '#16a34a';
  if (score >= 55) return '#2563eb';
  return '#6b7280';
};

// ─── MatchDetail cell ─────────────────────────────────────────────────────────

const MatchDetail = ({ icon: Icon, label, score, source, zeroMeans }) => {
  const isMissing = score === null || score === undefined || source === 'missing';
  const color = isMissing ? '#9ca3af' : getScoreColor(score, source);
  let displayValue;
  if (isMissing) displayValue = 'No data';
  else if (score === 0 && zeroMeans) displayValue = zeroMeans;
  else displayValue = `${score}%`;

  return (
    <View style={styles.detailItem}>
      <Icon size={14} color={color} />
      <View style={{ marginLeft: 6 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailScore, { color }]}>{displayValue}</Text>
      </View>
    </View>
  );
};

// ─── ConfidencePill ───────────────────────────────────────────────────────────

const ConfidencePill = ({ confidence }) => {
  if (confidence == null) return null;
  const pct   = Math.round(confidence * 100);
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#ca8a04' : '#dc2626';
  const bg    = pct >= 70 ? '#f0fdf4' : pct >= 40 ? '#fffbeb' : '#fef2f2';
  const label = pct >= 70 ? 'High confidence' : pct >= 40 ? 'Medium confidence' : 'Low confidence';
  return (
    <View style={[styles.confidencePill, { backgroundColor: bg }]}>
      <AlertCircle size={11} color={color} />
      <Text style={[styles.confidenceText, { color }]}>{label} · {pct}%</Text>
    </View>
  );
};

// ─── Chip ─────────────────────────────────────────────────────────────────────

const Chip = ({ label, color = '#dbeafe', textColor = '#1d4ed8' }) => (
  <View style={[styles.chip, { backgroundColor: color }]}>
    <Text style={[styles.chipText, { color: textColor }]}>{label}</Text>
  </View>
);

// ─── SectionLabel ─────────────────────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <Text style={styles.sectionLabel}>{children}</Text>
);

// ─── Star Rating Component ────────────────────────────────────────────────────
// Interactive stars with hover/selected state

const StarRating = ({ value, onChange, size = 28, disabled = false }) => (
  <View style={{ flexDirection: 'row', gap: 6 }}>
    {[1, 2, 3, 4, 5].map(n => {
      const filled = n <= value;
      return (
        <TouchableOpacity
          key={n}
          onPress={() => !disabled && onChange(n)}
          activeOpacity={0.7}
          disabled={disabled}
          hitSlop={6}
        >
          <Star
            size={size}
            color="#f59e0b"
            fill={filled ? '#f59e0b' : 'transparent'}
            strokeWidth={filled ? 0 : 1.5}
          />
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── Tutor Rating Modal ───────────────────────────────────────────────────────
// Shown after the student has already selected / worked with a tutor.
// Sends a proper outcome object to /api/match/quick-feedback so the RL
// system can learn and re-adjust match scores.

const TutorRatingModal = ({ visible, tutorName, tutorId, onClose, onSubmit }) => {
  const [rating, setRating]     = useState(0);
  const [completed, setCompleted] = useState(null); // true | false
  const [recommend, setRecommend] = useState(null); // true | false
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);

  const reset = () => { setRating(0); setCompleted(null); setRecommend(null); setDone(false); };

  const canSubmit = rating > 0 && completed !== null && recommend !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const token = await storage.getItem('token');
      const res = await fetch(`${API_URL}/api/match/quick-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tutor_id: tutorId,
          outcome: {
            satisfaction_rating: rating,   // 1-5 — RL uses this as primary reward signal
            completed,                     // did the student finish a session/course
            would_recommend: recommend,    // feeds into RL reward directly
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setDone(true);
      onSubmit?.();                        // caller triggers findMatches() to re-rank
    } catch {
      // fail silently — rating is best-effort
    } finally {
      setSubmitting(false);
    }
  };

  const YesNoBtn = ({ label, active, onPress }) => (
    <TouchableOpacity
      style={[styles.ynBtn, active && styles.ynBtnActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.ynText, active && styles.ynTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.ratingModal}>
          <TouchableOpacity style={styles.ratingModalClose} onPress={() => { reset(); onClose(); }}>
            <X size={18} color="#6b7280" />
          </TouchableOpacity>

          {done ? (
            // ── Success state ──────────────────────────────────────
            <View style={styles.ratingDone}>
              <CheckCircle size={48} color="#16a34a" />
              <Text style={styles.ratingDoneTitle}>Thanks for your feedback!</Text>
              <Text style={styles.ratingDoneSub}>
                The AI will use this to improve future recommendations.
              </Text>
              <TouchableOpacity
                style={styles.ratingDoneBtn}
                onPress={() => { reset(); onClose(); }}
              >
                <Text style={styles.ratingDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // ── Rating form ────────────────────────────────────────
            <>
              <Text style={styles.ratingModalTitle}>Rate your session</Text>
              <Text style={styles.ratingModalSub}>
                with <Text style={{ fontWeight: '700' }}>{tutorName}</Text>
              </Text>

              {/* Stars */}
              <View style={styles.ratingStarsWrap}>
                <StarRating value={rating} onChange={setRating} size={36} />
                {rating > 0 && (
                  <Text style={styles.ratingStarLabel}>
                    {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}
                  </Text>
                )}
              </View>

              {/* Did you complete a session? */}
              <Text style={styles.ratingQuestion}>Did you complete a session?</Text>
              <View style={styles.ynRow}>
                <YesNoBtn label="Yes" active={completed === true}  onPress={() => setCompleted(true)} />
                <YesNoBtn label="No"  active={completed === false} onPress={() => setCompleted(false)} />
              </View>

              {/* Would you recommend? */}
              <Text style={styles.ratingQuestion}>Would you recommend this tutor?</Text>
              <View style={styles.ynRow}>
                <YesNoBtn label="Yes" active={recommend === true}  onPress={() => setRecommend(true)} />
                <YesNoBtn label="No"  active={recommend === false} onPress={() => setRecommend(false)} />
              </View>

              <Text style={styles.ratingDisclaimer}>
                Your rating is used by the AI to re-rank tutors for you and other students with similar goals.
              </Text>

              <TouchableOpacity
                style={[styles.ratingSubmitBtn, (!canSubmit || submitting) && { opacity: 0.4 }]}
                onPress={handleSubmit}
                disabled={!canSubmit || submitting}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.ratingSubmitText}>Submit Rating</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ─── Inline Tutor Profile Panel ───────────────────────────────────────────────

const TutorProfilePanel = ({ tutorId, matchBreakdown, studentProfile }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/tutors/${tutorId}/profile`);
        if (!res.ok) throw new Error('Could not load profile');
        const data = await res.json();
        if (!cancelled) setProfile(data.tutor);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tutorId]);

  if (loading) return (
    <View style={styles.panelLoading}>
      <ActivityIndicator size="small" color="#7c3aed" />
      <Text style={styles.panelLoadingText}>Loading profile…</Text>
    </View>
  );
  if (error) return (
    <View style={styles.panelError}>
      <AlertCircle size={14} color="#dc2626" />
      <Text style={styles.panelErrorText}>Could not load profile</Text>
    </View>
  );
  if (!profile) return null;

  const bd = matchBreakdown || {};

  const formatAvailability = (avail) => {
    if (!avail || !Object.keys(avail).length) return null;
    const dayMap = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' };
    const days = Object.entries(avail).filter(([, v]) => v).map(([d]) => dayMap[d] || d);
    return days.length ? days.join(', ') : null;
  };

  const availStr    = formatAvailability(profile.availability);
  const studentTime = studentProfile?.available_time;
  const availKeys   = profile.availability
    ? Object.entries(profile.availability).filter(([, v]) => v).map(([k]) => k)
    : [];
  const timeMatch   = studentTime && availKeys.some(k =>
    k.toLowerCase().includes(studentTime.toLowerCase()) || studentTime.toLowerCase().includes(k.toLowerCase())
  );

  const MatchHint = ({ score, icon: Icon, suffix }) => score == null ? null : (
    <View style={styles.matchHint}>
      <Icon size={12} color={getScoreColor(score, 'verified')} />
      <Text style={[styles.matchHintText, { color: getScoreColor(score, 'verified') }]}>
        {score}% {suffix}
      </Text>
    </View>
  );

  return (
    <View style={styles.profilePanel}>
      {profile.bio && (
        <View style={styles.panelSection}>
          <SectionLabel>About this tutor</SectionLabel>
          <Text style={styles.bioText}>{profile.bio}</Text>
        </View>
      )}

      <View style={styles.panelSection}>
        <SectionLabel>Academic subjects</SectionLabel>
        {profile.expertise?.length > 0 ? (
          <View style={styles.chipRow}>
            {profile.expertise.map((s, i) => {
              const isMatch = (studentProfile?.preferred_subjects || [])
                .some(sub => sub.toLowerCase() === s.toLowerCase());
              return <Chip key={i} label={s} color={isMatch ? '#d1fae5' : '#dbeafe'} textColor={isMatch ? '#065f46' : '#1d4ed8'} />;
            })}
          </View>
        ) : <Text style={styles.emptyText}>No subjects listed</Text>}
        <MatchHint score={bd.subject_match} icon={CheckCircle} suffix="subject match" />
      </View>

      <View style={styles.panelSection}>
        <SectionLabel>Learning style fit</SectionLabel>
        <View style={styles.styleRow}>
          <View style={styles.styleBox}>
            <Text style={styles.styleBoxLabel}>Tutor's style</Text>
            <Text style={styles.styleBoxValue}>
              {profile.teaching_style
                ? profile.teaching_style.charAt(0).toUpperCase() + profile.teaching_style.slice(1)
                : 'Adaptive'}
            </Text>
          </View>
          <Text style={styles.styleArrow}>↔</Text>
          <View style={styles.styleBox}>
            <Text style={styles.styleBoxLabel}>Your style</Text>
            <Text style={styles.styleBoxValue}>
              {studentProfile?.learning_style
                ? studentProfile.learning_style.charAt(0).toUpperCase() + studentProfile.learning_style.slice(1)
                : '—'}
            </Text>
          </View>
        </View>
        <MatchHint score={bd.learning_style_match} icon={CheckCircle} suffix="style compatibility" />
      </View>

      <View style={styles.panelSection}>
        <SectionLabel>Subject level &amp; experience</SectionLabel>
        <View style={styles.levelRow}>
          {profile.years_experience ? (
            <View style={styles.levelPill}>
              <Briefcase size={13} color="#7c3aed" />
              <Text style={styles.levelPillText}>{profile.years_experience} experience</Text>
            </View>
          ) : null}
          {studentProfile?.skill_level ? (
            <View style={styles.levelPill}>
              <TrendingUp size={13} color="#2563eb" />
              <Text style={styles.levelPillText}>
                Your level: {studentProfile.skill_level.charAt(0).toUpperCase() + studentProfile.skill_level.slice(1)}
              </Text>
            </View>
          ) : null}
        </View>
        {profile.education && (
          <View style={[styles.matchHint, { marginTop: 6 }]}>
            <Award size={12} color="#ca8a04" />
            <Text style={[styles.matchHintText, { color: '#92400e' }]}>{profile.education}</Text>
          </View>
        )}
        <MatchHint score={bd.skill_compatibility} icon={CheckCircle} suffix="skill level compatibility" />
      </View>

      <View style={styles.panelSection}>
        <SectionLabel>Budget</SectionLabel>
        <View style={styles.budgetRow}>
          <DollarSign size={22} color="#16a34a" />
          <Text style={styles.budgetRate}>
            {profile.hourly_rate != null ? `$${profile.hourly_rate}` : 'Rate not set'}
          </Text>
          <Text style={styles.budgetPer}> / hour</Text>
        </View>
      </View>

      <View style={styles.panelSection}>
        <SectionLabel>Availability</SectionLabel>
        {availStr ? (
          <>
            <View style={styles.availRow}>
              <Calendar size={14} color="#2563eb" />
              <Text style={styles.availText}>{availStr}</Text>
            </View>
            {studentTime && (
              <View style={[styles.matchHint, { marginTop: 6 }]}>
                {timeMatch
                  ? <CheckCircle size={12} color="#16a34a" />
                  : <AlertCircle size={12} color="#ca8a04" />}
                <Text style={[styles.matchHintText, { color: timeMatch ? '#16a34a' : '#92400e' }]}>
                  {timeMatch ? 'Overlaps your preferred time slot' : 'Limited schedule overlap'}
                </Text>
              </View>
            )}
          </>
        ) : <Text style={styles.emptyText}>Availability not set</Text>}
        <MatchHint score={bd.schedule_match} icon={CheckCircle} suffix="schedule compatibility" />
      </View>

      {profile.languages?.length > 0 && (
        <View style={styles.panelSection}>
          <SectionLabel>Languages spoken</SectionLabel>
          <View style={styles.chipRow}>
            {profile.languages.map((l, i) => {
              const isMatch = (studentProfile?.preferred_languages || [])
                .some(sl => sl.toLowerCase() === l.toLowerCase());
              return <Chip key={i} label={l} color={isMatch ? '#d1fae5' : '#f3f4f6'} textColor={isMatch ? '#065f46' : '#374151'} />;
            })}
          </View>
          <MatchHint score={bd.language_match} icon={CheckCircle} suffix="language match" />
        </View>
      )}

      {profile.teaching_philosophy ? (
        <View style={styles.panelSection}>
          <SectionLabel>Teaching philosophy</SectionLabel>
          <View style={styles.philosophyBox}>
            <Text style={styles.philosophyText}>"{profile.teaching_philosophy}"</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#d1fae5' }]} />
          <Text style={styles.legendText}>Matches your profile</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#dbeafe' }]} />
          <Text style={styles.legendText}>Tutor's offerings</Text>
        </View>
      </View>
    </View>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const AITutorMatcher = ({ studentProfile, onSelectTutor, onMessageTutor }) => {
  const [matches, setMatches]               = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [useRL, setUseRL]                   = useState(true);
  const [selectedTutorId, setSelectedTutorId] = useState(null);
  const [expandedProfiles, setExpandedProfiles] = useState({});

  // Rating modal state
  const [ratingTarget, setRatingTarget] = useState(null); // { tutorId, tutorName }

  useEffect(() => {
    if (studentProfile) findMatches();
  }, [studentProfile, useRL]);

 const findMatches = async () => {
  setLoading(true);
  setError(null);
  try {
    const token = await storage.getItem('token');
    const response = await fetch(`${API_URL}/api/match/tutors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ student_profile: studentProfile, use_rl: useRL }),
    });
    if (!response.ok) throw new Error('Failed to find matches');
    const data = await response.json();
    console.log('matches after rating:', JSON.stringify(data.matches.map(m => ({ 
      name: m.tutor_name, 
      rating: m.breakdown?.rating,
      rating_source: m.breakdown?.rating_source,
      confidence: m.confidence
    }))));
    setMatches(data.matches || []);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
  const toggleProfile = useCallback((tutorId) => {
    setExpandedProfiles(prev => ({ ...prev, [tutorId]: !prev[tutorId] }));
  }, []);

  // Called when rating modal submits — re-fetch so RL-adjusted scores appear
  const handleRatingSubmitted = () => {
    findMatches();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Brain size={28} color="#fff" />
          <Text style={styles.headerTitle}>AI-Powered Tutor Matching</Text>
        </View>
        <Text style={styles.headerSub}>
          Tutors ranked by subject, learning style, schedule, and goals.
          Rate a tutor after your session — the AI learns and re-ranks.
        </Text>
        <TouchableOpacity style={styles.rlToggle} onPress={() => setUseRL(v => !v)}>
          <View style={[styles.toggle, useRL && styles.toggleOn]} />
          <Text style={styles.rlText}>
            {useRL ? '⚡ Smart matching enabled' : 'Use AI learning (recommended)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.centered}>
          <Brain size={48} color="#7c3aed" />
          <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 12 }} />
          <Text style={styles.loadingText}>Finding your best matches…</Text>
        </View>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity onPress={findMatches}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Results ── */}
      {!loading && matches.length > 0 && (
        <View>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              Found {matches.length} match{matches.length !== 1 ? 'es' : ''}
            </Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={findMatches}>
              <Search size={16} color="#fff" />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {matches.map((match, index) => {
            const bd         = match.breakdown || {};
            const confidence = match.confidence ?? null;
            const badgeColor = getScoreBadgeColor(match.match_score, confidence);
            const isExpanded = !!expandedProfiles[match.tutor_id];
            const isSelected = selectedTutorId === match.tutor_id;

            return (
              <View
                key={match.tutor_id}
                style={[styles.matchCard, isSelected && styles.matchCardSelected]}
              >
                {/* ── Card header ── */}
                <View style={styles.matchTop}>
                  <View style={styles.matchAvatar}>
                    <Text style={styles.matchRank}>#{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchName}>{match.tutor_name}</Text>
                    <View style={[styles.scoreBadge, { backgroundColor: badgeColor + '20' }]}>
                      <TrendingUp size={14} color={badgeColor} />
                      <Text style={[styles.scoreText, { color: badgeColor }]}>
                        {match.match_score}% · {getScoreLabel(match.match_score, confidence)}
                      </Text>
                    </View>
                  </View>
                  {match.total_matches > 0 ? (
                    <View style={styles.verifiedBox}>
                      <Text style={styles.verifiedLabel}>Verified</Text>
                      <Text style={styles.verifiedMatches}>{match.total_matches} sessions</Text>
                    </View>
                  ) : (
                    <View style={styles.unverifiedBox}>
                      <Text style={styles.unverifiedLabel}>New tutor</Text>
                      <Text style={styles.unverifiedSub}>No sessions yet</Text>
                    </View>
                  )}
                </View>

                <ConfidencePill confidence={confidence} />

                {/* ── Breakdown grid ── */}
                <View style={styles.breakdown}>
                  <MatchDetail icon={BookOpen}   label="Subject"    score={bd.subject_match}        source={bd.subject_match != null ? 'verified' : 'missing'} />
                  <MatchDetail icon={TrendingUp} label="Skill"      score={bd.skill_compatibility}  source={bd.skill_compatibility != null ? 'verified' : 'missing'} />
                  <MatchDetail icon={Calendar}   label="Schedule"   score={bd.schedule_match}       source={bd.schedule_match != null ? 'verified' : 'missing'} />
                  <MatchDetail icon={Globe}      label="Language"   score={bd.language_match}       source={bd.language_match != null ? 'verified' : 'missing'} zeroMeans="No overlap" />
                  <MatchDetail icon={Brain}      label="Style"      score={bd.learning_style_match} source={bd.learning_style_match != null ? 'verified' : 'missing'} />
                  <MatchDetail icon={Star}       label="Rating"     score={bd.rating_source === 'verified' ? bd.rating : null} source={bd.rating_source ?? 'missing'} />
                </View>

                {/* RL band */}
                {useRL && bd.performance_score != null && (match.rl_gate ?? 0) > 0 && (
                  <View style={styles.perfBox}>
                    <Zap size={14} color="#7c3aed" />
                    <Text style={styles.perfText}>
                      AI performance score: {bd.performance_score}%
                    </Text>
                  </View>
                )}

                {/* Low-confidence warning */}
                {confidence != null && confidence < 0.4 && (
                  <View style={styles.missingNotice}>
                    <AlertCircle size={13} color="#92400e" />
                    <Text style={styles.missingNoticeText}>
                      Limited data available — score improves as this tutor completes more sessions.
                    </Text>
                  </View>
                )}

                {/* Expand / collapse */}
                <TouchableOpacity
                  style={styles.expandBtn}
                  onPress={() => toggleProfile(match.tutor_id)}
                  activeOpacity={0.75}
                >
                  {isExpanded
                    ? <ChevronUp size={16} color="#7c3aed" />
                    : <ChevronDown size={16} color="#7c3aed" />}
                  <Text style={styles.expandBtnText}>
                    {isExpanded ? 'Hide profile' : 'View full profile'}
                  </Text>
                </TouchableOpacity>

                {isExpanded && (
                  <TutorProfilePanel
                    tutorId={match.tutor_id}
                    matchBreakdown={bd}
                    studentProfile={studentProfile}
                  />
                )}

                {/* ── Actions ── */}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.selectBtn, isSelected && styles.selectBtnActive]}
                    onPress={() => {
                      setSelectedTutorId(match.tutor_id);
                      onSelectTutor?.(match);
                    }}
                  >
                    <CheckCircle size={16} color="#fff" />
                    <Text style={styles.selectBtnText}>
                      {isSelected ? 'Selected ✓' : 'Select tutor'}
                    </Text>
                  </TouchableOpacity>
                  {onMessageTutor && (
                    <TouchableOpacity
                      style={styles.messageBtn}
                      onPress={() => onMessageTutor(match.tutor_id)}
                    >
                      <MessageSquare size={16} color="#7c3aed" />
                      <Text style={styles.messageBtnText}>Message</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── Rate tutor — always visible so students can rate anytime ── */}
                <TouchableOpacity
                  style={styles.rateTutorBtn}
                  onPress={() => setRatingTarget({ tutorId: match.tutor_id, tutorName: match.tutor_name })}
                  activeOpacity={0.8}
                >
                  <Star size={15} color="#f59e0b" fill="#f59e0b" />
                  <Text style={styles.rateTutorText}>Rate this tutor</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* ── No results ── */}
      {!loading && matches.length === 0 && !error && (
        <View style={styles.empty}>
          <Users size={48} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No matches found</Text>
          <Text style={styles.emptySub}>Try adjusting your profile or check back later</Text>
        </View>
      )}

      {/* ── Tutor Rating Modal ── */}
      {ratingTarget && (
        <TutorRatingModal
          visible
          tutorId={ratingTarget.tutorId}
          tutorName={ratingTarget.tutorName}
          onClose={() => setRatingTarget(null)}
          onSubmit={() => {
            setRatingTarget(null);
            handleRatingSubmitted();
          }}
        />
      )}
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },

  header: { backgroundColor: '#7c3aed', borderRadius: 12, padding: 20, marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerSub: { color: '#ede9fe', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  rlToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { width: 36, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.3)' },
  toggleOn: { backgroundColor: '#4ade80' },
  rlText: { color: '#fff', fontSize: 12 },

  centered: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: '#6b7280', marginTop: 10 },
  errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, padding: 16, marginBottom: 16 },
  errorText: { color: '#dc2626' },
  retryText: { color: '#991b1b', textDecorationLine: 'underline', marginTop: 8 },

  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resultsTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  refreshText: { color: '#fff', fontSize: 13 },

  matchCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  matchCardSelected: { borderColor: '#7c3aed', borderWidth: 2 },
  matchTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  matchAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  matchRank: { color: '#7c3aed', fontWeight: '700', fontSize: 16 },
  matchName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 6 },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  scoreText: { fontSize: 12, fontWeight: '600' },
  verifiedBox: { alignItems: 'flex-end' },
  verifiedLabel: { fontSize: 11, color: '#6b7280' },
  verifiedMatches: { fontSize: 13, fontWeight: '600', color: '#7c3aed' },
  unverifiedBox: { alignItems: 'flex-end' },
  unverifiedLabel: { fontSize: 11, fontWeight: '600', color: '#ca8a04' },
  unverifiedSub: { fontSize: 11, color: '#9ca3af' },

  confidencePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 12 },
  confidenceText: { fontSize: 11, fontWeight: '500' },

  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', width: '30%' },
  detailLabel: { fontSize: 11, color: '#6b7280' },
  detailScore: { fontSize: 13, fontWeight: '600' },

  perfBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 8, padding: 10, marginBottom: 12 },
  perfText: { fontSize: 13, fontWeight: '600', color: '#581c87', flex: 1 },

  missingNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, padding: 10, marginBottom: 12 },
  missingNoticeText: { fontSize: 12, color: '#92400e', flex: 1, lineHeight: 17 },

  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#ede9fe', borderRadius: 8, paddingVertical: 10, marginBottom: 12, backgroundColor: '#faf5ff' },
  expandBtnText: { color: '#7c3aed', fontSize: 13, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  selectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 10 },
  selectBtnActive: { backgroundColor: '#16a34a' },
  selectBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  messageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#7c3aed', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  messageBtnText: { color: '#7c3aed', fontWeight: '600', fontSize: 14 },

  // Rate tutor button — shown only after selecting a tutor
  rateTutorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#f59e0b',
    borderRadius: 8, paddingVertical: 10, marginTop: 4,
  },
  rateTutorText: { color: '#92400e', fontSize: 13, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#6b7280' },
  emptySub: { fontSize: 14, color: '#9ca3af' },

  // ── Profile panel ──────────────────────────────────────────────────────────
  profilePanel: { borderTopWidth: 1, borderTopColor: '#ede9fe', marginBottom: 12, paddingTop: 14 },
  panelSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  bioText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipText: { fontSize: 12, fontWeight: '500' },
  matchHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  matchHintText: { fontSize: 12, fontWeight: '500' },
  styleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  styleBox: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, alignItems: 'center' },
  styleBoxLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 2 },
  styleBoxValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  styleArrow: { fontSize: 18, color: '#9ca3af', paddingHorizontal: 4 },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  levelPillText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  budgetRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  budgetRate: { fontSize: 26, fontWeight: '700', color: '#16a34a' },
  budgetPer: { fontSize: 14, color: '#6b7280' },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  philosophyBox: { backgroundColor: '#f5f3ff', borderLeftWidth: 3, borderLeftColor: '#7c3aed', borderRadius: 6, padding: 12 },
  philosophyText: { fontSize: 13, color: '#4c1d95', lineHeight: 20, fontStyle: 'italic' },
  panelLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, justifyContent: 'center' },
  panelLoadingText: { color: '#6b7280', fontSize: 13 },
  panelError: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 },
  panelErrorText: { color: '#dc2626', fontSize: 13 },
  emptyText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  legend: { flexDirection: 'row', gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#9ca3af' },

  // ── Rating modal ───────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  ratingModal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 380,
  },
  ratingModalClose: {
    position: 'absolute', top: 14, right: 14,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
  },
  ratingModalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  ratingModalSub: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  ratingStarsWrap: { alignItems: 'center', marginBottom: 20, gap: 8 },
  ratingStarLabel: { fontSize: 15, fontWeight: '600', color: '#f59e0b' },
  ratingQuestion: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  ynRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  ynBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e5e7eb',
    alignItems: 'center', backgroundColor: '#fafafa',
  },
  ynBtnActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  ynText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  ynTextActive: { color: '#7c3aed' },
  ratingDisclaimer: {
    fontSize: 11, color: '#9ca3af', textAlign: 'center',
    lineHeight: 16, marginBottom: 16,
  },
  ratingSubmitBtn: {
    backgroundColor: '#7c3aed', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  ratingSubmitText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Done state
  ratingDone: { alignItems: 'center', paddingVertical: 12, gap: 10 },
  ratingDoneTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  ratingDoneSub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 },
  ratingDoneBtn: {
    marginTop: 8, backgroundColor: '#7c3aed', borderRadius: 10,
    paddingHorizontal: 28, paddingVertical: 12,
  },
  ratingDoneBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default AITutorMatcher;