import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from "react-native";
import { API_URL } from './utils/config';
import { storage } from './utils/storage';

/* ─────────────────────────────────────────────────────────────
   SAFE IMPORT: expo-notifications ONLY on native
───────────────────────────────────────────────────────────── */

const Notifications =
    Platform.OS === "web"
        ? null
        : require("expo-notifications");

/* ─────────────────────────────────────────────────────────────
   RINGTONE
───────────────────────────────────────────────────────────── */

let soundObject = null;
let isRinging = false;
let ringToken = 0;        // bumps on every play/stop so a late-loading sound can tell it was cancelled
let ringTimeout = null;

export async function stopRingtone() {
    console.log('🔕 [RINGTONE] stopRingtone called');
    ringToken += 1;
    isRinging = false;
    clearTimeout(ringTimeout);
    ringTimeout = null;

    const sound = soundObject;
    soundObject = null;
    try {
        if (sound) {
            await sound.stopAsync();
            await sound.unloadAsync();
        }
        if (Notifications) {
            await Notifications.dismissAllNotificationsAsync();
        }
    } catch (error) {
        console.warn('⚠️ [RINGTONE] Stop error:', error.message);
    }
}

export async function playRingtone(callerName = 'Someone') {
    console.log('🔔 [RINGTONE] playRingtone called');

    if (isRinging) return;
    isRinging = true;
    const myToken = ++ringToken;

    try {
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: false,
        });

        const { sound } = await Audio.Sound.createAsync(
            require('./assets/ringtone.wav'),
            { isLooping: true, volume: 1.0 }
        );

        // The call was cancelled/answered while the sound was loading — before,
        // the sound started anyway and kept ringing because nothing held a
        // reference to stop it.
        if (myToken !== ringToken) {
            await sound.unloadAsync();
            return;
        }

        soundObject = sound;
        await sound.playAsync();

        ringTimeout = setTimeout(() => {
            if (myToken === ringToken) stopRingtone();
        }, 45_000);

    } catch (error) {
        console.error('❌ [RINGTONE] FAILED:', error.message);
        if (myToken === ringToken) isRinging = false;
    }
}

/* ─────────────────────────────────────────────────────────────
   LOCAL NOTIFICATIONS (shown by the app itself)
   Used for messages and calls that arrive over the socket while the app
   is in the background (native) or the tab is hidden (web).
───────────────────────────────────────────────────────────── */

export async function requestWebNotificationPermission() {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return;
    try {
        if (window.Notification.permission === 'default') await window.Notification.requestPermission();
    } catch { /* ignore */ }
}

export async function showLocalNotification({ title, body, data = {}, channelId = 'general', onClick }) {
    try {
        if (Platform.OS === 'web') {
            if (typeof window === 'undefined' || !('Notification' in window)) return;
            if (window.Notification.permission !== 'granted') return;
            const n = new window.Notification(title, { body, tag: data.tag || undefined });
            n.onclick = () => { window.focus(); onClick?.(); n.close(); };
            return;
        }
        if (!Notifications) return;
        await Notifications.scheduleNotificationAsync({
            content: { title, body, data, sound: 'default' },
            trigger: Platform.OS === 'android' ? { channelId } : null,
        });
    } catch (e) {
        console.warn('⚠️ [NOTIF] Could not show local notification:', e?.message);
    }
}

// Whether a call screen is open — the app keeps its socket connected in the
// background during a call, and disconnects it otherwise (see App.jsx).
let inCall = false;
export const setInCall = (v) => { inCall = !!v; };
export const isInCall = () => inCall;

// Which chat is open right now, so a message from that person doesn't also
// pop a notification. Set by the messaging screens.
let activeChatPartnerId = null;
export const setActiveChatPartner = (id) => { activeChatPartnerId = id == null ? null : String(id); };
export const getActiveChatPartner = () => activeChatPartnerId;

/* ─────────────────────────────────────────────────────────────
   BACKEND TOKEN REGISTRATION
───────────────────────────────────────────────────────────── */

