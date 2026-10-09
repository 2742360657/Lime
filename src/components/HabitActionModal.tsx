import { Alert } from 'react-native';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useHabits } from '../state/HabitStore';
import { Habit } from '../types/habit';

type HabitActionModalProps = {
  habit: Habit | null;
  visible: boolean;
  onClose: () => void;
  onEdit: (habitId: string) => void;
  onOpenHistory: (habitId: string) => void;
};

export function HabitActionModal({
  habit,
  visible,
  onClose,
  onEdit,
  onOpenHistory,
}: HabitActionModalProps) {
  const { theme, archiveHabit, deleteHabit } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!habit) {
    return null;
  }

  const handleArchive = () => {
    Alert.alert('归档习惯', `归档“${habit.name}”后，它会从打卡页移除，并在设置页的归档习惯中只读查看。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认归档',
        onPress: () => {
          archiveHabit(habit.id);
          onClose();
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('确认删除习惯', `删除“${habit.name}”后，相关全部打卡历史会一并清除，且无法恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => {
          deleteHabit(habit.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.card}>
            <Text style={styles.title}>{habit.name}</Text>

            <View style={styles.actionList}>
              <ActionButton
                label="编辑习惯"
                onPress={() => {
                  onEdit(habit.id);
                  onClose();
                }}
              />
              <ActionButton
                label="查看历史"
                onPress={() => {
                  onOpenHistory(habit.id);
                  onClose();
                }}
              />
              <ActionButton label="归档" danger onPress={handleArchive} />
              <ActionButton label="删除习惯" danger onPress={handleDelete} />
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
  );

  function ActionButton({
    label,
    onPress,
    danger = false,
  }: {
    label: string;
    onPress: () => void;
    danger?: boolean;
  }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.actionButton, danger && styles.actionButtonDanger]}
      >
        <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>{label}</Text>
      </TouchableOpacity>
    );
  }
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(18, 31, 24, 0.22)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 28,
      backgroundColor: theme.colors.surface,
      gap: 14,
      ...theme.shadow,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    actionList: {
      gap: 10,
    },
    actionButton: {
      borderRadius: theme.radius.medium,
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    actionButtonDanger: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.dangerSoft,
    },
    actionButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    actionButtonTextDanger: {
      color: theme.colors.danger,
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
