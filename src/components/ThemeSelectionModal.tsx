import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useHabits } from '../state/HabitStore';
import { THEME_PRESETS, ThemeId } from '../theme';

type ThemeSelectionModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ThemeSelectionModal({ visible, onClose }: ThemeSelectionModalProps) {
  const { settings, setThemeId, theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>色系选择</Text>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {(Object.keys(THEME_PRESETS) as ThemeId[]).map((themeId) => {
              const preset = THEME_PRESETS[themeId];
              const selected = settings.themeId === themeId;

              return (
                <TouchableOpacity
                  key={themeId}
                  onPress={() => setThemeId(themeId)}
                  style={[styles.row, selected && styles.rowActive]}
                >
                  <View style={styles.swatches}>
                    <View style={[styles.swatch, { backgroundColor: preset.colors.primary }]} />
                    <View style={[styles.swatch, { backgroundColor: preset.colors.primarySoft }]} />
                    <View style={[styles.swatch, { backgroundColor: preset.colors.surfaceMuted }]} />
                  </View>
                  <Text style={[styles.label, selected && styles.labelActive]}>{preset.label}</Text>
                  {selected ? <Text style={styles.selectedMark}>当前</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: 'rgba(18, 31, 24, 0.22)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxHeight: '82%',
      borderRadius: theme.radius.large,
      padding: 20,
      backgroundColor: theme.colors.surface,
      gap: 14,
      ...theme.shadow,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    list: {
      gap: 10,
    },
    row: {
      borderRadius: theme.radius.medium,
      padding: 14,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rowActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    swatches: {
      flexDirection: 'row',
      gap: 6,
    },
    swatch: {
      width: 18,
      height: 18,
      borderRadius: 9,
    },
    label: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    labelActive: {
      color: theme.colors.primary,
    },
    selectedMark: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    closeButton: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    closeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });
}
