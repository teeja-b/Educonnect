import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, ActivityIndicator, StyleSheet, SafeAreaView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  Upload, X, Plus, FileText, Video, Trash2,
  CheckCircle, AlertCircle, FolderPlus,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { storage } from '../utils/storage';

const API_URL = 'https://hult-663884308553.europe-west9.run.app';

// ── helpers ──────────────────────────────────────────────────────────────────

const getToken = async () => {
  return storage.getItem('token');
};

const CATEGORIES = ['Mathematics', 'Science', 'English', 'History', 'Technology', 'Arts', 'Other'];
const LEVELS     = ['Beginner', 'Intermediate', 'Advanced'];
const MAT_TYPES  = ['document', 'video', 'presentation', 'image'];

// ── sub-components ────────────────────────────────────────────────────────────

const Label = ({ text }) => <Text style={s.label}>{text}</Text>;

const Field = ({ label, ...props }) => (
  <View style={s.fieldWrap}>
    {label && <Label text={label} />}
    <TextInput style={s.input} placeholderTextColor="#9ca3af" {...props} />
  </View>
);

const Picker = ({ label, value, options, onChange }) => (
  <View style={s.fieldWrap}>
    {label && <Label text={label} />}
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
    </ScrollView>
  </View>
);

const Btn = ({ label, onPress, color = '#2563eb', disabled, icon }) => (
  <TouchableOpacity
    style={[s.btn, { backgroundColor: disabled ? '#9ca3af' : color }]}
    onPress={onPress}
    disabled={disabled}
  >
    {icon}
    <Text style={s.btnText}>{label}</Text>
  </TouchableOpacity>
);

const FileTypeIcon = ({ type }) => {
  const colors = { video: '#dc2626', image: '#2563eb', presentation: '#ea580c', document: '#16a34a' };
  return <FileText size={16} color={colors[type] || '#6b7280'} />;
};

// ── TutorCourseManager ────────────────────────────────────────────────────────

