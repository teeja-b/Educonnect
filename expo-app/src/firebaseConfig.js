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

export async function stopRingtone() {
  console.log('🔕 [RINGTONE] stopRingtone called');
  isRinging = false;

  try {
    if (soundObject) {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
      soundObject = null;
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

    soundObject = sound;
    await sound.playAsync();

    setTimeout(() => stopRingtone(), 30_000);

  } catch (error) {
    console.error('❌ [RINGTONE] FAILED:', error.message);
    isRinging = false;
  }
}

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

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
}

/* ─────────────────────────────────────────────────────────────
   FCM INIT
───────────────────────────────────────────────────────────── */

export async function initializeFCM(onMessageCallback) {
  const authToken = await storage.getItem('token');
  if (!authToken) return false;

  if (Platform.OS === "web") {
    console.log("⚠️ [FCM] Skipping web platform");
    return false;
  }

  if (!Device.isDevice) {
    console.warn('⚠️ [FCM] Push notifications only work on physical devices');
    return false;
  }

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

  if (finalStatus !== 'granted') {
    console.warn('⚠️ [FCM] Notification permission denied');
    return false;
  }

  // ── PUSH TOKEN
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });

    const expoPushToken = tokenData.data;
    console.log('📱 [FCM] Expo push token:', expoPushToken);

    const deviceType = Platform.OS === 'ios' ? 'ios' : 'android';
    await registerTokenWithBackend(expoPushToken, deviceType);

  } catch (e) {
    console.warn('⚠️ [FCM] Push token error:', e.message);
  }

  // ── LISTENER
  if (onMessageCallback && Notifications) {
    Notifications.addNotificationReceivedListener(onMessageCallback);
  }

  console.log('✅ [FCM] Notifications initialized');
  return true;
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