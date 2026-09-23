// src/services/NotificationService.js — Expo version
import { Platform } from 'react-native';
import Notifications from "./notifications";

let _notifId = 1;
const nextId = () => _notifId++;

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function showCallNotification({ callerName, meetingId, joinUrl, callerUserId }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `📞 Incoming call from ${callerName}`,
      body: 'Tap to answer',
      data: { type: 'call', meetingId, joinUrl, callerName, callerUserId },
      sound: 'ringtone.wav',
      ...(Platform.OS === 'android' && { channelId: 'calls' }),
    },
    trigger: null, // deliver immediately
  });
}

export async function showMessageNotification({ senderName, preview, conversationId }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `💬 ${senderName}`,
      body: preview,
      data: { type: 'message', conversationId },
      ...(Platform.OS === 'android' && { channelId: 'messages' }),
    },
    trigger: null,
  });
}