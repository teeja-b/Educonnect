/**
 * TutorMessagingView.native.jsx
 * Tutor-side messaging with session time-limit support.
 *
 * When a student's session expires the tutor sees a banner with a
 * "Reopen Session" button. Tapping it calls POST /api/sessions/<id>/reopen
 * and the student's lock is immediately lifted via a socket push.
 */
import { Feather as Icon } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import VoiceCall from './VoiceCall';

const API_URL = 'https://hult-663884308553.europe-west9.run.app';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtCountdown = secs => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// ─────────────────────────────────────────────────────────────────────────────
const TutorMessagingView = ({
  currentTutorUserId,
  tutorProfileId,
  tutorName = 'Tutor',
  openConversationId  = null,
  onConversationOpened = null,
  autoJoinMeetingId   = null,
  autoJoinUrl         = null,
  callerStudentId     = null,
  onCallEnded         = null,
  appSocket           = null,
  authToken           = null,
}) => {
  // ── existing state ──────────────────────────────────────────────────────────
  const [conversations, setConversations]               = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages]                         = useState([]);
  const [newMessage, setNewMessage]                     = useState('');
  const [loading, setLoading]                           = useState(false);
  const [searchQuery, setSearchQuery]                   = useState('');
  const [isTyping, setIsTyping]                         = useState(false);
  const [onlineUsers, setOnlineUsers]                   = useState(new Set());
  const [connectionStatus, setConnectionStatus]         = useState('disconnected');
  const [attachmentFile, setAttachmentFile]             = useState(null);
  const [isRecording, setIsRecording]                   = useState(false);

  // ── session state ───────────────────────────────────────────────────────────
  const [sessionData, setSessionData]     = useState(null);
  const [secondsLeft, setSecondsLeft]     = useState(0);
  const [reopenLoading, setReopenLoading] = useState(false);
  const sessionTimerRef                   = useRef(null);
  const sessionPollRef                    = useRef(null);
  const bannerAnim                        = useRef(new Animated.Value(0)).current;
  const [timerKey, setTimerKey] = useState(0);

  const sessionExpired = sessionData !== null && !sessionData.is_active;

  // ── refs ────────────────────────────────────────────────────────────────────
  const flatListRef      = useRef(null);
  const socketRef        = useRef(null);
  const typingTimeoutRef = useRef(null);

  const getConversationKey = (studentId, tutorUserId) =>
    `conversation:${studentId}:${tutorUserId}`;

  const selectedTutorForCall = selectedConversation
    ? {
        user_id: selectedConversation.studentId || selectedConversation.partnerId,
        name:    selectedConversation.studentName || selectedConversation.partnerName || 'Student',
      }
    : callerStudentId
      ? { user_id: callerStudentId, name: 'Student' }
      : null;

  // ── session helpers ─────────────────────────────────────────────────────────
  // Soft update: used for the 30s background poll. Does NOT bump timerKey,
  // so an already-running countdown interval isn't reset/jittered.
  const applySessionDataSoft = useCallback(data => {
    setSessionData(data);
    setSecondsLeft(Math.max(0, data.seconds_remaining || 0));
    // timerKey unchanged — existing interval keeps ticking
  }, []);

  // Full update: used for initial load, session start, and socket-pushed
  // reopen/expiry events. Bumps timerKey so the countdown effect (which
  // depends on [timerKey]) actually (re)starts the interval.
  const applySessionData = useCallback(data => {
    setSessionData(data);
    setSecondsLeft(Math.max(0, data.seconds_remaining || 0));
    setTimerKey(k => k + 1);
  }, []);

  const startSessionPolling = useCallback(studentId => {
    if (sessionPollRef.current) clearInterval(sessionPollRef.current);
    sessionPollRef.current = setInterval(async () => {
      try {
        const token = authToken || (await AsyncStorage.getItem('auth_token'));
        const res = await fetch(
          `${API_URL}/api/sessions/status?student_id=${studentId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const body = await res.json();
          if (body.session) applySessionDataSoft(body.session);
        }
      } catch { /* ignore */ }
    }, 30_000);
  }, [authToken, applySessionDataSoft]);

  const startOrFetchSession = useCallback(async (conv, studentId) => {
    console.log('[SESSION] startOrFetchSession called with studentId:', studentId);
    if (!studentId) return;

    try {
      
      const token = authToken || (await AsyncStorage.getItem('auth_token'));
      const res = await fetch(`${API_URL}/api/sessions/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          tutor_user_id:  currentTutorUserId,
          student_id:     studentId,
          conversation_id: conv?.id,
        }),
      });
      if (res.ok) {
        const body = await res.json();
        applySessionData(body);
        startSessionPolling(studentId);
      }
    } catch (e) {
      console.warn('[SESSION] Could not start/fetch session:', e);
    }
  }, [authToken, currentTutorUserId, applySessionData, startSessionPolling]);

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
  // Banner slide-in when session expires
  useEffect(() => {
    if (sessionExpired) {
      Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    } else {
      bannerAnim.setValue(0);
    }
  }, [sessionExpired]);

  // Cleanup
  useEffect(() => () => {
    clearInterval(sessionTimerRef.current);
    clearInterval(sessionPollRef.current);
  }, []);

