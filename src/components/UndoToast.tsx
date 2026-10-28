import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';


type UndoToastProps = {
  message: string | null;
  onUndo: () => void;
  onDismiss: () => void;
};

export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timeout = setTimeout(onDismiss, 6500);
    return () => clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <View style={styles.toast} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="撤销上一次操作" onPress={onUndo} style={styles.action}>
        <Text style={styles.actionText}>撤销</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    toast: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 14,
      zIndex: 20,
      minHeight: 52,
      borderRadius: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.textPrimary,
      ...theme.shadow,
    },
    message: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.onPrimary,
    },
    action: {
      minHeight: 48,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    actionText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.primarySoft,
    },
  });
}
