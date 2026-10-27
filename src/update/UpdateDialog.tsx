import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../state/AppProvider';
import type { UpdateCandidate, UpdateStage } from './UpdateProvider';

export function UpdateDialog({ visible, candidate, stage, message, progress, onClose, onSkip, onDownload, onCancel, onInstall, onReleasePage }: {
  visible: boolean; candidate: UpdateCandidate | null; stage: UpdateStage; message: string; progress: number;
  onClose: () => void; onSkip: () => void; onDownload: () => void; onCancel: () => void; onInstall: () => void; onReleasePage: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!candidate) return null;
  const downloading = stage === 'downloading';
  const busy = downloading || stage === 'installing';
  const ready = stage === 'ready';
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.overlay, { backgroundColor: theme.colors.scrim }]}>
      <Pressable accessibilityLabel="稍后更新" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(20, insets.bottom + 8) }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.textPrimary }]}>更新到 {candidate.manifest.version}</Text>
        <Text style={[styles.detail, { color: theme.colors.textSecondary }]}>{(candidate.asset.size / 1024 / 1024).toFixed(1)} MB · 来自 GitHub 正式发布</Text>
        <ScrollView style={styles.notes}>
          {candidate.manifest.notes.map((note, index) => <Text key={index} style={[styles.note, { color: theme.colors.textPrimary }]}>• {note}</Text>)}
        </ScrollView>
        {!!message && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: stage === 'error' ? theme.colors.danger : theme.colors.textSecondary }]}>{message}</Text>}
        {downloading && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}><View style={[styles.fill, { backgroundColor: theme.colors.primary, width: `${progress * 100}%` }]} /></View>}
        {downloading && <Text style={[styles.detail, { color: theme.colors.textSecondary }]}>{Math.round(progress * 100)}%</Text>}
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={downloading ? '取消下载' : '稍后更新'} onPress={downloading ? onCancel : onClose} style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.textSecondary }}>{downloading ? '取消下载' : '稍后'}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={ready ? '安装更新' : stage === 'error' ? '重新下载更新' : '下载更新'} disabled={busy} onPress={ready ? onInstall : onDownload} style={[styles.button, { backgroundColor: theme.colors.primary, opacity: busy ? 0.45 : 1 }]}><Text style={{ color: theme.colors.white, fontWeight: '700' }}>{ready ? '安装更新' : busy ? '处理中…' : stage === 'error' ? '重新下载' : '下载更新'}</Text></TouchableOpacity>
        </View>
        <View style={styles.actions}>
          {!ready && !busy && <TouchableOpacity accessibilityRole="button" accessibilityLabel="跳过此版本" onPress={onSkip} style={styles.link}><Text style={{ color: theme.colors.textSecondary }}>跳过此版本</Text></TouchableOpacity>}
          <TouchableOpacity accessibilityRole="link" accessibilityLabel="查看发布页" onPress={onReleasePage} style={styles.link}><Text style={{ color: theme.colors.primary }}>查看发布页</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { maxHeight: '88%', borderRadius: 14, padding: 20, gap: 10 },
  title: { fontSize: 19, fontWeight: '700' }, detail: { fontSize: 12, lineHeight: 18 },
  notes: { flexGrow: 0, marginVertical: 6 }, note: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  message: { fontSize: 13, lineHeight: 20 }, track: { height: 5, borderRadius: 3, overflow: 'hidden' }, fill: { height: 5 },
  actions: { flexDirection: 'row', gap: 12 }, button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  link: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
