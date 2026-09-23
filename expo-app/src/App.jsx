// EduConnect — React Native / Expo
// Converted from Vite + Capacitor web app
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  FileText,
  GraduationCap,
  Lock, LogOut,
  Menu,
  MessageSquare,
  Phone, PhoneOff,
  Search,
  Users,
  Video,
  X
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, SafeAreaView,
  ScrollView,
  StatusBar, StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import 'react-native-get-random-values';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import io from 'socket.io-client';
import Notifications from "./notifications";

import { initializeFCM, playRingtone, registerNotificationHandler, stopRingtone } from './firebaseConfig';
import { API_URL } from './utils/config';
import { storage } from './utils/storage';
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
// ─── ROOT COMPONENT ──────────────────────────────────────────────────────────

const EduConnectApp = () => {
 useEffect(() => {
  // Wake up the server the moment app opens
  fetch('https://hult-663884308553.europe-west9.run.app/api/health').catch(() => {});
}, []);
  const insets = useSafeAreaInsets();

  // ── Refs ────────────────────────────────────────────────────────────────
  const appSocketRef = useRef(null);
  const nativeCallActiveRef = useRef(false);
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
  const [studentProfileForMatching, setStudentProfileForMatching] = useState(null);

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
}, []);
  // ── FCM init ─────────────────────────────────────────────────────────────