const handleReopenSession = async () => {
  if (!sessionData?.id || reopenLoading) return;
  setReopenLoading(true);
  try {
    const token = authToken || (await AsyncStorage.getItem('auth_token'));
    const res = await fetch(`${API_URL}/api/sessions/${sessionData.id}/reopen`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const body = await res.json();
      // Use applySessionData (not the soft version) here: the countdown
      // interval was cleared once secondsLeft hit 0, so we need timerKey
      // to bump in order to actually restart ticking after a reopen.
      applySessionData(body);
    }
  } catch (e) {
    console.warn('[SESSION] Reopen failed:', e);
  } finally {
    setReopenLoading(false);
  }
};

  // ── socket: Effect 1 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (appSocket) { socketRef.current = appSocket; return; }
    const socket = io(API_URL, {
      auth: { userId: currentTutorUserId },
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [currentTutorUserId, appSocket]);

  // ── socket: Effect 2 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    setConnectionStatus(socket.connected ? 'connected' : 'disconnected');

    const onConnect    = () => setConnectionStatus('connected');
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onError      = () => setConnectionStatus('error');

    const onReceiveMessage = data => {
      if (String(data.sender_id) === String(currentTutorUserId)) return;
      setMessages(prev => {
        const dup = prev.some(m =>
          (data.id && String(m.id) === String(data.id)) ||
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

    const onUserTyping  = ({ userId }) => { if (String(userId) !== String(currentTutorUserId)) { setIsTyping(true); setTimeout(() => setIsTyping(false), 3000); } };
    const onStopTyping  = ({ userId }) => { if (String(userId) !== String(currentTutorUserId)) setIsTyping(false); };
    const onUsersOnline = ids => setOnlineUsers(new Set(ids));
    const onUserStatus  = ({ userId, status }) => setOnlineUsers(prev => {
      const s = new Set(prev);
      status === 'online' ? s.add(userId) : s.delete(userId);
      return s;
    });

    const onSessionUpdate = data => {
      console.log('[SESSION] Tutor received session_status_update:', data);
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
  }, [appSocket, currentTutorUserId, applySessionData]);

  // ── Load conversations ────────────────────────────────────────────────────────
  useEffect(() => { loadConversations(); }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tutors/${tutorProfileId}/conversations`);
      if (res.ok) {
        const data  = await res.json();
        const raw   = Array.isArray(data) ? data : (data.conversations || []);
        const normalized = raw.map(c => ({
          ...c,
          studentId:       c.studentId       ?? c.student_id    ?? c.partnerId    ?? c.partner_id,
          studentName:     c.studentName     ?? c.student_name  ?? c.partnerName  ?? c.partner_name ?? 'Student',
          lastMessage:     c.lastMessage     ?? c.last_message,
          lastMessageTime: c.lastMessageTime ?? c.last_message_time ?? c.updatedAt ?? c.updated_at,
          unreadCount:     c.unreadCount     ?? c.unread_count  ?? 0,
        }));
        setConversations(normalized);
      }
    } catch (e) {
      console.error('[TutorMessaging] loadConversations error:', e);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Auto-open ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (openConversationId && conversations.length > 0 && !selectedConversation) {
      const conv = conversations.find(c => c.id === openConversationId);
      if (conv) { openConversation(conv); if (onConversationOpened) onConversationOpened(); }
    }
  }, [openConversationId, conversations, selectedConversation]);

  useEffect(() => {
    if (autoJoinMeetingId && autoJoinUrl && conversations.length > 0 && !selectedConversation) {
      let conv = callerStudentId
        ? conversations.find(c => String(c.studentId || c.partnerId) === String(callerStudentId))
        : null;
      if (!conv && conversations.length > 0) conv = conversations[0];
      if (conv) openConversation(conv);
    }
  }, [autoJoinMeetingId, autoJoinUrl, conversations, selectedConversation, callerStudentId]);

  const openConversation = async conv => {
    setSelectedConversation(conv);
    setLoading(true);
    setSessionData(null);

    const studentId = conv.studentId || conv.partnerId || conv.student_id || conv.partner_id;
    if (!studentId) { console.error('[TutorMessaging] openConversation: cannot resolve studentId', conv); setLoading(false); return; }

    const key = getConversationKey(studentId, currentTutorUserId);
    socketRef.current?.emit('join_conversation', { conversationId: key, userId: currentTutorUserId, partnerId: studentId });

    try {
      const res = await fetch(`${API_URL}/api/conversations/${conv.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages((data.messages || []).map(m => ({
          ...m, isOwn: String(m.sender_id) === String(currentTutorUserId),
        })));
      } else setMessages([]);
    } catch { setMessages([]); }
    finally  { setLoading(false); }

    // Load session state for this student
    await startOrFetchSession(conv, studentId);
  };

  const handleBack = () => {
    clearInterval(sessionTimerRef.current);
    clearInterval(sessionPollRef.current);
    if (onCallEnded) onCallEnded();
    setSelectedConversation(null);
    setMessages([]);
    setSessionData(null);
    setSecondsLeft(0);
  };

  // ── Send message ───────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMessage.trim() && !attachmentFile) return;
    if (!socketRef.current?.connected) { console.error('❌ Socket not connected'); return; }

    const targetId  = selectedConversation.studentId || selectedConversation.partnerId;
    const messageId = uuidv4();
    const msg = {
      id: messageId, messageId,
      sender_id: currentTutorUserId,
      text:      newMessage.trim(),
      timestamp: new Date().toISOString(),
      isOwn:     true,
      status:    'sending',
    };
    setMessages(prev => [...prev, msg]);
    setNewMessage('');

    const key = getConversationKey(targetId, currentTutorUserId);
    socketRef.current.emit('send_message', {
      conversationId: key,
      sender_id:      currentTutorUserId,
      receiver_id:    targetId,
      text:           msg.text,
      timestamp:      msg.timestamp,
      messageId,
    });
  };

  const handleTyping = () => {
    if (!socketRef.current?.connected || !selectedConversation) return;
    const tStudentId = selectedConversation.studentId || selectedConversation.partnerId;
    const tKey = getConversationKey(tStudentId, currentTutorUserId);
    socketRef.current.emit('typing', { conversationId: tKey, userId: currentTutorUserId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { conversationId: tKey, userId: currentTutorUserId });
    }, 2000);
  };

  const formatTime = ts => {
    if (!ts) return '';
    const d   = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getMessageStatus = msg => {
    if (!msg.isOwn) return null;
    if (msg.status === 'sending')   return <Icon name="clock"        size={12} color="rgba(255,255,255,0.6)" />;
    if (msg.status === 'failed')    return <Icon name="x-circle"     size={12} color="#FCA5A5" />;
    if (msg.status === 'delivered') return <Icon name="check-circle" size={12} color="rgba(255,255,255,0.9)" />;
    return <Icon name="check" size={12} color="rgba(255,255,255,0.6)" />;
  };

  const filteredConversations = conversations.filter(c => {
    const name = c.studentName || c.partnerName || '';
    return !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // countdown colour
  const countdownColor =
    secondsLeft <= 120 ? '#ef4444' :
    secondsLeft <= 300 ? '#f59e0b' : '#22c55e';

  // ── Message bubble ─────────────────────────────────────────────────────────────
  const renderMessage = ({ item: msg }) => (
    <View style={[styles.bubbleRow, msg.isOwn ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, msg.isOwn ? styles.ownBubble : styles.theirBubble]}>
        {msg.file_url && msg.file_type === 'image' && (
          <TouchableOpacity onPress={() => Linking.openURL(msg.file_url)}>
            <Image source={{ uri: msg.file_url }} style={styles.imageAttach} resizeMode="cover" />
          </TouchableOpacity>
        )}
        {msg.text ? (
          <Text style={[styles.bubbleText, msg.isOwn ? styles.ownText : styles.theirText]}>
            {msg.text}
          </Text>
        ) : null}
        <View style={styles.bubbleMeta}>
          <Text style={[styles.bubbleTime, msg.isOwn ? styles.ownMeta : styles.theirMeta]}>
            {formatTime(msg.timestamp)}
          </Text>
          {getMessageStatus(msg)}
        </View>
      </View>
    </View>
  );

  // ── CONVERSATION LIST ──────────────────────────────────────────────────────────
  if (!selectedConversation) {
    return (
      <SafeAreaView style={styles.container}>
           {/* ADD THIS */}
      {appSocket &&  (
        <VoiceCall
          externalSocket={appSocket}
          currentUserId={currentTutorUserId}
          selectedTutor={selectedTutorForCall ?? { user_id: callerStudentId ?? null, name: 'Student' }}
          currentUserName={tutorName}
          autoJoinMeetingId={autoJoinMeetingId}
          autoJoinUrl={autoJoinUrl}
          onCallEnded={onCallEnded}
          authToken={authToken}
        />
      )}
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.listTitle}>Messages</Text>
            <Text style={styles.tutorNameLabel}>{tutorName}</Text>
          </View>
          <View style={[
            styles.statusDot,
            { backgroundColor: connectionStatus === 'connected' ? '#22C55E' : '#9CA3AF' },
          ]} />
        </View>

        <View style={styles.searchBar}>
          <Icon name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search students…"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <View style={styles.loadingCenter}><ActivityIndicator color="#2563EB" /></View>
        ) : (
          <FlatList
            data={filteredConversations}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.convList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Icon name="message-square" size={36} color="#D1D5DB" />
                <Text style={styles.emptyText}>No conversations yet</Text>
                <Text style={styles.emptySubtext}>Students will appear here when they message you</Text>
              </View>
            }
            renderItem={({ item: conv }) => {
              const sId     = conv.studentId || conv.partnerId;
              const isOnline = onlineUsers.has(sId);
              return (
                <TouchableOpacity style={styles.convRow} onPress={() => openConversation(conv)}>
                  <View style={styles.convAvatar}>
                    <Icon name="user" size={20} color="#2563EB" />
                    {isOnline && <View style={styles.onlineDot} />}
                  </View>
                  <View style={styles.convInfo}>
                    <View style={styles.convInfoTop}>
                      <Text style={styles.convName}>{conv.studentName || conv.partnerName || 'Student'}</Text>
                      <Text style={styles.convTime}>{formatTime(conv.lastMessageTime)}</Text>
                    </View>
                    <Text style={styles.convLastMsg} numberOfLines={1}>{conv.lastMessage || 'No messages'}</Text>
                  </View>
                  {conv.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{conv.unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── CHAT VIEW ──────────────────────────────────────────────────────────────────
  const studentId         = selectedConversation.studentId || selectedConversation.partnerId;
  const isOnline          = onlineUsers.has(studentId);
  const studentDisplayName = selectedConversation.studentName || selectedConversation.partnerName || 'Student';

  // Banner translate from bottom
  const bannerTranslate = bannerAnim.interpolate({
    inputRange: [0, 1], outputRange: [80, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      {appSocket && (
        <VoiceCall
          externalSocket={appSocket}
          currentUserId={currentTutorUserId}
          selectedTutor={selectedTutorForCall ?? { user_id: callerStudentId ?? null, name: 'Student' }}
          currentUserName={tutorName}
          autoJoinMeetingId={autoJoinMeetingId}
          autoJoinUrl={autoJoinUrl}
          onCallEnded={onCallEnded}
        />
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── Header ── */}
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.chatAvatar}>
            <Icon name="user" size={18} color="#fff" />
            {isOnline && <View style={styles.onlineDotChat} />}
          </View>

          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName} numberOfLines={1}>{studentDisplayName}</Text>
            <Text style={styles.chatHeaderStatus}>{isOnline ? '● Online' : 'Offline'}</Text>
          </View>

          {/* Countdown badge */}
          {sessionData && (
            <View style={[styles.countdownBadge, { borderColor: countdownColor }]}>
              <Icon
                name={sessionExpired ? 'lock' : 'clock'}
                size={11}
                color={sessionExpired ? '#ef4444' : countdownColor}
              />
              <Text style={[styles.countdownText, { color: sessionExpired ? '#ef4444' : countdownColor }]}>
                {sessionExpired ? 'Expired' : fmtCountdown(secondsLeft)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Session-expired tutor banner ── */}
        {sessionExpired && (
          <Animated.View
            style={[
              styles.expiredBanner,
              { transform: [{ translateY: bannerTranslate }] },
            ]}
          >
            <View style={styles.expiredBannerLeft}>
              <Icon name="alert-circle" size={18} color="#b45309" />
              <View>
                <Text style={styles.expiredBannerTitle}>Session time ended</Text>
                <Text style={styles.expiredBannerSub}>
                  Student messaging and calls are paused
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.reopenBtn, reopenLoading && styles.reopenBtnLoading]}
              onPress={handleReopenSession}
              disabled={reopenLoading}
            >
              {reopenLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Icon name="refresh-cw" size={13} color="#fff" />
                    <Text style={styles.reopenBtnText}>Reopen</Text>
                  </>}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Session-active countdown bar (last 5 min) ── */}
        {sessionData?.is_active && secondsLeft > 0 && secondsLeft <= 300 && (
          <View style={[
            styles.warningBar,
            { backgroundColor: secondsLeft <= 120 ? '#fee2e2' : '#fef3c7' },
          ]}>
            <Icon name="clock" size={13} color={secondsLeft <= 120 ? '#b91c1c' : '#92400e'} />
            <Text style={[
              styles.warningBarText,
              { color: secondsLeft <= 120 ? '#b91c1c' : '#92400e' },
            ]}>
              Session ends in {fmtCountdown(secondsLeft)}
            </Text>
          </View>
        )}

        {/* ── Messages ── */}
        {loading ? (
          <View style={styles.loadingCenter}><ActivityIndicator color="#2563EB" /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Icon name="message-square" size={36} color="#D1D5DB" />
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            }
            ListFooterComponent={
              isTyping ? (
                <View style={styles.rowLeft}>
                  <View style={[styles.bubble, styles.theirBubble, styles.typingBubble]}>
                    <Text style={styles.typingDots}>• • •</Text>
                  </View>
                </View>
              ) : null
            }
            renderItem={renderMessage}
          />
        )}

        {/* ── Input ── */}
        <View style={styles.inputBar}>
          {attachmentFile && (
            <View style={styles.attachPreview}>
              <Icon name="file" size={14} color="#374151" />
              <Text style={styles.attachName} numberOfLines={1}>{attachmentFile.name}</Text>
              <TouchableOpacity onPress={() => setAttachmentFile(null)}>
                <Icon name="x" size={14} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.inputIconBtn}>
              <Icon name="paperclip" size={18} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inputIconBtn, isRecording && styles.recordingActive]}
              onPress={() => setIsRecording(r => !r)}
            >
              <Icon name="mic" size={18} color={isRecording ? '#fff' : '#6B7280'} />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder={isRecording ? 'Recording…' : 'Message…'}
              placeholderTextColor="#9CA3AF"
              value={newMessage}
              onChangeText={text => { setNewMessage(text); handleTyping(); }}
              onSubmitEditing={sendMessage}
              editable={!isRecording}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!newMessage.trim() && !attachmentFile) && styles.sendBtnDisabled,
              ]}
              onPress={sendMessage}
              disabled={(!newMessage.trim() && !attachmentFile) || connectionStatus !== 'connected'}
            >
              <Icon name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  flex:         { flex: 1 },
  loadingCenter:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  listTitle:      { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  tutorNameLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusDot:      { width: 10, height: 10, borderRadius: 99 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginVertical: 10,
    backgroundColor: '#F3F4F6', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1F2937' },

  convList: { paddingHorizontal: 0, paddingBottom: 20 },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  convAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center',
    position: 'relative', flexShrink: 0,
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#fff',
  },
  convInfo:    { flex: 1, minWidth: 0 },
  convInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  convName:    { fontWeight: '600', fontSize: 14, color: '#1F2937', flexShrink: 1 },
  convTime:    { fontSize: 11, color: '#9CA3AF', flexShrink: 0, marginLeft: 6 },
  convLastMsg: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  unreadBadge: {
    backgroundColor: '#2563EB', width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  emptyState:   { alignItems: 'center', paddingVertical: 60 },
  emptyText:    { color: '#9CA3AF', fontSize: 14, marginTop: 10 },
  emptySubtext: { color: '#D1D5DB', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 30 },

  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#2563EB',
  },
  backBtn:      { padding: 4, flexShrink: 0 },
  chatAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', flexShrink: 0,
  },
  onlineDotChat: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#4ADE80', borderWidth: 2, borderColor: '#2563EB',
  },
  chatHeaderInfo:   { flex: 1, minWidth: 0 },
  chatHeaderName:   { color: '#fff', fontWeight: '600', fontSize: 15 },
  chatHeaderStatus: { color: '#BFDBFE', fontSize: 11, marginTop: 1 },

  countdownBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  countdownText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // ── expired banner (tutor) ─────────────────────────────────────────────────
  expiredBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1, borderBottomColor: '#fde68a',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  expiredBannerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  expiredBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  expiredBannerSub:   { fontSize: 11, color: '#b45309', marginTop: 1 },
  reopenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    marginLeft: 10, flexShrink: 0,
  },
  reopenBtnLoading: { opacity: 0.7 },
  reopenBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // ── 5-minute warning bar ───────────────────────────────────────────────────
  warningBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  warningBarText: { fontSize: 12, fontWeight: '600' },

  messagesList: { padding: 12, flexGrow: 1 },
  emptyChat:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

  bubbleRow: { marginBottom: 6 },
  rowLeft:   { alignItems: 'flex-start' },
  rowRight:  { alignItems: 'flex-end' },
  bubble:    { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  ownBubble: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  bubbleText:  { fontSize: 14, lineHeight: 19 },
  ownText:     { color: '#fff' },
  theirText:   { color: '#1F2937' },
  bubbleMeta:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  bubbleTime:  { fontSize: 11 },
  ownMeta:     { color: 'rgba(255,255,255,0.7)' },
  theirMeta:   { color: '#9CA3AF' },
  imageAttach: { width: 180, height: 140, borderRadius: 10, marginBottom: 4 },
  typingBubble:{ paddingVertical: 10, paddingHorizontal: 14 },
  typingDots:  { color: '#6B7280', fontSize: 16, letterSpacing: 3 },

  inputBar: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  attachPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3F4F6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6,
  },
  attachName:   { flex: 1, fontSize: 12, color: '#374151' },
  inputRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  inputIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recordingActive: { backgroundColor: '#EF4444' },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: '#1F2937', maxHeight: 100,
  },
  sendBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});

export default TutorMessagingView;