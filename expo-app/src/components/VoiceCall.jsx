import { Feather as Icon } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
} from 'react-native-agora';

const AGORA_APP_ID = '56b7bde5aa344709a6727b7a343ad954';
const API_BASE_URL = 'https://hult-663884308553.europe-west9.run.app';

const fmt = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Add this helper near the top of both VoiceCall.native.jsx and VoiceCall.web.jsx
// It converts any string userId into a stable 32-bit unsigned integer.
const toAgoraUid = (userId) => {
  let hash = 0;
  const s = String(userId);
  for (let i = 0; i < s.length; i++) {
    hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100_000; // keep well within uint32 range
};

const requestMicPermission = async () => {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone Permission',
      message: 'This app needs microphone access for voice calls.',
      buttonPositive: 'Allow',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

const VoiceCall = ({
  currentUserId,
  selectedTutor,
  currentUserName = 'User',
  autoJoinMeetingId = null,
  onCallEnded = null,
  externalSocket = null,
  authToken = null,
}) => {
  const [isCallOpen, setIsCallOpen]         = useState(false);
  const [callStatus, setCallStatus]         = useState('idle');
  const [callDuration, setCallDuration]     = useState(0);
  const [isMuted, setIsMuted]               = useState(false);
  const [isSpeaker, setIsSpeaker]           = useState(true);
  const [callError, setCallError]           = useState(null);
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [remoteJoined, setRemoteJoined]     = useState(false);

  const engineRef       = useRef(null);
  const engineReadyRef  = useRef(false);
  const meetingIdRef    = useRef('');
  const isMountedRef    = useRef(true);
  const timerRef        = useRef(null);
  const pendingJoinRef  = useRef(null);
  // Track which meetingId we've already auto-joined to prevent double-join
  const handledAutoJoinRef = useRef(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Engine init ────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    initEngine();
    return () => {
      isMountedRef.current = false;
      cleanupAgora();
      clearInterval(timerRef.current);
    };
  }, []);

  const initEngine = async () => {
    try {
      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      engine.disableVideo();
      engine.enableAudio();
      engine.setDefaultAudioRouteToSpeakerphone(true);

      engine.addListener('onUserJoined', (connection, remoteUid) => {
        console.log('[Agora] Remote user joined:', remoteUid);
        if (isMountedRef.current) {
          setRemoteJoined(true);
          setCallStatus('connected');
          setCallError(null);
        }
      });

      engine.addListener('onUserOffline', (connection, remoteUid, reason) => {
        console.log('[Agora] Remote user offline:', remoteUid, reason);
        if (isMountedRef.current) {
          setRemoteJoined(false);
          setTimeout(() => {
            if (isMountedRef.current) endCall(false);
          }, 3000);
        }
      });

      engine.addListener('onError', (err, msg) => {
        console.error('[Agora] Engine error:', err, msg);
        if (isMountedRef.current) setCallError(`Connection error (${err})`);
      });

      engine.addListener('onConnectionStateChanged', (connection, state, reason) => {
        console.log('[Agora] Connection state:', state, reason);
      });

      engineReadyRef.current = true;
      console.log('[Agora] Engine initialized');

      if (pendingJoinRef.current) {
        const meetingId = pendingJoinRef.current;
        pendingJoinRef.current = null;
        console.log('[Agora] Processing pending auto-join:', meetingId);
        meetingIdRef.current = meetingId;
        setIsCallOpen(true);
        setCallStatus('calling');
        setCallDuration(0);
        setRemoteJoined(false);
        try {
          await joinAgoraChannel(meetingId);
        } catch (err) {
          console.error('[Agora] pending auto-join error:', err);
          if (isMountedRef.current) setCallError(err.message);
        }
      }
    } catch (err) {
      console.error('[Agora] Failed to initialize engine:', err);
    }
  };

  const cleanupAgora = async () => {
    try {
      if (engineRef.current) {
        await engineRef.current.leaveChannel();
        engineRef.current.removeAllListeners();
        engineRef.current.release();
        engineRef.current = null;
      }
    } catch (err) {
      console.warn('[Agora] Cleanup error:', err);
    }
    engineReadyRef.current = false;
  };

  // ── Timer + pulse ──────────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      clearInterval(timerRef.current);
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  // ── Auto-join: callee accepted incoming call ───────────────────────────
  // This fires when the PARENT passes down autoJoinMeetingId after user taps Accept
  useEffect(() => {
    if (!autoJoinMeetingId) return;
    // Prevent handling the same meetingId twice (StrictMode / prop re-render)
    if (handledAutoJoinRef.current === autoJoinMeetingId) return;
    handledAutoJoinRef.current = autoJoinMeetingId;

    console.log('[VoiceCall] autoJoinMeetingId received:', autoJoinMeetingId, '| engine ready:', engineReadyRef.current);

    // Always open the modal immediately so the user sees feedback
    meetingIdRef.current = autoJoinMeetingId;
    setIsCallOpen(true);
    setCallStatus('calling');
    setCallDuration(0);
    setRemoteJoined(false);
    setCallError(null);

    if (!engineReadyRef.current) {
      console.log('[VoiceCall] Engine not ready, queuing auto-join');
      pendingJoinRef.current = autoJoinMeetingId;
      return;
    }

    (async () => {
      try {
        await joinAgoraChannel(autoJoinMeetingId);
      } catch (err) {
        console.error('[Agora] auto-join error:', err);
        if (isMountedRef.current) setCallError(err.message);
      }
    })();
  }, [autoJoinMeetingId]);

  // ── Socket listeners: only call_declined and call_ended ───────────────
  // NOTE: call_accepted is NOT handled here — it's handled by the parent
  // (App.jsx IncomingCallModal → setPendingAutoJoin → autoJoinMeetingId prop).
  // Handling it here too would cause a double-join race condition.
  useEffect(() => {
    if (!externalSocket) return;

    const onCallDeclined = () => {
      setIsCreatingCall(false);
      setIsCallOpen(false);
      setCallStatus('idle');
      Alert.alert('Call Declined', `${selectedTutor?.name || 'User'} is unavailable right now.`);
    };

    const onCallEnded = ({ meetingId }) => {
      if (meetingIdRef.current === meetingId) endCall(false);
    };

    externalSocket.on('call_declined', onCallDeclined);
    externalSocket.on('call_ended',    onCallEnded);

    return () => {
      externalSocket.off('call_declined', onCallDeclined);
      externalSocket.off('call_ended',    onCallEnded);
    };
  }, [externalSocket, selectedTutor]);

  // ─── fetchAgoraToken — accept uid param (both files) ─────────────────────
const fetchAgoraToken = async (channelName, uid) => {
  const res = await fetch(`${API_BASE_URL}/api/agora/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      channelName,
      uid,          // ← numeric uid, matching what joinChannel will use
      role: 'publisher',
    }),
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const { token } = await res.json();
  return token;
};
// Add this block to the socket-listeners useEffect in BOTH VoiceCall files.
// It handles the case where App.jsx never sets autoJoinMeetingId.
// Safe to have both — handledAutoJoinRef prevents double-joins.

useEffect(() => {
  if (!externalSocket) return;

  const onCallDeclined = () => {
    setIsCreatingCall(false);
    setIsCallOpen(false);
    setCallStatus('idle');
    Alert.alert('Call Declined', `${selectedTutor?.name || 'User'} is unavailable right now.`);
  };

  const onCallEnded = ({ meetingId }) => {
    if (meetingIdRef.current === meetingId) endCall(false);
  };

  // ── NEW: fallback in case App.jsx never passes autoJoinMeetingId ─────────
  const onCallAccepted = ({ meetingId }) => {
    // Only the CALLER should react to call_accepted — callee handles autoJoinMeetingId
    if (meetingIdRef.current !== meetingId) return;
    // Caller is already in the channel; this just confirms the callee accepted.
    // No action needed on the caller side — Agora's onUserJoined handles the rest.
    console.log('[VoiceCall] call_accepted confirmed for meetingId:', meetingId);
  };

  // ── NEW: callee-side fallback — if App.jsx didn't set autoJoinMeetingId ──
  const onIncomingCallFallback = ({ meetingId, callerId, callerName }) => {
    // Only handle if this component isn't already in a call
    if (isCallOpen || meetingIdRef.current) return;
    if (handledAutoJoinRef.current === meetingId) return;
    // This fires if App.jsx didn't intercept it. Join directly.
    console.warn('[VoiceCall] Handling incoming_video_call fallback — App.jsx may have missed it');
    handledAutoJoinRef.current = meetingId;
    meetingIdRef.current = meetingId;
    setIsCallOpen(true);
    setCallStatus('calling');
    setCallDuration(0);
    setRemoteJoined(false);
    setCallError(null);
    (async () => {
      try {
        await joinAgoraChannel(meetingId);
      } catch (err) {
        if (isMountedRef.current) setCallError(err.message);
      }
    })();
  };

  externalSocket.on('call_declined',      onCallDeclined);
  externalSocket.on('call_ended',         onCallEnded);
  externalSocket.on('call_accepted',      onCallAccepted);
  // Uncomment the line below ONLY if App.jsx is confirmed broken:
  // externalSocket.on('incoming_video_call', onIncomingCallFallback);

  return () => {
    externalSocket.off('call_declined',      onCallDeclined);
    externalSocket.off('call_ended',         onCallEnded);
    externalSocket.off('call_accepted',      onCallAccepted);
    // externalSocket.off('incoming_video_call', onIncomingCallFallback);
  };
}, [externalSocket, selectedTutor, isCallOpen]);
// ─── VoiceCall.native.jsx — joinAgoraChannel ──────────────────────────────
const joinAgoraChannel = async (channelName) => {
  const permitted = await requestMicPermission();
  if (!permitted) throw new Error('Microphone permission denied');
  if (!engineRef.current) throw new Error('Call engine not initialized');

  const numericUid = toAgoraUid(currentUserId); // ← convert here
  const token = await fetchAgoraToken(channelName, numericUid);

  await engineRef.current.joinChannel(token, channelName, numericUid, { // ← numeric
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
  });
};


  // ── Start call (CALLER side) ───────────────────────────────────────────
  const startCall = async () => {
      if (!selectedTutor || !selectedTutor.user_id) {
      Alert.alert('Error', 'Please select a contact first.');
      return;
    }
    if (!externalSocket?.connected) {
      Alert.alert('Error', 'Not connected. Please wait a moment and try again.');
      return;
    }
    if (!engineRef.current || !engineReadyRef.current) {
      Alert.alert('Error', 'Call engine not ready. Please try again in a moment.');
      return;
    }

    setIsCreatingCall(true);
    setCallError(null);

    try {
      const meetingId = `vc-${currentUserId}-${selectedTutor.user_id}-${Date.now()}`;
      meetingIdRef.current = meetingId;
      handledAutoJoinRef.current = meetingId; // Prevent auto-join echo

      // Join Agora first so the caller is in the channel when callee joins
      await joinAgoraChannel(meetingId);

      // Then notify callee
      externalSocket.emit('initiate_video_call', {
        meetingId,
        callerId:   currentUserId,
        receiverId: selectedTutor.user_id,
        callerName: currentUserName,
        joinUrl:    '',
      });

      setIsCallOpen(true);
      setCallStatus('calling');
      setCallDuration(0);
      setRemoteJoined(false);
    } catch (err) {
      console.error('[Agora] startCall error:', err);
      setCallError(err.message);
      Alert.alert('Error', `Failed to start call: ${err.message}`);
      await engineRef.current?.leaveChannel();
    } finally {
      setIsCreatingCall(false);
    }
  };

  // ── End call ───────────────────────────────────────────────────────────
  const endCall = useCallback(async (emitEvent = true) => {
    const meetingId   = meetingIdRef.current;
    const otherUserId = selectedTutor?.user_id;

    try {
      await engineRef.current?.leaveChannel();
    } catch (err) {
      console.warn('[Agora] leaveChannel error:', err);
    }

    if (emitEvent && externalSocket?.connected && meetingId) {
      externalSocket.emit('end_video_call', {
        meetingId,
        endedBy:     currentUserId,
        otherUserId,
      });
    }

    if (isMountedRef.current) {
      setIsCallOpen(false);
      setCallStatus('idle');
      setCallDuration(0);
      setCallError(null);
      setIsMuted(false);
      setRemoteJoined(false);
    }
    meetingIdRef.current = '';
    pendingJoinRef.current = null;
    handledAutoJoinRef.current = null;

    if (onCallEnded) onCallEnded();
  }, [selectedTutor, currentUserId, externalSocket, onCallEnded]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    engineRef.current?.muteLocalAudioStream(next);
  };

  const toggleSpeaker = () => {
    const next = !isSpeaker;
    setIsSpeaker(next);
    engineRef.current?.setEnableSpeakerphone(next);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const isConnected = externalSocket?.connected ?? false;

  const statusLabel =
    callStatus === 'calling'   ? (remoteJoined ? 'Connecting audio…' : 'Calling…') :
    callStatus === 'connected' ? fmt(callDuration) :
    '';

  return (
    <>
      {/* Phone button — only show when not in a call */}
          {!isCallOpen && selectedTutor?.user_id && (
              <TouchableOpacity
                  style={[
                      styles.headerCallBtn,
                      (!isConnected || isCreatingCall) && styles.disabledBtn,
                  ]}
                  onPress={startCall}
                  disabled={isCreatingCall || !isConnected}
                  accessibilityLabel="Start voice call"
                  accessibilityRole="button"
              >
          {isCreatingCall
            ? <ActivityIndicator size="small" color="#fff" />
            : <Icon name="phone" size={16} color="#fff" />
          }
        </TouchableOpacity>
      )}

      <Modal
        visible={isCallOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => endCall(true)}
      >
        <SafeAreaView style={styles.screen}>

          <View style={styles.statusPill}>
            <View style={[
              styles.statusDot,
              callStatus === 'connected' && styles.statusDotActive,
            ]} />
            <Text style={styles.statusText}>
              {callStatus === 'connected' ? `Connected · ${statusLabel}` : 'Voice call'}
            </Text>
          </View>

          <View style={styles.avatarSection}>
            {callStatus === 'connected' && (
              <>
                <Animated.View style={[
                  styles.pulseRing, styles.pulseRingOuter,
                  { transform: [{ scale: pulseAnim }], opacity: 0.15 },
                ]} />
                <Animated.View style={[
                  styles.pulseRing,
                  { transform: [{ scale: pulseAnim }], opacity: 0.25 },
                ]} />
              </>
            )}
            <View style={styles.avatarCircle}>
              <Icon name="user" size={52} color="#fff" />
            </View>
          </View>

          <Text style={styles.calleeName} numberOfLines={1}>
            {selectedTutor?.name || 'Unknown'}
          </Text>

          <Text style={styles.calleeStatus}>{statusLabel}</Text>

          {callStatus === 'calling' && (
            <ActivityIndicator color="#a78bfa" size="large" style={{ marginTop: 20 }} />
          )}

          {!!callError && (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle" size={15} color="#fca5a5" />
              <Text style={styles.errorText} numberOfLines={2}>{callError}</Text>
            </View>
          )}

          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              onPress={toggleMute}
              accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
            >
              <Icon name={isMuted ? 'mic-off' : 'mic'} size={22} color="#fff" />
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.endBtn}
              onPress={() => endCall(true)}
              accessibilityLabel="End call"
            >
              <Icon name="phone-off" size={26} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
              onPress={toggleSpeaker}
              accessibilityLabel={isSpeaker ? 'Switch to earpiece' : 'Switch to speaker'}
            >
              <Icon name={isSpeaker ? 'volume-2' : 'volume-x'} size={22} color="#fff" />
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>

        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  headerCallBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.4 },
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 44,
    paddingHorizontal: 28,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6b7280' },
  statusDotActive: { backgroundColor: '#4ade80' },
  statusText: { color: '#d1d5db', fontSize: 13, letterSpacing: 0.2 },
  avatarSection: {
    width: 180, height: 180,
    alignItems: 'center', justifyContent: 'center',
    marginVertical: 8,
  },
  pulseRing: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#7c3aed',
  },
  pulseRingOuter: { width: 170, height: 170, borderRadius: 85 },
  avatarCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#6d28d9',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOpacity: 0.7,
    shadowRadius: 28, elevation: 14,
  },
  calleeName: {
    fontSize: 26, fontWeight: '700', color: '#f1f5f9',
    textAlign: 'center', maxWidth: '80%',
  },
  calleeStatus: {
    fontSize: 15, color: '#94a3b8',
    marginTop: 6, letterSpacing: 0.5,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(127,29,29,0.55)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 16,
  },
  errorText: { color: '#fca5a5', fontSize: 13, flex: 1 },
  controls: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 32,
    marginBottom: 4,
  },
  controlBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  controlBtnActive: { backgroundColor: 'rgba(109,40,217,0.45)' },
  controlLabel: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  endBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#dc2626', shadowOpacity: 0.55,
    shadowRadius: 14, elevation: 10,
  },
});

export default VoiceCall;