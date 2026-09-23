import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export const storage = {
  async getItem(key) {
    try {
      if (isWeb) return localStorage.getItem(key);
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.error('[storage] getItem error:', e);
      return null;
    }
  },

  async setItem(key, value) {
    try {
      if (isWeb) { localStorage.setItem(key, String(value)); return; }
      await AsyncStorage.setItem(key, String(value));
    } catch (e) {
      console.error('[storage] setItem error:', e);
    }
  },

  async removeItem(key) {
    try {
      if (isWeb) { localStorage.removeItem(key); return; }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('[storage] removeItem error:', e);
    }
  },

  async clear() {
    try {
      if (isWeb) { localStorage.clear(); return; }
      await AsyncStorage.clear();
    } catch (e) {
      console.error('[storage] clear error:', e);
    }
  },

  async getJSON(key) {
    const val = await this.getItem(key);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  },

  async setJSON(key, value) {
    await this.setItem(key, JSON.stringify(value));
  },
};