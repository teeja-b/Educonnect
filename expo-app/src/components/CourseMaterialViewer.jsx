/**
 * CourseMaterialViewer.native.jsx
 * Dependencies: react-native-webview, @expo/vector-icons
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  SafeAreaView,
  Modal,
  Platform,
  Image,
} from 'react-native';
import { Text, colors as C, font, radius, shadow } from '../theme';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather as Icon } from '@expo/vector-icons';
import { API_URL as CONFIG_API_URL } from '../utils/config';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// In-app preview is limited to PDFs and these image formats. Everything else
// (Word, Excel, PowerPoint, video, audio, archives, ...) gets a "preview
// unavailable" message with Open / Download actions instead.
const PREVIEW_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const PREVIEW_PDF_EXTS = ['pdf'];

const CourseMaterialsViewer = ({ course, onClose, API_URL = CONFIG_API_URL }) => {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [pdfError, setPdfError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [playerVisible, setPlayerVisible] = useState(false);

  const courseId = course?.course_id ?? course?.id;
  // Android draws modals edge-to-edge (under the status bar and the
  // navigation buttons), and React Native's SafeAreaView only pads on iOS,
  // so pad by the system-bar insets ourselves - same approach as App.jsx.
  const insets = useSafeAreaInsets();
  const sysPad = Platform.OS === 'android' ? { paddingTop: insets.top, paddingBottom: insets.bottom } : null;

  useEffect(() => {
    if (courseId) fetchSections();
  }, [courseId]);

  const fetchSections = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/courses/${courseId}/sections`);
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

  // ─── URL helpers ─────────────────────────────────────────────────
  const resolveUrl = (path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const getExt = (url) => {
    const clean = (url || '').split('?')[0].split('#')[0].toLowerCase();
    const i = clean.lastIndexOf('.');
    return i >= 0 ? clean.slice(i + 1) : '';
  };

  /** 'pdf' | 'image' | null (null = no in-app preview for this file). */
  const getPreviewKind = (material) => {
    const ext = getExt(resolveUrl(material?.file_path));
    if (PREVIEW_PDF_EXTS.includes(ext)) return 'pdf';
    if (PREVIEW_IMAGE_EXTS.includes(ext)) return 'image';
    // Extension-less URLs: trust the stored type only for images.
    if (!ext && material?.type === 'image') return 'image';
    return null;
  };

  const getFileLabel = (material) => {
    const ext = getExt(resolveUrl(material?.file_path));
    return ext ? `.${ext.toUpperCase()} files` : 'This file type';
  };

  const getPdfWebViewSource = (url) => {
    // iOS WebView renders PDFs natively; Android needs an embedded viewer.
    return Platform.OS === 'ios'
      ? { uri: url }
      : { uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}` };
  };

  // ─── Handlers ────────────────────────────────────────────────────
  const handleViewMaterial = (material) => {
    setPdfError(false);
    // Only previewable files show a loading spinner.
    setPdfLoading(getPreviewKind(material) !== null);
    setSelectedMaterial(material);
    setPlayerVisible(true);
  };

  const handleDownloadMaterial = (material) => {
    if (!course.offline_available) {
      Alert.alert('Unavailable', 'This course is not available for offline download');
      return;
    }
    Linking.openURL(resolveUrl(material.file_path));
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const getMaterialColor = (type) => {
    switch (type) {
      
      case 'image': return '#3B82F6';
      case 'presentation': return '#F97316';
      case 'document': return '#059669';
      default: return '#6B7280';
    }
  };

  const getMaterialIconName = (type) => {
    switch (type) {
      
      case 'image': return 'image';
      case 'presentation': return 'monitor';
      case 'document': return 'file-text';
      default: return 'file';
    }
  };

  // ─── Material Player Modal ───────────────────────────────────────
  const renderPlayerModal = () => {
    if (!selectedMaterial) return null;
    const fileUrl = resolveUrl(selectedMaterial.file_path);
    const previewKind = getPreviewKind(selectedMaterial);

    const renderPreview = () => {
      if (previewKind === 'image') {
        return (
          <View style={styles.imageWrap}>
            <Image
              key={`${selectedMaterial.id}-${playerVisible}`}
              source={{ uri: fileUrl }}
              style={styles.imagePreview}
              resizeMode="contain"
              accessibilityLabel={selectedMaterial.title}
              onLoadEnd={() => setPdfLoading(false)}
              onError={() => { setPdfLoading(false); setPdfError(true); }}
            />
          </View>
        );
      }

      // PDF on web: the browser's own PDF viewer in an iframe.
      if (Platform.OS === 'web') {
        return React.createElement('iframe', {
          key: `${selectedMaterial.id}-${playerVisible}`,
          src: fileUrl,
          title: selectedMaterial.title || 'PDF preview',
          style: { border: 0, width: '100%', height: '100%', flex: 1, backgroundColor: '#fff' },
          onLoad: () => setPdfLoading(false),
        });
      }

      // PDF on iOS / Android
      return (
        <WebView
          key={`${selectedMaterial.id}-${playerVisible}`}
          source={getPdfWebViewSource(fileUrl)}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          userAgent={Platform.OS === 'android' ? DESKTOP_UA : undefined}
          onLoadEnd={() => setPdfLoading(false)}
          onError={(e) => {
            console.warn('WebView error', e.nativeEvent);
            setPdfLoading(false);
            setPdfError(true);
          }}
          onHttpError={(e) => {
            console.warn('WebView HTTP error', e.nativeEvent.statusCode, fileUrl);
            setPdfLoading(false);
            setPdfError(true);
          }}
        />
      );
    };

    return (
      <Modal visible={playerVisible} animationType="slide" onRequestClose={() => setPlayerVisible(false)}>
        <SafeAreaView style={[styles.playerModal, sysPad]}>
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

          <View style={styles.playerContent}>
            {previewKind === null || pdfError ? (
              <View style={styles.errorContainer}>
                <Icon name={previewKind === null ? 'file' : 'alert-circle'} size={40} color="#FBBF24" />
                <Text style={styles.errorTitle}>Preview unavailable</Text>
                <Text style={styles.errorSub}>
                  {previewKind === null
                    ? `${getFileLabel(selectedMaterial)} can't be previewed here. Only PDFs and images (JPG, PNG, WEBP) can be previewed. Open the file to view it.`
                    : 'This file could not be loaded. Open it directly in your browser.'}
                </Text>
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
              renderPreview()
            )}

            {pdfLoading && !pdfError && previewKind !== null && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="#8FA8F5" />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            )}
          </View>

          {!pdfError && previewKind !== null && (
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
    <SafeAreaView style={[styles.container, sysPad]}>
      <View style={styles.courseHeader}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Icon name="arrow-left" size={22} color={C.text} />
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
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${course.progress || 0}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {course.description ? (
          <View style={styles.descCard}>
            <View style={styles.descHeader}>
              <Icon name="book-open" size={16} color="#2F5BEA" />
              <Text style={styles.descTitle}>About This Course</Text>
            </View>
            <Text style={styles.descText}>{course.description}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionHeading}>Course Content</Text>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2F5BEA" />
            <Text style={styles.loadingLabel}>Loading content…</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="book-open" size={40} color="#D5DCEA" />
            <Text style={styles.emptyText}>No content uploaded yet</Text>
            <Text style={styles.emptySubtext}>Check back later</Text>
          </View>
        ) : (
          sections.map((section, sectionIndex) => (
            <View key={section.id} style={styles.sectionCard}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.id)}>
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
                            <Icon name={getPreviewKind(material) ? 'eye' : 'file'} size={13} color="#fff" />
                            <Text style={styles.viewBtnText}>
                              {getPreviewKind(material) ? 'Preview' : 'View'}
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
                    <Icon name="file-text" size={28} color="#E6EAF2" />
                    <Text style={styles.emptySectionText}>No materials in this section yet</Text>
                  </View>
                )
              )}
            </View>
          ))
        )}

        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Legend</Text>
          <View style={styles.legendGrid}>
            {[
              { type: 'video', label: 'Video', icon: 'video', color: '#EF4444' },
              { type: 'document', label: 'Document / PDF', icon: 'file-text', color: '#059669' },
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
              <Icon name="download" size={14} color="#2F5BEA" />
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
  container: { flex: 1, backgroundColor: C.bg },

  courseHeader: { backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  closeBtn: { padding: 4 },
  courseHeaderText: { flex: 1 },
  courseTitle: { color: C.text, fontWeight: '700', fontSize: 15 },
  courseSubtitle: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4ADE80', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, gap: 4 },
  doneText: { fontSize: 11, color: '#14532D', fontWeight: '700' },
  progressBg: { height: 4, backgroundColor: C.primaryRing },
  progressFill: { height: 4, backgroundColor: C.primary },

  scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 12, paddingBottom: 32 },

  descCard: { backgroundColor: C.primarySoft, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.primaryRing, marginBottom: 14 },
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  descTitle: { fontWeight: '700', fontSize: 13, color: C.text },
  descText: { fontSize: 13, color: '#374151', lineHeight: 19 },

  sectionHeading: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 10 },

  centered: { alignItems: 'center', paddingVertical: 40 },
  loadingLabel: { color: C.textMuted, fontSize: 13, marginTop: 10 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, backgroundColor: C.tile, borderRadius: 16 },
  emptyText: { color: C.textMuted, fontSize: 13, marginTop: 8 },
  emptySubtext: { color: C.textSubtle, fontSize: 11, marginTop: 2 },

  sectionCard: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden', ...shadow },
  sectionHeader: { backgroundColor: C.tile, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.primarySoft },
  sectionHeaderLeft: { flex: 1, marginRight: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 13, color: C.text },
  sectionDesc: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  sectionCount: { fontSize: 11, color: C.textSubtle, marginTop: 2 },

  materialRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderTopWidth: 1, borderTopColor: C.tile, backgroundColor: '#fff' },
  materialRowActive: { backgroundColor: C.tile },
  matIconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  matInfo: { flex: 1 },
  matTitle: { fontWeight: '600', fontSize: 13, color: C.text },
  matDesc: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  matMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  metaTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.tile, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  metaText: { fontSize: 10, color: C.textMuted, textTransform: 'capitalize' },
  matActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, flex: 1, justifyContent: 'center' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, justifyContent: 'center' },
  viewBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  emptySection: { alignItems: 'center', paddingVertical: 24 },
  emptySectionText: { fontSize: 11, color: C.textSubtle, marginTop: 4 },

  legendCard: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 8, ...shadow },
  legendTitle: { fontWeight: '700', fontSize: 13, color: C.text, marginBottom: 10 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '45%' },
  legendLabel: { fontSize: 12, color: '#4B5563' },
  offlineBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryRing, borderRadius: 12, padding: 10, marginTop: 10 },
  offlineText: { flex: 1 },
  offlineTitle: { fontSize: 12, fontWeight: '700', color: '#1E3A5F' },
  offlineSub: { fontSize: 11, color: '#3B82F6', marginTop: 2 },

  playerModal: { flex: 1, backgroundColor: C.text },
  playerHeader: { backgroundColor: C.text, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  playerHeaderLeft: { flex: 1, marginRight: 10 },
  playerTitle: { color: '#fff', fontWeight: '600', fontSize: 14 },
  playerDesc: { color: C.textSubtle, fontSize: 11, marginTop: 2 },
  playerClose: { padding: 6 },
  playerContent: { flex: 1, position: 'relative', backgroundColor: '#fff' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  imageWrap: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  imagePreview: { width: '100%', height: '100%' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text, zIndex: 10 },
  loadingText: { color: C.textSubtle, fontSize: 12, marginTop: 8 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.text },
  errorTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 12 },
  errorSub: { color: C.textSubtle, fontSize: 12, marginTop: 6, textAlign: 'center' },
  errorButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  playerActions: { backgroundColor: C.text, flexDirection: 'row', padding: 12, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radius.md, gap: 6 },
  btnBlue: { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md },
  btnGreen: { backgroundColor: C.successText, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

export default CourseMaterialsViewer;