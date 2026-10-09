import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useHabits } from '../state/HabitStore';
import { HabitHistoryModal } from './HabitHistoryModal';

type ArchivedHabitsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ArchivedHabitsModal({ visible, onClose }: ArchivedHabitsModalProps) {
  const { archivedHabits, restoreArchivedHabit, theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.card}>
            <Text style={styles.title}>归档习惯</Text>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {archivedHabits.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>没有归档习惯</Text>
                </View>
              ) : (
                archivedHabits.map((habit) => (
                  <View key={habit.id} style={styles.row}>
                    <View style={styles.meta}>
                      <Text style={styles.name}>{habit.name}</Text>
                      <Text style={styles.usage}>{habit.checkins.length} 条记录</Text>
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => setSelectedHabitId(habit.id)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>查看</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => restoreArchivedHabit(habit.id)} style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>恢复</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <HabitHistoryModal
        habitId={selectedHabitId}
        visible={selectedHabitId !== null}
        readonly
        onClose={() => setSelectedHabitId(null)}
      />
    </>
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
    emptyState: {
      borderRadius: theme.radius.medium,
      padding: 16,
      backgroundColor: theme.colors.background,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    row: {
      borderRadius: theme.radius.medium,
      padding: 14,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
    },
    meta: {
      gap: 4,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    usage: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryButton: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.white,
    },
    secondaryButton: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
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
