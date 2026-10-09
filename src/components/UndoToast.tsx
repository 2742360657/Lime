import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useHabits } from '../state/HabitStore';

type UndoToastProps = {
  message: string | null;
  onUndo: () => void;
  onDismiss: () => void;
};

export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timeout = setTimeout(onDismiss, 4200);
    return () => clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <View style={styles.toast} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity onPress={onUndo} style={styles.action}>
        <Text style={styles.actionText}>撤销</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
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
      color: theme.colors.white,
    },
    action: {
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    actionText: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.primarySoft,
    },
  });
}