// Wrap this entire useEffect:
useEffect(() => {
  if (!isAuthenticated) return;
  try {
    initializeFCM((notification) => {
      console.log('📨 FCM message:', notification);
    });
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
    return () => sub.remove();
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

    socketInstance = io(API_URL, {
      auth: { userId },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: [ 'polling'],
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
      playRingtone(callData.callerName || 'Someone');
      setIncomingCallData({
        meetingId: callData.meetingId,
        joinUrl: callData.joinUrl,
        callerName: callData.callerName || 'Unknown Caller',
        callerUserId: callData.callerId,
        callerTutorProfileId: callData.callerTutorProfileId || null,
        callerStudentId: callData.callerStudentId || null,
      });
    });
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
const handleLogout = async () => {
  const { Platform } = require('react-native');
  
  const doLogout = async () => {
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

  const handleAIMatching = async () => {
    if (!isAuthenticated) {
      Alert.alert('Login required', 'Please log in first to use AI matching!');
      setShowLogin(true);
      return;
    }
    try {
      const token = await storage.getItem('token');
      const response = await fetch(`${API_URL}/api/student/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch profile');
      const data = await response.json();
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
};
      if (studentProfile.preferred_subjects.length === 0) {
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
        <TouchableOpacity style={styles.navLogo} onPress={() => setCurrentView('home')}>
          <GraduationCap size={24} color="#fff" />
          <Text style={styles.navTitle}>EduConnect</Text>
        </TouchableOpacity>

        <View style={styles.navActions}>
          {!isAuthenticated ? (
            <>
              <TouchableOpacity style={styles.btnOutline} onPress={() => setShowLogin(true)}>
                <Text style={styles.btnOutlineText}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnWhite} onPress={() => setShowRegister(true)}>
                <Text style={styles.btnWhiteText}>Sign Up</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.onlineBadge}>
                <View style={styles.greenDot} />
                <Text style={styles.onlineBadgeText}>{userType || 'User'}</Text>
              </View>
              <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} style={styles.menuBtn}>
                {menuOpen ? <X size={24} color="#fff" /> : <Menu size={24} color="#fff" />}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {menuOpen && isAuthenticated && (
        <View style={styles.dropdown}>
          <MenuItem icon={<BookOpen size={20} color="#fff" />} label="Home" onPress={() => { setCurrentView('home'); setMenuOpen(false); }} />
          {userType === 'student' && (
            <>
              <MenuItem icon={<FileText size={20} color="#fff" />} label="Courses" onPress={() => { setCurrentView('courses'); setMenuOpen(false); }} />
              <MenuItem icon={<BookOpen size={20} color="#fff" />} label="My Courses" onPress={() => { setCurrentView('my-courses'); setMenuOpen(false); }} />
              <MenuItem icon={<Users size={20} color="#fff" />} label="Find Tutors" onPress={() => { setCurrentView('tutors'); setMenuOpen(false); }} />
            </>
          )}
          {userType === 'tutor' && (
            <MenuItem icon={<BookOpen size={20} color="#fff" />} label="Manage Courses" onPress={() => { setShowCourseManager(true); setMenuOpen(false); }} />
          )}
          <View style={styles.divider} />
          <MenuItem icon={<Users size={20} color="#fff" />} label="My Profile" onPress={() => {
            userType === 'student' ? setShowStudentProfile(true) : setShowTutorProfile(true);
            setMenuOpen(false);
          }} />
          <MenuItem icon={<Lock size={20} color="#fff" />} label="Change Password" onPress={() => { setShowPasswordReset(true); setMenuOpen(false); }} />
          <MenuItem icon={<LogOut size={20} color="#ef4444" />} label="Logout" onPress={() => { setMenuOpen(false); handleLogout(); }} textStyle={{ color: '#fca5a5' }} />
        </View>
      )}
    </View>
  );

  const MenuItem = ({ icon, label, onPress, textStyle }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      {icon}
      <Text style={[styles.menuItemText, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );

  // ── Bottom Tab Bar ────────────────────────────────────────────────────────

  const BottomTabBar = () => {
    if (!isAuthenticated) return null;
    const tab = (view, icon, label) => {
      const active = currentView === view;
      const Icon = icon;
      return (
        <TouchableOpacity
          key={view}
          style={styles.tabBtn}
          onPress={() => setCurrentView(view)}
        >
          <Icon size={24} color={active ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        {tab('home', BookOpen, 'Home')}
        {userType === 'student' && (
          <>
            {tab('courses', FileText, 'Courses')}
            {tab('my-courses', GraduationCap, 'My Courses')}
            {tab('chat', MessageSquare, 'Messages')}
          </>
        )}
        {userType === 'tutor' && (
          <>
            <TouchableOpacity style={styles.tabBtn} onPress={() => setShowCourseManager(true)}>
              <FileText size={24} color={showCourseManager ? '#2563eb' : '#6b7280'} />
              <Text style={[styles.tabLabel, showCourseManager && styles.tabLabelActive]}>Manage</Text>
            </TouchableOpacity>
            {tab('chat', MessageSquare, 'Messages')}
          </>
        )}
      </View>
    );
  };

  // ── Incoming Call Modal ───────────────────────────────────────────────────

 // ── REPLACE only the IncomingCallModal component in App.jsx ──────────────────
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
          <View style={styles.callAvatar}>
            <Video size={40} color="#2563eb" />
          </View>
          <Text style={styles.callTitle}>Incoming Voice Call</Text>
          <Text style={styles.callSubtitle}>{incomingCallData.callerName} is calling…</Text>
          <View style={styles.callBtns}>
            {/* ── DECLINE ── */}
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: '#dc2626' }]}
             onPress={() => {
  stopRingtone();

  const { meetingId, joinUrl, callerName, callerUserId,
          callerTutorProfileId, callerStudentId } = incomingCallData;

  if (appSocketRef.current?.connected) {
    appSocketRef.current.emit('call_accepted', {
      meetingId,
      callerId:   callerUserId,
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
              style={[styles.callBtn, { backgroundColor: '#16a34a' }]}
              onPress={() => {
                stopRingtone();

                const { meetingId, joinUrl, callerName, callerUserId,
                        callerTutorProfileId, callerStudentId } = incomingCallData;

                // 1. Tell the SERVER the call was accepted — this triggers
                //    the caller's socket 'call_accepted' listener in VoiceCall,
                //    which makes the caller join the Agora channel.
                if (appSocketRef.current?.connected) {
                  appSocketRef.current.emit('call_accepted', {
                    meetingId,
                    callerId:   callerUserId,
                    receiverId: null,   // server will use socket auth userId
                    acceptedBy: null,
                  });
                }

                // 2. Clear the modal first
                setIncomingCallData(null);

                // 3. Pass meetingId down to the callee's VoiceCall via autoJoinMeetingId.
                //    VoiceCall's useEffect on autoJoinMeetingId will open the modal
                //    and join the Agora channel immediately.
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

  const WelcomeScreen = () => (
    <ScrollView contentContainerStyle={styles.padded}>
      <View style={[styles.heroGrad, { backgroundColor: '#7c3aed' }]}>
        <GraduationCap size={48} color="#fff" style={{ alignSelf: 'center', marginBottom: 12 }} />
        <Text style={styles.heroTitle}>Welcome to EduConnect</Text>
        <Text style={styles.heroSub}>AI-powered personalized learning for everyone, everywhere.</Text>
      </View>
      <View style={styles.gap12}>
        <TouchableOpacity style={styles.bigBtn} onPress={() => setUserType('student')}>
          <BookOpen size={28} color="#fff" />
          <View>
            <Text style={styles.bigBtnTitle}>I'm a Student</Text>
            <Text style={styles.bigBtnSub}>Discover courses & tutors</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#16a34a' }]} onPress={() => setUserType('tutor')}>
          <Users size={28} color="#fff" />
          <View>
            <Text style={styles.bigBtnTitle}>I'm a Tutor</Text>
            <Text style={styles.bigBtnSub}>Share your expertise</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const LoggedInDashboard = () => (
    <ScrollView contentContainerStyle={styles.padded}>
      <View style={styles.welcomeBanner}>
        <Text style={styles.welcomeText}>Welcome back, {userType === 'student' ? 'Learner' : 'Educator'}!</Text>
      </View>
      <View style={styles.statsGrid}>
        {userType === 'student' ? (
          <>
            <StatCard icon={<BookOpen color="#2563eb" size={20} />} label="Courses" value={courses.length} border="#2563eb" />
            <StatCard icon={<Users color="#16a34a" size={20} />} label="Tutors" value={tutors.length} border="#16a34a" />
          </>
        ) : (
          <>
            <StatCard icon={<BookOpen color="#2563eb" size={20} />} label="My Courses" value={tutorStats.totalCourses} border="#2563eb" />
            <StatCard icon={<Users color="#16a34a" size={20} />} label="Students" value={tutorStats.totalStudents} border="#16a34a" />
            <StatCard icon={<MessageSquare color="#7c3aed" size={20} />} label="Messages" value={tutorStats.totalMessages} border="#7c3aed" />
          </>
        )}
      </View>
      {userType === 'student' && (
        <View style={styles.gap12}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📝 Learning Profile Survey</Text>
            <Text style={styles.cardDesc}>Complete to unlock AI-powered tutor matching!</Text>
            <TouchableOpacity style={styles.purpleBtn} onPress={() => setShowSurvey(true)}>
              <Text style={styles.purpleBtnText}>Complete Survey</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🤖 AI Learning Assistant</Text>
            <Text style={styles.cardDesc}>Get personalized course recommendations.</Text>
            <TouchableOpacity
              style={[styles.purpleBtn, { backgroundColor: '#2563eb' }, aiMatching && { backgroundColor: '#9ca3af' }]}
              onPress={handleAIMatching}
              disabled={aiMatching}
            >
              <Text style={styles.purpleBtnText}>
                {aiMatching ? 'Analyzing...' : 'Find My Perfect Match'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );

  const StatCard = ({ icon, label, value, border }) => (
    <View style={[styles.statCard, { borderLeftColor: border }]}>
      {icon}
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );

  const HomeView = () => {
    if (isAuthenticated) return <LoggedInDashboard />;
    if (!userType) return <WelcomeScreen />;
    // Student / Tutor landing pages — same structure, different colours
    const isStudent = userType === 'student';
    return (
      <ScrollView contentContainerStyle={styles.padded}>
        <View style={[styles.heroGrad, { backgroundColor: isStudent ? '#2563eb' : '#16a34a' }]}>
          {isStudent ? <GraduationCap size={32} color="#fff" style={{ alignSelf: 'center', marginBottom: 8 }} /> : <Users size={32} color="#fff" style={{ alignSelf: 'center', marginBottom: 8 }} />}
          <Text style={styles.heroTitle}>{isStudent ? 'Learn Without Limits' : 'Teach & Inspire'}</Text>
          <Text style={styles.heroSub}>{isStudent ? 'AI-powered education tailored to your needs' : 'Share your knowledge and earn while you educate'}</Text>
        </View>
        <View style={styles.gap12}>
          <TouchableOpacity style={[styles.bigBtn, !isStudent && { backgroundColor: '#16a34a' }]} onPress={() => setShowRegister(true)}>
            {isStudent ? <GraduationCap size={24} color="#fff" /> : <Users size={24} color="#fff" />}
            <Text style={styles.bigBtnTitle}>{isStudent ? 'Start Learning Now' : 'Become a Tutor'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowLogin(true)}>
            <Text style={styles.outlineBtnText}>Already have an account? Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setUserType(null)}>
            <Text style={styles.linkText}>← Back to home</Text>
          </TouchableOpacity>
        </View>
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
      c.title.toLowerCase().includes(query.toLowerCase())
    );

    return (
      <ScrollView contentContainerStyle={styles.padded}>
        <View style={styles.searchRow}>
          <Search size={18} color="#9ca3af" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search courses..."
            value={query}
            onChangeText={setQuery}
          />
        </View>
        {filtered.map((course) => (
          <View key={course.id} style={[styles.courseCard, { borderLeftColor: '#2563eb' }]}>
            <Text style={styles.courseTitle}>{course.title}</Text>
            <Text style={styles.courseSub}>by {course.tutor_name || 'Unknown'}</Text>
            <View style={styles.tagRow}>
              <Tag label={course.level} />
              {course.duration && <Tag label={course.duration} />}
              <Tag label={`${course.total_students || 0} students`} />
            </View>
            <Text style={styles.courseDesc} numberOfLines={3}>
              {course.description || course.overview || 'No description available'}
            </Text>
            <TouchableOpacity
              style={styles.blueBtn}
              onPress={() => { setSelectedCourse(course); setCurrentView('course-detail'); }}
            >
              <Text style={styles.blueBtnText}>View Course</Text>
            </TouchableOpacity>
          </View>
        ))}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <BookOpen size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No courses available yet.</Text>
          </View>
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
          <TouchableOpacity onPress={() => setCurrentView('courses')}>
            <Text style={styles.backLink}>← Back to Courses</Text>
          </TouchableOpacity>
          <Text>Course not found.</Text>
        </View>
      );
    }

    const safeParseArr = (val) => { try { return JSON.parse(val || '[]'); } catch { return []; } };
    const learningOutcomes = safeParseArr(courseDetails.learning_outcomes);
    const prerequisites = safeParseArr(courseDetails.prerequisites);

    return (
      <ScrollView contentContainerStyle={styles.padded}>
        <TouchableOpacity onPress={() => setCurrentView('courses')}>
          <Text style={styles.backLink}>← Back to Courses</Text>
        </TouchableOpacity>
        <View style={[styles.heroGrad, { backgroundColor: '#2563eb', marginTop: 8 }]}>
          <Text style={[styles.heroTitle, { fontSize: 20 }]}>{courseDetails.title}</Text>
          <Text style={{ color: '#bfdbfe', marginTop: 4 }}>by {courseDetails.tutor_name}</Text>
          {courseDetails.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{courseDetails.category}</Text>
            </View>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Course Overview</Text>
          <InfoRow label="Level" value={courseDetails.level} />
          {courseDetails.duration && <InfoRow label="Duration" value={courseDetails.duration} />}
          <InfoRow label="Students" value={courseDetails.total_students || 0} />
          {courseDetails.price !== undefined && (
            <InfoRow label="Price" value={courseDetails.price === 0 ? 'Free' : `$${courseDetails.price}`} />
          )}
        </View>
        {courseDetails.description && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.bodyText}>{courseDetails.description}</Text>
          </View>
        )}
        {learningOutcomes.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>What You'll Learn</Text>
            {learningOutcomes.map((o, i) => (
              <View key={i} style={styles.checkRow}>
                <CheckCircle size={16} color="#16a34a" />
                <Text style={[styles.bodyText, { marginLeft: 8, flex: 1 }]}>{o}</Text>
              </View>
            ))}
          </View>
        )}
        {prerequisites.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Prerequisites</Text>
            {prerequisites.map((p, i) => (
              <View key={i} style={styles.checkRow}>
                <AlertCircle size={16} color="#2563eb" />
                <Text style={[styles.bodyText, { marginLeft: 8, flex: 1 }]}>{p}</Text>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.blueBtn} onPress={() => handleEnroll(courseDetails.id)}>
          <Text style={styles.blueBtnText}>Enroll Now</Text>
        </TouchableOpacity>
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
      <ScrollView contentContainerStyle={styles.padded}>
        <Text style={styles.pageTitle}>My Courses</Text>
        {enrolledCourses.length === 0 ? (
          <View style={styles.emptyState}>
            <BookOpen size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>You haven't enrolled in any courses yet</Text>
            <TouchableOpacity style={styles.blueBtn} onPress={() => setCurrentView('courses')}>
              <Text style={styles.blueBtnText}>Browse Courses</Text>
            </TouchableOpacity>
          </View>
        ) : (
          enrolledCourses.map((e) => (
            <View key={e.id} style={[styles.courseCard, { borderLeftColor: '#2563eb' }]}>
              <Text style={styles.courseTitle}>{e.course_title}</Text>
              <Text style={styles.courseSub}>by {e.tutor_name}</Text>
              {e.completed && (
                <View style={styles.completedBadge}>
                  <CheckCircle size={12} color="#166534" />
                  <Text style={styles.completedText}>Completed</Text>
                </View>
              )}
              <TouchableOpacity style={styles.purpleBtn} onPress={() => setViewingMaterials(e)}>
                <Text style={styles.purpleBtnText}>View Course Materials</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  // ── Chat View (Student or Tutor) ──────────────────────────────────────────

// AFTER

// AFTER
const ChatView = ({ appSocket, openConversationId, pendingAutoJoin, onConversationOpened, onCallEnded }) => { 
  const [userData, setUserData] = useState(null);
  const [token, setToken] = useState(null);  // ← add this

  useEffect(() => {
    (async () => {
      const userStr = await storage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const userId = user?.id || Number(await storage.getItem('userId'));
      const userName = user?.full_name || (await storage.getItem('userName')) || 'User';
      const uType = user?.user_type || (await storage.getItem('userType'));
      const tutorProfileId = user?.tutor_profile_id || Number(await storage.getItem('tutorProfileId')) || null;
      const authToken = await storage.getItem('token');  // ← add this
      setToken(authToken);  // ← add this
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
        authToken={token}  // ← add this
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
      authToken={token}  // ← add this
    />
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
      <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
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

      {/* ── Modal screens ──────────────────────────────── */}
      {showLogin && (
        <EnhancedLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={async (data) => {
            console.log('LOGIN TOKEN:', data.token); //
              console.log('SAVED, reading back:', await storage.getItem('token')); // ← and this

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
      {showSurvey && <StudentSurvey onClose={() => setShowSurvey(false)} onComplete={() => { setShowSurvey(false); Alert.alert('Done!', 'Survey completed! You can now use AI matching.'); }} />}
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
      {showStudentProfile && <StudentProfile onClose={() => setShowStudentProfile(false)} />}
      {showTutorProfile && <TutorProfile onClose={() => setShowTutorProfile(false)} token={authToken} />}
      {showCourseManager && <TutorCourseManager onClose={() => setShowCourseManager(false)} />}
      {showAIMatcherModal && studentProfileForMatching && (
        <Modal visible animationType="slide">
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Tutor Matching</Text>
              <TouchableOpacity onPress={() => { setShowAIMatcherModal(false); setStudentProfileForMatching(null); }}>
                <X size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <AITutorMatcher
              studentProfile={studentProfileForMatching}
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

// ── Shared small components ───────────────────────────────────────────────────

const LoadingSpinner = () => (
  <View style={styles.centered}>
    <ActivityIndicator size="large" color="#2563eb" />
    <Text style={{ color: '#6b7280', marginTop: 8 }}>Loading…</Text>
  </View>
);

const Tag = ({ label }) => (
  <View style={styles.tag}><Text style={styles.tagText}>{label}</Text></View>
);

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{String(value)}</Text>
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  content: { flex: 1 },

  // NavBar
  navbar: { backgroundColor: '#2563eb', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  navLogo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnOutline: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnOutlineText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  btnWhite: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnWhiteText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6 },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  onlineBadgeText: { color: '#fff', fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  menuBtn: { padding: 6 },
  dropdown: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  divider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', marginVertical: 4, marginHorizontal: 16 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.05, elevation: 8, paddingTop: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  tabLabelActive: { color: '#2563eb' },

  // Incoming call
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  callCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', width: '100%', maxWidth: 360 },
  callAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  callTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  callSubtitle: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  callBtns: { flexDirection: 'row', gap: 12 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  callBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  // General layout
  padded: { padding: 16, paddingBottom: 32 },
  gap12: { gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Hero
  heroGrad: { borderRadius: 12, padding: 24, marginBottom: 16, alignItems: 'center' },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' },

  // Big buttons
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#2563eb', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  bigBtnTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  bigBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  outlineBtn: { borderWidth: 2, borderColor: '#d1d5db', borderRadius: 12, padding: 14, alignItems: 'center' },
  outlineBtnText: { color: '#374151', fontWeight: '600' },
  linkText: { color: '#6b7280', textAlign: 'center', paddingVertical: 8, fontSize: 13 },

  // Dashboard
  welcomeBanner: { backgroundColor: '#ede9fe', borderRadius: 10, padding: 16, marginBottom: 12 },
  welcomeText: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 10, padding: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, elevation: 1 },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, elevation: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#6b7280', marginBottom: 10 },

  // Buttons
  blueBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  blueBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  purpleBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  purpleBtnText: { color: '#fff', fontWeight: '600' },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff', marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  // Course card
  courseCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, elevation: 1 },
  courseTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  courseSub: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  courseDesc: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: { backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: '#1e40af' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#9ca3af', fontSize: 15 },

  // Course detail
  backLink: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
  bodyText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { color: '#6b7280', fontSize: 13 },
  infoValue: { fontWeight: '600', fontSize: 13 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  categoryBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'center', marginTop: 8 },
  categoryText: { color: '#fff', fontSize: 12 },

  // Enrolled badge
  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
  completedText: { color: '#166534', fontSize: 11, fontWeight: '600' },

  // Page title
  pageTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 4 },

  // AI Matcher modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
});
const App = () => (
  <SafeAreaProvider>
    <EduConnectApp />
  </SafeAreaProvider>
);

export default App;