const TutorCourseManager = ({ onClose }) => {
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
      Alert.alert('Required', 'Please fill in title and description.');
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
      Alert.alert('✓ Success', 'Course created successfully!');
      setCourses([...courses, data.course]);
      setShowCreateForm(false);
      setCourseForm({ title: '', description: '', overview: '', learning_outcomes: [], prerequisites: [], target_audience: '', category: 'Mathematics', level: 'Beginner', duration: '', price: 0, offline_available: false, published: false });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSection = async () => {
    if (!sectionForm.title) { Alert.alert('Required', 'Section title is required.'); return; }
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/api/courses/${selectedCourse.id}/sections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sectionForm),
      });
      if (!res.ok) throw new Error('Failed to create section');
      const data = await res.json();
      Alert.alert('✓ Success', 'Section created!');
      setSections([...sections, data.section]);
      setShowSectionForm(false);
      setSectionForm({ title: '', description: '', order: 0 });
    } catch (e) {
      Alert.alert('Error', 'Failed to create section');
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
      Alert.alert('Error', 'Could not pick file');
    }
  };

  const handleUploadMaterial = async () => {
    if (!materialForm.file || !selectedCourse || !selectedSection) {
      Alert.alert('Missing', 'Please select a file and section first.');
      return;
    }
    if (!materialForm.title) { Alert.alert('Required', 'Material title is required.'); return; }
    setUploadingMaterial(true);
    try {
      const token    = await getToken();
      const formData = new FormData();
      formData.append('file', { uri: materialForm.file.uri, name: materialForm.file.name, type: materialForm.file.mimeType || 'application/octet-stream' });
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
      Alert.alert('✓ Uploaded', 'Material uploaded to Cloudinary!');
      setMaterialForm({ title: '', description: '', type: 'document', file: null, fileName: '', order: 0, duration: 0 });
      setSelectedSection(null);
      await fetchSections(selectedCourse.id);
    } catch (e) {
      Alert.alert('Upload Error', e.message);
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleDeleteSection = (sectionId) => {
    Alert.alert('Delete Section', 'Delete this section and all its materials?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken();
            const res   = await fetch(`${API_URL}/api/sections/${sectionId}`, {
              method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            Alert.alert('✓ Deleted', 'Section deleted.');
            await fetchSections(selectedCourse.id);
          } catch { Alert.alert('Error', 'Failed to delete section'); }
        },
      },
    ]);
  };

  const handleDeleteCourse = (courseId) => {
    Alert.alert('Delete Course', 'Delete this course? All materials will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken();
            const res   = await fetch(`${API_URL}/api/courses/${courseId}`, {
              method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            Alert.alert('✓ Deleted', 'Course deleted.');
            setCourses(courses.filter(c => c.id !== courseId));
            setSelectedCourse(null);
          } catch { Alert.alert('Error', 'Failed to delete course'); }
        },
      },
    ]);
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
      Alert.alert('✓ Updated', course.published ? 'Course unpublished.' : 'Course published!');
    } catch { Alert.alert('Error', 'Failed to update course'); }
  };

  // ── loading state ───────────────────────────────────────────────────────

  if (loading && courses.length === 0) {
    return (
      <Modal visible animationType="fade" transparent>
        <View style={s.overlay}>
          <View style={s.loadCard}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={s.loadText}>Loading your courses…</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // ── main render ─────────────────────────────────────────────────────────

  return (
    <Modal visible animationType="slide">
      <SafeAreaView style={s.root}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>My Courses</Text>
            <Text style={s.headerSub}>Create and manage your educational content</Text>
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {/* Create course button */}
          <Btn
            label="Create New Course"
            color="#16a34a"
            icon={<Plus size={18} color="#fff" style={{ marginRight: 6 }} />}
            onPress={() => setShowCreateForm(true)}
          />

          {/* Course list */}
          {courses.length === 0 ? (
            <View style={s.emptyState}>
              <FileText size={48} color="#d1d5db" />
              <Text style={s.emptyText}>You haven't created any courses yet</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreateForm(true)}>
                <Text style={s.emptyBtnText}>Create Your First Course</Text>
              </TouchableOpacity>
            </View>
          ) : (
            courses.map(course => (
              <View key={course.id} style={s.courseCard}>
                <View style={s.courseRow}>
                  <View style={{ flex: 1 }}>
                    <View style={s.titleRow}>
                      <Text style={s.courseTitle}>{course.title}</Text>
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
                      <View style={[s.tag, { backgroundColor: '#dbeafe' }]}><Text style={[s.tagText, { color: '#1e40af' }]}>{course.category}</Text></View>
                      <View style={[s.tag, { backgroundColor: '#ede9fe' }]}><Text style={[s.tagText, { color: '#5b21b6' }]}>{course.level}</Text></View>
                      <View style={[s.tag, { backgroundColor: '#f3f4f6' }]}><Text style={[s.tagText, { color: '#374151' }]}>{course.total_students || 0} students</Text></View>
                    </View>
                  </View>
                </View>

                <View style={s.actionRow}>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#2563eb', flex: 2 }]} onPress={() => setSelectedCourse(course)}>
                    <FolderPlus size={15} color="#fff" />
                    <Text style={s.actionBtnText}>Manage Sections</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { flex: 1.5, backgroundColor: course.published ? '#fef3c7' : '#16a34a' }]}
                    onPress={() => handleTogglePublish(course)}
                  >
                    <Text style={[s.actionBtnText, { color: course.published ? '#92400e' : '#fff' }]}>
                      {course.published ? 'Unpublish' : 'Publish'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#dc2626', paddingHorizontal: 14 }]} onPress={() => handleDeleteCourse(course.id)}>
                    <Trash2 size={15} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* ── Create Course Modal ─────────────────────────────────────── */}
        <Modal visible={showCreateForm} animationType="slide">
          <SafeAreaView style={s.root}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Create New Course</Text>
                <TouchableOpacity onPress={() => setShowCreateForm(false)}>
                  <X size={22} color="#374151" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                <Field label="Course Title *" value={courseForm.title} onChangeText={v => setCourseForm(f => ({ ...f, title: v }))} placeholder="e.g., Introduction to Python" />
                <Field label="Short Description *" value={courseForm.description} onChangeText={v => setCourseForm(f => ({ ...f, description: v }))} placeholder="Brief course description…" multiline numberOfLines={3} style={s.textarea} />
                <Field label="Course Overview" value={courseForm.overview} onChangeText={v => setCourseForm(f => ({ ...f, overview: v }))} placeholder="Detailed overview…" multiline numberOfLines={4} style={s.textarea} />
                <Field label="Target Audience" value={courseForm.target_audience} onChangeText={v => setCourseForm(f => ({ ...f, target_audience: v }))} placeholder="Who is this course for?" />
                <Picker label="Category" value={courseForm.category} options={CATEGORIES} onChange={v => setCourseForm(f => ({ ...f, category: v }))} />
                <Picker label="Level" value={courseForm.level} options={LEVELS} onChange={v => setCourseForm(f => ({ ...f, level: v }))} />
                <Field label="Duration" value={courseForm.duration} onChangeText={v => setCourseForm(f => ({ ...f, duration: v }))} placeholder="e.g., 8 weeks" />
                <Field label="Price ($)" value={String(courseForm.price)} onChangeText={v => setCourseForm(f => ({ ...f, price: parseFloat(v) || 0 }))} keyboardType="numeric" placeholder="0 for free" />

                <View style={s.row}>
                  <Btn label="Create Course" onPress={handleCreateCourse} disabled={loading} />
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
          <SafeAreaView style={s.root}>
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle} numberOfLines={1}>{selectedCourse?.title}</Text>
                <Text style={s.headerSub}>Manage sections and materials</Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => { setSelectedCourse(null); setSelectedSection(null); }}>
                <X size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              <Btn
                label="Add New Section"
                color="#16a34a"
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
                    <Btn label="Create Section" color="#16a34a" onPress={handleCreateSection} />
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSectionForm(false)}>
                      <Text style={s.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Sections list */}
              {sections.length === 0 ? (
                <View style={s.emptyState}>
                  <FolderPlus size={40} color="#d1d5db" />
                  <Text style={s.emptyText}>No sections yet. Create one to start adding materials.</Text>
                </View>
              ) : (
                sections.map(section => (
                  <View key={section.id} style={s.sectionCard}>
                    <View style={s.sectionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.sectionTitle}>{section.title}</Text>
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
                        <View style={{ flex: 1 }}>
                          <Text style={s.matTitle}>{idx + 1}. {mat.title}</Text>
                          <Text style={s.matType}>{mat.type}</Text>
                        </View>
                        {mat.duration > 0 && <Text style={s.matDur}>{mat.duration} min</Text>}
                      </View>
                    ))}

                    <TouchableOpacity style={s.uploadSectionBtn} onPress={() => setSelectedSection(section)}>
                      <Upload size={15} color="#fff" />
                      <Text style={s.uploadSectionBtnText}>Upload Material to this Section</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* ── Upload Material Modal ───────────────────────────────────── */}
        <Modal visible={!!selectedSection} animationType="slide" transparent>
          <View style={s.overlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 440 }}>
              <View style={s.uploadCard}>
                <View style={s.modalHeader}>
                  <View>
                    <Text style={s.modalTitle}>Upload Material</Text>
                    <Text style={s.modalSub}>to {selectedSection?.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedSection(null)}>
                    <X size={22} color="#374151" />
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled">
                  <Field label="Material Title *" value={materialForm.title} onChangeText={v => setMaterialForm(f => ({ ...f, title: v }))} placeholder="e.g., Lesson 1: Introduction" />
                  <Field label="Description" value={materialForm.description} onChangeText={v => setMaterialForm(f => ({ ...f, description: v }))} placeholder="Brief description…" multiline numberOfLines={2} style={s.textarea} />
                  <Picker label="Type *" value={materialForm.type} options={MAT_TYPES} onChange={v => setMaterialForm(f => ({ ...f, type: v }))} />

                  {/* File picker */}
                  <View style={s.fieldWrap}>
                    <Label text="File *" />
                    <TouchableOpacity style={s.filePicker} onPress={pickFile}>
                      <Upload size={18} color="#6b7280" />
                      <Text style={s.filePickerText}>
                        {materialForm.fileName || 'Tap to pick a file…'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={s.fileHint}>Max 500MB</Text>
                  </View>

                  <View style={s.twoCol}>
                    <View style={{ flex: 1 }}>
                      <Field label="Order" value={String(materialForm.order)} onChangeText={v => setMaterialForm(f => ({ ...f, order: parseInt(v) || 0 }))} keyboardType="numeric" placeholder="0" />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Field label="Duration (min)" value={String(materialForm.duration)} onChangeText={v => setMaterialForm(f => ({ ...f, duration: parseInt(v) || 0 }))} keyboardType="numeric" placeholder="Optional" />
                    </View>
                  </View>

                  <View style={s.row}>
                    <TouchableOpacity
                      style={[s.btn, { flex: 1, backgroundColor: uploadingMaterial ? '#9ca3af' : '#16a34a' }]}
                      onPress={handleUploadMaterial}
                      disabled={uploadingMaterial}
                    >
                      {uploadingMaterial
                        ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                        : <Upload size={16} color="#fff" style={{ marginRight: 6 }} />}
                      <Text style={s.btnText}>{uploadingMaterial ? 'Uploading…' : 'Upload to Cloudinary'}</Text>
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
  root:  { flex: 1, backgroundColor: '#f9fafb' },
  body:  { padding: 16, paddingBottom: 40 },

  // header
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:{ color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub:  { color: '#bfdbfe', fontSize: 12 },
  closeBtn:   { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 6 },

  // modal header (white)
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  modalTitle:  { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalSub:    { fontSize: 12, color: '#6b7280' },

  // overlay
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  loadCard: { backgroundColor: '#fff', borderRadius: 12, padding: 32, alignItems: 'center' },
  loadText: { color: '#6b7280', marginTop: 12 },

  uploadCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', width: '100%' },

  // form fields
  fieldWrap: { marginBottom: 14 },
  label:     { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:     { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#fff' },
  textarea:  { minHeight: 72, textAlignVertical: 'top' },

  // pill picker
  pillRow:       { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  pill:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  pillActive:    { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillText:      { fontSize: 13, color: '#374151' },
  pillTextActive:{ color: '#fff', fontWeight: '600' },

  // buttons
  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 12 },
  btnText:    { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelBtn:  { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', marginBottom: 12, flex: 1 },
  cancelBtnText: { color: '#374151', fontWeight: '500' },
  row:        { flexDirection: 'row', gap: 10, marginTop: 8 },
  twoCol:     { flexDirection: 'row' },

  // course card
  courseCard: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#2563eb', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2, overflow: 'hidden' },
  courseRow:  { padding: 14 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  courseTitle:{ fontSize: 15, fontWeight: 'bold', color: '#111827', flex: 1 },
  courseDesc: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  tagRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:        { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:    { fontSize: 11, fontWeight: '500' },

  // badges
  badgeGreen:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeGreenText: { color: '#166534', fontSize: 11, fontWeight: '600' },
  badgeYellow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeYellowText:{ color: '#92400e', fontSize: 11, fontWeight: '600' },

  // action row
  actionRow:    { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, paddingVertical: 10 },
  actionBtnText:{ color: '#fff', fontSize: 13, fontWeight: '600' },

  // section card
  sectionCard:    { backgroundColor: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  sectionRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  sectionTitle:   { fontSize: 14, fontWeight: 'bold', color: '#111827' },
  sectionDesc:    { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sectionMeta:    { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  deleteIconBtn:  { padding: 6, backgroundColor: '#fee2e2', borderRadius: 6 },

  // section form
  sectionFormBox:   { backgroundColor: '#eff6ff', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 2, borderColor: '#bfdbfe', gap: 10 },
  sectionFormTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e40af' },

  // material row
  materialRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb', gap: 10 },
  matIconWrap:  { backgroundColor: '#f3f4f6', padding: 8, borderRadius: 6 },
  matTitle:     { fontSize: 13, fontWeight: '500', color: '#111827' },
  matType:      { fontSize: 11, color: '#6b7280', textTransform: 'capitalize' },
  matDur:       { fontSize: 11, color: '#6b7280' },

  // upload section btn
  uploadSectionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 10, marginTop: 10 },
  uploadSectionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // file picker
  filePicker:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, backgroundColor: '#f9fafb' },
  filePickerText: { fontSize: 13, color: '#6b7280', flex: 1 },
  fileHint:       { fontSize: 11, color: '#9ca3af', marginTop: 4 },

  // empty state
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:  { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  emptyBtn:   { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText:{ color: '#fff', fontWeight: '600' },
});

export default TutorCourseManager;