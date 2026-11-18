import { Platform } from "react-native";

let Notifications = {
    // Return a subscription-shaped object so callers can safely call .remove()
    addNotificationResponseReceivedListener: () => ({ remove() { } }),
    addNotificationReceivedListener: () => ({ remove() { } }),
    setNotificationHandler: () => { },
    dismissAllNotificationsAsync: async () => { },
    getPermissionsAsync: async () => ({ status: "denied" }),
    requestPermissionsAsync: async () => ({ status: "denied" }),
    getExpoPushTokenAsync: async () => ({}),
    setNotificationChannelAsync: async () => { },
};

if (Platform.OS !== "web") {
    Notifications = require("expo-notifications");
}

export default Notifications;