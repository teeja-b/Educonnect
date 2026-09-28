import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
    StyleSheet, Modal, TextInput, Platform,
} from 'react-native';
import {
    Search, Star, TrendingUp, Brain, Users,
    Calendar, Globe, BookOpen, Zap, AlertCircle,
    ChevronDown, ChevronUp, DollarSign,
    Award, Briefcase, MessageSquare, CheckCircle, X, RefreshCw,
} from 'lucide-react-native';
import { storage } from '../utils/storage';
import { API_URL } from '../utils/config';
import {
    Avatar, Button, Card, EmptyState, InfoTile, PAGE_WIDTH, Pill, RankBadge, SectionDivider, TileGrid,
    colors, font, radius, tones,
} from '../theme';

// ─── Score helpers ────────────────────────────────────────────────────────────

const getScoreColor = (score, source) => {
    if (!source || source === 'missing') return '#9ca3af';
    if (score >= 75) return colors.successText;
    if (score >= 55) return colors.primary;
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
    if (score >= 75) return colors.successText;
    if (score >= 55) return colors.primary;
    return '#6b7280';
};

// ─── ConfidencePill ───────────────────────────────────────────────────────────

const ConfidencePill = ({ confidence }) => {
    if (confidence == null) return null;
    const pct = Math.round(confidence * 100);
    const color = pct >= 70 ? colors.successText : pct >= 40 ? '#ca8a04' : '#dc2626';
    const bg = pct >= 70 ? '#f0fdf4' : pct >= 40 ? '#fffbeb' : '#fef2f2';
    const label = pct >= 70 ? 'High confidence' : pct >= 40 ? 'Medium confidence' : 'Low confidence';
    return (
        <View style={[styles.confidencePill, { backgroundColor: bg }]}>
            <AlertCircle size={11} color={color} />
            <Text style={[styles.confidenceText, { color }]}>{label} · {pct}%</Text>
        </View>
    );
};

// ─── Chip ─────────────────────────────────────────────────────────────────────

const Chip = ({ label, color = colors.primarySoft, textColor = colors.primary }) => (
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
    const [rating, setRating] = useState(0);
    const [completed, setCompleted] = useState(null); // true | false
    const [recommend, setRecommend] = useState(null); // true | false
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

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
                            <CheckCircle size={48} color={colors.success} />
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
                                <YesNoBtn label="Yes" active={completed === true} onPress={() => setCompleted(true)} />
                                <YesNoBtn label="No" active={completed === false} onPress={() => setCompleted(false)} />
                            </View>

                            {/* Would you recommend? */}
                            <Text style={styles.ratingQuestion}>Would you recommend this tutor?</Text>
                            <View style={styles.ynRow}>
                                <YesNoBtn label="Yes" active={recommend === true} onPress={() => setRecommend(true)} />
                                <YesNoBtn label="No" active={recommend === false} onPress={() => setRecommend(false)} />
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
    const [error, setError] = useState(null);

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
            <ActivityIndicator size="small" color={colors.primary} />
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
        const dayMap = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
        const days = Object.entries(avail).filter(([, v]) => v).map(([d]) => dayMap[d] || d);
        return days.length ? days.join(', ') : null;
    };

    const availStr = formatAvailability(profile.availability);
    const studentTime = studentProfile?.available_time;
    const availKeys = profile.availability
        ? Object.entries(profile.availability).filter(([, v]) => v).map(([k]) => k)
        : [];
    const timeMatch = studentTime && availKeys.some(k =>
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
                            return <Chip key={i} label={s} color={isMatch ? colors.successSoft : colors.primarySoft} textColor={isMatch ? colors.successText : colors.primary} />;
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
                            <Briefcase size={13} color={colors.primary} />
                            <Text style={styles.levelPillText}>{profile.years_experience} experience</Text>
                        </View>
                    ) : null}
                    {studentProfile?.skill_level ? (
                        <View style={styles.levelPill}>
                            <TrendingUp size={13} color={colors.primary} />
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
                    <DollarSign size={22} color={colors.success} />
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
                            <Calendar size={14} color={colors.primary} />
                            <Text style={styles.availText}>{availStr}</Text>
                        </View>
                        {studentTime && (
                            <View style={[styles.matchHint, { marginTop: 6 }]}>
                                {timeMatch
                                    ? <CheckCircle size={12} color={colors.success} />
                                    : <AlertCircle size={12} color="#ca8a04" />}
                                <Text style={[styles.matchHintText, { color: timeMatch ? colors.successText : '#92400e' }]}>
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
                            return <Chip key={i} label={l} color={isMatch ? colors.successSoft : colors.surface} textColor={isMatch ? '#065f46' : '#374151'} />;
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
                    <View style={[styles.legendDot, { backgroundColor: colors.successSoft }]} />
                    <Text style={styles.legendText}>Matches your profile</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.primarySoft }]} />
                    <Text style={styles.legendText}>Tutor's offerings</Text>
                </View>
            </View>
        </View>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const cap = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    const s = String(v).replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
};

