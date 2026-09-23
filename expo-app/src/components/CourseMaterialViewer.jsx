/**
 * CourseMaterialViewer.native.jsx
 * React Native conversion of CourseMaterialsViewer
 *
 * Dependencies:
 *   npm install react-native-webview
 *   npm install react-native-vector-icons
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  SafeAreaView,
  Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather as Icon } from '@expo/vector-icons';

const CourseMaterialsViewer = ({ course, onClose, API_URL = 'https://hult-663884308553.europe-west9.run.app' }) => {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [pdfError, setPdfError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [playerVisible, setPlayerVisible] = useState(false);

  useEffect(() => {
    if (course?.course_id || course?.id) fetchSections();
  }, [course?.course_id, course?.id]);

  const fetchSections = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/courses/${course.course_id}/sections`);
      if (!response.ok) throw new Error('Failed to fetch sections');
      const data = await response.json();
      setSections(data.sections || []);
      const expanded = {};
      (data.sections || []).forEach(s => { expanded[s.id] = true; });
      setExpandedSections(expanded);
    } catch (error) {
      console.error(error);
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewMaterial = (material) => {
    setPdfError(false);
    setPdfLoading(true);
    setSelectedMaterial(material);
    setPlayerVisible(true);
  };

  const handleDownloadMaterial = (material) => {
    if (!course.offline_available) {
      Alert.alert('Unavailable', 'This course is not available for offline download');
      return;
    }
    Linking.openURL(material.file_path);
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const getMaterialColor = (type) => {
    switch (type) {
      case 'video': return '#EF4444';
      case 'image': return '#3B82F6';
      case 'presentation': return '#F97316';
      case 'document': return '#16A34A';
      default: return '#6B7280';
    }
  };

  const getMaterialIconName = (type) => {
    switch (type) {
      case 'video': return 'video';
      case 'image': return 'image';
      case 'presentation': return 'monitor';
      case 'document': return 'file-text';
      default: return 'file';
    }
  };

  const isPdf = (material) => material?.file_path?.toLowerCase().endsWith('.pdf');

  const getGoogleDocsViewerUrl = (fileUrl) =>
    `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;

  // ─── Material Player Modal ────────────────────────────────────────
  const renderPlayerModal = () => {
    if (!selectedMaterial) return null;
    const fileUrl = selectedMaterial.file_path;

    return (
      <Modal visible={playerVisible} animationType="slide" onRequestClose={() => setPlayerVisible(false)}>
        <SafeAreaView style={styles.playerModal}>
          {/* Header */}
          <View style={styles.playerHeader}>
            <View style={styles.playerHeaderLeft}>
              <Text style={styles.playerTitle} numberOfLines={1}>{selectedMaterial.title}</Text>
              {selectedMaterial.description ? (
                <Text style={styles.playerDesc} numberOfLines={1}>{selectedMaterial.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setPlayerVisible(false)} style={styles.playerClose}>
              <Icon name="x" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.playerContent}>
            {pdfLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#A78BFA" />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            )}
            {pdfError ? (
              <View style={styles.errorContainer}>
                <Icon name="alert-circle" size={40} color="#FBBF24" />
                <Text style={styles.errorTitle}>Preview unavailable</Text>
                <Text style={styles.errorSub}>Open the file directly in your browser.</Text>
                <View style={styles.errorButtons}>
                  <TouchableOpacity style={styles.btnBlue} onPress={() => Linking.openURL(fileUrl)}>
                    <Icon name="external-link" size={14} color="#fff" />
                    <Text style={styles.btnText}>Open</Text>
                  </TouchableOpacity>
                  {course.offline_available && (
                    <TouchableOpacity style={styles.btnGreen} onPress={() => Linking.openURL(fileUrl)}>
                      <Icon name="download" size={14} color="#fff" />
                      <Text style={styles.btnText}>Download</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <WebView
                source={{ uri: selectedMaterial.type === 'video' ? fileUrl : getGoogleDocsViewerUrl(fileUrl) }}
                style={styles.webview}
                onLoad={() => setPdfLoading(false)}
                onError={() => { setPdfLoading(false); setPdfError(true); }}
                allowsFullscreenVideo
                javaScriptEnabled
              />
            )}
          </View>

          {/* Action bar */}
          {!pdfError && (
            <View style={styles.playerActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.btnBlue]} onPress={() => Linking.openURL(fileUrl)}>
                <Icon name="external-link" size={14} color="#fff" />
                <Text style={styles.btnText}>Open in browser</Text>
              </TouchableOpacity>
              {course.offline_available && (
                <TouchableOpacity style={[styles.actionBtn, styles.btnGreen]} onPress={() => Linking.openURL(fileUrl)}>
                  <Icon name="download" size={14} color="#fff" />
                  <Text style={styles.btnText}>Download</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  // ─── Main Screen ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Course Header */}
      <View style={styles.courseHeader}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.courseHeaderText}>
          <Text style={styles.courseTitle} numberOfLines={1}>{course.title}</Text>
          <Text style={styles.courseSubtitle} numberOfLines={1}>
            {course.tutor_name} · {course.category}
          </Text>
        </View>
        {course.progress >= 100 && (
          <View style={styles.doneBadge}>
            <Icon name="award" size={12} color="#14532D" />
            <Text style={styles.doneText}>Done</Text>
          </View>
        )}
      </View>
      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${course.progress || 0}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Description */}
        {course.description ? (
          <View style={styles.descCard}>
            <View style={styles.descHeader}>
              <Icon name="book-open" size={16} color="#7C3AED" />
              <Text style={styles.descTitle}>About This Course</Text>
            </View>
            <Text style={styles.descText}>{course.description}</Text>
          </View>
        ) : null}

        {/* Sections */}
        <Text style={styles.sectionHeading}>Course Content</Text>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingLabel}>Loading content…</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="book-open" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>No content uploaded yet</Text>
            <Text style={styles.emptySubtext}>Check back later</Text>
          </View>
        ) : (
          sections.map((section, sectionIndex) => (
            <View key={section.id} style={styles.sectionCard}>
              {/* Section header */}
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.id)}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionTitle}>
                    Section {sectionIndex + 1}: {section.title}
                  </Text>
                  {section.description ? <Text style={styles.sectionDesc}>{section.description}</Text> : null}
                  <Text style={styles.sectionCount}>
                    {section.materials?.length || 0} material{section.materials?.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Icon name={expandedSections[section.id] ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Materials */}
              {expandedSections[section.id] && (
                section.materials?.length > 0 ? (
                  section.materials.map((material, matIndex) => (
                    <View
                      key={material.id}
                      style={[
                        styles.materialRow,
                        selectedMaterial?.id === material.id && styles.materialRowActive,
                      ]}
                    >
                      <View style={[styles.matIconBox, { backgroundColor: getMaterialColor(material.type) + '20' }]}>
                        <Icon name={getMaterialIconName(material.type)} size={20} color={getMaterialColor(material.type)} />
                      </View>
                      <View style={styles.matInfo}>
                        <Text style={styles.matTitle}>
                          {sectionIndex + 1}.{matIndex + 1} {material.title}
                        </Text>
                        {material.description ? <Text style={styles.matDesc}>{material.description}</Text> : null}
                        <View style={styles.matMeta}>
                          <View style={styles.metaTag}><Text style={styles.metaText}>{material.type}</Text></View>
                          {material.duration > 0 && (
                            <View style={styles.metaTag}>
                              <Icon name="clock" size={11} color="#9CA3AF" />
                              <Text style={styles.metaText}> {material.duration} min</Text>
                            </View>
                          )}
                          {material.file_size > 0 && (
                            <View style={styles.metaTag}>
                              <Text style={styles.metaText}>{(material.file_size / 1024 / 1024).toFixed(1)} MB</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.matActions}>
                          <TouchableOpacity style={styles.viewBtn} onPress={() => handleViewMaterial(material)}>
                            <Icon name={material.type === 'video' ? 'play' : 'eye'} size={13} color="#fff" />
                            <Text style={styles.viewBtnText}>
                              {material.type === 'video' ? 'Watch' : isPdf(material) ? 'Preview' : 'View'}
                            </Text>
                          </TouchableOpacity>
                          {course.offline_available && (
                            <TouchableOpacity style={styles.saveBtn} onPress={() => handleDownloadMaterial(material)}>
                              <Icon name="download" size={13} color="#fff" />
                              <Text style={styles.viewBtnText}>Save</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptySection}>
                    <Icon name="file-text" size={28} color="#E5E7EB" />
                    <Text style={styles.emptySectionText}>No materials in this section yet</Text>
                  </View>
                )
              )}
            </View>
          ))
        )}

        {/* Legend */}
        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Legend</Text>
          <View style={styles.legendGrid}>
            {[
              { type: 'video', label: 'Video', icon: 'video', color: '#EF4444' },
              { type: 'document', label: 'Document / PDF', icon: 'file-text', color: '#16A34A' },
              { type: 'presentation', label: 'Presentation', icon: 'monitor', color: '#F97316' },
              { type: 'image', label: 'Image', icon: 'image', color: '#3B82F6' },
            ].map(item => (
              <View key={item.type} style={styles.legendItem}>
                <Icon name={item.icon} size={14} color={item.color} />
                <Text style={styles.legendLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          {course.offline_available && (
            <View style={styles.offlineBadge}>
              <Icon name="download" size={14} color="#2563EB" />
              <View style={styles.offlineText}>
                <Text style={styles.offlineTitle}>Offline Available</Text>
                <Text style={styles.offlineSub}>All materials can be saved for offline use</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {renderPlayerModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  // Header
  courseHeader: { backgroundColor: '#7C3AED', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  closeBtn: { padding: 4 },
  courseHeaderText: { flex: 1 },
  courseTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  courseSubtitle: { color: '#DDD6FE', fontSize: 12, marginTop: 2 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4ADE80', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, gap: 4 },
  doneText: { fontSize: 11, color: '#14532D', fontWeight: '700' },
  progressBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.3)', backgroundColor: '#DDD6FE' },
  progressFill: { height: 4, backgroundColor: '#7C3AED' },

  scrollContent: { padding: 12, paddingBottom: 32 },

  // Description
  descCard: { backgroundColor: '#EDE9FE', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD6FE', marginBottom: 14 },
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  descTitle: { fontWeight: '700', fontSize: 13, color: '#1F2937' },
  descText: { fontSize: 13, color: '#374151', lineHeight: 19 },

  sectionHeading: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 10 },

  // Loading / empty
  centered: { alignItems: 'center', paddingVertical: 40 },
  loadingLabel: { color: '#6B7280', fontSize: 13, marginTop: 10 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, backgroundColor: '#F3F4F6', borderRadius: 12 },
  emptyText: { color: '#6B7280', fontSize: 13, marginTop: 8 },
  emptySubtext: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },

  // Section card
  sectionCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10, overflow: 'hidden' },
  sectionHeader: { backgroundColor: '#FAF5FF', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F3E8FF' },
  sectionHeaderLeft: { flex: 1, marginRight: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 13, color: '#1F2937' },
  sectionDesc: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  sectionCount: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  // Material row
  materialRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' },
  materialRowActive: { backgroundColor: '#FAF5FF' },
  matIconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  matInfo: { flex: 1 },
  matTitle: { fontWeight: '600', fontSize: 13, color: '#1F2937' },
  matDesc: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  matMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  metaTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  metaText: { fontSize: 10, color: '#6B7280', textTransform: 'capitalize' },
  matActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7C3AED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flex: 1, justifyContent: 'center' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, justifyContent: 'center' },
  viewBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  emptySection: { alignItems: 'center', paddingVertical: 24 },
  emptySectionText: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  // Legend
  legendCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, marginTop: 8 },
  legendTitle: { fontWeight: '700', fontSize: 13, color: '#1F2937', marginBottom: 10 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '45%' },
  legendLabel: { fontSize: 12, color: '#4B5563' },
  offlineBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, padding: 10, marginTop: 10 },
  offlineText: { flex: 1 },
  offlineTitle: { fontSize: 12, fontWeight: '700', color: '#1E3A5F' },
  offlineSub: { fontSize: 11, color: '#3B82F6', marginTop: 2 },

  // Player modal
  playerModal: { flex: 1, backgroundColor: '#111827' },
  playerHeader: { backgroundColor: '#1F2937', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  playerHeaderLeft: { flex: 1, marginRight: 10 },
  playerTitle: { color: '#fff', fontWeight: '600', fontSize: 14 },
  playerDesc: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  playerClose: { padding: 6 },
  playerContent: { flex: 1, position: 'relative' },
  webview: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', zIndex: 10 },
  loadingText: { color: '#9CA3AF', fontSize: 12, marginTop: 8 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 12 },
  errorSub: { color: '#9CA3AF', fontSize: 12, marginTop: 6, textAlign: 'center' },
  errorButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  playerActions: { backgroundColor: '#1F2937', flexDirection: 'row', padding: 12, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  btnBlue: { backgroundColor: '#2563EB' },
  btnGreen: { backgroundColor: '#16A34A' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

export default CourseMaterialsViewer;