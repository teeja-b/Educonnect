/**
 * VoiceCall.web.jsx
 * Web Agora implementation — mirrors VoiceCall.native.jsx logic exactly
 */

import { Feather as Icon } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const AGORA_APP_ID = '56b7bde5aa344709a6727b7a343ad954';
const API_BASE_URL = 'https://hult-663884308553.europe-west9.run.app';

const fmt = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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
    const [isCallOpen, setIsCallOpen] = useState(false);
    const [callStatus, setCallStatus] = useState('idle');
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [callError, setCallError] = useState(null);
    const [isCreatingCall, setIsCreatingCall] = useState(false);
    const [remoteJoined, setRemoteJoined] = useState(false);

    const clientRef = useRef(null);
    const localTrackRef = useRef(null);
    const clientReadyRef = useRef(false);
    const pendingJoinRef = useRef(null);
    const handledAutoJoinRef = useRef(null);
    const meetingIdRef = useRef('');
    const isMountedRef = useRef(true);
    const timerRef = useRef(null);

    const pulseAnim = useRef(new Animated.Value(1)).current;

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
    // ── Load Agora SDK (web only, SSR-safe) ───────────────────────────────
    const loadAgora = async () => {
        if (typeof window === 'undefined') return null;
        const mod = await import('agora-rtc-sdk-ng');
        return mod.default || mod;
    };

    // ── Init Agora client ─────────────────────────────────────────────────
    useEffect(() => {
        isMountedRef.current = true;

        (async () => {
            try {
                const AgoraRTC = await loadAgora();
                if (!AgoraRTC) return;

                AgoraRTC.setLogLevel(4); // suppress verbose logs

                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                clientRef.current = client;

                client.on('user-published', async (user, mediaType) => {
                    await client.subscribe(user, mediaType);
                    if (mediaType === 'audio') {
                        user.audioTrack?.play();
                        if (isMountedRef.current) {
                            setRemoteJoined(true);
                            setCallStatus('connected');
                            setCallError(null);
                        }
                    }
                });

                client.on('user-unpublished', () => {
                    if (isMountedRef.current) setRemoteJoined(false);
                });

                client.on('user-left', () => {
                    if (isMountedRef.current) {
                        setRemoteJoined(false);
                        setTimeout(() => {
                            if (isMountedRef.current) endCall(false);
                        }, 3000);
                    }
                });

                client.on('exception', (evt) => {
                    console.warn('[Agora Web] exception:', evt);
                });

                clientReadyRef.current = true;
                console.log('[Agora Web] Client initialized');

                // Process any pending auto-join that arrived before client was ready
                if (pendingJoinRef.current) {
                    const meetingId = pendingJoinRef.current;
                    pendingJoinRef.current = null;
                    console.log('[Agora Web] Processing pending auto-join:', meetingId);
                    meetingIdRef.current = meetingId;
                    setIsCallOpen(true);
                    setCallStatus('calling');
                    setCallDuration(0);
                    setRemoteJoined(false);
                    try {
                        await joinAgoraChannel(meetingId);
                    } catch (err) {
                        console.error('[Agora Web] pending auto-join error:', err);
                        if (isMountedRef.current) setCallError(err.message);
                    }
                }
            } catch (err) {
                console.error('[Agora Web] Failed to init client:', err);
            }
        })();

        return () => {
            isMountedRef.current = false;
            cleanupAgora();
            clearInterval(timerRef.current);
        };
    }, []);

    // ── Cleanup ───────────────────────────────────────────────────────────
    const cleanupAgora = async () => {
        try {
            if (localTrackRef.current) {
                localTrackRef.current.stop();
                localTrackRef.current.close();
                localTrackRef.current = null;
            }
            if (clientRef.current) {
                await clientRef.current.leave();
            }
        } catch (err) {
            console.warn('[Agora Web] cleanup error:', err);
        }
    };

    // ── Timer + pulse ─────────────────────────────────────────────────────
    useEffect(() => {
        if (callStatus === 'connected') {
            timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.18, duration: 900,
                        easing: Easing.inOut(Easing.ease), useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1, duration: 900,
                        easing: Easing.inOut(Easing.ease), useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            clearInterval(timerRef.current);
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
        return () => clearInterval(timerRef.current);
    }, [callStatus]);

    // ── Auto-join (callee side) ───────────────────────────────────────────
    useEffect(() => {
        if (!autoJoinMeetingId) return;
        if (handledAutoJoinRef.current === autoJoinMeetingId) return;
        handledAutoJoinRef.current = autoJoinMeetingId;

        console.log('[VoiceCall Web] autoJoinMeetingId received:', autoJoinMeetingId, '| client ready:', clientReadyRef.current);

        meetingIdRef.current = autoJoinMeetingId;
        setIsCallOpen(true);
        setCallStatus('calling');
        setCallDuration(0);
        setRemoteJoined(false);
        setCallError(null);

        if (!clientReadyRef.current) {
            console.log('[VoiceCall Web] Client not ready, queuing auto-join');
            pendingJoinRef.current = autoJoinMeetingId;
            return;
        }

        (async () => {
            try {
                await joinAgoraChannel(autoJoinMeetingId);
            } catch (err) {
                console.error('[Agora Web] auto-join error:', err);
                if (isMountedRef.current) setCallError(err.message);
            }
        })();
    }, [autoJoinMeetingId]);

    // ── Socket listeners ──────────────────────────────────────────────────
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
        externalSocket.on('call_ended', onCallEnded);

        return () => {
            externalSocket.off('call_declined', onCallDeclined);
            externalSocket.off('call_ended', onCallEnded);
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

        externalSocket.on('call_declined', onCallDeclined);
        externalSocket.on('call_ended', onCallEnded);
        externalSocket.on('call_accepted', onCallAccepted);
        // Uncomment the line below ONLY if App.jsx is confirmed broken:
        // externalSocket.on('incoming_video_call', onIncomingCallFallback);

        return () => {
            externalSocket.off('call_declined', onCallDeclined);
            externalSocket.off('call_ended', onCallEnded);
            externalSocket.off('call_accepted', onCallAccepted);
            // externalSocket.off('incoming_video_call', onIncomingCallFallback);
        };
    }, [externalSocket, selectedTutor, isCallOpen]);
    // ─── VoiceCall.web.jsx — joinAgoraChannel ─────────────────────────────────
    const joinAgoraChannel = async (channelName) => {
        if (!clientRef.current) throw new Error('Agora client not initialized');
        const AgoraRTC = await loadAgora();
        if (!AgoraRTC) throw new Error('Agora SDK not available');

        const numericUid = toAgoraUid(currentUserId); // ← convert here
        const token = await fetchAgoraToken(channelName, numericUid);

        await clientRef.current.join(AGORA_APP_ID, channelName, token, numericUid); // ← numeric
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = audioTrack;
        await clientRef.current.publish([audioTrack]);
    };

    // ── Start call (caller side) ──────────────────────────────────────────
    const startCall = async () => {
        if (!selectedTutor) {
            Alert.alert('Error', 'Please select a contact first.');
            return;
        }
        if (!externalSocket?.connected) {
            Alert.alert('Error', 'Not connected. Please wait a moment and try again.');
            return;
        }
        if (!clientRef.current || !clientReadyRef.current) {
            Alert.alert('Error', 'Call engine not ready. Please try again in a moment.');
            return;
        }

        setIsCreatingCall(true);
        setCallError(null);

        try {
            const meetingId = `vc-${currentUserId}-${selectedTutor.user_id}-${Date.now()}`;
            meetingIdRef.current = meetingId;
            handledAutoJoinRef.current = meetingId; // prevent echo

            await joinAgoraChannel(meetingId);

            externalSocket.emit('initiate_video_call', {
                meetingId,
                callerId: currentUserId,
                receiverId: selectedTutor.user_id,
                callerName: currentUserName,
                joinUrl: '',
            });

            setIsCallOpen(true);
            setCallStatus('calling');
            setCallDuration(0);
            setRemoteJoined(false);
        } catch (err) {
            console.error('[Agora Web] startCall error:', err);
            setCallError(err.message);
            Alert.alert('Error', `Failed to start call: ${err.message}`);
            await cleanupAgora();
        } finally {
            setIsCreatingCall(false);
        }
    };

    // ── End call ──────────────────────────────────────────────────────────
    const endCall = useCallback(async (emitEvent = true) => {
        const meetingId = meetingIdRef.current;
        const otherUserId = selectedTutor?.user_id;

        await cleanupAgora();

        if (emitEvent && externalSocket?.connected && meetingId) {
            externalSocket.emit('end_video_call', {
                meetingId,
                endedBy: currentUserId,
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

        onCallEnded?.();
    }, [selectedTutor, currentUserId, externalSocket, onCallEnded]);

    // ── Toggle mute ───────────────────────────────────────────────────────
    const toggleMute = async () => {
        const next = !isMuted;
        setIsMuted(next);
        if (localTrackRef.current) {
            await localTrackRef.current.setMuted(next);
        }
    };

    // ── UI ────────────────────────────────────────────────────────────────
    const isConnected = externalSocket?.connected ?? false;

    const statusLabel =
        callStatus === 'calling' ? (remoteJoined ? 'Connecting audio…' : 'Calling…') :
            callStatus === 'connected' ? fmt(callDuration) :
                '';

    return (
        <>
            {/* Phone button — only when a contact is selected and not already in a call */}
            {!isCallOpen && !!selectedTutor?.user_id && (
                <TouchableOpacity
                    style={[
                        styles.headerCallBtn,
                        (!isConnected || isCreatingCall) && styles.disabledBtn,
                    ]}
                    onPress={startCall}
                    disabled={isCreatingCall || !isConnected}
                    accessibilityLabel="Start voice call"
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

                        {/* Speaker toggle is N/A on web but kept for UI consistency */}
                        <TouchableOpacity
                            style={[styles.controlBtn, styles.controlBtnActive]}
                            accessibilityLabel="Speaker (always on for web)"
                        >
                            <Icon name="volume-2" size={22} color="#fff" />
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