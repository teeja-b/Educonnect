// EduConnect — React Native / Expo
// Converted from Vite + Capacitor web app
import {
    AlertCircle,
    BookOpen,
    Brain,
    Calendar,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    GraduationCap,
    Home,
    Lock, LogOut,
    Menu,
    MessageSquare,
    Phone, PhoneOff,
    Search,
    Sparkles,
    TrendingUp,
    User,
    Users,
    Video,
    X,
    Zap
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, AppState, Modal, Platform, SafeAreaView,
    ScrollView,
    StatusBar, StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import 'react-native-get-random-values';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import io from 'socket.io-client';
import Notifications from "./notifications";

import {
    getActiveChatPartner, initializeFCM, isInCall, playRingtone, registerNotificationHandler, registerPushToken,
    setupNotificationChannels, showLocalNotification, stopRingtone,
} from './firebaseConfig';
import { API_URL } from './utils/config';
import { storage } from './utils/storage';
import {
    Avatar, Button, Card, CardHeader, EmptyState, InfoTile, PAGE_WIDTH, Pill, SectionDivider, Text, TileGrid, useCompact,
    colors, font, radius, shadow, ui,
} from './theme';
// ── Lazy-loaded screens (modal-style) ──────────────────────────────────────
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AITutorMatcher from './components/AITutorMatch';
import { EnhancedLoginModal, EnhancedRegisterModal } from './components/AuthModals';
import CourseMaterialsViewer from './components/CourseMaterialViewer';
import MessagingVideoChat from './components/MessagingVideoChat';
import PasswordResetPage from './components/PasswordResetPage';
import ProfileCompletionPrompt from './components/ProfileCompletionPrompt';
import StudentProfile from './components/StudentProfile';
import StudentSurvey from './components/StudentSurvey';
import TutorCourseManager from './components/TutorCourseManager';
import TutorMessagingView from './components/TutorMessagingView';
import TutorOnboarding from './components/TutorOnboarding';
import TutorProfile from './components/TutorProfile';

// ── Web width limit ─────────────────────────────────────────────────────────
// Content is capped at PAGE_WIDTH on the web so it doesn't stretch across
// wide screens. On phones these have no effect.
// Side padding that lines a full-width bar's contents up with the centred page.
const gutter = (inner = 16) =>
    Platform.OS === 'web'
        ? `max(${inner}px, calc((100% - ${PAGE_WIDTH}px) / 2 + ${inner}px))`
        : inner;

// ─── ROOT COMPONENT ──────────────────────────────────────────────────────────

const EduConnectApp = () => {
    useEffect(() => {
        // Wake up the server the moment app opens
        fetch(`${API_URL}/api/health`).catch(() => { });
    }, []);
    const insets = useSafeAreaInsets();
    const compact = useCompact();''
    console.log('API_URL in use:', API_URL);

    // ── Refs ────────────────────────────────────────────────────────────────
    const appSocketRef = useRef(null);
    const nativeCallActiveRef = useRef(false);
    const incomingCallRef = useRef(null);     // mirror of incomingCallData for socket handlers
    const currentViewRef = useRef('home');
    const myUserIdRef = useRef(null);
    const ringTimeoutRef = useRef(null);
    const toastTimerRef = useRef(null);
    const pendingAutoJoinRef = useRef(null);
    const [appSocket, setAppSocket] = useState(null);
    // ── State ────────────────────────────────────────────────────────────────
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userType, setUserType] = useState(null);
    const [currentView, setCurrentView] = useState('home');
    const [menuOpen, setMenuOpen] = useState(false);

    const [showLogin, setShowLogin] = useState(false);
    const [showRegister, setShowRegister] = useState(false);
    const [showSurvey, setShowSurvey] = useState(false);
    const [showTutorOnboarding, setShowTutorOnboarding] = useState(false);
    const [showStudentProfile, setShowStudentProfile] = useState(false);
    const [showTutorProfile, setShowTutorProfile] = useState(false);
    const [showCourseManager, setShowCourseManager] = useState(false);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [showProfileCompletionPrompt, setShowProfileCompletionPrompt] = useState(false);
    const [showAIMatcherModal, setShowAIMatcherModal] = useState(false);
    const [authToken, setAuthToken] = useState(null);
    const [incomingCallData, setIncomingCallData] = useState(null);
    const [openConversationId, setOpenConversationId] = useState(null);
    const [pendingAutoJoin, _setPendingAutoJoin] = useState(null);
    const setPendingAutoJoin = useCallback((data) => {
        pendingAutoJoinRef.current = data;
        _setPendingAutoJoin(data);
    }, []);

    const [selectedCourse, setSelectedCourse] = useState(null);
    const [courses, setCourses] = useState([]);
    const [tutors, setTutors] = useState([]);
    const [tutorStats, setTutorStats] = useState({ totalCourses: 0, totalStudents: 0, totalMessages: 0 });
    const [offlineCourses, setOfflineCourses] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiMatching, setAiMatching] = useState(false);
    const [matcherMode, setMatcherMode] = useState('survey'); // 'survey' | 'prompt'
    const [studentProfileForMatching, setStudentProfileForMatching] = useState(null);
    const [dashProfile, setDashProfile] = useState(null);   // student survey profile for the home card
    const [userName, setUserName] = useState('');
    const [toast, setToast] = useState(null);   // in-app notification banner

    useEffect(() => { incomingCallRef.current = incomingCallData; }, [incomingCallData]);
    useEffect(() => { currentViewRef.current = currentView; }, [currentView]);

    // Clears the incoming-call screen and stops ringing (answered, declined,
    // cancelled by the caller, or timed out).
    const clearIncomingCall = useCallback(() => {
        clearTimeout(ringTimeoutRef.current);
        stopRingtone();
        setIncomingCallData(null);
    }, []);

    const showToast = useCallback((t) => {
        clearTimeout(toastTimerRef.current);
        setToast(t);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
    }, []);

    // ── Load Inter on the web ────────────────────────────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        if (document.getElementById('inter-font')) return;
        const link = document.createElement('link');
        link.id = 'inter-font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
        document.head.appendChild(link);
    }, []);

    // ── Name + student profile for the home screen ───────────────────────────
    const loadDashProfile = useCallback(async () => {
        try {
            const u = await storage.getItem('user');
            const parsed = u ? JSON.parse(u) : null;
            setUserName(parsed?.full_name || (await storage.getItem('userName')) || '');
            if ((parsed?.user_type || (await storage.getItem('userType'))) !== 'student') return;
            const token = await storage.getItem('token');
            const res = await fetch(`${API_URL}/api/student/profile`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setDashProfile(data.profile || null);
        } catch (e) {
            console.log('Could not load profile for home:', e);
        }
    }, []);

    useEffect(() => {
        if (!isAuthenticated) { setDashProfile(null); setUserName(''); return; }
        loadDashProfile();
    }, [isAuthenticated, userType, loadDashProfile]);

    // ── Auth init from storage ───────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const token = await storage.getItem('token');
            const storedUserType = await storage.getItem('userType');
            const savedCourses = await storage.getJSON('offlineCourses');
            if (token && storedUserType) {
                setAuthToken(token);
                setIsAuthenticated(true);
                setUserType(storedUserType);
            }
            if (savedCourses) setOfflineCourses(savedCourses);
        })();
    }, []);
    useEffect(() => {
        registerNotificationHandler();
        setupNotificationChannels();
    }, []);

    // ── Foreground / background ──────────────────────────────────────────────
    // When the app goes to the background the socket is disconnected, so the
    // server immediately sees this user as offline and sends a PUSH for calls
    // and messages. Before, the socket looked connected for up to a minute
    // after closing the app; the server sent the call over that dead socket
    // instead of as a push, so nothing appeared on the phone.
    // (Kept connected during a call so the call isn't dropped.)
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const sub = AppState.addEventListener('change', (state) => {
            const socket = appSocketRef.current;
            if (state === 'background') {
                if (socket?.connected && !isInCall() && !incomingCallRef.current) {
                    console.log('🌙 App in background — disconnecting socket so calls arrive as push');
                    socket.disconnect();
                }
            } else if (state === 'active') {
                if (socket && !socket.connected) {
                    console.log('☀️ App active — reconnecting socket');
                    socket.connect();
                }
                if (isAuthenticated) registerPushToken();
            }
        });
        return () => sub?.remove?.();
    }, [isAuthenticated]);
    // ── FCM init ─────────────────────────────────────────────────────────────
    // Wrap this entire useEffect:
    useEffect(() => {
        if (!isAuthenticated) return;
        try {
            initializeFCM((notification) => {
                console.log('📨 FCM message:', notification);
            });
            // (Foreground pushes are shown by the notification handler in firebaseConfig.)
        } catch (e) {
            console.log('FCM not available:', e);
        }
    }, [isAuthenticated]);
    // ── Expo notification response handler (tap on push) ────────────────────
    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification.request.content.data || {};
            if (data.type === 'call') {
                stopRingtone();
                setPendingAutoJoin({
                    meetingId: data.meetingId,
                    joinUrl: data.joinUrl,
                    callerName: data.callerName,
                    callerUserId: data.callerId,
                    callerTutorProfileId: null,
                    callerStudentId: null,
                });
                setCurrentView('chat');
            } else if (data.type === 'message') {
                setOpenConversationId(data.conversationId);
                setCurrentView('chat');
            }
        });
        return () => sub?.remove?.();
    }, []);

    // ── Socket.IO for incoming calls ─────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated) return;

        let socketInstance = null;
        let cancelled = false;

        (async () => {
            const userStr = await storage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const userId = user?.id || Number(await storage.getItem('userId'));

            if (!userId || cancelled) return; // Don't connect if logged out mid-load

            myUserIdRef.current = String(userId);

            socketInstance = io(API_URL, {
                auth: { userId },
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                transports: ['polling'],
                // Add timeout to prevent premature close
                timeout: 10000,
            });

            appSocketRef.current = socketInstance;
            setAppSocket(socketInstance);
            socketInstance.on('connect', () => {
                console.log('✅ Socket connected:', socketInstance.id);
                setAppSocket(socketInstance);
            });

            socketInstance.on('connect_error', (err) => {
                console.log('⚠️ Socket connect error:', err.message);
            });

            socketInstance.on('incoming_video_call', (callData) => {
                if (nativeCallActiveRef.current) return;
                const callerName = callData.callerName || 'Unknown Caller';
                playRingtone(callerName);
                setIncomingCallData({
                    meetingId: callData.meetingId,
                    joinUrl: callData.joinUrl,
                    callerName,
                    callerUserId: callData.callerId,
                    callerTutorProfileId: callData.callerTutorProfileId || null,
                    callerStudentId: callData.callerStudentId || null,
                });

                // App in the background / tab hidden → system notification too
                if (AppState.currentState !== 'active' || (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden)) {
                    showLocalNotification({
                        title: 'Incoming voice call',
                        body: `${callerName} is calling you`,
                        channelId: 'calls',
                        data: { type: 'call', meetingId: callData.meetingId, callerName, callerId: callData.callerId, tag: callData.meetingId },
                    });
                }

                // Stop ringing if nobody answers
                clearTimeout(ringTimeoutRef.current);
                ringTimeoutRef.current = setTimeout(() => {
                    const cur = incomingCallRef.current;
                    if (cur && cur.meetingId === callData.meetingId) {
                        clearIncomingCall();
                        showToast({ kind: 'call', title: 'Missed call', body: `from ${callerName}` });
                    }
                }, 45_000);
            });

            // The caller hung up (or the call ended/was declined elsewhere) before
            // this person answered → stop ringing and close the incoming screen.
            const onCallGone = (data = {}) => {
                const cur = incomingCallRef.current;
                if (!cur) return;
                if (data.meetingId && data.meetingId !== cur.meetingId) return;
                console.log('📵 Incoming call cancelled by caller:', cur.meetingId);
                clearIncomingCall();
                showToast({ kind: 'call', title: 'Missed call', body: `from ${cur.callerName}` });
            };
            ['call_ended', 'call_cancelled', 'call_canceled', 'call_missed', 'video_call_ended'].forEach((ev) =>
                socketInstance.on(ev, onCallGone)
            );

            // New message → in-app banner (or a system notification when the app
            // is in the background), unless that chat is already open.
            const onMessage = (msg = {}) => {
                const senderId = String(msg.sender_id ?? msg.senderId ?? '');
                if (!senderId || senderId === myUserIdRef.current) return;
                const appActive = AppState.currentState === 'active' &&
                    !(Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden);
                if (appActive && currentViewRef.current === 'chat' && getActiveChatPartner() === senderId) return;

                const title = msg.sender_name || msg.senderName || 'New message';
                const body = (msg.text || msg.message || msg.content || '').slice(0, 140) || 'Sent you a message';
                const convId = msg.conversation_db_id ?? msg.conversationDbId ?? (typeof msg.conversation_id === 'number' ? msg.conversation_id : null);
                if (appActive) {
                    showToast({ kind: 'message', title, body, conversationId: convId });
                } else {
                    showLocalNotification({
                        title, body, channelId: 'messages',
                        data: { type: 'message', conversationId: convId },
                        onClick: () => { if (convId) setOpenConversationId(convId); setCurrentView('chat'); },
                    });
                }
            };
            // Different backend versions use different event names; a message is
            // only handled once per id.
            const seen = new Set();
            const onMessageOnce = (msg = {}) => {
                const id = msg.id ?? msg.messageId ?? msg.message_id;
                if (id != null) {
                    if (seen.has(String(id))) return;
                    seen.add(String(id));
                    if (seen.size > 200) seen.clear();
                }
                onMessage(msg);
            };
            ['receive_message', 'new_message', 'message_notification', 'new_message_notification'].forEach((ev) =>
                socketInstance.on(ev, onMessageOnce)
            );
        })();

        // Cleanup function prevents the "closed before established" error
        return () => {
            cancelled = true;
            if (socketInstance) {
                socketInstance.removeAllListeners();
                socketInstance.disconnect();
            }
            setAppSocket(null);
            appSocketRef.current = null;
        };
    }, [isAuthenticated]);

    // ── Fetch home stats ─────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [cRes, tRes] = await Promise.all([
                    fetch(`${API_URL}/api/courses`),
                    fetch(`${API_URL}/api/tutors`),
                ]);
                const cData = await cRes.json();
                const tData = await tRes.json();
                setCourses(cData.courses || []);
                setTutors(tData.tutors || []);
            } catch (e) {
                console.error('Failed to fetch home stats:', e);
            }
        })();
    }, []);

    // ── Tutor stats ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated || userType !== 'tutor') return;
        (async () => {
            try {
                const token = await storage.getItem('token');
                const res = await fetch(`${API_URL}/api/tutor/stats`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                setTutorStats({
                    totalCourses: data.totalCourses || 0,
                    totalStudents: data.totalStudents || 0,
                    totalMessages: data.totalMessages || 0,
                });
            } catch (e) {
                console.error('Error fetching tutor stats:', e);
            }
        })();
    }, [isAuthenticated, userType]);

    // ── Profile completion prompt ────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated || userType !== 'tutor') return;
        (async () => {
            const profileComplete = await storage.getItem('profileComplete');
            if (profileComplete !== 'true') {
                setTimeout(() => setShowProfileCompletionPrompt(true), 1000);
            }
        })();
    }, [isAuthenticated, userType]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    // Clears the session and returns to the home screen. Used by logout
    // and after an account is deleted.
    const clearSession = async () => {
        setMenuOpen(false);
        setIsAuthenticated(false);
        setUserType(null);
        setCurrentView('home');
        setIncomingCallData(null);
        setOpenConversationId(null);
        setPendingAutoJoin(null);

        if (appSocketRef.current) {
            appSocketRef.current.removeAllListeners();
            appSocketRef.current.disconnect();
            appSocketRef.current = null;
            setAppSocket(null);
        }

        try {
            await Promise.all([
                storage.removeItem('token'),
                storage.removeItem('userType'),
                storage.removeItem('user'),
                storage.removeItem('userId'),
                storage.removeItem('tutorProfileId'),
                storage.removeItem('profileComplete'),
                storage.removeItem('offlineCourses'),
            ]);
        } catch (e) {
            console.warn('Storage clear failed:', e);
        }
    };

    const handleLogout = async () => {
        const { Platform } = require('react-native');
        const doLogout = clearSession;

        if (Platform.OS === 'web') {
            if (window.confirm('Are you sure you want to log out?')) {
                await doLogout();
            }
        } else {
            Alert.alert('Log out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log out', style: 'destructive', onPress: doLogout },
            ]);
        }
    };

    // mode: 'survey' (ranked from survey answers) or 'prompt' (student describes
    // their needs in free text). Prompt mode doesn't require the survey.
    const handleAIMatching = async (mode = 'survey') => {
        if (!isAuthenticated) {
            Alert.alert('Login required', 'Please log in first to use AI matching!');
            setShowLogin(true);
            return;
        }
        setMatcherMode(mode);
        try {
            const token = await storage.getItem('token');
            const response = await fetch(`${API_URL}/api/student/profile`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                if (mode === 'prompt') {
                    setStudentProfileForMatching(null);
                    setShowAIMatcherModal(true);
                    return;
                }
                throw new Error('Failed to fetch profile');
            }
            const data = await response.json();
            if (!data.profile?.survey_completed && mode === 'prompt') {
                setStudentProfileForMatching(null);
                setShowAIMatcherModal(true);
                return;
            }
            if (!data.profile?.survey_completed) {
                Alert.alert('Survey required', 'Please complete your profile survey first!');
                setShowSurvey(true);
                return;
            }
            const safeParseJSON = (val, fb = []) => {
                if (!val) return fb;
                if (Array.isArray(val)) return val;
                try { return JSON.parse(val); } catch { return fb; }
            };
            const profile = data.profile;
            // In handleAIMatching, replace the studentProfile construction:
            const studentProfile = {
                preferred_subjects: safeParseJSON(profile.preferred_subjects, []),
                skill_level: profile.skill_level || 'intermediate',
                learning_style: profile.learning_style || 'visual',
                available_time: profile.available_time || 'evening',
                preferred_languages: safeParseJSON(profile.preferred_languages, ['English']),
                math_score: profile.math_score || 5,
                science_score: profile.science_score || 5,
                language_score: profile.language_score || 5,
                tech_score: profile.tech_score || 5,
                motivation_level: profile.motivation_level || 7,
                // ← ADD THESE TWO:
                tutor_gender_preference: profile.tutor_gender_preference || 'no_preference',
                selected_goals: safeParseJSON(profile.selected_goals, []),
                // Mauritian academic context (only sent if the survey has collected them)
                ...(profile.academic_level ? { academic_level: profile.academic_level } : {}),
                ...(profile.exam_board ? { exam_board: profile.exam_board } : {}),
                ...(profile.max_hourly_rate != null ? { max_hourly_rate: profile.max_hourly_rate, budget_currency: profile.budget_currency || 'MUR' } : {}),
            };
            if (studentProfile.preferred_subjects.length === 0 && mode !== 'prompt') {
                Alert.alert('No subjects', 'Please add at least one subject to your profile!');
                setShowSurvey(true);
                return;
            }
            setStudentProfileForMatching(studentProfile);
            setShowAIMatcherModal(true);
        } catch (error) {
            Alert.alert('Error', `Failed to load your profile: ${error.message}`);
            setShowSurvey(true);
        }
    };

    const handleEnroll = async (courseId) => {
        if (!isAuthenticated) {
            Alert.alert('Login required', 'Please log in to enroll!');
            setShowLogin(true);
            return;
        }
        try {
            const token = await storage.getItem('token');
            const response = await fetch(`${API_URL}/api/courses/${courseId}/enroll`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await response.json();
            if (response.ok) {
                Alert.alert('Enrolled!', 'Check "My Courses" to start learning.');
                setCurrentView('my-courses');
            } else {
                Alert.alert('Error', data.error || 'Enrollment failed');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to enroll. Please try again.');
        }
    };

    // ── NavBar ────────────────────────────────────────────────────────────────

    const NavBar = () => (
        <View style={[styles.navbar, { paddingTop: insets.top }]}>
            <View style={styles.navRow}>
                <TouchableOpacity style={styles.navLogo} onPress={() => { setCurrentView('home'); setMenuOpen(false); }}>
                    <View style={styles.logoMark}>
                        <GraduationCap size={18} color="#fff" strokeWidth={2.2} />
                    </View>
                    <Text style={styles.navTitle}>EduConnect</Text>
                </TouchableOpacity>

                <View style={styles.navActions}>
                    {!isAuthenticated ? (
                        <>
                            <TouchableOpacity style={styles.navGhostBtn} onPress={() => setShowLogin(true)}>
                                <Text style={styles.navGhostText}>Log in</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.navPrimaryBtn} onPress={() => setShowRegister(true)}>
                                <Text style={styles.navPrimaryText}>Sign up</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <View style={styles.rolePill}>
                                <View style={styles.greenDot} />
                                <Text style={styles.rolePillText} numberOfLines={1}>{userType || 'User'}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} style={styles.menuBtn}>
                                {menuOpen ? <X size={20} color={colors.text} /> : <Menu size={20} color={colors.text} />}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {menuOpen && isAuthenticated && (
                <View style={styles.dropdownWrap}>
                    <View style={styles.dropdown}>
                        <MenuItem icon={Home} label="Home" onPress={() => { setCurrentView('home'); setMenuOpen(false); }} />
                        {userType === 'student' && (
                            <>
                                <MenuItem icon={FileText} label="Courses" onPress={() => { setCurrentView('courses'); setMenuOpen(false); }} />
                                <MenuItem icon={BookOpen} label="My courses" onPress={() => { setCurrentView('my-courses'); setMenuOpen(false); }} />
                                <MenuItem icon={Sparkles} label="Find tutors" onPress={() => { setMenuOpen(false); handleAIMatching(); }} />
                            </>
                        )}
                        {userType === 'tutor' && (
                            <MenuItem icon={BookOpen} label="Manage courses" onPress={() => { setShowCourseManager(true); setMenuOpen(false); }} />
                        )}
                        <View style={styles.divider} />
                        <MenuItem icon={User} label="My profile" onPress={() => {
                            userType === 'student' ? setShowStudentProfile(true) : setShowTutorProfile(true);
                            setMenuOpen(false);
                        }} />
                        <MenuItem icon={Lock} label="Change password" onPress={() => { setShowPasswordReset(true); setMenuOpen(false); }} />
                        <MenuItem icon={LogOut} label="Log out" danger onPress={() => { setMenuOpen(false); handleLogout(); }} />
                    </View>
                </View>
            )}
        </View>
    );

    const MenuItem = ({ icon: Icon, label, onPress, danger }) => (
        <TouchableOpacity style={styles.menuItem} onPress={onPress}>
            <View style={[styles.menuIcon, danger && { backgroundColor: colors.dangerSoft }]}>
                <Icon size={17} color={danger ? colors.danger : colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.menuItemText, danger && { color: colors.danger }]}>{label}</Text>
        </TouchableOpacity>
    );

    // ── Bottom Tab Bar ────────────────────────────────────────────────────────

    const BottomTabBar = () => {
        if (!isAuthenticated) return null;
        const TabButton = ({ active, icon: Icon, label, onPress }) => (
            <TouchableOpacity style={styles.tabBtn} onPress={onPress}>
                <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
                    <Icon size={20} color={active ? colors.primary : colors.textSubtle} strokeWidth={active ? 2.3 : 1.9} />
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
        );
        const tab = (view, icon, label) => (
            <TabButton key={view} active={currentView === view} icon={icon} label={label} onPress={() => setCurrentView(view)} />
        );

        return (
            <View style={[styles.tabBar, { paddingBottom: insets.bottom + 6 }]}>
                {tab('home', Home, 'Home')}
                {userType === 'student' && (
                    <>
                        {tab('courses', FileText, 'Courses')}
                        {tab('my-courses', GraduationCap, 'My courses')}
                        {tab('chat', MessageSquare, 'Messages')}
                    </>
                )}
                {userType === 'tutor' && (
                    <>
                        <TabButton active={showCourseManager} icon={FileText} label="Manage" onPress={() => setShowCourseManager(true)} />
                        {tab('chat', MessageSquare, 'Messages')}
                    </>
                )}
            </View>
        );
    };

    // ── Incoming Call Modal ───────────────────────────────────────────────────
    // The accept button must:
    // 1. Emit call_accepted to the server (so the caller's VoiceCall socket listener fires)
    // 2. Set pendingAutoJoin (so the callee's VoiceCall gets autoJoinMeetingId and joins Agora)
    // 3. Switch to chat view

    const IncomingCallModal = () => {
        if (!incomingCallData) return null;
        return (
            <Modal transparent animationType="fade" visible>
                <View style={styles.overlay}>
                    <View style={styles.callCard}>
                        <View style={styles.callAvatarRing}>
                            <Avatar name={incomingCallData.callerName} size={72} />
                        </View>
                        <Pill icon={Video} label="Incoming call" tone="success" style={{ alignSelf: 'center', marginBottom: 10 }} />
                        <Text style={styles.callTitle}>{incomingCallData.callerName}</Text>
                        <Text style={styles.callSubtitle}>is calling you…</Text>
                        <View style={styles.callBtns}>
                            {/* ── DECLINE ── */}
                            <TouchableOpacity
                                style={[styles.callBtn, { backgroundColor: colors.danger }]}
                                onPress={() => {
                                    clearTimeout(ringTimeoutRef.current);
                                    stopRingtone();

                                    const { meetingId, joinUrl, callerName, callerUserId,
                                        callerTutorProfileId, callerStudentId } = incomingCallData;

                                    if (appSocketRef.current?.connected) {
                                        appSocketRef.current.emit('call_accepted', {
                                            meetingId,
                                            callerId: callerUserId,
                                            receiverId: null,
                                            acceptedBy: null,
                                        });
                                    }

                                    setIncomingCallData(null);

                                    setPendingAutoJoin({
                                        meetingId,
                                        joinUrl,
                                        callerName,
                                        callerUserId,
                                        callerTutorProfileId,
                                        callerStudentId,
                                    });

                                    setCurrentView('chat');
                                    setMenuOpen(false);
                                }}
                            >
                                <PhoneOff size={18} color="#fff" />
                                <Text style={styles.callBtnText}>Decline</Text>
                            </TouchableOpacity>

                            {/* ── ACCEPT ── */}
                            <TouchableOpacity
                                style={[styles.callBtn, { backgroundColor: colors.success }]}
                                onPress={() => {
                                    clearTimeout(ringTimeoutRef.current);
                                    stopRingtone();

                                    const { meetingId, joinUrl, callerName, callerUserId,
                                        callerTutorProfileId, callerStudentId } = incomingCallData;

                                    // 1. Tell the SERVER the call was accepted — this triggers
                                    //    the caller's socket 'call_accepted' listener in VoiceCall,
                                    //    which makes the caller join the Agora channel.
                                    if (appSocketRef.current?.connected) {
                                        appSocketRef.current.emit('call_accepted', {
                                            meetingId,
                                            callerId: callerUserId,
                                            receiverId: null,   // server will use socket auth userId
                                            acceptedBy: null,
                                        });
                                    }

                                    // 2. Clear the modal first
                                    setIncomingCallData(null);

                                    // 3. Pass meetingId down to the callee's VoiceCall via autoJoinMeetingId.
                                    setPendingAutoJoin({
                                        meetingId,
                                        joinUrl,
                                        callerName,
                                        callerUserId,
                                        callerTutorProfileId,
                                        callerStudentId,
                                    });

                                    // 4. Switch to chat view
                                    requestAnimationFrame(() => {
                                        setCurrentView('chat');
                                    });

                                    setMenuOpen(false);
                                }}
                            >
                                <Phone size={18} color="#fff" />
                                <Text style={styles.callBtnText}>Accept</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    // ── Home View ─────────────────────────────────────────────────────────────

    const ChoiceCard = ({ icon: Icon, title, text, tint, onPress }) => (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
            <Card style={styles.choiceCard}>
                <View style={[styles.choiceIcon, { backgroundColor: tint }]}>
                    <Icon size={22} color="#fff" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={ui.h3}>{title}</Text>
                    <Text style={[ui.muted, { marginTop: 2 }]}>{text}</Text>
                </View>
                <ChevronRight size={20} color={colors.textSubtle} />
            </Card>
        </TouchableOpacity>
    );

    const WelcomeScreen = () => (
        <ScrollView contentContainerStyle={[styles.padded, compact && styles.paddedCompact]}>
            <Card style={styles.heroCard}>
                <View style={styles.heroMark}>
                    <GraduationCap size={30} color="#fff" strokeWidth={2} />
                </View>
                <Text style={styles.heroTitle}>Learn with the right tutor</Text>
                <Text style={styles.heroSub}>
                    EduConnect matches students with tutors by subject, learning style and schedule.
                </Text>
                <Pill icon={Zap} label="Smart matching" style={{ alignSelf: 'center', marginTop: 14 }} />
            </Card>
            <SectionDivider label="Get started" />
            <ChoiceCard icon={BookOpen} title="I'm a student" text="Find courses and tutors that fit you" tint={colors.primary} onPress={() => setUserType('student')} />
            <ChoiceCard icon={Users} title="I'm a tutor" text="Share what you know and teach students" tint={colors.success} onPress={() => setUserType('tutor')} />
        </ScrollView>
    );

    const cap = (v) => {
        if (v === null || v === undefined || v === '') return '—';
        const s = String(v).replace(/_/g, ' ');
        return s.charAt(0).toUpperCase() + s.slice(1);
    };
    const asList = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
    };

    const StudentProfileCard = () => {
        const p = dashProfile;
        const surveyDone = !!p?.survey_completed;
        const subjects = asList(p?.preferred_subjects);
        return (
            <Card>
                <CardHeader
                    leading={
                        <Avatar name={userName || 'Student'} size={compact ? 40 : 46} />
                    }
                    text={
                        <>
                            <Text style={styles.profileTitle}>{userName ? userName : 'Your profile'}</Text>
                            <Text style={styles.profileSub}>
                                Student{p?.skill_level ? ` · ${cap(p.skill_level)}` : ''}
                            </Text>
                        </>
                    }
                    trailing={surveyDone && <Pill icon={Zap} label="Smart matching" />}
                />

                {surveyDone ? (
                    <TileGrid>
                        <InfoTile icon={BookOpen} label="Subjects" value={subjects.length ? subjects.slice(0, 3).join(' · ') : '—'} />
                        <InfoTile icon={TrendingUp} label="Level" value={cap(p.skill_level)} />
                        <InfoTile icon={Calendar} label="Availability" value={cap(p.available_time)} />
                        <InfoTile icon={Brain} label="Learning preference" value={cap(p.learning_style)} />
                    </TileGrid>
                ) : (
                    <View style={styles.surveyPrompt}>
                        <Text style={ui.body}>
                            Answer a short survey about your subjects, level and schedule so we can match you with tutors.
                        </Text>
                        <Button label="Complete survey" onPress={() => setShowSurvey(true)} style={{ marginTop: 14 }} />
                    </View>
                )}
                {surveyDone && (
                    <TouchableOpacity onPress={() => setShowSurvey(true)} style={styles.editLink}>
                        <Text style={styles.editLinkText}>Update survey answers</Text>
                    </TouchableOpacity>
                )}
            </Card>
        );
    };

    const StatTile = ({ icon: Icon, label, value }) => (
        <View style={styles.statTile}>
            <View style={styles.statIcon}><Icon size={18} color={colors.primary} strokeWidth={2} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
            </View>
        </View>
    );

    const LoggedInDashboard = () => (
        <ScrollView contentContainerStyle={[styles.padded, compact && styles.paddedCompact]}>
            {userType === 'student' ? (
                <>
                    <StudentProfileCard />

                    <SectionDivider label="Your learning" />

                    <Card highlighted>
                        <View style={styles.actionRow}>
                            <View style={[styles.actionIcon, { backgroundColor: colors.success }]}>
                                <Sparkles size={20} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={ui.h3}>Find your tutor matches</Text>
                                <Text style={[ui.muted, { marginTop: 2 }]}>
                                    Use your survey answers, or describe what you need in your own words.
                                </Text>
                            </View>
                        </View>
                        <View style={[styles.matchBtnRow, compact && { flexDirection: 'column' }]}>
                            <Button
                                label={aiMatching ? 'Finding matches…' : 'See my matches'}
                                icon={Zap}
                                loading={aiMatching}
                                onPress={() => handleAIMatching('survey')}
                                style={{ flex: compact ? undefined : 1 }}
                            />
                            <Button
                                label="Describe what you need"
                                icon={Sparkles}
                                variant="soft"
                                onPress={() => handleAIMatching('prompt')}
                                style={{ flex: compact ? undefined : 1 }}
                            />
                        </View>
                    </Card>

                    <View style={styles.statRow}>
                        <StatTile icon={BookOpen} label="Courses" value={courses.length} />
                        <StatTile icon={Users} label="Tutors" value={tutors.length} />
                    </View>

                    <Card>
                        <TouchableOpacity style={styles.linkRow} onPress={() => setCurrentView('courses')}>
                            <FileText size={18} color={colors.primary} />
                            <Text style={styles.linkRowText}>Browse courses</Text>
                            <ChevronRight size={18} color={colors.textSubtle} />
                        </TouchableOpacity>
                        <View style={styles.hairline} />
                        <TouchableOpacity style={styles.linkRow} onPress={() => setCurrentView('my-courses')}>
                            <GraduationCap size={18} color={colors.primary} />
                            <Text style={styles.linkRowText}>Continue my courses</Text>
                            <ChevronRight size={18} color={colors.textSubtle} />
                        </TouchableOpacity>
                    </Card>
                </>
            ) : (
                <>
                    <Card>
                        <CardHeader
                            leading={
                                <Avatar name={userName || 'Tutor'} size={compact ? 40 : 46} color={colors.success} />
                            }
                            text={
                                <>
                                    <Text style={styles.profileTitle}>{userName || 'Your profile'}</Text>
                                    <Text style={styles.profileSub}>Tutor</Text>
                                </>
                            }
                            trailing={<Pill icon={User} label="Edit profile" onPress={() => setShowTutorProfile(true)} />}
                        />
                        <TileGrid>
                            <InfoTile icon={BookOpen} label="Courses" value={String(tutorStats.totalCourses)} />
                            <InfoTile icon={Users} label="Students" value={String(tutorStats.totalStudents)} />
                            <InfoTile icon={MessageSquare} label="Messages" value={String(tutorStats.totalMessages)} />
                            <InfoTile icon={Sparkles} label="Matching" value="Active" />
                        </TileGrid>
                    </Card>

                    <SectionDivider label="Your teaching" />

                    <Card>
                        <TouchableOpacity style={styles.linkRow} onPress={() => setShowCourseManager(true)}>
                            <FileText size={18} color={colors.primary} />
                            <Text style={styles.linkRowText}>Manage courses</Text>
                            <ChevronRight size={18} color={colors.textSubtle} />
                        </TouchableOpacity>
                        <View style={styles.hairline} />
                        <TouchableOpacity style={styles.linkRow} onPress={() => setCurrentView('chat')}>
                            <MessageSquare size={18} color={colors.primary} />
                            <Text style={styles.linkRowText}>Messages and calls</Text>
                            <ChevronRight size={18} color={colors.textSubtle} />
                        </TouchableOpacity>
                    </Card>
                </>
            )}
        </ScrollView>
    );

    const HomeView = () => {
        if (isAuthenticated) return <LoggedInDashboard />;
        if (!userType) return <WelcomeScreen />;
        const isStudent = userType === 'student';
        const features = isStudent
            ? [
                { icon: Sparkles, label: 'Matching', value: 'Tutors ranked for you' },
                { icon: Video, label: 'Sessions', value: 'Chat and voice calls' },
                { icon: BookOpen, label: 'Courses', value: 'Materials in one place' },
                { icon: Calendar, label: 'Schedule', value: 'Learn when it suits you' },
            ]
            : [
                { icon: Users, label: 'Students', value: 'Matched to your subjects' },
                { icon: FileText, label: 'Courses', value: 'Publish your own' },
                { icon: MessageSquare, label: 'Sessions', value: 'Chat and voice calls' },
                { icon: Calendar, label: 'Schedule', value: 'Set your availability' },
            ];
        return (
            <ScrollView contentContainerStyle={[styles.padded, compact && styles.paddedCompact]}>
                <TouchableOpacity onPress={() => setUserType(null)} style={styles.backRow}>
                    <ChevronLeft size={18} color={colors.textMuted} />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Card>
                    <CardHeader
                        leading={
                            <View style={[styles.actionIcon, { backgroundColor: isStudent ? colors.primary : colors.success }]}>
                                {isStudent ? <GraduationCap size={22} color="#fff" /> : <Users size={22} color="#fff" />}
                            </View>
                        }
                        text={
                            <>
                                <Text style={styles.profileTitle}>{isStudent ? 'Learn at your pace' : 'Teach what you know'}</Text>
                                <Text style={styles.profileSub}>
                                    {isStudent ? 'Tutoring matched to how you learn' : 'Reach students who need your subjects'}
                                </Text>
                            </>
                        }
                    />
                    <TileGrid>
                        {features.map((f) => <InfoTile key={f.label} icon={f.icon} label={f.label} value={f.value} />)}
                    </TileGrid>
                </Card>
                <Button
                    label={isStudent ? 'Create student account' : 'Create tutor account'}
                    variant={isStudent ? 'primary' : 'success'}
                    onPress={() => setShowRegister(true)}
                />
                <Button label="I already have an account" variant="outline" onPress={() => setShowLogin(true)} style={{ marginTop: 10 }} />
            </ScrollView>
        );
    };

    // ── Courses View ──────────────────────────────────────────────────────────

    const CoursesView = () => {
        const [allCourses, setAllCourses] = useState([]);
        const [loading, setLoading] = useState(true);
        const [query, setQuery] = useState('');

        useEffect(() => {
            fetch(`${API_URL}/api/courses`)
                .then((r) => r.json())
                .then((d) => setAllCourses(d.courses || []))
                .catch(console.error)
                .finally(() => setLoading(false));
        }, []);

        if (loading) return <LoadingSpinner />;

        const filtered = allCourses.filter((c) =>
            (c.title || '').toLowerCase().includes(query.toLowerCase())
        );

        return (
            <ScrollView contentContainerStyle={[styles.padded, compact && styles.paddedCompact]}>
                <Text style={styles.pageTitle}>Courses</Text>
                <Text style={styles.pageSub}>{allCourses.length} available</Text>
                <View style={styles.searchRow}>
                    <Search size={18} color={colors.textSubtle} />
                    <TextInput
                        maxFontSizeMultiplier={1}
                        style={styles.searchInput}
                        placeholder="Search courses"
                        placeholderTextColor={colors.textSubtle}
                        value={query}
                        onChangeText={setQuery}
                    />
                </View>
                {filtered.map((course) => (
                    <TouchableOpacity
                        key={course.id}
                        activeOpacity={0.85}
                        onPress={() => { setSelectedCourse(course); setCurrentView('course-detail'); }}
                    >
                        <Card>
                            <Text style={styles.courseTitle}>{course.title}</Text>
                            <Text style={styles.courseSub}>by {course.tutor_name || 'Unknown'}</Text>
                            <View style={styles.metaRow}>
                                {course.level ? <Meta icon={TrendingUp} text={cap(course.level)} /> : null}
                                {course.duration ? <Meta icon={Clock} text={course.duration} /> : null}
                                <Meta icon={Users} text={`${course.total_students || 0} students`} />
                            </View>
                            <Text style={styles.courseDesc} numberOfLines={3}>
                                {course.description || course.overview || 'No description yet.'}
                            </Text>
                            <View style={styles.cardFooter}>
                                <Text style={styles.cardFooterText}>View course</Text>
                                <ChevronRight size={16} color={colors.primary} />
                            </View>
                        </Card>
                    </TouchableOpacity>
                ))}
                {filtered.length === 0 && (
                    <EmptyState
                        icon={BookOpen}
                        title={query ? 'No courses match your search' : 'No courses yet'}
                        text={query ? 'Try a different word.' : 'New courses appear here as tutors publish them.'}
                    />
                )}
            </ScrollView>
        );
    };

    // ── Course Detail View ────────────────────────────────────────────────────

    const CourseDetailView = () => {
        const [courseDetails, setCourseDetails] = useState(null);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
            if (!selectedCourse?.id) return;
            fetch(`${API_URL}/api/courses/${selectedCourse.id}`)
                .then((r) => r.json())
                .then((d) => setCourseDetails(d.course))
                .catch(console.error)
                .finally(() => setLoading(false));
        }, []);

        if (loading) return <LoadingSpinner />;
        if (!courseDetails) {
            return (
                <View style={styles.padded}>
                    <TouchableOpacity onPress={() => setCurrentView('courses')} style={styles.backRow}>
                        <ChevronLeft size={18} color={colors.textMuted} />
                        <Text style={styles.backText}>Courses</Text>
                    </TouchableOpacity>
                    <EmptyState icon={AlertCircle} title="Course not found" text="It may have been removed by the tutor." />
                </View>
            );
        }

        const safeParseArr = (val) => { try { return JSON.parse(val || '[]'); } catch { return []; } };
        const learningOutcomes = safeParseArr(courseDetails.learning_outcomes);
        const prerequisites = safeParseArr(courseDetails.prerequisites);

        return (
            <ScrollView contentContainerStyle={[styles.padded, compact && styles.paddedCompact]}>
                <TouchableOpacity onPress={() => setCurrentView('courses')} style={styles.backRow}>
                    <ChevronLeft size={18} color={colors.textMuted} />
                    <Text style={styles.backText}>Courses</Text>
                </TouchableOpacity>
                <Card>
                    <CardHeader
                        leading={
                            <View style={[styles.actionIcon, { backgroundColor: colors.primary }]}>
                                <BookOpen size={20} color="#fff" />
                            </View>
                        }
                        text={
                            <>
                                <Text style={styles.profileTitle}>{courseDetails.title}</Text>
                                <Text style={styles.profileSub}>by {courseDetails.tutor_name}</Text>
                            </>
                        }
                        trailing={courseDetails.category ? <Pill label={courseDetails.category} /> : null}
                    />
                    <TileGrid>
                        <InfoTile icon={TrendingUp} label="Level" value={cap(courseDetails.level)} />
                        <InfoTile icon={Clock} label="Duration" value={courseDetails.duration || '—'} />
                        <InfoTile icon={Users} label="Students" value={String(courseDetails.total_students || 0)} />
                        {courseDetails.price !== undefined && (
                            <InfoTile icon={Zap} label="Price" value={courseDetails.price === 0 ? 'Free' : `Rs ${Number(courseDetails.price).toLocaleString('en-US')}`} />
                        )}
                    </TileGrid>
                </Card>
                {courseDetails.description ? (
                    <Card>
                        <Text style={styles.sectionTitle}>About this course</Text>
                        <Text style={ui.body}>{courseDetails.description}</Text>
                    </Card>
                ) : null}
                {learningOutcomes.length > 0 && (
                    <Card>
                        <Text style={styles.sectionTitle}>What you'll learn</Text>
                        {learningOutcomes.map((o, i) => (
                            <View key={i} style={styles.checkRow}>
                                <CheckCircle size={17} color={colors.success} />
                                <Text style={[ui.body, { flex: 1 }]}>{o}</Text>
                            </View>
                        ))}
                    </Card>
                )}
                {prerequisites.length > 0 && (
                    <Card>
                        <Text style={styles.sectionTitle}>Before you start</Text>
                        {prerequisites.map((p, i) => (
                            <View key={i} style={styles.checkRow}>
                                <AlertCircle size={17} color={colors.primary} />
                                <Text style={[ui.body, { flex: 1 }]}>{p}</Text>
                            </View>
                        ))}
                    </Card>
                )}
                <Button label="Enroll in course" onPress={() => handleEnroll(courseDetails.id)} />
            </ScrollView>
        );
    };

    // ── My Courses View ───────────────────────────────────────────────────────

    const MyCoursesView = () => {
        const [enrolledCourses, setEnrolledCourses] = useState([]);
        const [loading, setLoading] = useState(true);
        const [viewingMaterials, setViewingMaterials] = useState(null);

        useEffect(() => {
            (async () => {
                try {
                    const token = await storage.getItem('token');
                    const res = await fetch(`${API_URL}/api/student/enrollments`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const data = await res.json();
                    setEnrolledCourses(data.enrollments || []);
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoading(false);
                }
            })();
        }, []);

        if (loading) return <LoadingSpinner />;
        if (viewingMaterials) {
            return <CourseMaterialsViewer course={viewingMaterials} onClose={() => setViewingMaterials(null)} API_URL={API_URL} />;
        }

        return (
            <ScrollView contentContainerStyle={[styles.padded, compact && styles.paddedCompact]}>
                <Text style={styles.pageTitle}>My courses</Text>
                <Text style={styles.pageSub}>
                    {enrolledCourses.length} enrolled
                </Text>
                {enrolledCourses.length === 0 ? (
                    <EmptyState
                        icon={GraduationCap}
                        title="You're not enrolled in any courses"
                        text="Pick a course to start learning. It will show up here."
                        action={<Button label="Browse courses" onPress={() => setCurrentView('courses')} />}
                    />
                ) : (
                    enrolledCourses.map((e) => (
                        <Card key={e.id}>
                            <CardHeader
                                leading={
                                    <View style={[styles.actionIcon, { backgroundColor: e.completed ? colors.success : colors.primary }]}>
                                        <BookOpen size={20} color="#fff" />
                                    </View>
                                }
                                text={
                                    <>
                                        <Text style={styles.courseTitle}>{e.course_title}</Text>
                                        <Text style={styles.courseSub}>by {e.tutor_name}</Text>
                                    </>
                                }
                                trailing={e.completed ? <Pill icon={CheckCircle} label="Completed" tone="success" /> : <Pill label="In progress" />}
                            />
                            <Button label="Open materials" variant="soft" icon={FileText} onPress={() => setViewingMaterials(e)} />
                        </Card>
                    ))
                )}
            </ScrollView>
        );
    };

    // ── Main Render ───────────────────────────────────────────────────────────

    const renderView = () => {
        if (!isAuthenticated) return <HomeView />;
        switch (currentView) {
            case 'home': return <HomeView />;
            case 'courses': return <CoursesView />;
            case 'course-detail': return <CourseDetailView />;
            case 'my-courses': return <MyCoursesView />;

            default: return <HomeView />;
        }
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            <NavBar />
            <View style={styles.content}>

                {isAuthenticated && currentView === 'chat' && (
                    <ChatView
                        key={pendingAutoJoin?.meetingId || 'chat'}
                        appSocket={appSocket}
                        openConversationId={openConversationId}
                        pendingAutoJoin={pendingAutoJoin}
                        onConversationOpened={() => setOpenConversationId(null)}
                        onCallEnded={() => {
                            setPendingAutoJoin(null);
                            setIncomingCallData(null);
                        }}
                    />
                )}

                {/* All other views */}
                <View style={{ display: currentView !== 'chat' ? 'flex' : 'none', flex: 1 }}>
                    {renderView()}
                </View>

            </View>
            <BottomTabBar />

            {/* Global incoming call modal */}
            <IncomingCallModal />

            {/* In-app notification banner (new messages, missed calls) */}
            {toast && (
                <View pointerEvents="box-none" style={[styles.toastWrap, { top: insets.top + 64 }]}>
                    <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.toast}
                        onPress={() => {
                            if (toast.kind === 'message') {
                                if (toast.conversationId) setOpenConversationId(toast.conversationId);
                                setCurrentView('chat');
                            }
                            setToast(null);
                        }}
                    >
                        <View style={[styles.toastIcon, toast.kind === 'call' && { backgroundColor: colors.dangerSoft }]}>
                            {toast.kind === 'call'
                                ? <PhoneOff size={18} color={colors.danger} />
                                : <MessageSquare size={18} color={colors.primary} />}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.toastTitle} numberOfLines={1}>{toast.title}</Text>
                            <Text style={styles.toastBody} numberOfLines={2}>{toast.body}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setToast(null)} hitSlop={10}>
                            <X size={16} color={colors.textSubtle} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── Modal screens ──────────────────────────────── */}
            {showLogin && (
                <EnhancedLoginModal
                    onClose={() => setShowLogin(false)}
                    onSuccess={async (data) => {
                        await storage.setItem('token', data.token);
                        await storage.setItem('userType', data.user.user_type);
                        await storage.setJSON('user', data.user);
                        if (data.user.id) await storage.setItem('userId', String(data.user.id));
                        if (data.user.tutor_profile_id) await storage.setItem('tutorProfileId', String(data.user.tutor_profile_id));
                        setAuthToken(data.token);
                        setIsAuthenticated(true);
                        setUserType(data.user.user_type);
                        setShowLogin(false);
                    }}
                />
            )}
            {showRegister && (
                <EnhancedRegisterModal
                    onClose={() => setShowRegister(false)}
                    onSuccess={async (data) => {
                        await storage.setItem('token', data.token);
                        await storage.setItem('userType', data.user.user_type);
                        await storage.setJSON('user', data.user);
                        if (data.user.id) await storage.setItem('userId', String(data.user.id));
                        setAuthToken(data.token);
                        setIsAuthenticated(true);
                        setUserType(data.user.user_type);
                        setShowRegister(false);
                    }}
                />
            )}
            {showSurvey && (
                <StudentSurvey
                    onClose={() => setShowSurvey(false)}
                    onComplete={() => {
                        setShowSurvey(false);
                        loadDashProfile();
                        Alert.alert('Done!', 'Survey completed! You can now use AI matching.');
                    }}
                />
            )}
            {showTutorOnboarding && (
                <TutorOnboarding
                    onComplete={async (profileData) => {
                        await storage.setItem('profileComplete', 'true');
                        if (profileData?.tutor_profile_id) await storage.setItem('tutorProfileId', String(profileData.tutor_profile_id));
                        setShowTutorOnboarding(false);
                        Alert.alert('Done!', 'Profile setup complete! You can now be matched with students.');
                    }}
                    onSkip={() => {
                        setShowTutorOnboarding(false);
                        Alert.alert('Warning', 'You need to complete your profile to receive messages from students.');
                    }}
                />
            )}
            {showProfileCompletionPrompt && (
                <ProfileCompletionPrompt
                    onComplete={() => { setShowTutorProfile(true); setShowProfileCompletionPrompt(false); }}
                    onDismiss={() => setShowProfileCompletionPrompt(false)}
                />
            )}
            {showPasswordReset && <PasswordResetPage onClose={() => setShowPasswordReset(false)} />}
            {showStudentProfile && <StudentProfile onClose={() => setShowStudentProfile(false)} onAccountDeleted={() => { setShowStudentProfile(false); clearSession(); }} />}
            {showTutorProfile && <TutorProfile onClose={() => setShowTutorProfile(false)} token={authToken} onAccountDeleted={() => { setShowTutorProfile(false); clearSession(); }} />}
            {showCourseManager && <TutorCourseManager onClose={() => setShowCourseManager(false)} />}
            {showAIMatcherModal && (studentProfileForMatching || matcherMode === 'prompt') && (
                <Modal visible animationType="slide" statusBarTranslucent>
                    <SafeAreaView style={{
                        flex: 1, backgroundColor: colors.bg,
                        paddingTop: Platform.OS === 'android' ? insets.top : 0,
                        paddingBottom: Platform.OS === 'android' ? insets.bottom : 0,
                    }}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Tutor matches</Text>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => { setShowAIMatcherModal(false); setStudentProfileForMatching(null); }}
                            >
                                <X size={18} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <AITutorMatcher
                            studentProfile={studentProfileForMatching}
                            studentName={userName}
                            initialMode={matcherMode}
                            onEditProfile={() => {
                                setShowAIMatcherModal(false);
                                setStudentProfileForMatching(null);
                                setShowSurvey(true);
                            }}
                            onSelectTutor={(match) => {
                                Alert.alert(
                                    'Match found!',
                                    `You can now chat with ${match.tutor_name}. They're a ${match.match_score}% match!`,
                                    [{
                                        text: 'Start chatting',
                                        onPress: () => {
                                            setShowAIMatcherModal(false);
                                            setStudentProfileForMatching(null);
                                            setCurrentView('chat');
                                        }
                                    }]
                                );
                            }}
                        />
                    </SafeAreaView>
                </Modal>
            )}
        </View>
    );
};

