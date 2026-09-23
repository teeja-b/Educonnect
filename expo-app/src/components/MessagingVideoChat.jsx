/**
 * MessagingVideoChat.native.jsx
 * Student-side messaging with 1-hour session time-limit.
 *
 * Session lifecycle:
 *  - Session is started (POST /api/sessions/start) when a conversation is opened.
 *  - A countdown timer runs client-side; every 30 s we also poll /api/sessions/status.
 *  - When time runs out the UI shows an "Session Ended" overlay; input + calls are locked.
 *  - The tutor can reopen via their own UI → socket event 'session_status_update' lifts the lock.
 */
import { Feather as Icon } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import 'react-native-get-random-values';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

import TutorProfileViewer from './TutorProfileViewer';
import VoiceCall from './VoiceCall';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://hult-663884308553.europe-west9.run.app';

// ─── tiny helpers ────────────────────────────────────────────────────────────
const fmtCountdown = secs => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// ─────────────────────────────────────────────────────────────────────────────
const MessagingVideoChat = ({
  currentUserId = 'user123',
  openConversationId = null,
  onConversationOpened = null,
  autoJoinMeetingId = null,
  autoJoinUrl = null,
  callerTutorProfileId = null,
  onCallEnded = null,
  appSocket = null,
  authToken = null,
}) => {
  // ── existing state ──────────────────────────────────────────────────────────
  const [conversations, setConversations]           = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [tutors, setTutors]                         = useState([]);
  const [messages, setMessages]                     = useState([]);
  const [newMessage, setNewMessage]                 = useState('');
  const [viewingTutorProfile, setViewingTutorProfile] = useState(null);
  const [showMessages, setShowMessages]             = useState(false);
  const [loading, setLoading]                       = useState(false);
  const [isTyping, setIsTyping]                     = useState(false);
  const [onlineUsers, setOnlineUsers]               = useState(new Set());
  const [connectionStatus, setConnectionStatus]     = useState('disconnected');
  const [searchQuery, setSearchQuery]               = useState('');
  const [attachmentFile, setAttachmentFile]         = useState(null);
  const [isRecording, setIsRecording]               = useState(false);
  const [recordingInstance, setRecordingInstance]   = useState(null);

  // ── session state ───────────────────────────────────────────────────────────
  const [sessionData, setSessionData]               = useState(null);
  // sessionData shape: { id, status, is_active, seconds_remaining, expires_at }
  const [secondsLeft, setSecondsLeft]               = useState(0);
  const sessionTimerRef                             = useRef(null);
  const sessionPollRef                              = useRef(null);
  const expiredFadeAnim                             = useRef(new Animated.Value(0)).current;
const [timerKey, setTimerKey] = useState(0);
  // is the student currently allowed to interact?
  const sessionBlocked = sessionData !== null && !sessionData.is_active;

  // ── refs ────────────────────────────────────────────────────────────────────
  const socketRef        = useRef(null);
  const flatListRef      = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => flatListRef.current?.scrollToEnd({ animated: true });

  // Derive selectedTutor from selectedConversation
  const selectedTutor = selectedConversation
    ? {
        user_id:         selectedConversation.tutorUserId || selectedConversation.partnerId,
        tutor_profile_id: selectedConversation.tutorProfileId,
        name:            selectedConversation.tutorName || selectedConversation.partnerName || 'Tutor',
        avatar:          selectedConversation.avatar || null,
      }
    : null;

  // ── session helpers ─────────────────────────────────────────────────────────
const applySessionData = useCallback(data => {
    setSessionData(data);
    setSecondsLeft(data.seconds_remaining || 0);
    setTimerKey(k => k + 1);
}, []);

  const startSessionPolling = useCallback(tutorUserId => {
    if (sessionPollRef.current) clearInterval(sessionPollRef.current);
    sessionPollRef.current = setInterval(async () => {
      try {
        const token = authToken || (await AsyncStorage.getItem('auth_token'));
        const res = await fetch(
          `${API_URL}/api/sessions/status?tutor_user_id=${tutorUserId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const body = await res.json();
          if (body.session) applySessionData(body.session);
        }
      } catch { /* network blip – ignore */ }
    }, 30_000); // poll every 30 s
  }, [authToken, applySessionData]);
const startOrFetchSession = useCallback(async conv => {
  const tutorUserId = conv.tutorUserId || conv.partnerId;
  if (!tutorUserId) return;
  try {
    const token = authToken || (await AsyncStorage.getItem('auth_token'));
    console.log('[SESSION] Starting session, token:', token ? 'exists' : 'MISSING');
    console.log('[SESSION] tutorUserId:', tutorUserId);
    const res = await fetch(`${API_URL}/api/sessions/start`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ tutor_user_id: tutorUserId, conversation_id: conv.id }),
    });
    console.log('[SESSION] Response status:', res.status);
    if (res.ok) {
      const body = await res.json();
      console.log('[SESSION] Session data:', body);
      applySessionData(body);
      startSessionPolling(tutorUserId);
    }
  } catch (e) {
    console.warn('[SESSION] Could not start/fetch session:', e);
  }
}, [authToken, applySessionData, startSessionPolling]);
  // Countdown tick
useEffect(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (!sessionData?.is_active || secondsLeft <= 0) return;

    sessionTimerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(sessionTimerRef.current);
          socketRef.current?.emit('check_session_expired', { sessionId: sessionData.id });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(sessionTimerRef.current);
}, [timerKey]);

  // Fade-in expired overlay when blocked
  useEffect(() => {
    if (sessionBlocked) {
      Animated.timing(expiredFadeAnim, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }).start();
    } else {
      expiredFadeAnim.setValue(0);
    }
  }, [sessionBlocked]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(sessionTimerRef.current);
    clearInterval(sessionPollRef.current);
  }, []);

  // ── socket: Effect 1 – reference ────────────────────────────────────────────
  useEffect(() => {
    if (appSocket) { socketRef.current = appSocket; return; }
    const socket = io(API_URL, {
      auth: { userId: currentUserId },
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [currentUserId, appSocket]);

  // ── socket: Effect 2 – listeners ────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    setConnectionStatus(socket.connected ? 'connected' : 'disconnected');

    const onConnect    = () => setConnectionStatus('connected');
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onError      = () => setConnectionStatus('error');

    const onReceiveMessage = data => {
      if (String(data.sender_id) === String(currentUserId)) return;
      setMessages(prev => {
        const dup = prev.some(
          m => (data.id && String(m.id) === String(data.id)) ||
               (data.messageId && (
                 String(m.id) === String(data.messageId) ||
                 String(m.messageId) === String(data.messageId)
               ))
        );
        if (dup) return prev;
        return [...prev, { ...data, id: data.id || data.messageId, isOwn: false }];
      });
    };

    const onMessageDelivered = ({ messageId, dbMessageId }) => {
      setMessages(prev => prev.map(msg =>
        String(msg.id) === String(messageId) || String(msg.messageId) === String(messageId)
          ? { ...msg, id: dbMessageId, status: 'delivered' }
          : msg
      ));
    };

    const onUserTyping    = ({ userId }) => { if (String(userId) !== String(currentUserId)) { setIsTyping(true); setTimeout(() => setIsTyping(false), 3000); } };
    const onStopTyping    = ({ userId }) => { if (String(userId) !== String(currentUserId)) setIsTyping(false); };
    const onUsersOnline   = ids  => setOnlineUsers(new Set(ids));
    const onUserStatus    = ({ userId, status }) => setOnlineUsers(prev => { const s = new Set(prev); status === 'online' ? s.add(userId) : s.delete(userId); return s; });

    // ← session update pushed by tutor reopen or backend expiry
    const onSessionUpdate = data => {
      console.log('[SESSION] Received session_status_update:', data);
      applySessionData(data);
    };

    socket.on('connect',               onConnect);
    socket.on('disconnect',            onDisconnect);
    socket.on('connect_error',         onError);
    socket.on('receive_message',       onReceiveMessage);
    socket.on('message_delivered',     onMessageDelivered);
    socket.on('user_typing',           onUserTyping);
    socket.on('user_stop_typing',      onStopTyping);
    socket.on('users_online',          onUsersOnline);
    socket.on('user_status',           onUserStatus);
    socket.on('session_status_update', onSessionUpdate);

    return () => {
      socket.off('connect',               onConnect);
      socket.off('disconnect',            onDisconnect);
      socket.off('connect_error',         onError);
      socket.off('receive_message',       onReceiveMessage);
      socket.off('message_delivered',     onMessageDelivered);
      socket.off('user_typing',           onUserTyping);
      socket.off('user_stop_typing',      onStopTyping);
      socket.off('users_online',          onUsersOnline);
      socket.off('user_status',           onUserStatus);
      socket.off('session_status_update', onSessionUpdate);
    };
  }, [appSocket, currentUserId, applySessionData]);

  // Join room when conversation selected
  useEffect(() => {
    if (socketRef.current?.connected && selectedConversation) {
      const tutorUserId = selectedConversation.tutorUserId || selectedConversation.partnerId;
      const key = `conversation:${currentUserId}:${tutorUserId}`;
      socketRef.current.emit('join_conversation', {
        conversationId: key, userId: currentUserId, partnerId: tutorUserId,
      });
    }
  }, [selectedConversation, currentUserId]);

  // Auto-open from prop
  useEffect(() => {
    if (openConversationId && conversations.length > 0 && !selectedConversation) {
      const conv = conversations.find(c => c.id === openConversationId);
      if (conv) { openConversation(conv); if (onConversationOpened) onConversationOpened(); }
    }
  }, [openConversationId, conversations, selectedConversation]);

  // Auto-open for incoming call
  useEffect(() => {
    if (autoJoinMeetingId && conversations.length > 0 && !selectedConversation) {
      let conv = callerTutorProfileId
        ? conversations.find(c => String(c.tutorProfileId || c.partnerProfileId) === String(callerTutorProfileId))
        : null;
      if (!conv && conversations.length > 0) conv = conversations[0];
      if (conv) openConversation(conv);
    }
  }, [autoJoinMeetingId, conversations]);

  // Fetch tutors
  useEffect(() => {
    const fetchTutors = async () => {
      try {
        const cached = await AsyncStorage.getItem('cached_tutors');
        if (cached) setTutors(JSON.parse(cached));
        const res = await fetch(`${API_URL}/api/tutors`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.tutors || [];
        setTutors(list);
        AsyncStorage.setItem('cached_tutors', JSON.stringify(list));
      } catch { /* use cache */ }
    };
    fetchTutors();
  }, []);

  // Load conversations
  useEffect(() => { loadConversations(); }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/students/${currentUserId}/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data) ? data : data.conversations || []);
      }
    } catch { setConversations([]); }
    finally  { setLoading(false); }
  };

  const openConversation = async conv => {
    setSelectedConversation(conv);
    setShowMessages(true);
    setLoading(true);
    setSessionData(null); // reset previous session state

    const tutorUserId = conv.tutorUserId || conv.partnerId;
    const key = `conversation:${currentUserId}:${tutorUserId}`;
    socketRef.current?.emit('join_conversation', {
      conversationId: key, userId: currentUserId, partnerId: tutorUserId,
    });

    try {
      const res = await fetch(`${API_URL}/api/conversations/${conv.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages((data.messages || []).map(m => ({
          ...m, isOwn: String(m.sender_id) === String(currentUserId),
        })));
      } else setMessages([]);
    } catch { setMessages([]); }
    finally  { setLoading(false); }

    // Start / resume session tracking
    await startOrFetchSession(conv);
  };

  const openConversationFromTutor = async tutor => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/students/${currentUserId}/conversations`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.conversations || [];
        setConversations(list);
        const conv = list.find(c => String(c.tutorUserId || c.partnerId) === String(tutor.user_id));
        if (conv) {
          await openConversation(conv);
        } else {
          const shell = {
            id: null,
            tutorUserId:    tutor.user_id,
            tutorProfileId: tutor.tutor_profile_id || tutor.id,
            partnerName:    tutor.name,
            tutorName:      tutor.name,
            avatar:         tutor.avatar || null,
          };
          setSelectedConversation(shell);
          setShowMessages(true);
          setMessages([]);
          setLoading(false);
          await startOrFetchSession(shell);
        }
      }
    } catch { setLoading(false); }
  };

  const handleBack = () => {
    clearInterval(sessionTimerRef.current);
    clearInterval(sessionPollRef.current);
    if (onCallEnded) onCallEnded();
    setSelectedConversation(null);
    setShowMessages(false);
    setMessages([]);
    setSessionData(null);
    setSecondsLeft(0);
  };

  const handlePickFile = async () => {
    if (sessionBlocked) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf',
               'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'text/plain'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (asset.size > 10 * 1024 * 1024) { Alert.alert('File too large', 'Maximum 10MB'); return; }
        setAttachmentFile({ uri: asset.uri, name: asset.name, type: asset.mimeType });
      }
    } catch {}
  };

  const startRecording = async () => {
    if (sessionBlocked) return;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Please allow microphone access'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecordingInstance(recording);
      setIsRecording(true);
    } catch { Alert.alert('Failed to start recording'); }
  };

  const stopRecording = async () => {
    try {
      await recordingInstance.stopAndUnloadAsync();
      const uri = recordingInstance.getURI();
      setAttachmentFile({ uri, name: `voice-${Date.now()}.m4a`, type: 'audio/m4a' });
      setRecordingInstance(null);
      setIsRecording(false);
    } catch {}
  };

  const sendMessage = async () => {
    if (sessionBlocked) return;
    if (!newMessage.trim() && !attachmentFile) return;
    if (!socketRef.current?.connected) {
      Alert.alert('Not connected', 'Please wait for connection to be established.');
      return;
    }
    const tutorUserId = selectedConversation?.tutorUserId || selectedConversation?.partnerId;
    if (!tutorUserId) return;

    const messageId = uuidv4();
    const msg = {
      id: messageId, messageId,
      sender_id: currentUserId,
      text:      newMessage.trim(),
      timestamp: new Date().toISOString(),
      isOwn:     true,
      status:    'sending',
    };
    setMessages(prev => [...prev, msg]);
    setNewMessage('');

    const key = `conversation:${currentUserId}:${tutorUserId}`;
    socketRef.current.emit('send_message', {
      conversationId: key,
      sender_id:      currentUserId,
      receiver_id:    tutorUserId,
      text:           msg.text,
      timestamp:      msg.timestamp,
      messageId,
    });
  };

  const handleTyping = () => {
    if (sessionBlocked || !socketRef.current?.connected || !selectedConversation) return;
    const tutorUserId = selectedConversation.tutorUserId || selectedConversation.partnerId;
    const key = `conversation:${currentUserId}:${tutorUserId}`;
    socketRef.current.emit('typing', { conversationId: key, userId: currentUserId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { conversationId: key, userId: currentUserId });
    }, 2000);
  };

  const getMessageStatusIcon = msg => {
    if (!msg.isOwn) return null;
    if (msg.status === 'sending')   return <Icon name="clock"        size={11} color="rgba(255,255,255,0.6)" />;
    if (msg.status === 'sent')      return <Icon name="check"        size={11} color="rgba(255,255,255,0.6)" />;
    if (msg.status === 'delivered') return <Icon name="check-circle" size={11} color="rgba(255,255,255,0.6)" />;
    if (msg.status === 'failed')    return <Text style={styles.failedStatus}>!</Text>;
    return <Icon name="check-circle" size={11} color="rgba(255,255,255,0.6)" />;
  };

  const formatTime = ts => {
    if (!ts) return '';
    const d   = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredTutors = tutors.filter(
    t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
         (t.expertise && t.expertise.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ── countdown colour ────────────────────────────────────────────────────────
  const countdownColor =
    secondsLeft <= 120 ? '#ef4444' :
    secondsLeft <= 300 ? '#f59e0b' : '#22c55e';

  // ── render helpers ──────────────────────────────────────────────────────────
  const renderMessage = ({ item: msg }) => (
    <View style={[styles.msgRow, msg.isOwn ? styles.msgRowOwn : styles.msgRowOther]}>
      <View style={[styles.bubble, msg.isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {msg.file_url && (
          <View style={styles.attachmentContainer}>
            {msg.file_type === 'image' ? (
              <TouchableOpacity onPress={() => Linking.openURL(msg.file_url)}>
                <Image source={{ uri: msg.file_url }} style={styles.imageAttachment} resizeMode="cover" />
              </TouchableOpacity>
            ) : msg.file_type === 'voice' ? (
              <TouchableOpacity style={styles.voiceRow}>
                <Icon name="mic" size={14} color={msg.isOwn ? '#fff' : '#3b82f6'} />
                <Text style={[styles.voiceLabel, msg.isOwn && styles.voiceLabelOwn]}>Voice message</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.fileRow} onPress={() => Linking.openURL(msg.file_url)}>
                <Icon name="file-text" size={13} color={msg.isOwn ? '#bfdbfe' : '#3b82f6'} />
                <Text style={[styles.fileLabel, msg.isOwn && styles.fileLabelOwn]} numberOfLines={1}>
                  {msg.file_name || 'Download'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {msg.text ? <Text style={[styles.msgText, msg.isOwn && styles.msgTextOwn]}>{msg.text}</Text> : null}
        <View style={styles.msgMeta}>
          <Text style={[styles.msgTime, msg.isOwn && styles.msgTimeOwn]}>{formatTime(msg.timestamp)}</Text>
          {getMessageStatusIcon(msg)}
        </View>
      </View>
    </View>
  );

  // ── TUTOR LIST VIEW ─────────────────────────────────────────────────────────
  if (!showMessages || !selectedConversation) {
    return (
      <SafeAreaView style={styles.listContainer}>
             {/* ADD THIS */}
      {appSocket && (
        <VoiceCall
          externalSocket={appSocket}
          currentUserId={currentUserId}
          selectedTutor={{ user_id: null, name: 'Tutor' }}
          currentUserName="Student"
          autoJoinMeetingId={autoJoinMeetingId}
          autoJoinUrl={autoJoinUrl}
          onCallEnded={onCallEnded}
          authToken={authToken}
        />
      )}
        <Text style={styles.listTitle}>Messages</Text>

        <View style={styles.searchRow}>
          <Icon name="search" size={16} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tutors..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading && tutors.length === 0 ? (
          <View style={styles.emptyState}><ActivityIndicator color="#3b82f6" /></View>
        ) : filteredTutors.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="message-square" size={36} color="#d1d5db" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No tutors match your search' : 'No tutors available'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTutors}
            keyExtractor={item => String(item.id)}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            style={styles.tutorList}
            renderItem={({ item: tutor }) => {
              const isOnline = onlineUsers.has(tutor.user_id);
              return (
                <View style={styles.tutorRow}>
                  <TouchableOpacity
                    onPress={() => setViewingTutorProfile(tutor.tutor_profile_id || tutor.id)}
                    style={styles.avatarWrapper}
                  >
                    {tutor.avatar
                      ? <Text style={styles.avatarEmoji}>{tutor.avatar}</Text>
                      : <View style={styles.avatarPlaceholder}><Icon name="user" size={20} color="#3b82f6" /></View>}
                    {isOnline && <View style={styles.onlineDot} />}
                  </TouchableOpacity>

                  <View style={styles.tutorInfo}>
                    <TouchableOpacity onPress={() => setViewingTutorProfile(tutor.tutor_profile_id || tutor.id)}>
                      <Text style={styles.tutorName} numberOfLines={1}>
                        {tutor.name}
                        {isOnline && <Text style={styles.onlineTag}> ● Online</Text>}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.tutorExpertise} numberOfLines={1}>{tutor.expertise}</Text>
                  </View>

                  <TouchableOpacity style={styles.messageBtn} onPress={() => openConversationFromTutor(tutor)}>
                    <Icon name="message-square" size={13} color="#fff" />
                    <Text style={styles.messageBtnText}>Message</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}

        {viewingTutorProfile && (
          <TutorProfileViewer
            tutorId={viewingTutorProfile}
            onClose={() => setViewingTutorProfile(null)}
            API_URL={API_URL}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── CHAT VIEW ───────────────────────────────────────────────────────────────
  const tutorUserId      = selectedConversation.tutorUserId || selectedConversation.partnerId;
  const isOnline         = onlineUsers.has(tutorUserId);
  const tutorDisplayName = selectedConversation.tutorName || selectedConversation.partnerName || 'Tutor';

  return (
    <SafeAreaView style={styles.chatContainer}>
      {appSocket && (
        <VoiceCall
          externalSocket={appSocket}
          currentUserId={currentUserId}
          selectedTutor={selectedTutor || { user_id: null, name: 'Tutor' }}
          currentUserName="Student"
          autoJoinMeetingId={sessionBlocked ? null : autoJoinMeetingId}
          autoJoinUrl={sessionBlocked ? null : autoJoinUrl}
          onCallEnded={onCallEnded}
          authToken={authToken}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Icon name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setViewingTutorProfile(
                selectedConversation.tutorProfileId ||
                selectedTutor?.tutor_profile_id ||
                selectedTutor?.id
              )
            }
          >
            {selectedTutor?.avatar
              ? <Text style={styles.headerAvatarEmoji}>{selectedTutor.avatar}</Text>
              : <View style={styles.headerAvatarPlaceholder}><Icon name="user" size={18} color="#fff" /></View>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerInfo}
            onPress={() =>
              setViewingTutorProfile(
                selectedConversation.tutorProfileId ||
                selectedTutor?.tutor_profile_id ||
                selectedTutor?.id
              )
            }
          >
            <Text style={styles.headerName} numberOfLines={1}>{tutorDisplayName}</Text>
            <Text style={styles.headerStatus}>{isOnline ? '● Online' : 'Offline'}</Text>
          </TouchableOpacity>

          {/* Countdown badge */}
          {sessionData && (
            <View style={[styles.countdownBadge, { borderColor: countdownColor }]}>
              <Icon name="clock" size={11} color={countdownColor} />
              <Text style={[styles.countdownText, { color: countdownColor }]}>
                {sessionData.is_active ? fmtCountdown(secondsLeft) : 'Ended'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Messages ── */}
        {loading ? (
          <View style={styles.centered}><ActivityIndicator color="#3b82f6" /></View>
        ) : messages.length === 0 ? (
          <View style={styles.centered}>
            <Icon name="message-square" size={36} color="#d1d5db" />
            <Text style={styles.emptyText}>No messages yet.{'\n'}Start the conversation!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => String(item.id)}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={scrollToBottom}
            ListFooterComponent={
              isTyping ? (
                <View style={styles.typingRow}>
                  <View style={styles.typingBubble}>
                    <Text style={styles.typingDots}>● ● ●</Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* ── Session-expired overlay ── */}
        {sessionBlocked && (
          <Animated.View style={[styles.expiredOverlay, { opacity: expiredFadeAnim }]}>
            <View style={styles.expiredCard}>
              <View style={styles.expiredIconCircle}>
                <Icon name="clock" size={32} color="#f59e0b" />
              </View>
              <Text style={styles.expiredTitle}>Session Time Ended</Text>
              <Text style={styles.expiredBody}>
                Your 1-hour tutoring session has ended.{'\n'}
                Messaging and calls are paused until your tutor reopens the session.
              </Text>
              <View style={styles.expiredDivider} />
              <Text style={styles.expiredWaiting}>
                <Icon name="refresh-cw" size={12} color="#6b7280" />
                {'  '}Waiting for tutor approval…
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── Input bar ── */}
        <View style={[styles.inputBar, sessionBlocked && styles.inputBarBlocked]}>
          {sessionBlocked ? (
            <View style={styles.blockedInputRow}>
              <Icon name="lock" size={15} color="#9ca3af" />
              <Text style={styles.blockedInputText}>
                Session ended — awaiting tutor to reopen
              </Text>
            </View>
          ) : (
            <>
              {attachmentFile && (
                <View style={styles.attachmentPreview}>
                  <Icon name={attachmentFile.type?.startsWith('image/') ? 'image' : 'file-text'} size={14} color="#4b5563" />
                  <Text style={styles.attachmentName} numberOfLines={1}>{attachmentFile.name}</Text>
                  <TouchableOpacity onPress={() => setAttachmentFile(null)}>
                    <Icon name="x" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.iconBtn} onPress={handlePickFile}>
                  <Icon name="paperclip" size={18} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, isRecording && styles.iconBtnRecording]}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Icon name="mic" size={18} color={isRecording ? '#fff' : '#6b7280'} />
                </TouchableOpacity>
                <TextInput
                  style={styles.textInput}
                  placeholder={isRecording ? 'Recording...' : 'Message...'}
                  placeholderTextColor="#9ca3af"
                  value={newMessage}
                  onChangeText={text => { setNewMessage(text); handleTyping(); }}
                  onSubmitEditing={sendMessage}
                  editable={!isRecording}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!newMessage.trim() && !attachmentFile) && styles.sendBtnDisabled]}
                  onPress={sendMessage}
                  disabled={!newMessage.trim() && !attachmentFile}
                >
                  <Icon name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {viewingTutorProfile && (
        <TutorProfileViewer
          tutorId={viewingTutorProfile}
          onClose={() => setViewingTutorProfile(null)}
          API_URL={API_URL}
        />
      )}
    </SafeAreaView>
  );
};

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  listContainer:     { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingTop: 8 },
  listTitle:         { fontSize: 20, fontWeight: '700', color: '#1f2937', marginBottom: 10 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#d1d5db',
    paddingHorizontal: 10, marginBottom: 10,
  },
  searchIcon:  { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8, color: '#1f2937' },

  tutorList:   { backgroundColor: '#fff', borderRadius: 12 },
  divider:     { height: 1, backgroundColor: '#f3f4f6' },
  tutorRow:    { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },

  avatarWrapper:     { position: 'relative', flexShrink: 0 },
  avatarEmoji:       { fontSize: 24, width: 40, height: 40, textAlign: 'center', lineHeight: 40 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff',
  },
  tutorInfo:     { flex: 1, minWidth: 0 },
  tutorName:     { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  onlineTag:     { fontSize: 12, fontWeight: '400', color: '#16a34a' },
  tutorExpertise:{ fontSize: 12, color: '#6b7280', marginTop: 1 },
  messageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  messageBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  emptyState:     { alignItems: 'center', paddingVertical: 40 },
  emptyText:      { color: '#9ca3af', fontSize: 13, marginTop: 8, textAlign: 'center' },

  chatContainer:  { flex: 1, backgroundColor: '#fff' },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 8, paddingVertical: 12, backgroundColor: '#2563eb',
  },
  backBtn:               { padding: 6, borderRadius: 8 },
  headerAvatarEmoji:     { fontSize: 20, width: 36, height: 36, textAlign: 'center', lineHeight: 36 },
  headerAvatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerInfo:   { flex: 1, minWidth: 0 },
  headerName:   { fontSize: 14, fontWeight: '600', color: '#fff' },
  headerStatus: { fontSize: 12, color: '#bfdbfe', marginTop: 1 },

  // countdown badge in header
  countdownBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  countdownText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },

  msgRow:      { flexDirection: 'row', marginVertical: 2 },
  msgRowOwn:   { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  bubble:      { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubbleOwn:   { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },

  attachmentContainer: { marginBottom: 4 },
  imageAttachment:     { width: 200, height: 150, borderRadius: 8 },
  voiceRow:            { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceLabel:          { fontSize: 13, color: '#3b82f6' },
  voiceLabelOwn:       { color: '#fff' },
  fileRow:             { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fileLabel:           { fontSize: 12, color: '#3b82f6', textDecorationLine: 'underline', flexShrink: 1 },
  fileLabelOwn:        { color: '#bfdbfe' },

  msgText:     { fontSize: 14, color: '#1f2937', lineHeight: 20 },
  msgTextOwn:  { color: '#fff' },
  msgMeta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 },
  msgTime:     { fontSize: 11, color: '#9ca3af' },
  msgTimeOwn:  { color: 'rgba(255,255,255,0.6)' },
  failedStatus:{ fontSize: 11, color: '#fca5a5' },

  typingRow:   { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 4 },
  typingBubble:{
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderBottomLeftRadius: 4,
  },
  typingDots:  { color: '#9ca3af', fontSize: 14, letterSpacing: 3 },

  inputBar: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  inputBarBlocked: { backgroundColor: '#fafafa' },
  attachmentPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6,
  },
  attachmentName: { flex: 1, fontSize: 12, color: '#374151' },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:     { padding: 8, borderRadius: 20 },
  iconBtnRecording: { backgroundColor: '#ef4444' },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: '#1f2937', backgroundColor: '#fff',
  },
  sendBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ opacity: 0.4 },

  // blocked input state
  blockedInputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
  },
  blockedInputText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },

  // expired overlay
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  expiredCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 32,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  expiredIconCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#fef3c7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  expiredTitle: {
    fontSize: 18, fontWeight: '700', color: '#1f2937',
    marginBottom: 10, textAlign: 'center',
  },
  expiredBody: {
    fontSize: 13.5, color: '#6b7280', textAlign: 'center',
    lineHeight: 20, marginBottom: 18,
  },
  expiredDivider: { width: '100%', height: 1, backgroundColor: '#f3f4f6', marginBottom: 14 },
  expiredWaiting: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});

export default MessagingVideoChat;