// Which colour family a match card uses (rank badge, label, metrics, score pill)
const matchTone = (score, confidence) => {
    const conf = confidence ?? 1;
    if (conf < 0.25) return 'neutral';
    if (conf < 0.50) return 'warning';
    if (score >= 75) return 'success';
    if (score >= 55) return 'primary';
    return 'neutral';
};

// Big metric used in the card: icon, small label, large % value
const Metric = ({ icon: Icon, label, score, tone, zeroMeans }) => {
    const isMissing = score === null || score === undefined;
    const t = tones[isMissing ? 'neutral' : tone] || tones.primary;
    let value;
    if (isMissing) value = '—';
    else if (score === 0 && zeroMeans) value = zeroMeans;
    else value = `${score}%`;
    return (
        <View style={styles.metric}>
            <Icon size={20} color={t.fg} strokeWidth={1.8} />
            <View>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={[styles.metricValue, { color: t.fg }]}>{value}</Text>
            </View>
        </View>
    );
};

const AITutorMatcher = ({ studentProfile, studentName, onSelectTutor, onMessageTutor, onEditProfile }) => {
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [useRL, setUseRL] = useState(true);
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

    const subjects = studentProfile?.preferred_subjects || [];

    return (
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>

            {/* ── Your profile ── */}
            <Card>
                <View style={styles.profileHead}>
                    <Avatar name={studentName || 'Student'} size={46} />
                    <View style={styles.headText}>
                        <Text style={styles.profileTitle}>Your profile</Text>
                        <Text style={styles.profileSub}>
                            Student{studentProfile?.skill_level ? ` · ${cap(studentProfile.skill_level)}` : ''}
                        </Text>
                    </View>
                    <Pill
                        icon={Zap}
                        label={useRL ? 'Smart matching' : 'Smart matching off'}
                        tone={useRL ? 'primary' : 'neutral'}
                        onPress={() => setUseRL(v => !v)}
                    />
                </View>
                <TileGrid>
                    <InfoTile icon={BookOpen} label="Subjects" value={subjects.length ? subjects.slice(0, 3).join(' · ') : '—'} />
                    <InfoTile icon={TrendingUp} label="Level" value={cap(studentProfile?.skill_level)} />
                    <InfoTile icon={Calendar} label="Availability" value={cap(studentProfile?.available_time)} />
                    <InfoTile icon={Brain} label="Learning preference" value={cap(studentProfile?.learning_style)} />
                </TileGrid>
                {onEditProfile && (
                    <TouchableOpacity onPress={onEditProfile} style={styles.editLink}>
                        <Text style={styles.editLinkText}>Update survey answers</Text>
                    </TouchableOpacity>
                )}
            </Card>

            <SectionDivider label="Your learning matches" />

            {/* ── Loading ── */}
            {loading && (
                <Card style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Finding your best matches…</Text>
                </Card>
            )}

            {/* ── Error ── */}
            {error && !loading && (
                <Card style={styles.errorCard}>
                    <View style={styles.errorRow}>
                        <AlertCircle size={18} color={colors.danger} />
                        <Text style={styles.errorText}>Couldn't load matches: {error}</Text>
                    </View>
                    <Button label="Try again" variant="outline" onPress={findMatches} style={{ marginTop: 12 }} />
                </Card>
            )}

            {/* ── Results ── */}
            {!loading && matches.length > 0 && (
                <View>
                    <View style={styles.resultsHeader}>
                        <Text style={styles.resultsTitle}>
                            {matches.length} tutor{matches.length !== 1 ? 's' : ''} ranked for you
                        </Text>
                        <TouchableOpacity style={styles.refreshBtn} onPress={findMatches}>
                            <RefreshCw size={14} color={colors.primary} />
                            <Text style={styles.refreshText}>Refresh</Text>
                        </TouchableOpacity>
                    </View>

                    {matches.map((match, index) => {
                        const bd = match.breakdown || {};
                        const confidence = match.confidence ?? null;
                        const tone = matchTone(match.match_score, confidence);
                        const t = tones[tone];
                        const isExpanded = !!expandedProfiles[match.tutor_id];
                        const isSelected = selectedTutorId === match.tutor_id;

                        return (
                            <Card key={match.tutor_id} highlighted={isSelected || (index === 0 && !selectedTutorId)}>
                                {/* ── Card header ── */}
                                <View style={styles.matchTop}>
                                    <RankBadge label={`#${index + 1}`} tone={tone} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.matchName} numberOfLines={1}>{match.tutor_name}</Text>
                                        <View style={styles.matchSubRow}>
                                            <Text style={[styles.matchLabel, { color: t.fg }]}>
                                                {getScoreLabel(match.match_score, confidence)}
                                            </Text>
                                            <View style={styles.sessions}>
                                                <CheckCircle size={14} color={colors.textMuted} />
                                                <Text style={styles.sessionsText}>
                                                    {match.total_matches > 0 ? `${match.total_matches} sessions` : 'New tutor'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <Pill icon={TrendingUp} label={`${match.match_score}%`} tone={tone} />
                                </View>

                                {/* ── Key metrics ── */}
                                <View style={styles.metrics}>
                                    <Metric icon={BookOpen} label="Subject" score={bd.subject_match} tone={tone} />
                                    <Metric icon={Brain} label="Style" score={bd.learning_style_match} tone={tone} />
                                    <Metric icon={Calendar} label="Schedule" score={bd.schedule_match} tone={tone} />
                                </View>

                                {/* Low-confidence note */}
                                {confidence != null && confidence < 0.4 && (
                                    <View style={styles.notice}>
                                        <AlertCircle size={14} color={colors.warning} />
                                        <Text style={styles.noticeText}>
                                            Limited data so far. This score gets more accurate as the tutor completes sessions.
                                        </Text>
                                    </View>
                                )}

                                {/* ── Expanded detail ── */}
                                {isExpanded && (
                                    <View style={styles.expanded}>
                                        <View style={styles.metrics}>
                                            <Metric icon={TrendingUp} label="Skill" score={bd.skill_compatibility} tone={tone} />
                                            <Metric icon={Globe} label="Language" score={bd.language_match} tone={tone} zeroMeans="None" />
                                            <Metric icon={Star} label="Rating" score={bd.rating_source === 'verified' ? bd.rating : null} tone={tone} />
                                        </View>
                                        {useRL && bd.performance_score != null && (match.rl_gate ?? 0) > 0 && (
                                            <View style={styles.perfBox}>
                                                <Zap size={14} color={colors.primary} />
                                                <Text style={styles.perfText}>Performance score from past sessions: {bd.performance_score}%</Text>
                                            </View>
                                        )}
                                        <ConfidencePill confidence={confidence} />
                                        <TutorProfilePanel
                                            tutorId={match.tutor_id}
                                            matchBreakdown={bd}
                                            studentProfile={studentProfile}
                                        />
                                    </View>
                                )}

                                {/* ── Actions ── */}
                                <View style={styles.footer}>
                                    <TouchableOpacity style={styles.footLink} onPress={() => toggleProfile(match.tutor_id)}>
                                        {isExpanded
                                            ? <ChevronUp size={16} color={colors.primary} />
                                            : <ChevronDown size={16} color={colors.primary} />}
                                        <Text style={styles.footLinkText}>{isExpanded ? 'Hide profile' : 'View profile'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.footLink}
                                        onPress={() => setRatingTarget({ tutorId: match.tutor_id, tutorName: match.tutor_name })}
                                    >
                                        <Star size={15} color="#F59E0B" fill="#F59E0B" />
                                        <Text style={[styles.footLinkText, { color: colors.textMuted }]}>Rate</Text>
                                    </TouchableOpacity>
                                    <View style={{ flex: 1 }} />
                                    {onMessageTutor && (
                                        <Button
                                            label="Message"
                                            icon={MessageSquare}
                                            variant="soft"
                                            style={styles.smallBtn}
                                            onPress={() => onMessageTutor(match.tutor_id)}
                                        />
                                    )}
                                    <Button
                                        label={isSelected ? 'Selected' : 'Select tutor'}
                                        icon={isSelected ? CheckCircle : undefined}
                                        variant={isSelected ? 'success' : 'primary'}
                                        style={styles.smallBtn}
                                        onPress={() => {
                                            setSelectedTutorId(match.tutor_id);
                                            onSelectTutor?.(match);
                                        }}
                                    />
                                </View>
                            </Card>
                        );
                    })}
                </View>
            )}

            {/* ── No results ── */}
            {!loading && matches.length === 0 && !error && (
                <EmptyState
                    icon={Users}
                    title="No matches yet"
                    text="Add more subjects or widen your availability, then refresh."
                    action={<Button label="Refresh" variant="soft" icon={RefreshCw} onPress={findMatches} />}
                />
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
    container: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 20, paddingBottom: 40 },

    // Profile card
    // Wraps the Smart matching pill onto its own line on narrow screens
    profileHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 12, marginBottom: 18 },
    headText: { flexGrow: 1, flexShrink: 1, flexBasis: 170, minWidth: 0 },
    profileTitle: { fontFamily: font, fontSize: 19, fontWeight: '700', color: colors.text },
    profileSub: { fontFamily: font, fontSize: 14, color: colors.textMuted, marginTop: 2 },
    editLink: { alignSelf: 'flex-start', marginTop: 14 },
    editLinkText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.primary },

    centered: { alignItems: 'center', paddingVertical: 36 },
    loadingText: { fontFamily: font, color: colors.textMuted, marginTop: 12, fontSize: 14 },
    errorCard: { borderColor: '#F5C2C2' },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    errorText: { fontFamily: font, color: colors.danger, fontSize: 14, flex: 1 },

    resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 2 },
    resultsTitle: { fontFamily: font, fontSize: 14, fontWeight: '600', color: colors.textMuted },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
    refreshText: { fontFamily: font, color: colors.primary, fontSize: 13, fontWeight: '700' },

    // Match card
    matchTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    matchName: { fontFamily: font, fontSize: 18, fontWeight: '700', color: colors.text },
    matchSubRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
    matchLabel: { fontFamily: font, fontSize: 13, fontWeight: '700' },
    sessions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sessionsText: { fontFamily: font, fontSize: 13, color: colors.textMuted },

    // Indented under the name on the web; full width on phones so all three fit on one line
    metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 12, marginTop: 14, marginLeft: Platform.OS === 'web' ? 54 : 0 },
    metric: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metricLabel: { fontFamily: font, fontSize: 13, color: colors.textMuted },
    metricValue: { fontFamily: font, fontSize: 16, fontWeight: '800' },

    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 12, marginTop: 14 },
    noticeText: { fontFamily: font, fontSize: 13, color: '#92400E', flex: 1, lineHeight: 18 },

    expanded: { marginTop: 16, paddingTop: 2, borderTopWidth: 1, borderTopColor: colors.border },
    perfBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, marginTop: 14 },
    perfText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.primaryDark, flex: 1 },

    footer: {
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14,
        marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border,
    },
    footLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
    footLinkText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary },
    smallBtn: { paddingVertical: 9, paddingHorizontal: 16 },

    // Confidence pill
    confidencePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start', marginTop: 14 },
    confidenceText: { fontFamily: font, fontSize: 12, fontWeight: '600' },

    // ── Profile panel ──────────────────────────────────────────────────────────
    profilePanel: { marginTop: 16 },
    panelSection: { backgroundColor: colors.tile, borderRadius: radius.md, padding: 14, marginBottom: 10 },
    sectionLabel: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 },
    bioText: { fontFamily: font, fontSize: 14, color: '#374151', lineHeight: 21 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    chipText: { fontFamily: font, fontSize: 12, fontWeight: '600' },
    matchHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    matchHintText: { fontFamily: font, fontSize: 12, fontWeight: '600' },
    styleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    styleBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, alignItems: 'center' },
    styleBoxLabel: { fontFamily: font, fontSize: 11, color: colors.textSubtle, marginBottom: 2 },
    styleBoxValue: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.text },
    styleArrow: { fontSize: 18, color: colors.textSubtle, paddingHorizontal: 4 },
    levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    levelPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
    levelPillText: { fontFamily: font, fontSize: 12, color: '#374151', fontWeight: '600' },
    budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    budgetRate: { fontFamily: font, fontSize: 24, fontWeight: '800', color: colors.successText },
    budgetPer: { fontFamily: font, fontSize: 14, color: colors.textMuted },
    availRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    availText: { fontFamily: font, fontSize: 14, color: '#374151', fontWeight: '600' },
    philosophyBox: { backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: radius.sm, padding: 12 },
    philosophyText: { fontFamily: font, fontSize: 14, color: '#374151', lineHeight: 21, fontStyle: 'italic' },
    panelLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, justifyContent: 'center' },
    panelLoadingText: { fontFamily: font, color: colors.textMuted, fontSize: 13 },
    panelError: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 },
    panelErrorText: { fontFamily: font, color: colors.danger, fontSize: 13 },
    emptyText: { fontFamily: font, fontSize: 13, color: colors.textSubtle, fontStyle: 'italic' },
    legend: { flexDirection: 'row', gap: 14, paddingTop: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontFamily: font, fontSize: 12, color: colors.textMuted },

    // ── Rating modal ───────────────────────────────────────────────────────────
    modalBackdrop: {
        flex: 1, backgroundColor: 'rgba(17,24,39,0.55)',
        justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    ratingModal: {
        backgroundColor: colors.surface, borderRadius: 24, padding: 24,
        width: '100%', maxWidth: 380,
    },
    ratingModalClose: {
        position: 'absolute', top: 14, right: 14, zIndex: 1,
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center',
    },
    ratingModalTitle: { fontFamily: font, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
    ratingModalSub: { fontFamily: font, fontSize: 14, color: colors.textMuted, marginBottom: 20 },
    ratingStarsWrap: { alignItems: 'center', marginBottom: 20, gap: 8, backgroundColor: colors.tile, borderRadius: radius.lg, paddingVertical: 16 },
    ratingStarLabel: { fontFamily: font, fontSize: 15, fontWeight: '700', color: '#D97706' },
    ratingQuestion: { fontFamily: font, fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    ynRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    ynBtn: {
        flex: 1, paddingVertical: 11, borderRadius: radius.md,
        borderWidth: 1.5, borderColor: colors.border,
        alignItems: 'center', backgroundColor: colors.surface,
    },
    ynBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    ynText: { fontFamily: font, fontSize: 14, fontWeight: '600', color: colors.textMuted },
    ynTextActive: { color: colors.primary },
    ratingDisclaimer: {
        fontFamily: font, fontSize: 12, color: colors.textSubtle, textAlign: 'center',
        lineHeight: 17, marginBottom: 16,
    },
    ratingSubmitBtn: {
        backgroundColor: colors.primary, borderRadius: radius.md,
        paddingVertical: 14, alignItems: 'center',
    },
    ratingSubmitText: { fontFamily: font, color: '#fff', fontWeight: '700', fontSize: 15 },

    // Done state
    ratingDone: { alignItems: 'center', paddingVertical: 12, gap: 10 },
    ratingDoneTitle: { fontFamily: font, fontSize: 18, fontWeight: '800', color: colors.text },
    ratingDoneSub: { fontFamily: font, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
    ratingDoneBtn: {
        marginTop: 8, backgroundColor: colors.primary, borderRadius: radius.md,
        paddingHorizontal: 28, paddingVertical: 12,
    },
    ratingDoneBtnText: { fontFamily: font, color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default AITutorMatcher;