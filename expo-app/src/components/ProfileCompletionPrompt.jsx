import React from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { Text, colors as C, font, radius, shadow } from '../theme';

const ProfileCompletionPrompt = ({ onComplete, onDismiss }) => {
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Complete Your Profile</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.message}>
              Students can't see you yet. Complete your profile to start receiving messages and bookings.
            </Text>
          </View>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.laterBtn} onPress={onDismiss}>
              <Text style={styles.laterText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.completeBtn} onPress={onComplete}>
              <Text style={styles.completeText}>Complete Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: { backgroundColor: '#fff', borderRadius: radius.lg, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: C.border, ...shadow },
  header: { padding: 24, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '600', color: C.text },
  body: { paddingHorizontal: 24, paddingBottom: 24 },
  message: { fontSize: 14, color: C.textMuted, lineHeight: 22 },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  laterBtn: { flex: 1, paddingVertical: 10, backgroundColor: C.border, borderRadius: radius.md, alignItems: 'center' },
  laterText: { color: '#374151', fontWeight: '500', fontSize: 14 },
  completeBtn: { flex: 1, paddingVertical: 10, backgroundColor: C.primary, borderRadius: radius.md, alignItems: 'center' },
  completeText: { color: '#fff', fontWeight: '500', fontSize: 14 },
});

export default ProfileCompletionPrompt;