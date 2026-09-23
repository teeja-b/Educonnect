import Constants from 'expo-constants';

export const API_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://hult-663884308553.europe-west9.run.app';