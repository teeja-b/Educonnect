/**
 * StudentProfile.jsx
 * The student's own profile: only the answers from the learning survey
 * (skills, motivation, learning preferences, subjects, languages, goals,
 * preferred tutor gender). The student can review and edit them here.
 */
import { storage } from '../utils/storage';
import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { Text, colors as C, radius } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather as Icon } from '@expo/vector-icons';
import { SurveyDetails, pickSurvey, s as surveyStyles } from './StudentSurveyView';

import { API_URL } from '../utils/config';


// Alert.alert works on web for a plain message, but window.alert is more reliable there
const notify = (title, message) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const StudentProfile = ({ onClose, onAccountDeleted, visible = true }) => {
  // Android draws modals edge-to-edge (under the status bar and the
  // navigation buttons), and React Native's SafeAreaView only pads on iOS,
  // so pad by the system-bar insets ourselves - same approach as App.jsx.
  const insets = useSafeAreaInsets();
  const sysPad = Platform.OS === 'android' ? { paddingTop: insets.top, paddingBottom: insets.bottom } : null;
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [survey, setSurvey] = useState(pickSurvey());

  useEffect(() => { fetchProfile(); }, []);
  const getToken = () => storage.getItem('token');

  const fetchProfile = async () => {
    try {
      const token = await getToken();
      const [userRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/api/user/info`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/student/profile`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const userData = await userRes.json();
      const profileData = await profileRes.json();
      setFullName(userData.user?.full_name || '');
      setSurvey(pickSurvey(profileData.profile || {}));
    } catch (err) {
      notify('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      // Survey answers only
      const res = await fetch(`${API_URL}/api/student/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(survey),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }
      notify('Saved', 'Profile updated successfully!');
      setEditing(false);
      fetchProfile();
    } catch (e) {
      notify('Error', `Failed to update profile: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    const doDelete = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/user/delete-account`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server returned ${res.status}`);
        }
        notify('Account deleted', 'Your account has been permanently deleted.');
        // Log out: the old token belongs to a user that no longer exists
        if (onAccountDeleted) onAccountDeleted(); else onClose?.();
      } catch (e) {
        notify('Error', `Failed to delete account: ${e.message}`);
      }
    };

    const title = 'Delete account';
    const message = 'This will permanently delete your profile, enrollments, progress, and messages. This cannot be undone.';
    // Alert.alert buttons do nothing on web, so use the browser's dialog there
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) doDelete();
    } else {
      Alert.alert(`⚠️ ${title}`, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide">
        <SafeAreaView style={[styles.centered, sysPad]}>
          <ActivityIndicator size="large" color="#2F5BEA" />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, sysPad]}>
        {/* Header */}
        <View style={surveyStyles.header}>
          <View style={surveyStyles.headerInner}>
            <View style={surveyStyles.avatar}>
              <Text style={surveyStyles.avatarText}>{fullName?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
            <View style={surveyStyles.headerText}>
              <Text style={surveyStyles.headerName} numberOfLines={1}>{fullName || 'Student'}</Text>
              <Text style={surveyStyles.headerSub}>Learning survey</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={surveyStyles.closeBtn} accessibilityLabel="Close profile">
              <Icon name="x" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={surveyStyles.scroll} keyboardShouldPersistTaps="handled">
          <SurveyDetails survey={survey} editing={editing} onChange={setSurvey} />

          {/* Delete */}
          <View style={surveyStyles.section}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
              <Text style={styles.deleteBtnText}>Delete My Account Permanently</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerInner}>
            {editing ? (
              <View style={styles.footerRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); fetchProfile(); }} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Icon name="save" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Changes</Text></>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Icon name="edit-2" size={16} color="#fff" />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1, minHeight: 0 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: C.textMuted, marginTop: 10, fontSize: 13 },

  deleteBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  deleteBtnText: { color: C.danger, fontSize: 13, fontWeight: '600' },

  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.tile, paddingHorizontal: 12, paddingVertical: 10 },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.borderStrong, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.successText, borderRadius: radius.md, paddingVertical: 10 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.primary, borderRadius: radius.md, paddingVertical: 10 },
  editBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default StudentProfile;
