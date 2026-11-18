import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, ScrollView, TouchableOpacity, ActivityIndicator,
    StyleSheet, Modal, TextInput, Platform, KeyboardAvoidingView, useWindowDimensions, Image,
} from 'react-native';
import {
    Search, Star, TrendingUp, Brain, Users,
    Calendar, Globe, BookOpen, Zap, AlertCircle,
    ChevronDown, ChevronUp,
    Award, Briefcase, MessageSquare, CheckCircle, X, RefreshCw,
    Sparkles, ClipboardList, Send, GraduationCap, Clock,
} from 'lucide-react-native';
import TutorProfileViewer from './TutorProfileViewer';
import { storage } from '../utils/storage';
import { API_URL } from '../utils/config';
import {
    Avatar, Button, EmptyState, PAGE_WIDTH, Text, useCompact,
    colors, font, radius, shadow, tones,
} from '../theme';

// ─── Score helpers ────────────────────────────────────────────────────────────

const getScoreColor = (score, source) => {
    if (!source || source === 'missing') return '#9ca3af';
    if (score >= 75) return colors.successText;
    if (score >= 55) return colors.primary;
    if (score >= 35) return '#ca8a04';
    return '#6b7280';
};

const getScoreLabel = (score) => {
    if (score >= 75) return 'Strong match';
    if (score >= 55) return 'Good match';
    if (score >= 35) return 'Partial match';
    return 'Weak match';
};

// ─── Mauritian context: money & levels ────────────────────────────────────────

const CURRENCY_SYMBOL = { MUR: 'Rs', USD: 'US$', EUR: '€', GBP: '£', INR: '₹' };

// Rs 1,200 / US$ 25. Tutor rates default to Mauritian rupees.
const formatMoney = (amount, currency = 'MUR') => {
    if (amount == null || amount === '' || Number.isNaN(Number(amount))) return null;
    const sym = CURRENCY_SYMBOL[currency] || currency;
    return `${sym} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const LEVEL_LABELS = {
    primary: 'Primary (Std 1–6 / CPE)',
    secondary: 'Secondary (Form 1–5 / SC / IGCSE)',
    'a-level': 'A-level / HSC (Form 6)',
    university: 'University',
    'all levels': 'All levels',
};
const BOARD_LABELS = { cambridge: 'Cambridge', edexcel: 'Edexcel', aqa: 'AQA', ocr: 'OCR', ib: 'IB', mauritius: 'MES (Mauritius)' };

// Small "Rs" badge used where a currency icon was shown before
const RsIcon = ({ size = 14, color }) => (
    <Text style={{ fontSize: size, fontWeight: '800', color, lineHeight: size + 2 }}>Rs</Text>
);

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
        const slotMap = { early_morning: 'early mornings', morning: 'mornings', afternoon: 'afternoons', late_afternoon: 'late afternoons', evening: 'evenings', night: 'nights' };
        const keys = Object.entries(avail).filter(([, v]) => v).map(([k]) => k);
        if (!keys.length) return null;
        // Profile screen saves "monday_evening"; onboarding saves "evening"
        const bySlot = {};
        const plain = [];
        keys.forEach(k => {
            const day = Object.keys(dayMap).find(d => k.startsWith(d + '_'));
            if (day) (bySlot[k.slice(day.length + 1)] ||= []).push(dayMap[day]);
            else plain.push(slotMap[k] || dayMap[k] || k.replace(/_/g, ' '));
        });
        const grouped = Object.entries(bySlot).map(([slot, days]) => `${days.join(', ')} ${slotMap[slot] || slot.replace(/_/g, ' ')}`);
        return [...grouped, ...plain].map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' · ');
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
                <MatchHint score={bd.learning_style} icon={CheckCircle} suffix="style compatibility" />
            </View>

            <View style={styles.panelSection}>
                <SectionLabel>Subject level &amp; experience</SectionLabel>
                <View style={styles.levelRow}>
                    {profile.years_experience ? (
                        <View style={styles.levelPill}>
                            <Briefcase size={13} color={colors.primary} />
                            <Text style={styles.levelPillText}>{profile.years_experience} {/^\d+$/.test(String(profile.years_experience)) ? 'years' : ''} experience</Text>
                        </View>
                    ) : null}
                    {(studentProfile?.academic_level || studentProfile?.skill_level) ? (
                        <View style={styles.levelPill}>
                            <TrendingUp size={13} color={colors.primary} />
                            <Text style={styles.levelPillText}>
                                Your level: {LEVEL_LABELS[studentProfile.academic_level] || cap(studentProfile.skill_level)}
                            </Text>
                        </View>
                    ) : null}
                    {(profile.teaching_levels || []).map(l => (
                        <View key={l} style={styles.levelPill}>
                            <Award size={13} color={colors.primary} />
                            <Text style={styles.levelPillText}>Teaches {LEVEL_LABELS[l] || cap(l)}</Text>
                        </View>
                    ))}
                    {(profile.exam_boards || []).map(b => (
                        <View key={b} style={styles.levelPill}>
                            <BookOpen size={13} color={colors.primary} />
                            <Text style={styles.levelPillText}>{BOARD_LABELS[b] || cap(b)}</Text>
                        </View>
                    ))}
                </View>
                {profile.education && (
                    <View style={[styles.matchHint, { marginTop: 6 }]}>
                        <Award size={12} color="#ca8a04" />
                        <Text style={[styles.matchHintText, { color: '#92400e' }]}>{profile.education}</Text>
                    </View>
                )}
                
            </View>

            <View style={styles.panelSection}>
                <SectionLabel>Budget</SectionLabel>
                <View style={styles.budgetRow}>
                    {(profile.price_currency || 'MUR') === 'MUR' ? <RsIcon size={20} color={colors.success} /> : null}
                    <Text style={styles.budgetRate}>
                        {profile.hourly_rate != null
                            ? (profile.price_currency || 'MUR') === 'MUR'
                                ? Number(profile.hourly_rate).toLocaleString('en-US')
                                : formatMoney(profile.hourly_rate, profile.price_currency)
                            : 'Rate not set'}
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
                <MatchHint score={bd.schedule} icon={CheckCircle} suffix="schedule compatibility" />
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
                    <MatchHint score={bd.language} icon={CheckCircle} suffix="language match" />
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

// ─── Conversational chat (EduConnect AI) ──────────────────────────────────────
// Every message goes to /api/chat/conversations/:id/messages. The server interprets it (Groq),
// updates the saved requirement profile, asks the next question or runs the real tutor matcher,
// and returns messages. Tutor cards are rendered from real database fields only.

const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const availabilityText = (slots = []) => {
    if (!slots.length) return null;
    const parts = slots.map(k => {
        const [d, ...rest] = String(k).split('_');
        const day = DAY_SHORT[d] || (d ? d[0].toUpperCase() + d.slice(1) : '');
        return rest.length ? `${day} ${rest.join(' ')}` : day;
    });
    return parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` +${parts.length - 3} more` : '');
};
const levelShort = (l) => ({ primary: 'Primary', secondary: 'Secondary', 'a-level': 'A-level', university: 'University', 'all levels': 'All levels' }[String(l).toLowerCase()] || l);

const chatApi = async (path, { method = 'GET', body } = {}) => {
    const token = await storage.getItem('token');
    const res = await fetch(`${API_URL}/api/chat${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
};

const TagRow = ({ label, items, max = 4, hit }) => {
    const list = (items || []).filter(Boolean);
    if (!list.length) return null;
    return (
        <View style={cs.tagRow}>
            <Text style={cs.tagLabel}>{label}</Text>
            <View style={cs.tagWrap}>
                {list.slice(0, max).map(x => (
                    <View key={String(x)} style={[cs.tag, hit?.has(String(x).toLowerCase()) && cs.tagHit]}>
                        <Text style={[cs.tagText, hit?.has(String(x).toLowerCase()) && { color: colors.successText }]}>{x}</Text>
                    </View>
                ))}
                {list.length > max && <Text style={cs.tagMore}>+{list.length - max}</Text>}
            </View>
        </View>
    );
};

const modalityText = (m) => ({ online: 'Online', in_person: m.location ? `In person · ${m.location}` : 'In person', hybrid: 'Online & in person' }[m.modality]);

// Tutor photo when the profile has one, otherwise the initial (EduConnect stores no photos yet).
const TutorPhoto = ({ uri, name, size = 44 }) => (uri
    ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.tile }}
        accessibilityLabel={`${name}'s photo`} />
    : <Avatar name={name} size={size} />);

const CardFact = ({ icon: Icon, children, muted }) => (
    <View style={cs.cardFact}>
        <Icon size={13} color={muted ? colors.textSubtle : colors.textMuted} />
        <Text style={[cs.cardFactText, muted && { color: colors.textSubtle }]} numberOfLines={1}>{children}</Text>
    </View>
);

