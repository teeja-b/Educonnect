import { AlertCircle, CheckCircle, Eye, EyeOff, Lock, Mail, User, X } from 'lucide-react-native';
import { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { initializeFCM } from '../firebaseConfig';
import { API_URL } from '../utils/config';
import { storage } from '../utils/storage';

// ── Floating Label Input ──────────────────────────────────────────────────────
const FloatingInput = ({
  label, value, onChangeText, error,
  secureTextEntry, keyboardType, autoCapitalize,
  rightElement, returnKeyType, onSubmitEditing, inputRef,
}) => {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const onFocus = () => {
    setFocused(true);
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    setFocused(false);
    if (!value) Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const labelSize = anim.interpolate({ inputRange: [0, 1], outputRange: [15, 11] });
  const labelColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#9ca3af', error ? '#ef4444' : focused ? '#2563eb' : '#6b7280'],
  });

  return (
    <View style={[fi.wrap, error && fi.wrapError, focused && fi.wrapFocused]}>
      <Animated.Text style={[fi.label, { top: labelTop, fontSize: labelSize, color: labelColor }]}>
        {label}
      </Animated.Text>
      <View style={fi.row}>
        <TextInput
          ref={inputRef}
          style={fi.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={false}
        />
        {rightElement}
      </View>
      {!!error && (
        <View style={fi.errorRow}>
          <AlertCircle size={11} color="#ef4444" />
          <Text style={fi.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const fi = StyleSheet.create({
  wrap: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10,
    marginBottom: 14, backgroundColor: '#fafafa',
  },
  wrapFocused: { borderColor: '#2563eb', backgroundColor: '#fff' },
  wrapError: { borderColor: '#ef4444' },
  label: { position: 'absolute', left: 14, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  errorText: { color: '#ef4444', fontSize: 11 },
});

// ── Role Pill ─────────────────────────────────────────────────────────────────
const RolePill = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[rp.pill, active && rp.pillActive]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[rp.dot, active && rp.dotActive]} />
    <Text style={[rp.label, active && rp.labelActive]}>{label}</Text>
  </TouchableOpacity>
);

const rp = StyleSheet.create({
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    backgroundColor: '#fafafa',
  },
  pillActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#d1d5db' },
  dotActive: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  label: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  labelActive: { color: '#2563eb' },
});

// ── Sheet wrapper (bottom sheet style) ───────────────────────────────────────
const Sheet = ({ visible, onClose, children, title }) => {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <Modal transparent animationType="slide" visible={visible}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { Keyboard.dismiss(); onClose(); }} />
        <View style={[s.sheet, { paddingBottom: kbHeight || (Platform.OS === 'ios' ? 36 : 24) }]}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={12}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ── REGISTER MODAL ────────────────────────────────────────────────────────────
export const EnhancedRegisterModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', role: 'student',
  });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const refs = { email: useRef(), password: useRef(), confirm: useRef() };
  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Minimum 8 characters';
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password))
      e.password = 'Need uppercase, lowercase & number';
    if (form.password !== form.confirmPassword)
      e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(async () => {
          try {
            const lr = await fetch(`${API_URL}/api/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: form.email, password: form.password }),
            });
            const ld = await lr.json();
            if (lr.ok) {
              await storage.setItem('token', ld.token);
              await storage.setJSON('user', ld.user);
              await storage.setItem('userType', ld.user.user_type);
              if (ld.user.id) await storage.setItem('userId', String(ld.user.id));
              if (ld.user.user_type === 'tutor') {
                if (ld.user.tutor_profile_id)
                  await storage.setItem('tutorProfileId', String(ld.user.tutor_profile_id));
                await storage.setItem('profileComplete', 'false');
              }
              await initializeFCM(p => console.log('FCM:', p));
              onSuccess?.({ token: ld.token, user: ld.user });
            }
          } catch { onClose?.(); }
        }, 1500);
      } else {
        setErrors({ submit: data.error || 'Registration failed' });
      }
    } catch {
      setErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Modal transparent animationType="fade" visible>
        <View style={s.backdrop}>
          <View style={s.successCard}>
            <View style={s.successCircle}><CheckCircle size={36} color="#16a34a" /></View>
            <Text style={s.successTitle}>Account Created!</Text>
            <Text style={s.successSub}>Welcome to EduConnect. Taking you to your dashboard…</Text>
            <ActivityIndicator color="#2563eb" style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Sheet visible title="Create Account" onClose={onClose}>
      <FloatingInput
        label="Full Name" value={form.name} onChangeText={v => set('name', v)}
        error={errors.name} returnKeyType="next" onSubmitEditing={() => refs.email.current?.focus()}
      />
      <FloatingInput
        label="Email address" value={form.email} onChangeText={v => set('email', v)}
        error={errors.email} keyboardType="email-address" autoCapitalize="none"
        returnKeyType="next" onSubmitEditing={() => refs.password.current?.focus()}
        inputRef={refs.email}
      />
      <FloatingInput
        label="Password" value={form.password} onChangeText={v => set('password', v)}
        error={errors.password} secureTextEntry={!showPw}
        returnKeyType="next" onSubmitEditing={() => refs.confirm.current?.focus()}
        inputRef={refs.password}
        rightElement={
          <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={10}>
            {showPw ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
          </TouchableOpacity>
        }
      />
      {!errors.password && (
        <Text style={s.hint}>Uppercase, lowercase & number required</Text>
      )}
      <FloatingInput
        label="Confirm password" value={form.confirmPassword} onChangeText={v => set('confirmPassword', v)}
        error={errors.confirmPassword} secureTextEntry={!showPw}
        returnKeyType="done" onSubmitEditing={handleSubmit}
        inputRef={refs.confirm}
      />

      <Text style={s.roleLabel}>I am a…</Text>
      <View style={s.roleRow}>
        <RolePill label="Student" active={form.role === 'student'} onPress={() => set('role', 'student')} />
        <RolePill label="Tutor" active={form.role === 'tutor'} onPress={() => set('role', 'tutor')} />
      </View>

      {!!errors.submit && (
        <View style={s.errBanner}>
          <AlertCircle size={15} color="#dc2626" />
          <Text style={s.errBannerText}>{errors.submit}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.primaryBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.primaryBtnText}>Create Account</Text>}
      </TouchableOpacity>
    </Sheet>
  );
};

// ── LOGIN MODAL ───────────────────────────────────────────────────────────────
export const EnhancedLoginModal = ({ onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pwRef = useRef();

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        await storage.setItem('token', data.token);
        await storage.setJSON('user', data.user);
        await storage.setItem('userType', data.user.user_type);
        if (data.user.id) await storage.setItem('userId', String(data.user.id));
        await storage.setItem('userName', data.user.full_name || '');
        if (data.user.user_type === 'tutor') {
          if (data.user.tutor_profile_id)
            await storage.setItem('tutorProfileId', String(data.user.tutor_profile_id));
          await storage.setItem('profileComplete', data.user.profile_complete ? 'true' : 'false');
        }
        await initializeFCM(p => console.log('FCM:', p));
        onSuccess?.({ token: data.token, user: data.user });
      } else {
        setError(data.error || 'Incorrect email or password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet visible title="Welcome back" onClose={onClose}>
      <FloatingInput
        label="Email address"
        value={email}
        onChangeText={v => { setEmail(v); setError(''); }}
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={() => pwRef.current?.focus()}
      />
      <FloatingInput
        label="Password"
        value={password}
        onChangeText={v => { setPassword(v); setError(''); }}
        secureTextEntry={!showPw}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        inputRef={pwRef}
        rightElement={
          <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={10}>
            {showPw ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
          </TouchableOpacity>
        }
      />

      {!!error && (
        <View style={s.errBanner}>
          <AlertCircle size={15} color="#dc2626" />
          <Text style={s.errBannerText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.primaryBtn, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.primaryBtnText}>Log In</Text>}
      </TouchableOpacity>
    </Sheet>
  );
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%', maxWidth: 520, alignSelf: 'center',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: { padding: 20, paddingBottom: 8 },

  hint: { fontSize: 11, color: '#9ca3af', marginTop: -10, marginBottom: 14, marginLeft: 2 },

  roleLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },

  errBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errBannerText: { color: '#dc2626', fontSize: 13, flex: 1 },

  primaryBtn: {
    backgroundColor: '#2563eb', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    marginBottom: 4,
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Success state
  successCard: {
    margin: 32, backgroundColor: '#fff', borderRadius: 20,
    padding: 32, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 8,
  },
  successCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#dcfce7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
});

export default { EnhancedRegisterModal, EnhancedLoginModal };