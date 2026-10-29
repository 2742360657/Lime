import { useMemo } from 'react';
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
import type { AppTheme } from '../theme';


export type ItemAction = {
  label: string;
  onPress: () => void;
  danger?: boolean;
};

type ItemActionSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: ItemAction[];
  onClose: () => void;
};

/**
 * 长按条目后弹出的底部动作面板。
 * 先给“对这条做什么”，而不是直接把人拖进整理模式。
 */
export function ItemActionSheet({ visible, title, subtitle, actions, onClose }: ItemActionSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭操作面板" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.card, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <View style={styles.handle} />
          <Text numberOfLines={2} style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView contentContainerStyle={styles.actionList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {actions.map((action) => (
              <TouchableOpacity
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={[styles.actionButton, action.danger && styles.actionButtonDanger]}
              >
                <Text style={[styles.actionButtonText, action.danger && styles.actionButtonTextDanger]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity accessibilityRole="button" accessibilityLabel="取消" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.scrim },
    backdrop: { ...StyleSheet.absoluteFillObject },
    card: {
      width: '100%',
      maxHeight: '90%',
      borderTopLeftRadius: theme.radius.large,
      borderTopRightRadius: theme.radius.large,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 28,
      backgroundColor: theme.colors.surface,
      gap: 10,
      ...theme.shadow,
    },
    handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: theme.colors.border, marginBottom: 8 },
    title: { fontSize: 17, fontWeight: '700', color: theme.colors.textPrimary },
    subtitle: { fontSize: 12, color: theme.colors.textSecondary },
    actionList: { gap: 10, paddingTop: 6 },
    actionButton: {
      borderRadius: theme.radius.medium,
      minHeight: 52,
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.background,
    },
    actionButtonDanger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerSoft },
    actionButtonText: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    actionButtonTextDanger: { color: theme.colors.danger },
    closeButton: {
      minHeight: 48,
      marginTop: 4,
      borderRadius: theme.radius.action,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    closeButtonText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  });
}
