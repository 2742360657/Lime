import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, Vibration } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_ITEM_ENTERING, LIST_ITEM_EXITING, LIST_LAYOUT } from '../theme/animation';

import { useHabits } from '../state/HabitStore';
import { TodoItem } from '../types/habit';
import { formatTodoDue, isTodoOverdue } from '../utils/todo';

type TodoRowProps = {
  todo: TodoItem;
  onToggle: (todo: TodoItem) => void;
  onPress: (todo: TodoItem) => void;
  onLongPress?: (todo: TodoItem) => void;
  /** 点截止时间快速改期，不打开编辑页。 */
  onPickDue?: (todo: TodoItem) => void;
  compact?: boolean;
};

export function TodoRow({ todo, onToggle, onPress, onLongPress, onPickDue, compact = false }: TodoRowProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const completed = todo.completedAt !== null;
  const overdue = !completed && isTodoOverdue(todo);

  return (
    <Animated.View
      entering={LIST_ITEM_ENTERING}
      exiting={LIST_ITEM_EXITING}
      layout={LIST_LAYOUT}
      style={[styles.row, compact && styles.rowCompact, completed && styles.rowCompleted]}
    >
      <TouchableOpacity
        accessibilityLabel={completed ? `恢复待办：${todo.title}` : `完成待办：${todo.title}`}
        onPress={() => onToggle(todo)}
        style={[styles.check, completed && styles.checkDone]}
      >
        <Text style={[styles.checkText, completed && styles.checkTextDone]}>{completed ? '✓' : ''}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        delayLongPress={360}
        onLongPress={onLongPress ? () => {
          Vibration.vibrate(12);
          onLongPress(todo);
        } : undefined}
        onPress={() => onPress(todo)}
        style={styles.content}
      >
        <Text numberOfLines={1} style={[styles.title, completed && styles.titleDone]}>
          {todo.title}
        </Text>
        {onPickDue && !completed ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`改截止时间：${formatTodoDue(todo)}`}
            onPress={() => onPickDue(todo)}
            style={styles.dueChip}
            hitSlop={6}
          >
            <Text style={[styles.meta, overdue && styles.metaOverdue]}>{formatTodoDue(todo)}</Text>
            <Text style={[styles.dueChipHint, overdue && styles.metaOverdue]}>改</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.meta, overdue && styles.metaOverdue]}>{formatTodoDue(todo)}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity accessibilityLabel="编辑待办" onPress={() => onPress(todo)} style={styles.more}>
        <Text style={styles.moreText}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    row: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.medium,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dueChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    dueChipHint: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
    rowCompact: {
      minHeight: 62,
    },
    rowCompleted: {
      opacity: 0.64,
    },
    check: {
      width: 27,
      height: 27,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    checkDone: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    checkText: {
      fontSize: 14,
      fontWeight: '900',
      color: 'transparent',
    },
    checkTextDone: {
      color: theme.colors.white,
    },
    content: {
      flex: 1,
      gap: 5,
    },
    title: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    titleDone: {
      textDecorationLine: 'line-through',
      color: theme.colors.textSecondary,
    },
    meta: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    metaOverdue: {
      fontWeight: '700',
      color: theme.colors.danger,
    },
    more: {
      width: 32,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreText: {
      fontSize: 27,
      lineHeight: 30,
      color: theme.colors.textMuted,
    },
  });
}
