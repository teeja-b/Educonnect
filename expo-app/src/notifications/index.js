import { Platform } from "react-native";

let Notifications = {
  addNotificationResponseReceivedListener: () => {},
  addNotificationReceivedListener: () => {},
  setNotificationHandler: () => {},
  dismissAllNotificationsAsync: async () => {},
  getPermissionsAsync: async () => ({ status: "denied" }),
  requestPermissionsAsync: async () => ({ status: "denied" }),
  getExpoPushTokenAsync: async () => ({}),
  setNotificationChannelAsync: async () => {},
};

if (Platform.OS !== "web") {
  Notifications = require("expo-notifications");
}

export default Notifications;