// Compact recommendation card shown inside the chat. Everything on it comes from the tutor's
// database record (via the matcher): photo, name, subjects, levels, hourly rate, availability, score.
const ChatTutorCard = ({ match, profile, isSelected, onViewProfile, onMessage, onSelect }) => {
    const wanted = new Set((profile?.subjects || []).map(x => String(x).toLowerCase()));
    const subjects = [...(match.expertise || [])].sort((a, b) =>
        wanted.has(String(b).toLowerCase()) - wanted.has(String(a).toLowerCase()));
    const levels = (match.teaching_levels || []).map(levelShort);
    const available = availabilityText(match.availability_slots);
    const rate = match.hourly_rate != null ? `${formatMoney(match.hourly_rate, match.price_currency || 'MUR')}/hr` : 'Rate not listed';
    const tone = tones[matchTone(match.match_score)];
    return (
        <View style={[cs.card, isSelected && s.cardSelected]}>
            <View style={cs.cardTop}>
                <TutorPhoto uri={match.image_url} name={match.tutor_name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={cs.cardName} numberOfLines={1}>{match.tutor_name}</Text>
                    <Text style={cs.cardRate} numberOfLines={1}>
                        {rate}{modalityText(match) ? <Text style={cs.cardSub}>{'  ·  '}{modalityText(match)}</Text> : null}
                    </Text>
                </View>
                <View style={[cs.scoreBox, { backgroundColor: tone.bg }]}>
                    <Text style={[cs.score, { color: tone.fg }]}>{match.match_score}%</Text>
                    <Text style={[cs.scoreLabel, { color: tone.fg }]}>match</Text>
                </View>
            </View>
            <View style={cs.cardFacts}>
                <CardFact icon={BookOpen} muted={!subjects.length}>{subjects.length ? subjects.slice(0, 3).join(', ') + (subjects.length > 3 ? ` +${subjects.length - 3}` : '') : 'Subjects not listed'}</CardFact>
                <CardFact icon={GraduationCap} muted={!levels.length}>{levels.length ? levels.join(', ') : 'Levels not listed'}</CardFact>
                <CardFact icon={Clock} muted={!available}>{available || 'Availability not listed'}</CardFact>
            </View>
            {match.ai_reason ? <Text style={cs.reason} numberOfLines={2}>{match.ai_reason}</Text> : null}
            {match.support_match?.length > 0 && <Text style={cs.support}>Supports {match.support_match.join(', ')}</Text>}
            {match.caveat ? <Text style={cs.caveat} numberOfLines={2}>{match.caveat}</Text> : null}
            <View style={cs.cardActions}>
                <TouchableOpacity onPress={onViewProfile} style={cs.linkBtn} accessibilityRole="button" accessibilityLabel={`View ${match.tutor_name}'s profile`}>
                    <Text style={cs.linkText}>View profile</Text>
                </TouchableOpacity>
                {onMessage && <TouchableOpacity onPress={onMessage} style={cs.smallBtn} accessibilityRole="button"><Text style={cs.smallBtnText}>Message</Text></TouchableOpacity>}
                <TouchableOpacity onPress={onSelect} style={[cs.smallBtn, cs.smallBtnPrimary, isSelected && { backgroundColor: colors.success }]} accessibilityRole="button">
                    <Text style={[cs.smallBtnText, { color: '#fff' }]}>{isSelected ? 'Selected' : 'Choose'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

// Everything about a tutor, shown on request and in the Recommended tab
const TutorFacts = ({ match, profile }) => {
    const wantedSubjects = new Set((profile?.subjects || []).map(x => x.toLowerCase()));
    const wantedTopics = new Set((profile?.topics || []).map(x => x.toLowerCase()));
    const quals = [match.education, match.certifications].filter(Boolean).join(' · ');
    return (
        <View style={{ gap: 8 }}>
            <Text style={cs.cardSub}>
                {[match.years_experience ? `${match.years_experience} yrs experience` : null, match.rating ? `★ ${Number(match.rating).toFixed(1)}` : null,
                  match.total_sessions > 0 ? `${match.total_sessions} sessions` : 'New on EduConnect'].filter(Boolean).join('  ·  ')}
            </Text>
            {availabilityText(match.availability_slots) ? <Text style={cs.fact}>Available: {availabilityText(match.availability_slots)}</Text> : null}
            <TagRow label="Subjects" items={match.expertise} hit={wantedSubjects} />
            <TagRow label="Levels" items={(match.teaching_levels || []).map(levelShort)} />
            <TagRow label="Boards" items={(match.exam_boards || []).map(b => BOARD_LABELS[String(b).toLowerCase()] || b)} />
            <TagRow label="Topics" items={match.topics} max={5} hit={wantedTopics} />
            {quals ? <Text style={cs.fact}>Qualifications: {quals}</Text> : null}
        </View>
    );
};

// Fuller card for the Recommended tab
const RecommendedCard = ({ match, profile, compact, isSelected, isExpanded, onToggle, onRate, onMessage, onSelect }) => (
    <View style={[cs.card, isSelected && s.cardSelected]}>
        <View style={cs.cardTop}>
            <Avatar name={match.tutor_name} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cs.cardName} numberOfLines={1}>{match.tutor_name}</Text>
                <Text style={cs.cardSub} numberOfLines={1}>
                    {[match.hourly_rate != null ? `${formatMoney(match.hourly_rate, match.price_currency || 'MUR')}/hr` : null, modalityText(match)].filter(Boolean).join('  ·  ')}
                </Text>
            </View>
            <ScorePill match={match} />
        </View>
        {match.ai_reason ? (
            <View style={cs.why}><Text style={cs.whyLabel}>Why recommended</Text><Text style={cs.whyText}>{match.ai_reason}</Text></View>
        ) : null}
        <Caveat match={match} />
        <TutorFacts match={match} profile={profile} />
        {isExpanded && <MatchDetails match={match} useRL studentProfile={requirementsToProfile(profile)} />}
        <CardActions match={match} compact={compact} isSelected={isSelected} isExpanded={isExpanded}
            onToggle={onToggle} onRate={onRate} onMessage={onMessage} onSelect={onSelect} />
    </View>
);

const TypingIndicator = ({ label }) => (
    <View style={[cs.row, { justifyContent: 'flex-start' }]}>
        <View style={cs.aiBadge}><Sparkles size={14} color="#fff" /></View>
        <View style={[cs.bubble, cs.bubbleAi, cs.typing]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={cs.typingText}>{label}</Text>
        </View>
    </View>
);

const ChatChips = ({ items, onPress, disabled }) => (
    <View style={cs.chips}>
        {items.map(x => (
            <TouchableOpacity key={x} style={cs.chip} disabled={disabled} onPress={() => onPress(x)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={x}>
                <Text style={cs.chipText}>{x}</Text>
            </TouchableOpacity>
        ))}
    </View>
);

const ProfileStrip = ({ profile }) => {
    if (!profile) return null;
    const cur = profile.currency || 'MUR';
    const items = [
        ...(profile.subjects || []).map(x => x[0].toUpperCase() + x.slice(1)),
        profile.level && (LEVEL_LABELS[profile.level] || profile.level).split(' (')[0],
        profile.board && (BOARD_LABELS[profile.board] || profile.board),
        ...(profile.topics || []).slice(0, 3),
        profile.absolute_max_rate && (profile.preferred_rate && profile.preferred_rate < profile.absolute_max_rate
            ? `${formatMoney(profile.preferred_rate, cur)} – ${formatMoney(profile.absolute_max_rate, cur)}/hr`
            : `Up to ${formatMoney(profile.absolute_max_rate, cur)}/hr`),
        profile.modality && ({ online: 'Online', in_person: 'In person', hybrid: 'Online or in person' }[profile.modality]),
        profile.location,
        profile.gender_pref && `${profile.gender_pref} tutor`,
        ...(profile.available_days || []),
        profile.available_time,
        profile.require_all_subjects && 'All subjects',
        profile.support_needs?.length ? 'Learning support' : null,
    ].filter(Boolean);
    if (!items.length) return null;
    return (
        <View style={cs.strip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
                {items.map(x => <View key={x} style={cs.tag}><Text style={cs.tagText}>{x}</Text></View>)}
            </ScrollView>
        </View>
    );
};

const ChatInterface = ({ compact, onSelectTutor, onMessageTutor, onRate, onSnapshot, hidden }) => {
    const { height } = useWindowDimensions();
    const [conv, setConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [phase, setPhase] = useState('typing');
    const [booting, setBooting] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [failedText, setFailedText] = useState(null);
    const [profileTutorId, setProfileTutorId] = useState(null);   // "View profile" from a chat card
    const scrollRef = useRef(null);
    const phaseTimer = useRef(null);

    const loadHistory = useCallback(async () => {
        try { setHistory((await chatApi('/conversations')).conversations || []); } catch (e) { /* history is optional */ }
    }, []);

    const open = useCallback((c) => {
        setConv(c);
        setMessages(c.messages || []);
        setSelectedId(null);
        setExpanded({});
        setFailedText(null);
        setShowHistory(false);
    }, []);

    const startNew = useCallback(async () => {
        try { open((await chatApi('/conversations', { method: 'POST' })).conversation); loadHistory(); }
        catch (e) { setMessages(m => [...m, { id: `e${Date.now()}`, role: 'assistant', kind: 'error', text: e.message, payload: {} }]); }
    }, [open, loadHistory]);

    // Resume the most recent conversation, or start the first one
    useEffect(() => {
        (async () => {
            try {
                const list = (await chatApi('/conversations')).conversations || [];
                setHistory(list);
                if (list.length) open((await chatApi(`/conversations/${list[0].id}`)).conversation);
                else open((await chatApi('/conversations', { method: 'POST' })).conversation);
            } catch (e) {
                setMessages([{ id: 'boot-error', role: 'assistant', kind: 'error', text: e.message, payload: {} }]);
            } finally { setBooting(false); }
        })();
        return () => clearTimeout(phaseTimer.current);
    }, [open]);

    const send = useCallback(async (raw) => {
        const text = (raw ?? input).trim();
        if (!text || sending || !conv) return;
        setInput('');
        setFailedText(null);
        setSending(true);
        setPhase('typing');
        clearTimeout(phaseTimer.current);
        phaseTimer.current = setTimeout(() => setPhase('matching'), 1400);
        setMessages(m => [...m, { id: `u${Date.now()}`, role: 'user', kind: 'message', text, payload: {} }]);
        try {
            const data = await chatApi(`/conversations/${conv.id}/messages`, { method: 'POST', body: { message: text } });
            if (data.new_conversation) {
                open(data.conversation);
            } else {
                setMessages(m => [...m, ...(data.notice ? [{ id: `n${Date.now()}`, role: 'assistant', kind: 'notice', text: data.notice, payload: {} }] : []), ...data.messages]);
                setConv(c => ({ ...c, ...data.conversation, messages: undefined }));
            }
            loadHistory();
        } catch (e) {
            setFailedText(text);
            setMessages(m => [...m, { id: `e${Date.now()}`, role: 'assistant', kind: 'error', text: e.message, payload: {} }]);
        } finally {
            clearTimeout(phaseTimer.current);
            setSending(false);
        }
    }, [input, sending, conv, open, loadHistory]);

    const removeConversation = async (id) => {
        try {
            await chatApi(`/conversations/${id}`, { method: 'DELETE' });
            if (conv?.id === id) await startNew(); else loadHistory();
            loadHistory();
        } catch (e) { /* leave it listed; the user can retry */ }
    };

    const lastIdx = messages.length - 1;
    const profile = conv?.profile;
    useEffect(() => {
        const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
        return () => clearTimeout(t);
    }, [messages.length, sending]);
    useEffect(() => {
        const withGroups = [...messages].reverse().find(m => m.role === 'assistant' && m.payload?.groups?.length);
        onSnapshot?.({ groups: withGroups?.payload.groups || [], profile });
    }, [messages, profile]);
    const chatHeight = Math.max(480, Math.min(height - (compact ? 190 : 230), 820));
    const onKeyPress = (e) => {
        if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault?.(); send(); }
    };

    return (
        <View style={[cs.shell, { height: chatHeight }, hidden && { display: 'none' }]}>
            <View style={cs.header}>
                <View style={cs.aiBadgeLg}><Sparkles size={18} color="#fff" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={cs.headerTitle}>EduConnect AI</Text>
                    <Text style={cs.headerSub} numberOfLines={1}>{conv?.title && conv.title !== 'New chat' ? conv.title : 'Ask me for a tutor'}</Text>
                </View>
                <TouchableOpacity style={cs.headBtn} onPress={() => { setShowHistory(v => !v); loadHistory(); }} accessibilityRole="button" accessibilityLabel="Chat history">
                    <ClipboardList size={16} color={colors.primary} />{!compact && <Text style={cs.headBtnText}>History</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={cs.headBtn} onPress={startNew} disabled={sending} accessibilityRole="button" accessibilityLabel="New chat">
                    <RefreshCw size={16} color={colors.primary} />{!compact && <Text style={cs.headBtnText}>New chat</Text>}
                </TouchableOpacity>
            </View>

            {showHistory && (
                <View style={cs.historyPanel}>
                    <Text style={cs.stripLabel}>Your conversations</Text>
                    <ScrollView style={{ maxHeight: 220 }}>
                        {history.length === 0 && <Text style={cs.historyEmpty}>No conversations yet.</Text>}
                        {history.map(h => (
                            <View key={h.id} style={[cs.historyRow, conv?.id === h.id && cs.historyRowActive]}>
                                <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={async () => { try { open((await chatApi(`/conversations/${h.id}`)).conversation); } catch (e) { /* keep current */ } }}
                                    accessibilityRole="button">
                                    <Text style={cs.historyTitle} numberOfLines={1}>{h.title}</Text>
                                    <Text style={cs.historySub} numberOfLines={1}>{h.preview || 'No messages yet'} · {new Date(h.updated_at).toLocaleDateString()}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => removeConversation(h.id)} accessibilityRole="button" accessibilityLabel="Delete conversation" style={cs.historyDel}>
                                    <X size={16} color={colors.textMuted} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                    <Text style={cs.privacy}>Chats are saved to your account so you can resume them. Delete any chat here and it is removed.</Text>
                </View>
            )}

            <ProfileStrip profile={profile} />

            <ScrollView ref={scrollRef} style={cs.messages} contentContainerStyle={cs.messagesInner}
                keyboardShouldPersistTaps="handled"
                >
                {booting && <View style={cs.boot}><ActivityIndicator color={colors.primary} /><Text style={cs.typingText}>Opening your chat…</Text></View>}
                {messages.map((m, i) => {
                    const isLast = i === lastIdx;
                    if (m.role === 'user') {
                        return (
                            <View key={m.id} style={[cs.row, { justifyContent: 'flex-end' }]}>
                                <View style={[cs.bubble, cs.bubbleUser]}><Text style={cs.userText} selectable>{m.text}</Text></View>
                            </View>
                        );
                    }
                    const p = m.payload || {};
                    const isError = m.kind === 'error';
                    const chipItems = isLast && !sending ? [...(p.options || []), ...(p.quick_replies || [])] : [];
                    return (
                        <View key={m.id} style={{ gap: 8 }}>
                            <View style={[cs.row, { justifyContent: 'flex-start' }]}>
                                <View style={[cs.aiBadge, isError && { backgroundColor: colors.danger }]}>
                                    {isError ? <AlertCircle size={14} color="#fff" /> : <Sparkles size={14} color="#fff" />}
                                </View>
                                <View style={[cs.bubble, cs.bubbleAi, isError && cs.bubbleError, m.kind === 'notice' && cs.bubbleNotice]}>
                                    <Text style={[cs.aiText, isError && { color: colors.danger }]} selectable>{m.text}</Text>
                                    {isError && failedText && isLast && (
                                        <TouchableOpacity onPress={() => send(failedText)} style={cs.retry} accessibilityRole="button">
                                            <RefreshCw size={13} color={colors.primary} /><Text style={cs.retryText}>Try again</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {(p.groups || []).map(g => (
                                <View key={g.key} style={[cs.group, g.key === 'alternatives' && cs.groupAlt]}>
                                    <View style={cs.groupHead}>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={[cs.groupTitle, g.key === 'alternatives' && { color: colors.warning }]}>{g.title}</Text>
                                            {g.subtitle ? <Text style={cs.groupSub}>{g.subtitle}</Text> : null}
                                        </View>
                                        <Text style={cs.groupCount}>{g.matches.length}</Text>
                                    </View>
                                    {g.matches.map(match => {
                                        const key = `${m.id}-${match.tutor_id}`;
                                        return (
                                            <ChatTutorCard key={key} match={match} profile={profile}
                                                isSelected={selectedId === match.tutor_id}
                                                onViewProfile={() => setProfileTutorId(match.tutor_id)}
                                                onMessage={onMessageTutor ? () => onMessageTutor(match.tutor_id) : undefined}
                                                onSelect={() => { setSelectedId(match.tutor_id); onSelectTutor?.(match); }} />
                                        );
                                    })}
                                </View>
                            ))}

                            {chipItems.length > 0 && <ChatChips items={chipItems} onPress={send} disabled={sending} />}
                        </View>
                    );
                })}
                {sending && <TypingIndicator label={phase === 'matching' ? 'Searching EduConnect tutors…' : 'EduConnect AI is typing…'} />}
            </ScrollView>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={cs.composer}>
                    <TextInput
                        style={cs.input}
                        value={input}
                        onChangeText={t => setInput(t.slice(0, PROMPT_MAX))}
                        onKeyPress={onKeyPress}
                        placeholder="Type your message…"
                        placeholderTextColor={colors.textSubtle}
                        multiline
                        maxLength={PROMPT_MAX}
                        editable={!booting && !!conv}
                        accessibilityLabel="Message EduConnect AI"
                    />
                    <TouchableOpacity
                        style={[cs.send, (!input.trim() || sending || !conv) && cs.sendOff]}
                        onPress={() => send()}
                        disabled={!input.trim() || sending || !conv}
                        accessibilityRole="button" accessibilityLabel="Send message">
                        <Send size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
                <Text style={cs.hint}>Mention anything: subject, level, budget, lesson type, learning needs. You can change it any time.</Text>
            </KeyboardAvoidingView>

            {profileTutorId != null && (
                <TutorProfileViewer
                    tutorId={profileTutorId}
                    visible
                    onClose={() => setProfileTutorId(null)}
                    onMessageTutor={onMessageTutor}
                />
            )}
        </View>
    );
};

const cs = StyleSheet.create({
    shell: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    aiBadgeLg: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    aiBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    headerTitle: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text },
    headerSub: { fontFamily: font, fontSize: 12, color: colors.textMuted },
    headBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
    headBtnText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary },
    historyPanel: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.tile, gap: 6 },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radius.md },
    historyRowActive: { backgroundColor: colors.primarySoft },
    historyTitle: { fontFamily: font, fontSize: 14, fontWeight: '600', color: colors.text },
    historySub: { fontFamily: font, fontSize: 12, color: colors.textMuted },
    historyDel: { padding: 6 },
    historyEmpty: { fontFamily: font, fontSize: 13, color: colors.textMuted, paddingVertical: 6 },
    privacy: { fontFamily: font, fontSize: 11, color: colors.textSubtle },
    strip: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    stripLabel: { fontFamily: font, fontSize: 11, fontWeight: '700', color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5 },
    messages: { flex: 1, backgroundColor: colors.bg },
    messagesInner: { padding: 12, gap: 12 },
    boot: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 24 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
    bubbleAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 6, flexShrink: 1 },
    bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 6 },
    bubbleError: { backgroundColor: colors.dangerSoft || '#FDECEC', borderColor: '#F5C2C2' },
    bubbleNotice: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
    aiText: { fontFamily: font, fontSize: 15, lineHeight: 22, color: colors.text },
    userText: { fontFamily: font, fontSize: 15, lineHeight: 22, color: '#fff' },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typingText: { fontFamily: font, fontSize: 13, color: colors.textMuted },
    retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    retryText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 34 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryRing || colors.border },
    chipText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.primary },
    group: { gap: 8, marginLeft: 0 },
    groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    groupTitle: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primaryDark, textTransform: 'uppercase', letterSpacing: 0.4 },
    groupSub: { fontFamily: font, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    groupAlt: { paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed' },
    groupCount: { fontFamily: font, fontSize: 12, fontWeight: '700', color: colors.textMuted },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
    cardRate: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
    cardFacts: { gap: 4 },
    cardFact: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
    cardFactText: { fontFamily: font, fontSize: 12, color: colors.text, flexShrink: 1 },
    scoreBox: { alignItems: 'center', borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
    scoreLabel: { fontFamily: font, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardName: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text },
    cardSub: { fontFamily: font, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    score: { fontFamily: font, fontSize: 16, fontWeight: '800' },
    reason: { fontFamily: font, fontSize: 13, lineHeight: 19, color: colors.text },
    support: { fontFamily: font, fontSize: 12, fontWeight: '600', color: colors.successText },
    caveat: { fontFamily: font, fontSize: 12, color: colors.warning },
    fact: { fontFamily: font, fontSize: 13, color: colors.text },
    cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
    linkBtn: { paddingHorizontal: 8, paddingVertical: 6, marginRight: 'auto' },
    linkText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary },
    smallBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
    smallBtnPrimary: { backgroundColor: colors.primary },
    smallBtnText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary },
    recWrap: { gap: 12 },
    recHead: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primaryDark, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
    recEmpty: { alignItems: 'center', padding: 28, gap: 8, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border },
    recEmptyTitle: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text },
    recEmptyText: { fontFamily: font, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
    tagRow: { gap: 4 },
    tagLabel: { fontFamily: font, fontSize: 11, fontWeight: '700', color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.tile, borderWidth: 1, borderColor: colors.border },
    tagHit: { backgroundColor: colors.successSoft, borderColor: colors.success },
    tagText: { fontFamily: font, fontSize: 12, color: colors.text },
    tagMore: { fontFamily: font, fontSize: 12, color: colors.textMuted },
    why: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 10, gap: 2 },
    whyLabel: { fontFamily: font, fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
    whyText: { fontFamily: font, fontSize: 13, lineHeight: 19, color: colors.text },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
    input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong || colors.border, backgroundColor: colors.bg, fontFamily: font, fontSize: 15, color: colors.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },
    send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    sendOff: { opacity: 0.4 },
    hint: { display: 'none' },
});
function compactGutter() { return 34; }


// ─── Main component ───────────────────────────────────────────────────────────


// Which colour family a match card uses (rank badge, label, metrics, score pill)
const matchTone = (score) => {
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

// ─── Prompt-mode helpers ──────────────────────────────────────────────────────

const PROMPT_MAX = 1000;

// Short label on the chip, full prompt inserted on tap
const PROMPT_EXAMPLES = [
    { label: 'A-level Maths (Cambridge)', text: "I'm in Lower Sixth doing Cambridge A-level Maths and I'm struggling with differentiation. I learn best with worked examples. Weekday evenings, online, up to Rs 800 per hour." },
    { label: 'Form 4 Science (SC)', text: 'My daughter is in Form 4 and needs help with Physics and Chemistry for the School Certificate. In person around Quatre Bornes, weekends, budget Rs 500 an hour. A tutor who speaks Creole or French is fine.' },
    { label: 'Learn Python', text: "I'm a university beginner who wants to learn Python by building small projects. Hands-on, afternoons, under Rs 600/hr." },
];

// What a good request covers. Checked live as the student types so they can see
// what is missing, and ALSO ticked from what the server's AI extracted last time
// (see Ingredients), so a chip is never left blank for something we understood.
const INGREDIENTS = [
    { key: 'subject', label: 'Subject', req: r => r.subjects?.length,
      re: /\b(math|maths|mathematics|algebra|calculus|differentiation|integration|geometry|statistic|trig|physics|chem|biology|bio|science|english|essay|writing|grammar|literature|python|javascript|java\b|coding|programming|computer|ict|history|geography|art|drawing|music|piano|guitar|business|economics|accounting|accounts|finance|marketing|spanish|french|mandarin|chinese|hindi|arabic|creole|kreol|portuguese|russian|language)/i },
    { key: 'level', label: 'Level', req: r => !!r.level,
      re: /\b(primary|secondary|high school|university|undergrad\w*|postgrad\w*|college|cpe|std\.?\s?[1-6]|standard\s?[1-6]|form\s?[1-6]|grade\s?\d{1,2}|year\s?\d{1,2}|igcse|gcse|\bsc\b|school certificate|o[- ]?level|a[- ]?level|as[- ]?level|advanced level|hsc|lower sixth|upper sixth|sixth form|beginner|intermediate|advanced|from scratch)/i },
    { key: 'board', label: 'Exam board', req: r => !!r.board,
      re: /\b(cambridge|cie|caie|edexcel|pearson|aqa|ocr|ib\b|mes\b|mauritius examinations)/i },
    { key: 'time', label: 'When', req: r => !!r.available_time,
      re: /\b(morning|afternoon|evening|night|after school|before school|weekend|weekday|saturday|sunday|after work)/i },
    { key: 'style', label: 'How you learn', req: r => !!r.learning_style,
      re: /\b(visual|diagram|video|hands-on|hands on|practice|practical|project|by doing|discuss|talk|conversation|listen|example|step by step)/i },
    { key: 'budget', label: 'Budget', req: r => r.max_rate != null,
      re: /(\b(rs|mur)\.?\s?\d+|\d+\s?(rs|mur|rupees?)\b|rupees?|budget|per hour|\/\s?hr|an hour|\/\s?h\b|\bunder\s+\d+|\bup to\s+\d+|\bmax(imum)?\s+\d+)/i },
    { key: 'where', label: 'Online / in person', req: r => !!r.modality,
      re: /\b(online|virtual|zoom|remote|in[- ]person|face[- ]to[- ]face|home tuition|at home|hybrid)/i },
    { key: 'language', label: 'Language', req: r => r.languages?.length > 0,
      re: /\b(speak|speaks|speaking|in english|in french|in creole|in kreol|in hindi|explain in|creole|kreol|bhojpuri)/i },
];

const cap = (v) => {
    if (v == null || v === '') return '';
    const t = String(v).replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
};

// Turns the server's `requirements` object into readable chips
const requirementItems = (req) => {
    if (!req) return [];
    const items = [];
    const add = (key, label, value) => { if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) items.push({ key, label, value }); };
    add('subjects', 'Subject', (req.subjects || []).map(cap).join(', '));
    add('topics', 'Topics', (req.topics || []).map(cap).join(', '));
    add('level', 'Level', LEVEL_LABELS[req.level] || cap(req.level));
    add('board', 'Exam board', req.board_declined ? 'Any board' : (BOARD_LABELS[req.board] || cap(req.board)));
    add('modality', 'Lessons', { online: 'Online', in_person: 'In person', hybrid: 'Online or in person' }[req.modality] || cap(req.modality));
    add('location', 'Location', req.location);
    add('available_time', 'When', cap(req.available_time));
    add('learning_style', 'Learns best', { visual: 'Visually', auditory: 'By discussing', kinesthetic: 'Hands-on' }[req.learning_style] || cap(req.learning_style));
    add('languages', 'Tutor speaks', (req.languages || []).join(', '));
    add('gender_pref', 'Tutor', { female: 'Female tutor', male: 'Male tutor' }[req.gender_pref]);
    add('support_needs', 'Learning support', (req.support_needs || []).map(cap).join(', '));
    if (req.max_rate != null) add('max_rate', 'Budget', `Up to ${formatMoney(req.max_rate, req.currency || 'MUR')}/hr${req.currency ? '' : ' (MUR assumed)'}`);
    return items;
};

// The tutor-profile panel & fact rows still read survey-style keys
const requirementsToProfile = (req) => req ? ({
    preferred_subjects: req.subjects || [],
    academic_level: req.level,
    learning_style: req.learning_style,
    available_time: req.available_time,
    preferred_languages: req.languages || [],
}) : null;

const scheduleText = (score) => {
    if (score == null) return null;
    if (score >= 80) return 'Fits your schedule';
    if (score >= 60) return 'Close to your schedule';
    return 'Limited schedule overlap';
};

const styleText = (style) => ({
    visual: 'Visual teacher', auditory: 'Discussion-based', kinesthetic: 'Hands-on teacher', adaptive: 'Adapts to you',
}[(style || '').toLowerCase()] || null);

// ─── Small building blocks ────────────────────────────────────────────────────

const ModeSwitch = ({ mode, onChange, compact, recommendedCount = 0 }) => (
    <View style={s.modeSwitch} accessibilityRole="tablist">
        {[
            { key: 'prompt', label: compact ? 'Describe it' : 'Describe what you need', icon: Sparkles },
            { key: 'recommended', label: recommendedCount ? `Recommended (${recommendedCount})` : 'Recommended', icon: Users },
            { key: 'survey', label: compact ? 'Survey' : 'Use my survey', icon: ClipboardList },
        ].map(({ key, label, icon: Icon }) => {
            const active = mode === key;
            return (
                <TouchableOpacity
                    key={key}
                    style={[s.modeBtn, active && s.modeBtnActive]}
                    onPress={() => onChange(key)}
                    activeOpacity={0.85}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                >
                    <Icon size={16} color={active ? colors.primary : colors.textMuted} />
                    <Text style={[s.modeBtnText, active && s.modeBtnTextActive]} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
            );
        })}
    </View>
);

// Live "what your request covers" checklist under the text box.
// A chip is ticked if the text matches OR the server already understood that field
// (from an earlier message or answer), so nothing the AI picked up shows as missing.
const Ingredients = ({ text, requirements }) => {
    const found = INGREDIENTS.map(i => ({
        ...i,
        on: i.re.test(text || '') || !!(requirements && i.req(requirements)),
    }));
    const count = found.filter(i => i.on).length;
    return (
        <View style={s.ingredients}>
            <Text style={s.ingredientsLead}>
                {count === 0 ? 'Mention as many as you can:' : count >= 4 ? 'Great, that’s plenty to match on.' : 'Adding more helps:'}
            </Text>
            <View style={s.ingredientRow}>
                {found.map(i => (
                    <View key={i.key} style={[s.ingredient, i.on && s.ingredientOn]}>
                        {i.on
                            ? <CheckCircle size={13} color={colors.successText} />
                            : <View style={s.ingredientDot} />}
                        <Text style={[s.ingredientText, i.on && s.ingredientTextOn]}>{i.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

// What we took from the request, as compact chips, and who understood it
const SOURCE_NOTE = {
    ai: 'Understood by AI.',
    keywords_fallback: 'The AI service was unavailable, so this was read with basic keyword matching.',
    keywords_only: 'Read with keyword matching (AI is turned off on the server).',
};
const Understood = ({ result }) => {
    if (!result) return null;
    const items = requirementItems(result.requirements);
    if (!items.length && !result.notice) return null;
    return (
        <View style={s.understood}>
            <View style={s.understoodHead}>
                <Sparkles size={15} color={colors.primary} />
                <Text style={s.understoodTitle}>Here’s what we’re matching on</Text>
            </View>
            <View style={s.understoodChips}>
                {items.map(i => (
                    <View key={i.key} style={s.uChip}>
                        <Text style={s.uChipLabel}>{i.label}</Text>
                        <Text style={s.uChipValue}>{i.value}</Text>
                    </View>
                ))}
            </View>
            <Text style={s.understoodNote}>
                {SOURCE_NOTE[result.interpretation_source] || ''}
                {result.requirements?.support_needs?.length ? ' Learning support needs are only used for this search and aren’t saved.' : ''}
            </Text>
            {result.notice ? <Text style={[s.understoodNote, { color: colors.warning }]}>{result.notice}</Text> : null}
        </View>
    );
};

const LOADING_STEPS = ['Reading your request…', 'Ranking tutors…', 'Writing why each one fits…'];

const LoadingCard = ({ mode }) => {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (mode !== 'prompt') return undefined;
        const id = setInterval(() => setStep(v => Math.min(v + 1, LOADING_STEPS.length - 1)), 2500);
        return () => clearInterval(id);
    }, [mode]);
    return (
        <View style={s.loading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.loadingText}>{mode === 'prompt' ? LOADING_STEPS[step] : 'Finding your best matches…'}</Text>
        </View>
    );
};

const Fact = ({ icon: Icon, text, tone = 'neutral' }) => {
    if (!text) return null;
    const t = tones[tone] || tones.neutral;
    return (
        <View style={s.fact}>
            <Icon size={14} color={t.fg} />
            <Text style={[s.factText, tone !== 'neutral' && { color: t.fg }]} numberOfLines={1}>{text}</Text>
        </View>
    );
};

const ScorePill = ({ match }) => {
    const tone = matchTone(match.match_score);
    return (
        <View style={[s.scorePill, { backgroundColor: tones[tone].bg }]}>
            <Text style={[s.scoreValue, { color: tones[tone].fg }]}>{match.match_score}%</Text>
            <Text style={[s.scoreLabel, { color: tones[tone].fg }]}>{getScoreLabel(match.match_score)}</Text>
        </View>
    );
};

// Scores, confidence and the full tutor profile, shown when a card is opened
const VERIFIED_LABELS = { subjects: 'Subject', level: 'Level', exam_board: 'Exam board', topics: 'Topics', modality: 'Lessons' };

const MatchDetails = ({ match, useRL, studentProfile }) => {
    const bd = match.breakdown || {};
    const tone = matchTone(match.match_score);
    const verified = Object.entries(match.requirements_verified || {})
        .filter(([, v]) => Array.isArray(v) ? v.length > 0 : !!v)
        .map(([k]) => VERIFIED_LABELS[k] || cap(k));
    return (
        <View style={s.details}>
            {verified.length > 0 && (
                <View style={styles.perfBox}>
                    <CheckCircle size={14} color={colors.primary} />
                    <Text style={styles.perfText}>Checked against this tutor’s profile: {verified.join(', ')}</Text>
                </View>
            )}
            <View style={s.detailMetrics}>
                {bd.support != null && <Metric icon={CheckCircle} label="Learning support" score={bd.support} tone={tone} />}
                <Metric icon={Star} label="Rating" score={bd.rating} tone={tone} />
                <Metric icon={Briefcase} label="Experience" score={bd.experience} tone={tone} />
                <Metric icon={Award} label="Qualifications" score={bd.qualifications} tone={tone} />
                {bd.schedule != null && <Metric icon={Calendar} label="Schedule" score={bd.schedule} tone={tone} />}
                {bd.learning_style != null && <Metric icon={Brain} label="Style" score={bd.learning_style} tone={tone} />}
                {bd.language != null && <Metric icon={Globe} label="Language" score={bd.language} tone={tone} zeroMeans="None" />}
            </View>
            {bd.rating_source === 'missing' && (
                <View style={styles.notice}>
                    <AlertCircle size={14} color={colors.warning} />
                    <Text style={styles.noticeText}>
                        No student ratings yet, so the rating part isn’t counted in this score.
                    </Text>
                </View>
            )}
            {match.rl_gate > 0 && useRL && (
                <View style={styles.perfBox}>
                    <Zap size={14} color={colors.primary} />
                    <Text style={styles.perfText}>Past-session ratings are used only to break ties between equal matches.</Text>
                </View>
            )}
            <TutorProfilePanel tutorId={match.tutor_id} matchBreakdown={bd} studentProfile={studentProfile} />
        </View>
    );
};

const CardActions = ({ match, isSelected, isExpanded, onToggle, onRate, onMessage, onSelect, compact }) => (
    <View style={[s.actions, compact && s.actionsCompact]}>
        <View style={s.actionLinks}>
            <TouchableOpacity style={s.linkBtn} onPress={onToggle} accessibilityRole="button">
                {isExpanded ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
                <Text style={s.linkBtnText}>{isExpanded ? 'Hide details' : 'Full profile'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={onRate} accessibilityRole="button" accessibilityLabel={`Rate ${match.tutor_name}`}>
                <Star size={15} color="#D97706" />
                <Text style={[s.linkBtnText, { color: colors.textMuted }]}>Rate</Text>
            </TouchableOpacity>
        </View>
        <View style={s.actionButtons}>
            {onMessage && (
                <Button label="Message" icon={MessageSquare} variant="soft" style={s.btn} onPress={onMessage} />
            )}
            <Button
                label={isSelected ? 'Selected' : 'Choose tutor'}
                icon={isSelected ? CheckCircle : undefined}
                variant={isSelected ? 'success' : 'primary'}
                style={s.btn}
                onPress={onSelect}
            />
        </View>
    </View>
);

// Shown when the tutor's profile doesn't confirm every requirement the student gave
const Caveat = ({ match }) => (match.caveat ? (
    <View style={styles.notice}>
        <AlertCircle size={14} color={colors.warning} />
        <Text style={styles.noticeText}>{match.caveat}</Text>
    </View>
) : null);

// The top result: everything needed to decide, without opening anything
const FeaturedMatch = ({ match, studentProfile, compact, ...rest }) => {
    const subjects = match.expertise || [];
    const wanted = new Set((studentProfile?.preferred_subjects || []).map(x => x.toLowerCase()));
    return (
        <View style={[s.featured, rest.isSelected && s.cardSelected]}>
            <Text style={s.featuredKicker}>Best fit for you</Text>
            <View style={s.featuredTop}>
                <Avatar name={match.tutor_name} size={compact ? 52 : 60} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.featuredName} numberOfLines={1}>{match.tutor_name}</Text>
                    <Text style={s.featuredSub} numberOfLines={compact ? 2 : 1}>
                        {[styleText(match.teaching_style), match.years_experience ? `${match.years_experience} yrs experience` : null,
                        match.total_sessions > 0 ? `${match.total_sessions} sessions` : 'New on EduConnect'].filter(Boolean).join('  ·  ')}
                    </Text>
                </View>
                {!compact && <ScorePill match={match} />}
            </View>

            {match.ai_reason ? <Text style={s.featuredReason}>{match.ai_reason}</Text> : null}
            <Caveat match={match} />

            {subjects.length > 0 && (
                <View style={s.subjectRow}>
                    {subjects.slice(0, 4).map(sub => {
                        const hit = wanted.has(sub.toLowerCase());
                        return (
                            <View key={sub} style={[s.subject, hit && s.subjectHit]}>
                                {hit && <CheckCircle size={12} color={colors.successText} />}
                                <Text style={[s.subjectText, hit && s.subjectTextHit]}>{sub}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            <View style={s.factRow}>
                <Fact icon={RsIcon} text={match.hourly_rate != null ? `${formatMoney(match.hourly_rate, match.price_currency || 'MUR')}/hr` : null} />
                {match.modality && <Fact icon={Globe} text={{ online: 'Online', in_person: match.location ? `In person · ${match.location}` : 'In person', hybrid: 'Online & in person' }[match.modality]} />}
                <Fact icon={Calendar} text={scheduleText(match.breakdown?.schedule)}
                    tone={(match.breakdown?.schedule ?? 0) >= 80 ? 'success' : 'neutral'} />
                {match.support_match?.length > 0 && (
                    <Fact icon={CheckCircle} text={`Supports ${match.support_match.join(', ')}`} tone="success" />
                )}
                {compact && <Fact icon={TrendingUp} text={`${match.match_score}% · ${getScoreLabel(match.match_score)}`} />}
            </View>

            {rest.isExpanded && <MatchDetails match={match} useRL={rest.useRL} studentProfile={studentProfile} />}
            <CardActions match={match} compact={compact} {...rest} />
        </View>
    );
};

// Everyone else: one tidy row each, opens in place
const CompactMatch = ({ match, rank, studentProfile, compact, ...rest }) => (
    <View style={[s.row, rest.isSelected && s.cardSelected]}>
        <TouchableOpacity style={s.rowMain} onPress={rest.onToggle} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`${match.tutor_name}, rank ${rank}. Show details`}>
            <Text style={s.rowRank}>{rank}</Text>
            <Avatar name={match.tutor_name} size={40} color={colors.primaryDark} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.rowTitleLine}>
                    <Text style={s.rowName} numberOfLines={1}>{match.tutor_name}</Text>
                    {match.hourly_rate != null && (
                        <Text style={s.rowRate}>
                            {formatMoney(match.hourly_rate, match.price_currency || 'MUR')}/hr
                        </Text>
                    )}
                </View>
                {match.support_match?.length > 0 && (
                    <Text style={s.rowSupport}>Supports {match.support_match.join(', ')}</Text>
                )}
                {match.ai_reason ? <Text style={s.rowReason} numberOfLines={rest.isExpanded ? undefined : 2}>{match.ai_reason}</Text> : null}
                {match.caveat ? <Text style={[s.rowReason, { color: colors.warning }]} numberOfLines={rest.isExpanded ? undefined : 2}>{match.caveat}</Text> : null}
            </View>
            {!compact && <ScorePill match={match} />}
        </TouchableOpacity>
        {rest.isExpanded && (
            <>
                <MatchDetails match={match} useRL={rest.useRL} studentProfile={studentProfile} />
                <CardActions match={match} compact={compact} {...rest} />
            </>
        )}
    </View>
);

// ─── Main component ───────────────────────────────────────────────────────────

const AITutorMatcher = ({
    studentProfile, studentName, initialMode = 'survey',
    onSelectTutor, onMessageTutor, onEditProfile,
}) => {
    const compact = useCompact();
    const [mode, setMode] = useState(initialMode);
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [useRL, setUseRL] = useState(true);
    const [selectedTutorId, setSelectedTutorId] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [ratingTarget, setRatingTarget] = useState(null); // { tutorId, tutorName }
    const [chatSnapshot, setChatSnapshot] = useState({ groups: [], profile: null });

    // Prompt mode
    const [prompt, setPrompt] = useState('');
    const [promptResult, setPromptResult] = useState(null);
    const [useSurveyDefaults, setUseSurveyDefaults] = useState(true);
    const [focused, setFocused] = useState(false);
    const lastPromptRef = useRef('');
    const [requirements, setRequirements] = useState(null);   // round-tripped to the server
    const [lastQuestionField, setLastQuestionField] = useState(null);
    const [surveyResult, setSurveyResult] = useState(null);

    const hasSurvey = !!studentProfile;

    // ── Fetchers ──
    const findSurveyMatches = async () => {
        if (!studentProfile) return;
        setLoading(true);
        setError(null);
        try {
            const token = await storage.getItem('token');
            const response = await fetch(`${API_URL}/api/match/tutors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ student_profile: studentProfile, use_rl: useRL }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'The server could not rank tutors right now.');
            setMatches(data.matches || []);
            setSurveyResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // `text` is the student's message (or the tapped answer chip). With no text we
    // re-run the current requirements (refresh / toggle ratings) without re-reading anything.
    const findPromptMatches = async (text, { answering = false, reset = false } = {}) => {
        const trimmed = (text ?? '').trim();
        const prior = reset ? null : requirements;
        if (!trimmed && !prior) {
            setError('Tell us a little more about what you need help with.');
            return;
        }
        if (trimmed && !answering && trimmed.length < 5) {
            setError('Tell us a little more about what you need help with.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const token = await storage.getItem('token');
            const response = await fetch(`${API_URL}/api/match/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    message: trimmed,
                    requirements: prior,
                    last_question_field: answering ? lastQuestionField : null,
                    use_rl: useRL,
                    use_survey_defaults: hasSurvey && useSurveyDefaults,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'The server could not rank tutors right now.');
            setPromptResult(data);
            setRequirements(data.requirements || null);
            setLastQuestionField(data.question?.field || null);
            setMatches(data.status === 'ok' ? (data.matches || []) : []);
            setSelectedTutorId(null);
            setExpanded({});
            if (trimmed) setPrompt('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const startOver = () => {
        setRequirements(null);
        setLastQuestionField(null);
        setPromptResult(null);
        setMatches([]);
        setPrompt('');
        setError(null);
    };

    const refresh = () => (mode === 'prompt' ? findPromptMatches('') : findSurveyMatches());

    useEffect(() => {
        if (mode === 'survey' && studentProfile) findSurveyMatches();
    }, [studentProfile, useRL, mode]);

    useEffect(() => {
        if (mode === 'prompt' && requirements && promptResult?.status === 'ok') findPromptMatches('');
    }, [useRL]);

    const switchMode = (next) => {
        if (next === mode) return;
        setMode(next);
        setMatches(next === 'prompt' && promptResult?.status === 'ok' ? (promptResult.matches || []) : (next === 'survey' && surveyResult?.status !== 'needs_clarification' ? (surveyResult?.matches || []) : []));
        setError(null);
        setSelectedTutorId(null);
        setExpanded({});
    };

    const toggle = useCallback((id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] })), []);

    const activeProfile = mode === 'prompt' ? (requirementsToProfile(requirements) || studentProfile) : studentProfile;
    const result = mode === 'prompt' ? promptResult : surveyResult;
    const showResults = mode === 'survey' ? hasSurvey : !!promptResult;
    const needsQuestion = !!result?.question && result.status === 'needs_clarification';
    const noMatch = result?.status === 'no_match';
    const isVerified = (m) => (m.verification?.status ?? 'verified') === 'verified';
    const verifiedMatches = matches.filter(isVerified);
    const unverifiedMatches = matches.filter(m => !isVerified(m));
    const subjects = studentProfile?.preferred_subjects || [];

    const cardProps = (match) => ({
        match,
        compact,
        useRL,
        studentProfile: activeProfile,
        isSelected: selectedTutorId === match.tutor_id,
        isExpanded: !!expanded[match.tutor_id],
        onToggle: () => toggle(match.tutor_id),
        onRate: () => setRatingTarget({ tutorId: match.tutor_id, tutorName: match.tutor_name }),
        onMessage: onMessageTutor ? () => onMessageTutor(match.tutor_id) : undefined,
        onSelect: () => { setSelectedTutorId(match.tutor_id); onSelectTutor?.(match); },
    });

    if (mode === 'prompt' || mode === 'recommended') {
        const recGroups = chatSnapshot.groups || [];
        const recCount = recGroups.reduce((n, g) => n + g.matches.length, 0);
        return (
            <View style={{ backgroundColor: colors.bg, flex: 1 }}>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, compact && styles.containerCompact, { paddingBottom: 16 }]}
                    keyboardShouldPersistTaps="handled" scrollEnabled={mode === 'recommended'}>
                    <ModeSwitch mode={mode} onChange={switchMode} compact={compact} recommendedCount={recCount} />
                    <ChatInterface
                        hidden={mode !== 'prompt'}
                        compact={compact}
                        onSelectTutor={onSelectTutor}
                        onMessageTutor={onMessageTutor}
                        onRate={setRatingTarget}
                        onSnapshot={setChatSnapshot}
                    />
                    {mode === 'recommended' && (
                        <View style={cs.recWrap}>
                            {recCount === 0 ? (
                                <View style={cs.recEmpty}>
                                    <Sparkles size={28} color={colors.primary} />
                                    <Text style={cs.recEmptyTitle}>No recommendations yet</Text>
                                    <Text style={cs.recEmptyText}>Tell EduConnect AI what you need help with and your matched tutors will appear here.</Text>
                                    <Button label="Start chatting" icon={Sparkles} onPress={() => switchMode('prompt')} />
                                </View>
                            ) : recGroups.map(g => (
                                <View key={g.key} style={{ gap: 10 }}>
                                    <Text style={[cs.recHead, g.key === 'alternatives' && { color: colors.warning }]}>{g.title} · {g.matches.length}</Text>
                                    {g.matches.map(match => (
                                        <RecommendedCard key={match.tutor_id} match={match} profile={chatSnapshot.profile} compact={compact}
                                            isSelected={selectedTutorId === match.tutor_id}
                                            isExpanded={!!expanded[match.tutor_id]}
                                            onToggle={() => toggle(match.tutor_id)}
                                            onRate={() => setRatingTarget({ tutorId: match.tutor_id, tutorName: match.tutor_name })}
                                            onMessage={onMessageTutor ? () => onMessageTutor(match.tutor_id) : undefined}
                                            onSelect={() => { setSelectedTutorId(match.tutor_id); onSelectTutor?.(match); }} />
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>
                {ratingTarget && (
                    <TutorRatingModal visible tutorId={ratingTarget.tutorId} tutorName={ratingTarget.tutorName}
                        onClose={() => setRatingTarget(null)} onSubmit={() => setRatingTarget(null)} />
                )}
            </View>
        );
    }

    return (
        <ScrollView
            style={{ backgroundColor: colors.bg }}
            contentContainerStyle={[styles.container, compact && styles.containerCompact]}
            keyboardShouldPersistTaps="handled"
        >
            <ModeSwitch mode={mode} onChange={switchMode} compact={compact} />

            {/* ── Prompt composer ── */}
            {mode === 'prompt' && (
                <View style={s.composer}>
                    <Text style={s.composerTitle}>{requirements ? 'Add or change anything' : 'What do you need help with?'}</Text>
                    <Text style={s.composerSub}>Write it the way you’d explain it to a friend. We’ll find tutors who fit.</Text>

                    <View style={[s.inputWrap, focused && s.inputWrapFocused]}>
                        <TextInput
                            style={s.input}
                            value={prompt}
                            onChangeText={t => setPrompt(t.slice(0, PROMPT_MAX))}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            placeholder={requirements ? 'e.g. actually make it online, or my budget is Rs 700' : 'e.g. Form 5 Chemistry (Cambridge IGCSE), struggling with organic chemistry. Weekday evenings, online, around Rs 600/hr.'}
                            placeholderTextColor={colors.textSubtle}
                            multiline
                            maxLength={PROMPT_MAX}
                            accessibilityLabel="Describe what you need from a tutor"
                        />
                        {prompt.length > PROMPT_MAX * 0.8 && <Text style={s.count}>{prompt.length}/{PROMPT_MAX}</Text>}
                    </View>

                    <Ingredients text={prompt} requirements={requirements} />
                    <Text style={s.supportHint}>
                        You can also mention learning needs like ADHD or dyslexia. It’s only used for this search and isn’t saved.
                    </Text>

                    {!prompt && !requirements && (
                        <View style={s.examples}>
                            <Text style={s.examplesLead}>Or start from an example</Text>
                            <View style={s.exampleRow}>
                                {PROMPT_EXAMPLES.map(ex => (
                                    <TouchableOpacity key={ex.label} style={s.example} onPress={() => setPrompt(ex.text)}
                                        activeOpacity={0.8} accessibilityRole="button">
                                        <Text style={s.exampleText}>{ex.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={[s.composerFoot, compact && s.composerFootCompact]}>
                        {hasSurvey ? (
                            <TouchableOpacity style={s.check} onPress={() => setUseSurveyDefaults(v => !v)} activeOpacity={0.8}
                                accessibilityRole="checkbox" accessibilityState={{ checked: useSurveyDefaults }}>
                                <View style={[s.checkbox, useSurveyDefaults && s.checkboxOn]}>
                                    {useSurveyDefaults && <CheckCircle size={13} color="#fff" />}
                                </View>
                                <Text style={s.checkText}>Fill gaps from my survey</Text>
                            </TouchableOpacity>
                        ) : <View />}
                        <Button
                            label={loading ? 'Finding tutors…' : (requirements ? 'Update search' : 'Find my tutors')}
                            icon={Search}
                            loading={loading}
                            disabled={prompt.trim().length < 5}
                            onPress={() => findPromptMatches(prompt)}
                            style={[s.findBtn, compact && { alignSelf: 'stretch' }]}
                        />
                    </View>
                </View>
            )}

            {mode === 'prompt' && !loading && <Understood result={promptResult} />}

            {needsQuestion && !loading && (
                <View style={s.clarify}>
                    <AlertCircle size={16} color={colors.warning} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.clarifyText}>{result.question.text}</Text>
                        {mode === 'prompt' && result.question.options?.length > 0 && (
                            <View style={[s.exampleRow, { marginTop: 10 }]}>
                                {result.question.options.map(opt => (
                                    <TouchableOpacity key={opt} style={s.example} activeOpacity={0.8} accessibilityRole="button"
                                        onPress={() => findPromptMatches(opt, { answering: true })}>
                                        <Text style={s.exampleText}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                        {mode === 'prompt' && !result.question.options?.length && (
                            <Text style={[s.clarifyText, { marginTop: 6, fontStyle: 'italic' }]}>Type your answer in the box above.</Text>
                        )}
                        {mode === 'survey' && (
                            <TouchableOpacity onPress={() => switchMode('prompt')} style={{ marginTop: 8 }} accessibilityRole="button">
                                <Text style={s.errorRetry}>Describe what you need instead</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {mode === 'prompt' && requirements && !loading && (
                <TouchableOpacity onPress={startOver} style={{ alignSelf: 'flex-start', marginBottom: 10 }} accessibilityRole="button">
                    <Text style={s.errorRetry}>Start a new search</Text>
                </TouchableOpacity>
            )}

            {/* ── Survey summary ── */}
            {mode === 'survey' && (hasSurvey ? (
                <View style={s.surveyBar}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.surveyTitle}>Matching on your survey answers</Text>
                        <Text style={s.surveyLine} numberOfLines={2}>
                            {[subjects.slice(0, 3).join(', '), (LEVEL_LABELS[studentProfile?.academic_level] || cap(studentProfile?.skill_level)), cap(studentProfile?.available_time),
                            studentProfile?.learning_style ? `${cap(studentProfile.learning_style)} learner` : null]
                                .filter(v => v && v !== '—').join('  ·  ')}
                        </Text>
                    </View>
                    {onEditProfile && (
                        <TouchableOpacity onPress={onEditProfile} style={s.surveyEdit} accessibilityRole="button">
                            <Text style={s.surveyEditText}>Edit</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <EmptyState
                    icon={ClipboardList}
                    title="You haven’t taken the survey yet"
                    text="Answer a few questions about your subjects, level and schedule, or describe what you need in your own words instead."
                    action={
                        <View style={{ gap: 10 }}>
                            {onEditProfile && <Button label="Take the survey" onPress={onEditProfile} />}
                            <Button label="Describe what I need" variant="soft" icon={Sparkles} onPress={() => switchMode('prompt')} />
                        </View>
                    }
                />
            ))}

            {/* ── Loading / error ── */}
            {loading && <LoadingCard mode={mode} />}

            {error && !loading && (
                <View style={s.error}>
                    <AlertCircle size={18} color={colors.danger} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.errorText}>Couldn’t load matches. {error}</Text>
                        <TouchableOpacity onPress={refresh} style={{ marginTop: 6 }} accessibilityRole="button">
                            <Text style={s.errorRetry}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ── Results ── */}
            {!loading && showResults && !needsQuestion && matches.length > 0 && (
                <View style={{ marginTop: 6 }}>
                    <View style={s.resultsHead}>
                        <Text style={s.resultsTitle}>
                            {matches.length} tutor{matches.length !== 1 ? 's' : ''} found
                        </Text>
                        <View style={s.resultsTools}>
                            <TouchableOpacity onPress={() => setUseRL(v => !v)} style={s.toolBtn} accessibilityRole="switch"
                                accessibilityState={{ checked: useRL }}>
                                <Zap size={14} color={useRL ? colors.primary : colors.textMuted} />
                                <Text style={[s.toolText, !useRL && { color: colors.textMuted }]}>
                                    {useRL ? 'Learning from ratings' : 'Ratings ignored'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={refresh} style={s.toolBtn} accessibilityRole="button" accessibilityLabel="Refresh matches">
                                <RefreshCw size={14} color={colors.primary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {result?.notice && verifiedMatches.length === 0 && mode === 'survey' && (
                        <View style={styles.notice}>
                            <AlertCircle size={14} color={colors.warning} />
                            <Text style={styles.noticeText}>{result.notice}</Text>
                        </View>
                    )}

                    {verifiedMatches.length > 0 && <FeaturedMatch {...cardProps(verifiedMatches[0])} />}

                    {verifiedMatches.length > 1 && (
                        <>
                            <Text style={s.moreTitle}>Also a good fit</Text>
                            {verifiedMatches.slice(1).map((m, i) => (
                                <CompactMatch key={m.tutor_id} rank={i + 2} {...cardProps(m)} />
                            ))}
                        </>
                    )}

                    {unverifiedMatches.length > 0 && (
                        <>
                            <Text style={s.moreTitle}>
                                {verifiedMatches.length ? 'Not fully confirmed by their profile' : 'Possible matches (not fully confirmed)'}
                            </Text>
                            {unverifiedMatches.map((m, i) => (
                                <CompactMatch key={m.tutor_id} rank={verifiedMatches.length + i + 1} {...cardProps(m)} />
                            ))}
                        </>
                    )}
                </View>
            )}

            {!loading && showResults && !needsQuestion && matches.length === 0 && !error && (
                <EmptyState
                    icon={Users}
                    title={noMatch ? 'No tutor meets all your requirements' : 'No tutors to show yet'}
                    text={noMatch
                        ? 'We never relax your requirements silently. Here is what ruled tutors out:'
                        : (mode === 'prompt'
                            ? 'Tell us the subject and level and we’ll find tutors.'
                            : 'Add subjects in the survey, then refresh.')}
                    action={
                        <View style={{ gap: 8 }}>
                            {noMatch && (result?.suggestions || []).map((sg, i) => (
                                <Text key={i} style={s.clarifyText}>• {sg}</Text>
                            ))}
                            <Button label="Refresh" variant="soft" icon={RefreshCw} onPress={refresh} />
                        </View>
                    }
                />
            )}

            {ratingTarget && (
                <TutorRatingModal
                    visible
                    tutorId={ratingTarget.tutorId}
                    tutorName={ratingTarget.tutorName}
                    onClose={() => setRatingTarget(null)}
                    onSubmit={() => { setRatingTarget(null); refresh(); }}
                />
            )}
        </ScrollView>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 20, paddingBottom: 40 },
    containerCompact: { paddingHorizontal: 12, paddingTop: 12 },

    // Profile card
    profileTitle: { fontFamily: font, fontSize: 17, fontWeight: '700', color: colors.text },
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
    matchName: { fontFamily: font, fontSize: 17, fontWeight: '700', color: colors.text },
    matchSubRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
    matchLabel: { fontFamily: font, fontSize: 13, fontWeight: '700' },
    sessions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sessionsText: { fontFamily: font, fontSize: 13, color: colors.textMuted },

    metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 12, marginTop: 14, marginLeft: 56 },
    // Phones: three equal columns across the full card width
    metricsCompact: { marginLeft: 0, flexWrap: 'nowrap', justifyContent: 'space-between', columnGap: 8, backgroundColor: colors.tile, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
    metric: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
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

    // ── Mode switch (survey vs prompt) ─────────────────────────────────────────
    modeSwitch: {
        flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4, marginBottom: 14,
    },
    modeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.sm,
    },
    modeBtnActive: { backgroundColor: colors.primarySoft },
    modeBtnText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.textMuted, flexShrink: 1 },
    modeBtnTextActive: { color: colors.primary, fontWeight: '700' },

    // ── Prompt input ───────────────────────────────────────────────────────────
    promptIcon: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    promptInput: {
        fontFamily: font, fontSize: 15, color: colors.text, lineHeight: 22,
        borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
        backgroundColor: colors.tile, padding: 14, minHeight: 120, textAlignVertical: 'top',
    },
    promptMetaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
    promptCount: { fontFamily: font, fontSize: 12, color: colors.textSubtle },
    examplesLabel: { fontFamily: font, fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
    exampleChip: {
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
        paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, backgroundColor: colors.surface,
    },
    exampleText: { fontFamily: font, fontSize: 13, color: '#374151', lineHeight: 19 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    checkbox: {
        width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkText: { fontFamily: font, fontSize: 13, color: '#374151', flex: 1 },

    // ── What we understood ─────────────────────────────────────────────────────
    understoodHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    understoodTitle: { fontFamily: font, fontSize: 15, fontWeight: '700', color: colors.text },
    understoodSummary: { fontFamily: font, fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 10 },
    understoodGrid: { backgroundColor: colors.tile, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: 12 },
    understoodRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
    understoodLabel: { fontFamily: font, fontSize: 13, color: colors.textMuted, width: 104 },
    understoodValue: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.text },
    fromSurvey: {
        fontFamily: font, fontSize: 11, fontWeight: '600', color: colors.textMuted,
        backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
    },
    understoodSource: { fontFamily: font, fontSize: 12, color: colors.textSubtle, marginTop: 10 },

    // ── Match card additions ───────────────────────────────────────────────────
    reasonBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12,
        backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12,
    },
    reasonText: { fontFamily: font, fontSize: 13, color: colors.primaryDark, lineHeight: 19, flex: 1 },
    budgetTag: {
        flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warningSoft,
        borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2,
    },
    budgetTagText: { fontFamily: font, fontSize: 12, fontWeight: '600', color: colors.warning },
    adjustText: { fontFamily: font, fontSize: 12, color: colors.textMuted, marginTop: 12 },

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


// ─── Styles for the redesigned match screen ──────────────────────────────────

const s = StyleSheet.create({
    // Mode switch
    modeSwitch: {
        flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4, marginBottom: 16,
    },
    modeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        minHeight: 44, paddingHorizontal: 10, borderRadius: radius.pill,
    },
    modeBtnActive: { backgroundColor: colors.primarySoft },
    modeBtnText: { fontFamily: font, fontSize: 14, fontWeight: '600', color: colors.textMuted, flexShrink: 1 },
    modeBtnTextActive: { color: colors.primary, fontWeight: '700' },

    // Composer
    composer: {
        backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
        padding: 22, marginBottom: 14, ...shadow,
    },
    composerTitle: { fontFamily: font, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
    composerSub: { fontFamily: font, fontSize: 15, color: colors.textMuted, marginTop: 4, marginBottom: 16, lineHeight: 21 },
    inputWrap: {
        borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.tile,
    },
    inputWrapFocused: {
        borderColor: colors.primary, backgroundColor: colors.surface,
        ...Platform.select({ web: { boxShadow: `0 0 0 4px ${colors.primarySoft}` }, default: {} }),
    },
    input: {
        fontFamily: font, fontSize: 16, lineHeight: 24, color: colors.text,
        padding: 16, minHeight: 128, textAlignVertical: 'top',
        ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
    },
    count: { fontFamily: font, fontSize: 12, color: colors.textSubtle, alignSelf: 'flex-end', paddingRight: 12, paddingBottom: 8 },

    ingredients: { marginTop: 14 },
    ingredientsLead: { fontFamily: font, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    ingredientRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    ingredient: {
        flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    },
    ingredientOn: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
    ingredientDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borderStrong },
    ingredientText: { fontFamily: font, fontSize: 12, fontWeight: '600', color: colors.textMuted },
    ingredientTextOn: { color: colors.successText },

    supportHint: { fontFamily: font, fontSize: 12, color: colors.textSubtle, marginTop: 10, lineHeight: 17 },
    examples: { marginTop: 16 },
    examplesLead: { fontFamily: font, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    example: {
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
        backgroundColor: colors.primarySoft,
    },
    exampleText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.primaryDark },

    composerFoot: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        marginTop: 18, flexWrap: 'wrap',
    },
    composerFootCompact: { flexDirection: 'column', alignItems: 'stretch' },
    check: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44 },
    checkbox: {
        width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkText: { fontFamily: font, fontSize: 14, color: '#374151' },
    findBtn: { paddingHorizontal: 24, minHeight: 48 },

    // What we understood
    understood: {
        backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: 16, marginBottom: 14,
    },
    understoodHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
    understoodTitle: { fontFamily: font, fontSize: 15, fontWeight: '600', color: colors.primaryDark, flex: 1, lineHeight: 21 },
    understoodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    uChip: {
        backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7,
        borderWidth: 1, borderColor: colors.surface,
    },
    uChipSurvey: { borderStyle: 'dashed', borderColor: colors.primaryRing, backgroundColor: 'transparent' },
    uChipLabel: { fontFamily: font, fontSize: 11, color: colors.textMuted },
    uChipValue: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 1 },
    understoodNote: { fontFamily: font, fontSize: 12, color: colors.primaryDark, opacity: 0.75, marginTop: 12 },

    clarify: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.warningSoft,
        borderRadius: radius.lg, padding: 14, marginBottom: 14,
    },
    clarifyText: { fontFamily: font, fontSize: 14, color: '#92400E', flex: 1, lineHeight: 20 },

    // Survey summary
    surveyBar: {
        flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14,
    },
    surveyTitle: { fontFamily: font, fontSize: 15, fontWeight: '700', color: colors.text },
    surveyLine: { fontFamily: font, fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 19 },
    surveyEdit: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primarySoft },
    surveyEditText: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary },

    // Loading / error
    loading: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        paddingVertical: 22, marginBottom: 14,
    },
    loadingText: { fontFamily: font, fontSize: 14, color: colors.textMuted },
    error: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.dangerSoft,
        borderRadius: radius.lg, padding: 14, marginBottom: 14,
    },
    errorText: { fontFamily: font, fontSize: 14, color: colors.danger, lineHeight: 20 },
    errorRetry: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.danger, textDecorationLine: 'underline' },

    // Results header
    resultsHead: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        marginBottom: 12, flexWrap: 'wrap',
    },
    resultsTitle: { fontFamily: font, fontSize: 15, fontWeight: '700', color: colors.text },
    resultsTools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toolBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12,
        borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    toolText: { fontFamily: font, fontSize: 12, fontWeight: '600', color: colors.primary },

    // Featured (top) match
    featured: {
        backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.primaryRing,
        padding: 22, marginBottom: 18, ...shadow,
    },
    featuredKicker: { fontFamily: font, fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 14 },
    featuredTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    featuredName: { fontFamily: font, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
    featuredSub: { fontFamily: font, fontSize: 13, color: colors.textMuted, marginTop: 3 },
    featuredReason: { fontFamily: font, fontSize: 16, lineHeight: 24, color: '#1F2937', marginTop: 16 },

    subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
    subject: {
        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: radius.pill, backgroundColor: colors.tile,
    },
    subjectHit: { backgroundColor: colors.successSoft },
    subjectText: { fontFamily: font, fontSize: 12, fontWeight: '600', color: '#374151' },
    subjectTextHit: { color: colors.successText },

    factRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, marginTop: 14 },
    fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    factText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: '#374151' },

    scorePill: { alignItems: 'center', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7, minWidth: 76 },
    scoreValue: { fontFamily: font, fontSize: 18, fontWeight: '800' },
    scoreLabel: { fontFamily: font, fontSize: 11, fontWeight: '600', marginTop: 1 },

    cardSelected: { borderColor: colors.success, borderWidth: 2 },

    // Other matches
    moreTitle: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.textMuted, marginBottom: 10 },
    row: {
        backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        padding: 14, marginBottom: 10,
    },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowRank: { fontFamily: font, fontSize: 15, fontWeight: '800', color: colors.textSubtle, width: 18, textAlign: 'center' },
    rowTitleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
    rowName: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
    rowRate: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.textMuted },
    rowSupport: { fontFamily: font, fontSize: 12, fontWeight: '700', color: colors.successText, marginTop: 2 },
    rowReason: { fontFamily: font, fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: 3 },

    // Expanded details + actions
    details: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
    detailMetrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 12 },
    actions: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border,
    },
    actionsCompact: { flexDirection: 'column', alignItems: 'stretch' },
    actionLinks: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40 },
    linkBtnText: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.primary },
    actionButtons: { flexDirection: 'row', gap: 8 },
    btn: { paddingVertical: 10, paddingHorizontal: 18, flexGrow: 1 },
});

export default AITutorMatcher;