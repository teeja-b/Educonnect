import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Text, colors as C, font, radius, shadow, useCompact } from '../theme';
import {
  Upload, X, Plus, FileText, Video, Trash2,
  CheckCircle, AlertCircle, FolderPlus,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { storage } from '../utils/storage';

import { API_URL } from '../utils/config';

// ── helpers ──────────────────────────────────────────────────────────────────

const getToken = async () => {
  return storage.getItem('token');
};

// Alert.alert buttons do nothing on react-native-web, so confirmations and
// messages fall back to the browser's own dialogs there.
const notify = (title, message) => {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
};
const confirmAction = (title, message, confirmLabel, onConfirm) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
};

const CONTENT_WIDTH = 760;

const CATEGORIES = ['Mathematics', 'Science', 'English', 'History', 'Technology', 'Arts', 'Other'];
const LEVELS     = ['Beginner', 'Intermediate', 'Advanced'];
const MAT_TYPES  = ['document',  'presentation', 'image'];

// ── sub-components ────────────────────────────────────────────────────────────

const Label = ({ text }) => <Text style={s.label}>{text}</Text>;

const Field = ({ label, style, ...props }) => (
  <View style={s.fieldWrap}>
    {label && <Label text={label} />}
    {/* merge, so multiline fields keep the input border */}
    <TextInput placeholderTextColor="#9ca3af" {...props} style={[s.input, style]} />
  </View>
);