// Defined at module level (not inside EduConnectApp) on purpose: a component
// declared inside another component is a brand-new type on every parent
// render, so React unmounted and remounted the whole chat — including
// VoiceCall — each time the app re-rendered. That tore down the Agora engine
// in the middle of accepting a call ("Cannot read property 'joinChannel' of null").
// ── Chat View (Student or Tutor) ──────────────────────────────────────────

const ChatView = ({ appSocket, openConversationId, pendingAutoJoin, onConversationOpened, onCallEnded }) => {
    const [userData, setUserData] = useState(null);
    const [token, setToken] = useState(null);

    useEffect(() => {
        (async () => {
            const userStr = await storage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const userId = user?.id || Number(await storage.getItem('userId'));
            const userName = user?.full_name || (await storage.getItem('userName')) || 'User';
            const uType = user?.user_type || (await storage.getItem('userType'));
            const tutorProfileId = user?.tutor_profile_id || Number(await storage.getItem('tutorProfileId')) || null;
            const authToken = await storage.getItem('token');
            setToken(authToken);
            setUserData({ userId, userName, uType, tutorProfileId });
        })();
    }, []);

    if (!userData) return <LoadingSpinner />;
    const autoJoin = pendingAutoJoin;

    if (userData.uType === 'student') {
        return (
            <MessagingVideoChat
                appSocket={appSocket}
                currentUserId={String(userData.userId)}
                openConversationId={openConversationId}
                onConversationOpened={onConversationOpened}
                autoJoinMeetingId={autoJoin?.meetingId || null}
                autoJoinUrl={autoJoin?.joinUrl || null}
                callerName={autoJoin?.callerName || null}
                callerTutorProfileId={autoJoin?.callerTutorProfileId || null}
                onCallEnded={onCallEnded}
                authToken={token}
            />
        );
    }
    return (
        <TutorMessagingView
            appSocket={appSocket}
            currentTutorUserId={String(userData.userId)}
            tutorProfileId={userData.tutorProfileId}
            tutorName={userData.userName}
            openConversationId={openConversationId}
            onConversationOpened={onConversationOpened}
            autoJoinMeetingId={autoJoin?.meetingId || null}
            autoJoinUrl={autoJoin?.joinUrl || null}
            callerName={autoJoin?.callerName || null}
            callerStudentId={autoJoin?.callerStudentId || null}
            onCallEnded={onCallEnded}
            authToken={token}
        />
    );
};