async function registerTokenWithBackend(token, deviceType) {
    try {
        const authToken = await storage.getItem('token');
        if (!authToken) return false;

        const response = await fetch(`${API_URL}/api/notifications/register-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ token, device_type: deviceType }),
        });

        if (response.ok) {
            await storage.setItem('fcm_token', token);
            console.log('✅ [FCM] Token registered with backend');
            return true;
        }

        return false;

    } catch (error) {
        console.error('❌ [FCM] Backend registration error:', error);
        return false;
    }
}

/* ─────────────────────────────────────────────────────────────
   NOTIFICATION HANDLER (SAFE)
───────────────────────────────────────────────────────────── */

export function registerNotificationHandler() {
    if (!Notifications) return;

    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            const data = notification.request.content.data || {};

            if (data.type === "call" || data.type === "incoming_call") {
                await playRingtone(data.callerName || "Someone");
            }

            // shouldShowBanner / shouldShowList are what current expo-notifications
            // versions read; with only shouldShowAlert, notifications that arrive
            // while the app is open were not displayed.
            return {
                shouldShowAlert: true,
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            };
        },
    });
}

async function setupChannelsAndPermission() {
    if (!Notifications) return false;
    // ── ANDROID CHANNELS
    if (Platform.OS === 'android' && Notifications) {
        await Notifications.setNotificationChannelAsync('calls', {
            name: 'Incoming Calls',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'ringtone.wav',
        });

        await Notifications.setNotificationChannelAsync('messages', {
            name: 'Messages',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('general', {
            name: 'General',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        });
    }

    // ── PERMISSIONS
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    return finalStatus === 'granted';

}

/* ─────────────────────────────────────────────────────────────
   FCM INIT
───────────────────────────────────────────────────────────── */

export async function initializeFCM(onMessageCallback) {
    const authToken = await storage.getItem('token');
    if (!authToken) return false;

    if (Platform.OS === "web") {
        await requestWebNotificationPermission();
        console.log("⚠️ [FCM] Push skipped on web — using browser notifications");
        return false;
    }

    // Channels + permission are needed for local notifications too, so set
    // them up before the physical-device check below.
    await setupChannelsAndPermission();

    if (!Device.isDevice) {
        console.warn('⚠️ [FCM] Push notifications only work on physical devices');
        return false;
    }

    const { status: finalStatus } = await Notifications.getPermissionsAsync();
    if (finalStatus !== 'granted') {
        console.warn('⚠️ [FCM] Notification permission denied');
        return false;
    }

    // ── PUSH TOKEN
    await registerPushToken();

    // ── LISTENER
    if (onMessageCallback && Notifications) {
        Notifications.addNotificationReceivedListener(onMessageCallback);
    }

    console.log('✅ [FCM] Notifications initialized');
    return true;
}

/* ─────────────────────────────────────────────────────────────
   PUSH TOKEN REGISTRATION (with retries)
   Called at login and every time the app comes back to the foreground,
   so the server always has this phone's current token — before, it was
   sent once, and if that one attempt failed (slow network right after
   install, app closed too quickly) the server had no token and could not
   push calls until something else happened to re-register it.
───────────────────────────────────────────────────────────── */

export async function registerPushToken() {
    if (!Notifications || Platform.OS === 'web' || !Device.isDevice) return false;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
        console.warn('⚠️ [FCM] No EAS projectId in app.json — run `npx eas-cli init`');
        return false;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
            console.log('📱 [FCM] Expo push token:', expoPushToken);
            const deviceType = Platform.OS === 'ios' ? 'ios' : 'android';
            if (await registerTokenWithBackend(expoPushToken, deviceType)) return true;
        } catch (e) {
            console.warn(`⚠️ [FCM] Push token attempt ${attempt} failed:`, e.message);
        }
        await new Promise((r) => setTimeout(r, attempt * 3000));
    }
    console.warn('❌ [FCM] Could not register push token with the server');
    return false;
}

// Create the Android channels as soon as the app starts (no permission
// needed). Pushes sent to a channel that doesn't exist yet are dropped.
export async function setupNotificationChannels() {
    if (!Notifications || Platform.OS !== 'android') return;
    try {
        await Notifications.setNotificationChannelAsync('calls', {
            name: 'Incoming Calls',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'ringtone.wav',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC,
            bypassDnd: true,
        });
        await Notifications.setNotificationChannelAsync('messages', {
            name: 'Messages',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('general', {
            name: 'General',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        });
    } catch (e) {
        console.warn('⚠️ [FCM] Channel setup failed:', e.message);
    }
}

/* ─────────────────────────────────────────────────────────────
   UNREGISTER TOKEN
───────────────────────────────────────────────────────────── */

export async function unregisterFCMToken() {
    try {
        const token = await storage.getItem('fcm_token');
        if (!token) return true;

        const authToken = await storage.getItem('token');

        if (!authToken) {
            await storage.removeItem('fcm_token');
            return true;
        }

        await fetch(`${API_URL}/api/notifications/unregister-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ token }),
        });

        await storage.removeItem('fcm_token');
        return true;

    } catch (error) {
        console.error('❌ [FCM] Unregister error:', error);
        return false;
    }
}