const Picker = ({ label, value, options, onChange }) => (
  <View style={s.fieldWrap}>
    {label && <Label text={label} />}
    {/* Wraps onto extra lines instead of scrolling sideways */}
    <View style={s.pillRow}>
      {options.map(o => (
        <TouchableOpacity
          key={o}
          style={[s.pill, value === o && s.pillActive]}
          onPress={() => onChange(o)}
        >
          <Text style={[s.pillText, value === o && s.pillTextActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

const Btn = ({ label, onPress, color = '#2F5BEA', disabled, icon, style }) => (
  <TouchableOpacity
    style={[s.btn, { backgroundColor: disabled ? '#9ca3af' : color }, style]}
    onPress={onPress}
    disabled={disabled}
  >
    {icon}
    <Text style={s.btnText}>{label}</Text>
  </TouchableOpacity>
);

const FileTypeIcon = ({ type }) => {
  const colors = { image: '#2F5BEA', presentation: '#ea580c', document: '#059669' };
  return <FileText size={16} color={colors[type] || '#6b7280'} />;
};

// ── TutorCourseManager ────────────────────────────────────────────────────────

const TutorCourseManager = ({ onClose }) => {
  // Wide screens show course cards two per row; phones keep a single column.
  const compact = useCompact();
  const { height: winHeight } = useWindowDimensions();
  // Android draws modals edge-to-edge (under the status bar and the
  // navigation buttons), and React Native's SafeAreaView only pads on iOS,
  // so pad by the system-bar insets ourselves - same approach as App.jsx.
  const insets = useSafeAreaInsets();
  const sysPad = Platform.OS === 'android' ? { paddingTop: insets.top, paddingBottom: insets.bottom } : null;
  const [courses, setCourses]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [sections, setSections]             = useState([]);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);

  const [courseForm, setCourseForm] = useState({
    title: '', description: '', overview: '',
    learning_outcomes: [], prerequisites: [],
    target_audience: '', category: 'Mathematics',
    level: 'Beginner', duration: '', price: 0,
    offline_available: false, published: false,
  });

  const [sectionForm, setSectionForm] = useState({ title: '', description: '', order: 0 });

  const [materialForm, setMaterialForm] = useState({
    title: '', description: '', type: 'document',
    file: null, fileName: '', order: 0, duration: 0,
  });

  // ── API calls ───────────────────────────────────────────────────────────

  const fetchCourses = async () => {
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/api/tutor/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSections = async (courseId) => {
    try {
      const res  = await fetch(`${API_URL}/api/courses/${courseId}/sections`);
      const data = await res.json();
      setSections(data.sections || []);
    } catch (e) {
      setSections([]);
    }
  };

  useEffect(() => { fetchCourses(); }, []);
  useEffect(() => { if (selectedCourse) fetchSections(selectedCourse.id); }, [selectedCourse]);

  // ── handlers ────────────────────────────────────────────────────────────

  const handleCreateCourse = async () => {
    if (!courseForm.title || !courseForm.description) {
      notify('Required', 'Please fill in title and description.');
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/api/courses/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(courseForm),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      const data = await res.json();
      notify('✓ Success', 'Course created successfully!');
      setCourses([...courses, data.course]);
      setShowCreateForm(false);
      setCourseForm({ title: '', description: '', overview: '', learning_outcomes: [], prerequisites: [], target_audience: '', category: 'Mathematics', level: 'Beginner', duration: '', price: 0, offline_available: false, published: false });
    } catch (e) {
      notify('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSection = async () => {
    if (!sectionForm.title) { notify('Required', 'Section title is required.'); return; }
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/api/courses/${selectedCourse.id}/sections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sectionForm),
      });
      if (!res.ok) throw new Error('Failed to create section');
      const data = await res.json();
      notify('✓ Success', 'Section created!');
      setSections([...sections, data.section]);
      setShowSectionForm(false);
      setSectionForm({ title: '', description: '', order: 0 });
    } catch (e) {
      notify('Error', 'Failed to create section');
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setMaterialForm(f => ({ ...f, file: asset, fileName: asset.name }));
      }
    } catch (e) {
      notify('Error', 'Could not pick file');
    }
  };

  const handleUploadMaterial = async () => {
    if (!materialForm.file || !selectedCourse || !selectedSection) {
      notify('Missing', 'Please select a file and section first.');
      return;
    }
    if (!materialForm.title) { notify('Required', 'Material title is required.'); return; }
    setUploadingMaterial(true);
    try {
      const token    = await getToken();
      const formData = new FormData();
      if (Platform.OS === 'web' && materialForm.file.file) {
        // On web the picker gives a real File object; the {uri,name,type} shape only works on native.
        formData.append('file', materialForm.file.file, materialForm.file.name);
      } else {
        formData.append('file', { uri: materialForm.file.uri, name: materialForm.file.name, type: materialForm.file.mimeType || 'application/octet-stream' });
      }
      formData.append('course_id',   selectedCourse.id);
      formData.append('section_id',  selectedSection.id);
      formData.append('title',       materialForm.title);
      formData.append('description', materialForm.description);
      formData.append('type',        materialForm.type);
      formData.append('order',       materialForm.order);
      formData.append('duration',    materialForm.duration);

      const res = await fetch(`${API_URL}/api/upload/material`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed'); }
      notify('✓ Uploaded', 'Material uploaded to Cloudinary!');
      setMaterialForm({ title: '', description: '', type: 'document', file: null, fileName: '', order: 0, duration: 0 });
      setSelectedSection(null);
      await fetchSections(selectedCourse.id);
    } catch (e) {
      notify('Upload Error', e.message);
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleDeleteSection = (sectionId) => {
    confirmAction('Delete Section', 'Delete this section and all its materials?', 'Delete', async () => {
      try {
        const token = await getToken();
        const res   = await fetch(`${API_URL}/api/sections/${sectionId}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        notify('✓ Deleted', 'Section deleted.');
        await fetchSections(selectedCourse.id);
      } catch { notify('Error', 'Failed to delete section'); }
    });
  };

  const handleDeleteCourse = (courseId) => {
    confirmAction(
      'Delete Course',
      'Delete this course? Its sections, materials, enrollments, offline downloads and assignments will also be removed.',
      'Delete',
      async () => {
        try {
          const token = await getToken();
          const res   = await fetch(`${API_URL}/api/courses/${courseId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to delete course');
          }
          notify('✓ Deleted', 'Course deleted.');
          setCourses(prev => prev.filter(c => c.id !== courseId));
          setSelectedCourse(null);
        } catch (e) { notify('Error', e.message || 'Failed to delete course'); }
      },
    );
  };

  const handleTogglePublish = async (course) => {
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/api/courses/${course.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !course.published }),
      });
      if (!res.ok) throw new Error();
      setCourses(courses.map(c => c.id === course.id ? { ...c, published: !c.published } : c));
      notify('✓ Updated', course.published ? 'Course unpublished.' : 'Course published!');
    } catch { notify('Error', 'Failed to update course'); }
  };

  // ── loading state ───────────────────────────────────────────────────────

  if (loading && courses.length === 0) {
    return (
      <Modal visible animationType="fade" transparent>
        <View style={[s.overlay, sysPad]}>
          <View style={s.loadCard}>
            <ActivityIndicator size="large" color="#2F5BEA" />
            <Text style={s.loadText}>Loading your courses…</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // ── main render ─────────────────────────────────────────────────────────

  return (
    <Modal visible animationType="slide">
      <SafeAreaView style={[s.root, sysPad]}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerInner}>
            <View style={s.headerText}>
              <Text style={s.headerTitle} numberOfLines={1}>My Courses</Text>
              <Text style={s.headerSub} numberOfLines={1}>Create and manage your educational content</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <X size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {/* Create course button */}
          <Btn
            label="Create New Course"
            color="#059669"
            icon={<Plus size={18} color="#fff" style={{ marginRight: 6 }} />}
            onPress={() => setShowCreateForm(true)}
          />

          {/* Course list: 2 per row on wide screens */}
          {courses.length === 0 ? (
            <View style={s.emptyState}>
              <FileText size={48} color="#D5DCEA" />
              <Text style={s.emptyText}>You haven't created any courses yet</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreateForm(true)}>
                <Text style={s.emptyBtnText}>Create Your First Course</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.cardGrid}>
            {courses.map(course => (
              <View key={course.id} style={[s.courseCard, compact ? s.cardFull : s.cardHalf]}>
                <View style={s.courseRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.titleRow}>
                      <Text style={s.courseTitle} numberOfLines={2}>{course.title}</Text>
                      {course.published ? (
                        <View style={s.badgeGreen}>
                          <CheckCircle size={11} color="#166534" />
                          <Text style={s.badgeGreenText}> Published</Text>
                        </View>
                      ) : (
                        <View style={s.badgeYellow}>
                          <AlertCircle size={11} color="#92400e" />
                          <Text style={s.badgeYellowText}> Draft</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.courseDesc} numberOfLines={2}>{course.description}</Text>
                    <View style={s.tagRow}>
                      <View style={[s.tag, { backgroundColor: '#E8EEFD' }]}><Text style={[s.tagText, { color: '#1E45C8' }]}>{course.category}</Text></View>
                      <View style={[s.tag, { backgroundColor: '#E8EEFD' }]}><Text style={[s.tagText, { color: '#1E45C8' }]}>{course.level}</Text></View>
                      <View style={[s.tag, { backgroundColor: '#F3F5FA' }]}><Text style={[s.tagText, { color: '#374151' }]}>{course.total_students || 0} students</Text></View>
                    </View>
                  </View>
                </View>

                <View style={s.actionRow}>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#2F5BEA', flex: 2 }]} onPress={() => setSelectedCourse(course)}>
                    <FolderPlus size={14} color="#fff" />
                    <Text style={s.actionBtnText} numberOfLines={1}>Manage Sections</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { flex: 1.5, backgroundColor: course.published ? '#fef3c7' : '#059669' }]}
                    onPress={() => handleTogglePublish(course)}
                  >
                    <Text style={[s.actionBtnText, { color: course.published ? '#92400e' : '#fff' }]} numberOfLines={1}>
                      {course.published ? 'Unpublish' : 'Publish'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#dc2626', paddingHorizontal: 12 }]} onPress={() => handleDeleteCourse(course.id)} accessibilityLabel="Delete course">
                    <Trash2 size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            </View>
          )}
        </ScrollView>

        {/* ── Create Course Modal ─────────────────────────────────────── */}
        <Modal visible={showCreateForm} animationType="slide">
          <SafeAreaView style={[s.root, sysPad]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={s.modalHeader}>
                <View style={s.headerInner}>
                  <Text style={s.modalTitle} numberOfLines={1}>Create New Course</Text>
                  <TouchableOpacity onPress={() => setShowCreateForm(false)} accessibilityLabel="Close">
                    <X size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView contentContainerStyle={[s.body, s.formBody]} keyboardShouldPersistTaps="handled">
                <Field label="Course Title *" value={courseForm.title} onChangeText={v => setCourseForm(f => ({ ...f, title: v }))} placeholder="e.g., Introduction to Python" />
                <Field label="Short Description *" value={courseForm.description} onChangeText={v => setCourseForm(f => ({ ...f, description: v }))} placeholder="Brief course description…" multiline numberOfLines={3} style={s.textarea} />
                <Field label="Course Overview" value={courseForm.overview} onChangeText={v => setCourseForm(f => ({ ...f, overview: v }))} placeholder="Detailed overview…" multiline numberOfLines={4} style={s.textarea} />
                <Field label="Target Audience" value={courseForm.target_audience} onChangeText={v => setCourseForm(f => ({ ...f, target_audience: v }))} placeholder="Who is this course for?" />
                <Picker label="Category" value={courseForm.category} options={CATEGORIES} onChange={v => setCourseForm(f => ({ ...f, category: v }))} />
                <Picker label="Level" value={courseForm.level} options={LEVELS} onChange={v => setCourseForm(f => ({ ...f, level: v }))} />
                <View style={s.twoCol}>
                  <View style={s.col}>
                    <Field label="Duration" value={courseForm.duration} onChangeText={v => setCourseForm(f => ({ ...f, duration: v }))} placeholder="e.g., 8 weeks" />
                  </View>
                  <View style={s.col}>
                    <Field label="Price ($)" value={String(courseForm.price)} onChangeText={v => setCourseForm(f => ({ ...f, price: parseFloat(v) || 0 }))} keyboardType="numeric" placeholder="0 for free" />
                  </View>
                </View>

                <View style={s.row}>
                  <Btn label="Create Course" onPress={handleCreateCourse} disabled={loading} style={s.rowBtn} />
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreateForm(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* ── Sections Manager Modal ──────────────────────────────────── */}
        <Modal visible={!!selectedCourse} animationType="slide">
          <SafeAreaView style={[s.root, sysPad]}>
            <View style={s.header}>
              <View style={s.headerInner}>
                <View style={s.headerText}>
                  <Text style={s.headerTitle} numberOfLines={1}>{selectedCourse?.title}</Text>
                  <Text style={s.headerSub} numberOfLines={1}>Manage sections and materials</Text>
                </View>
                <TouchableOpacity style={s.closeBtn} onPress={() => { setSelectedCourse(null); setSelectedSection(null); }} accessibilityLabel="Close">
                  <X size={20} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              <Btn
                label="Add New Section"
                color="#059669"
                icon={<Plus size={16} color="#fff" style={{ marginRight: 6 }} />}
                onPress={() => setShowSectionForm(true)}
              />

              {/* Inline section form */}
              {showSectionForm && (
                <View style={s.sectionFormBox}>
                  <Text style={s.sectionFormTitle}>New Section</Text>
                  <TextInput style={s.input} placeholder="Section title (e.g., Module 1: Introduction)" value={sectionForm.title} onChangeText={v => setSectionForm(f => ({ ...f, title: v }))} placeholderTextColor="#9ca3af" />
                  <TextInput style={[s.input, s.textarea]} placeholder="Description (optional)" value={sectionForm.description} onChangeText={v => setSectionForm(f => ({ ...f, description: v }))} multiline numberOfLines={2} placeholderTextColor="#9ca3af" />
                  <TextInput style={[s.input, { width: 80 }]} placeholder="Order" value={String(sectionForm.order)} onChangeText={v => setSectionForm(f => ({ ...f, order: parseInt(v) || 0 }))} keyboardType="numeric" placeholderTextColor="#9ca3af" />
                  <View style={s.row}>
                    <Btn label="Create Section" color="#059669" onPress={handleCreateSection} style={s.rowBtn} />
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSectionForm(false)}>
                      <Text style={s.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Sections list */}
              {sections.length === 0 ? (
                <View style={s.emptyState}>
                  <FolderPlus size={40} color="#D5DCEA" />
                  <Text style={s.emptyText}>No sections yet. Create one to start adding materials.</Text>
                </View>
              ) : (
                sections.map(section => (
                  <View key={section.id} style={s.sectionCard}>
                    <View style={s.sectionRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.sectionTitle} numberOfLines={2}>{section.title}</Text>
                        {section.description ? <Text style={s.sectionDesc}>{section.description}</Text> : null}
                        <Text style={s.sectionMeta}>{section.material_count || 0} materials</Text>
                      </View>
                      <TouchableOpacity style={s.deleteIconBtn} onPress={() => handleDeleteSection(section.id)}>
                        <Trash2 size={16} color="#dc2626" />
                      </TouchableOpacity>
                    </View>

                    {/* Materials */}
                    {section.materials?.map((mat, idx) => (
                      <View key={mat.id} style={s.materialRow}>
                        <View style={s.matIconWrap}><FileTypeIcon type={mat.type} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.matTitle} numberOfLines={1}>{idx + 1}. {mat.title}</Text>
                          <Text style={s.matType}>{mat.type}</Text>
                        </View>
                        {mat.duration > 0 && <Text style={s.matDur}>{mat.duration} min</Text>}
                      </View>
                    ))}

                    <TouchableOpacity style={s.uploadSectionBtn} onPress={() => setSelectedSection(section)}>
                      <Upload size={15} color="#fff" />
                      <Text style={s.uploadSectionBtnText} numberOfLines={1}>Upload Material</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* ── Upload Material Modal ───────────────────────────────────── */}
        <Modal visible={!!selectedSection} animationType="slide" transparent>
          <View style={[s.overlay, sysPad]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 440 }}>
              {/* Height-capped so the card never runs off short screens; the form scrolls inside it. */}
              <View style={[s.uploadCard, { maxHeight: Math.round((winHeight - insets.top - insets.bottom) * 0.92) }]}>
                <View style={s.modalHeader}>
                  <View style={s.headerInner}>
                    <View style={s.headerText}>
                      <Text style={s.modalTitle}>Upload Material</Text>
                      <Text style={s.modalSub} numberOfLines={1}>to {selectedSection?.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedSection(null)} accessibilityLabel="Close">
                      <X size={20} color="#374151" />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={s.uploadScroll} contentContainerStyle={s.uploadBody} keyboardShouldPersistTaps="handled">
                  <Field label="Material Title *" value={materialForm.title} onChangeText={v => setMaterialForm(f => ({ ...f, title: v }))} placeholder="e.g., Lesson 1: Introduction" />
                  <Field label="Description" value={materialForm.description} onChangeText={v => setMaterialForm(f => ({ ...f, description: v }))} placeholder="Brief description…" multiline numberOfLines={2} style={s.textarea} />
                  <Picker label="Type *" value={materialForm.type} options={MAT_TYPES} onChange={v => setMaterialForm(f => ({ ...f, type: v }))} />

                  {/* File picker */}
                  <View style={s.fieldWrap}>
                    <Label text="File *" />
                    <TouchableOpacity style={s.filePicker} onPress={pickFile}>
                      <Upload size={18} color="#6b7280" />
                      <Text style={s.filePickerText} numberOfLines={1}>
                        {materialForm.fileName || 'Tap to pick a file…'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={s.fileHint}>Max 500MB</Text>
                  </View>

                  <View style={s.twoCol}>
                    <View style={s.col}>
                      <Field label="Order" value={String(materialForm.order)} onChangeText={v => setMaterialForm(f => ({ ...f, order: parseInt(v) || 0 }))} keyboardType="numeric" placeholder="0" />
                    </View>
                    <View style={s.col}>
                      <Field label="Duration (min)" value={String(materialForm.duration)} onChangeText={v => setMaterialForm(f => ({ ...f, duration: parseInt(v) || 0 }))} keyboardType="numeric" placeholder="Optional" />
                    </View>
                  </View>

                  <View style={s.row}>
                    <TouchableOpacity
                      style={[s.btn, s.rowBtn, { backgroundColor: uploadingMaterial ? '#9ca3af' : '#059669' }]}
                      onPress={handleUploadMaterial}
                      disabled={uploadingMaterial}
                    >
                      {uploadingMaterial
                        ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                        : <Upload size={16} color="#fff" style={{ marginRight: 6 }} />}
                      <Text style={s.btnText} numberOfLines={1}>{uploadingMaterial ? 'Uploading…' : 'Upload'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setSelectedSection(null)} disabled={uploadingMaterial}>
                      <Text style={s.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  body:  { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },
  formBody: { maxWidth: 640 },

  // header (content held to the page column)
  header:     { backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  headerInner:{ width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle:{ color: C.text, fontSize: 17, fontWeight: '700' },
  headerSub:  { color: C.textMuted, fontSize: 12 },
  closeBtn:   { backgroundColor: C.tile, borderRadius: 18, padding: 6, flexShrink: 0 },

  // modal header (white)
  modalHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: '#fff' },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: C.text },
  modalSub:    { fontSize: 12, color: C.textMuted },

  // overlay
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  loadCard: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border, ...shadow },
  loadText: { color: C.textMuted, marginTop: 10 },

  uploadCard:   { backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden', width: '100%', borderWidth: 1, borderColor: C.border, ...shadow },
  uploadScroll: { flexGrow: 0, flexShrink: 1 },
  uploadBody:   { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },

  // form fields
  fieldWrap: { marginBottom: 10, minWidth: 0 },
  label:     { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:     { width: '100%', minWidth: 0, borderWidth: 1, borderColor: C.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.text, backgroundColor: '#fff', fontFamily: font },
  textarea:  { minHeight: 60, textAlignVertical: 'top' },

  // pill picker (wraps)
  pillRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 2 },
  pill:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: '#fff' },
  pillActive:    { backgroundColor: C.primary, borderColor: C.primary },
  pillText:      { fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  pillTextActive:{ color: '#fff', fontWeight: '600' },

  // buttons
  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10 },
  btnText:    { color: '#fff', fontWeight: '600', fontSize: 13 },
  cancelBtn:  { borderWidth: 1, borderColor: C.borderStrong, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10, flex: 1 },
  cancelBtnText: { color: '#374151', fontWeight: '500', fontSize: 13 },
  row:        { flexDirection: 'row', gap: 10, marginTop: 6 },
  rowBtn:     { flex: 1 },
  twoCol:     { flexDirection: 'row', gap: 10 },
  col:        { flex: 1, minWidth: 0 },

  // course cards: grid
  cardGrid:   { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  cardHalf:   { flexBasis: '45%', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  cardFull:   { width: '100%' },
  courseCard: { backgroundColor: '#fff', borderRadius: radius.md, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border, ...shadow },
  courseRow:  { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, flexGrow: 1 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  courseTitle:{ fontSize: 14, fontWeight: '700', color: C.text, flexShrink: 1, minWidth: 0 },
  courseDesc: { fontSize: 12, color: C.textMuted, marginBottom: 6 },
  tagRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag:        { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText:    { fontSize: 11, fontWeight: '500' },

  // badges
  badgeGreen:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.successSoft, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  badgeGreenText: { color: '#166534', fontSize: 11, fontWeight: '600' },
  badgeYellow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  badgeYellowText:{ color: '#92400e', fontSize: 11, fontWeight: '600' },

  // action row
  actionRow:    { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.tile },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 6, minWidth: 0 },
  actionBtnText:{ color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },

  // section card
  sectionCard:    { backgroundColor: C.bg, borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  sectionRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  sectionTitle:   { fontSize: 14, fontWeight: '700', color: C.text },
  sectionDesc:    { fontSize: 12, color: C.textMuted, marginTop: 2 },
  sectionMeta:    { fontSize: 11, color: C.textSubtle, marginTop: 3 },
  deleteIconBtn:  { padding: 6, backgroundColor: C.dangerSoft, borderRadius: radius.sm, flexShrink: 0 },

  // section form
  sectionFormBox:   { backgroundColor: C.primarySoft, borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1.5, borderColor: C.primaryRing, gap: 8 },
  sectionFormTitle: { fontSize: 14, fontWeight: '700', color: C.primaryDark },

  // material row
  materialRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 5, borderWidth: 1, borderColor: C.border, gap: 8 },
  matIconWrap:  { backgroundColor: C.tile, padding: 6, borderRadius: 8, flexShrink: 0 },
  matTitle:     { fontSize: 13, fontWeight: '500', color: C.text },
  matType:      { fontSize: 11, color: C.textMuted, textTransform: 'capitalize' },
  matDur:       { fontSize: 11, color: C.textMuted, flexShrink: 0 },

  // upload section btn
  uploadSectionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.primary, borderRadius: radius.sm, paddingVertical: 8, marginTop: 6 },
  uploadSectionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // file picker
  filePicker:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: C.bg },
  filePickerText: { fontSize: 13, color: C.textMuted, flex: 1, minWidth: 0 },
  fileHint:       { fontSize: 11, color: C.textSubtle, marginTop: 3 },

  // empty state
  emptyState: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText:  { color: C.textSubtle, fontSize: 13, textAlign: 'center' },
  emptyBtn:   { backgroundColor: C.primary, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 9 },
  emptyBtnText:{ color: '#fff', fontWeight: '600' },
});

export default TutorCourseManager;