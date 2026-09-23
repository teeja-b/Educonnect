import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff, X } from 'lucide-react-native';
import { storage } from '../utils/storage';
import { API_URL } from '../utils/config';

export default function PasswordResetPage({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!currentPassword) { setError('Please enter your current password'); return false; }
    if (password.length < 8) { setError('New password must be at least 8 characters'); return false; }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setError('Password must contain uppercase, lowercase, and number'); return false;
    }
    if (password !== confirmPassword) { setError('Passwords do not match'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const token = await storage.getItem('token');
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword: password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => onClose(), 2000);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strength = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  };

  if (success) {
    return (
      <Modal transparent animationType="fade" visible>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
            <View style={styles.successIcon}>
              <CheckCircle size={32} color="#16a34a" />
            </View>
            <Text style={styles.successTitle}>Password Changed!</Text>
            <Text style={styles.successSub}>Your password has been successfully updated.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal transparent animationType="slide" visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={20} color="#6b7280" />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Lock size={32} color="#2563eb" />
          </View>
          <Text style={styles.title}>Change Password</Text>
          <Text style={styles.sub}>Enter your current and new password</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
            {/* Current password */}
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputRow}>
              <Lock size={16} color="#9ca3af" />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            {/* New password */}
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputRow}>
              <Lock size={16} color="#9ca3af" />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                {showPassword ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>At least 8 characters with uppercase, lowercase, and number</Text>

            {/* Confirm */}
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputRow}>
              <Lock size={16} color="#9ca3af" />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            {/* Strength */}
            {!!password && (
              <View style={styles.strengthWrap}>
                <View style={styles.strengthBars}>
                  {[strength.length, strength.upper, strength.lower, strength.number].map((ok, i) => (
                    <View key={i} style={[styles.bar, ok && styles.barGreen]} />
                  ))}
                </View>
                <Text style={styles.strengthLabel}>
                  {Object.values(strength).every(Boolean) ? '✓ Strong password' : 'Password strength: Weak'}
                </Text>
              </View>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#dc2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, (loading || !currentPassword || !password || !confirmPassword) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={loading || !currentPassword || !password || !confirmPassword}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>Change Password</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    width: '100%', maxWidth: 440, maxHeight: '90%',
  },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 8 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827', textAlign: 'center' },
  sub: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6, marginTop: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f9fafb',
  },
  input: { flex: 1, fontSize: 14, color: '#111827' },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  strengthWrap: { marginTop: 8 },
  strengthBars: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#e5e7eb' },
  barGreen: { backgroundColor: '#16a34a' },
  strengthLabel: { fontSize: 11, color: '#6b7280' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 10, padding: 12, marginTop: 12,
  },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },
  submitBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancelBtn: {
    backgroundColor: '#f3f4f6', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 10, marginBottom: 16,
  },
  cancelText: { color: '#374151', fontSize: 14 },
  successIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: '#111827', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});