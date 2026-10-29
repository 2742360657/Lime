import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppActions, useSettings, useTheme } from '../state/AppProvider';
import { getTheme, THEME_PRESETS, type AppTheme, type ThemeId } from '../theme';

export function ThemeSelectionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings } = useSettings();
  const { setThemeId } = useAppActions();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭色系选择" />
      <View style={styles.card}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>色系选择</Text><Text style={styles.hint}>点选即时预览</Text></View>
        <ScrollView accessibilityLabel="主题列表" contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {(Object.keys(THEME_PRESETS) as ThemeId[]).map(id => {
            const choice = getTheme(id);
            const selected = settings.themeId === id;
            return <TouchableOpacity key={id} accessibilityRole="button" accessibilityLabel={`应用${choice.label}色系`}
              accessibilityState={{ selected }} onPress={() => setThemeId(id)} style={[styles.option, selected && styles.selected]}>
              <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.preview, { backgroundColor: choice.colors.background }]}>
                <View style={[styles.previewHeading, { backgroundColor: choice.colors.textPrimary }]} />
                <View style={[styles.previewPaper, { backgroundColor: choice.colors.surface }]}>
                  <View style={styles.previewCopy}>
                    <View style={[styles.previewLine, { backgroundColor: choice.colors.textSecondary }]} />
                    <View style={[styles.previewLineShort, { backgroundColor: choice.colors.border }]} />
                  </View>
                  <View style={[styles.previewAction, { backgroundColor: choice.colors.primary }]} />
                </View>
              </View>
              <View style={styles.labelRow}><Text style={styles.label}>{choice.label}</Text>{selected && <Text style={styles.mark}>已选</Text>}</View>
              <View style={styles.pairRow}>{choice.pair.map(color => <View key={color} style={[styles.swatch, { backgroundColor: color, borderColor: theme.colors.controlBorder }]} />)}<Text style={styles.description}>{choice.description}</Text></View>
            </TouchableOpacity>;
          })}
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>关闭</Text></TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: theme.colors.scrim },
    card: { width: '100%', maxHeight: '86%', borderRadius: theme.radius.large, padding: 18, gap: 14, backgroundColor: theme.colors.surface, ...theme.shadow },
    heading: { gap: 4 }, title: { fontSize: 17, fontWeight: '600', color: theme.colors.textPrimary },
    hint: { fontSize: 12, color: theme.colors.textSecondary },
    list: { gap: 10, paddingBottom: 2 },
    option: { width: '100%', borderRadius: theme.radius.medium, borderWidth: 1, borderColor: theme.colors.border, padding: 12, gap: 8, backgroundColor: theme.colors.surface },
    selected: { borderColor: theme.colors.primary, borderWidth: 1.5 },
    preview: { height: 40, borderRadius: theme.radius.small, padding: 7, gap: 5 }, previewHeading: { height: 3, width: '34%', borderRadius: 1 },
    previewPaper: { flex: 1, padding: 5, flexDirection: 'row', alignItems: 'center', gap: 10 },
    previewCopy: { flex: 1, gap: 4 }, previewLine: { height: 2, width: '80%' }, previewLineShort: { height: 2, width: '60%' },
    previewAction: { height: 10, width: 20, borderRadius: 4 },
    pairRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, swatch: { width: 22, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, label: { flex: 1, fontSize: 14, fontWeight: '500', color: theme.colors.textPrimary },
    mark: { fontSize: 11, fontWeight: '600', color: theme.colors.primaryText }, description: { fontSize: 11, color: theme.colors.textMuted },
    closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.action, backgroundColor: theme.colors.surfaceMuted },
    closeText: { fontSize: 14, fontWeight: '500', color: theme.colors.textPrimary },
  });
}