// ── Shared small components ───────────────────────────────────────────────────

const LoadingSpinner = () => (
    <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[ui.muted, { marginTop: 10 }]}>Loading…</Text>
    </View>
);

const Meta = ({ icon: Icon, text }) => (
    <View style={styles.meta}>
        <Icon size={14} color={colors.primary} strokeWidth={2} />
        <Text style={styles.metaText}>{text}</Text>
    </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1 },

    // NavBar
    navbar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10 },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: gutter(16), paddingVertical: 12 },
    navLogo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logoMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    navTitle: { fontFamily: font, color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
    navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    navGhostBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm },
    navGhostText: { fontFamily: font, color: colors.text, fontSize: 14, fontWeight: '600' },
    navPrimaryBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm },
    navPrimaryText: { fontFamily: font, color: '#fff', fontSize: 14, fontWeight: '700' },
    rolePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, gap: 6 },
    greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
    rolePillText: { fontFamily: font, color: colors.primary, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
    menuBtn: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
    dropdownWrap: { paddingHorizontal: gutter(12), paddingBottom: 12 },
    dropdown: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, ...shadow },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9 },
    menuIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    menuItemText: { fontFamily: font, color: colors.text, fontSize: 15, fontWeight: '600' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: 12 },

    // Tab bar
    tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, paddingHorizontal: gutter(0) },
    tabBtn: { flex: 1, alignItems: 'center', gap: 3 },
    tabIconWrap: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: radius.pill },
    tabIconWrapActive: { backgroundColor: colors.primarySoft },
    tabLabel: { fontFamily: font, fontSize: 11, textAlign: 'center', color: colors.textSubtle, fontWeight: '600' },
    tabLabelActive: { color: colors.primary, fontWeight: '700' },

    // Incoming call
    overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    callCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', maxWidth: 360 },
    callAvatarRing: { padding: 6, borderRadius: 60, backgroundColor: colors.primarySoft, marginBottom: 14 },
    callTitle: { fontFamily: font, fontSize: 22, fontWeight: '800', color: colors.text },
    callSubtitle: { fontFamily: font, fontSize: 15, color: colors.textMuted, marginTop: 2, marginBottom: 24 },
    callBtns: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
    callBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.md },
    callBtnText: { fontFamily: font, color: '#fff', fontWeight: '700', fontSize: 15 },

    // General layout — pages are capped at PAGE_WIDTH and centred on the web
    padded: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 20, paddingBottom: 40 },
    paddedCompact: { paddingHorizontal: 12, paddingTop: 12 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Welcome
    heroCard: { alignItems: 'center', paddingVertical: 32 },
    heroMark: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroTitle: { fontFamily: font, color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
    heroSub: { fontFamily: font, color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 420 },
    choiceCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    choiceIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 12 },
    backText: { fontFamily: font, fontSize: 14, fontWeight: '600', color: colors.textMuted },

    // Profile card
    profileTitle: { fontFamily: font, fontSize: 17, fontWeight: '700', color: colors.text },
    profileSub: { fontFamily: font, fontSize: 14, color: colors.textMuted, marginTop: 2 },
    surveyPrompt: { backgroundColor: colors.tile, borderRadius: radius.md, padding: 16 },
    editLink: { alignSelf: 'flex-start', marginTop: 14 },
    editLinkText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.primary },

    // Dashboard
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    matchBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    actionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    statRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
    statTile: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, ...shadow },
    statIcon: { width: 34, height: 34, flexShrink: 0, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontFamily: font, fontSize: 18, fontWeight: '800', color: colors.text },
    statLabel: { fontFamily: font, fontSize: 12, color: colors.textMuted },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    linkRowText: { fontFamily: font, flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    hairline: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

    // Pages
    pageTitle: { fontFamily: font, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
    pageSub: { fontFamily: font, fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 16 },

    // Search
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 12 : 8, backgroundColor: colors.surface, marginBottom: 14 },
    searchInput: { flex: 1, fontFamily: font, fontSize: 15, color: colors.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },

    // Course card
    courseTitle: { fontFamily: font, fontSize: 17, fontWeight: '700', color: colors.text },
    courseSub: { fontFamily: font, fontSize: 14, color: colors.textMuted, marginTop: 2 },
    courseDesc: { fontFamily: font, fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 12 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { fontFamily: font, fontSize: 13, fontWeight: '600', color: colors.text },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 14 },
    cardFooterText: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.primary },

    // Course detail
    sectionTitle: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },

    // In-app notification banner
    toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12, zIndex: 50 },
    toast: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, ...shadow, ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(17,24,39,0.12)' } : { elevation: 6 }) },
    toastIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    toastTitle: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.text },
    toastBody: { fontFamily: font, fontSize: 13, color: colors.textMuted, marginTop: 1 },

    // AI Matcher modal
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: gutter(16), backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontFamily: font, fontSize: 18, fontWeight: '800', color: colors.text },
    modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
});
const App = () => (
    <SafeAreaProvider>
        <EduConnectApp />
    </SafeAreaProvider>
);

export default App;