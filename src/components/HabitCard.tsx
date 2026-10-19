import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_ITEM_ENTERING, LIST_ITEM_EXITING, LIST_LAYOUT } from '../theme/animation';

import { useHabits } from '../state/HabitStore';
import { Habit } from '../types/habit';
import { getHabitProgress } from '../utils/habit';

type HabitCardProps = {
  habit: Habit;
  onAddCheckin: (habitId: string) => void;
  onOpenDetails: (habitId: string) => void;
  onOpenActions?: (habit: Habit) => void;
  onLongPress?: (habit: Habit) => void;
  compact?: boolean;
};

export function HabitCard({
  habit,
  onAddCheckin,
  onOpenDetails,
  onOpenActions,
  onLongPress,
  compact = false,
}: HabitCardProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const progress = getHabitProgress(habit);

  return (
    <Animated.View
      entering={LIST_ITEM_ENTERING}
      exiting={LIST_ITEM_EXITING}
      layout={LIST_LAYOUT}
      style={[styles.card, compact && styles.cardCompact, progress.completed && styles.cardCompleted]}
    >
      <TouchableOpacity
        style={styles.infoPressable}
        delayLongPress={360}
        onLongPress={onLongPress ? () => {
          Vibration.vibrate(12);
          onLongPress(habit);
        } : undefined}
        onPress={() => onOpenDetails(habit.id)}
      >
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {habit.name}
          </Text>
          <Text style={[styles.countText, progress.completed && styles.countTextDone]}>
            {progress.completed ? `已完成 · ${progress.label}` : progress.label}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onAddCheckin(habit.id)} style={styles.plusButton}>
        <Text style={styles.plusText}>+1</Text>
      </TouchableOpacity>
      {onOpenActions ? (
        <TouchableOpacity accessibilityLabel="习惯操作" onPress={() => onOpenActions(habit)} style={styles.moreButton}>
          <Text style={styles.moreText}>•••</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: theme.radius.medium,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardCompact: {
      paddingVertical: 8,
    },
    cardCompleted: {
      backgroundColor: theme.colors.primarySoft,
    },
    infoPressable: {
      flex: 1,
      borderRadius: 12,
      justifyContent: 'center',
      minHeight: 48,
    },
    info: {
      gap: 4,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    countText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    countTextDone: {
      color: theme.colors.primary,
      fontWeight: '700',
    },
    plusButton: {
      minWidth: 56,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    plusText: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.white,
    },
    moreButton: {
      width: 36,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreText: {
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1,
      color: theme.colors.textMuted,
    },
  });
}
