import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import { AppIcon } from './AppIcon';

import { LIST_ITEM_ENTERING, LIST_ITEM_EXITING, LIST_LAYOUT } from '../theme/animation';

import { TodoItem } from '../types/app';
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
  const theme = useTheme();
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
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={completed ? `恢复待办：${todo.title}` : `完成待办：${todo.title}`}
        onPress={() => onToggle(todo)}
        hitSlop={4}
        style={styles.checkTarget}
      >
        <View style={[styles.check, completed && styles.checkDone]}><Text style={[styles.checkText, completed && styles.checkTextDone]}>{completed ? '✓' : ''}</Text></View>
      </TouchableOpacity>
      <View style={styles.content}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`编辑待办：${todo.title}`} delayLongPress={360} onLongPress={onLongPress ? () => { Vibration.vibrate(12); onLongPress(todo); } : undefined} onPress={() => onPress(todo)} style={styles.textTarget}>
          <Text numberOfLines={2} style={[styles.title, completed && styles.titleDone]}>{todo.title}</Text>
          {!!todo.note.trim() && <Text numberOfLines={1} style={styles.note}>{todo.note}</Text>}
        </TouchableOpacity>
        {onPickDue && !completed ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`改截止时间：${formatTodoDue(todo)}`} onPress={() => onPickDue(todo)} hitSlop={8} style={styles.dueChip}>
          <Text style={[styles.meta, overdue && styles.metaOverdue]}>{overdue ? '逾期 · ' : ''}{formatTodoDue(todo)}</Text>
          <Text style={styles.dueChipHint}>改期</Text>
        </TouchableOpacity> : <Text style={styles.meta}>{formatTodoDue(todo)}</Text>}
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`待办操作：${todo.title}`} onPress={() => onLongPress ? onLongPress(todo) : onPress(todo)} style={styles.more} hitSlop={6}>
        <AppIcon name="more" color={theme.colors.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    row: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.colors.surface,
      borderRadius: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    dueChip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    dueChipHint: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
    rowCompact: {
      minHeight: 62,
    },
    rowCompleted: {
      opacity: 1,
    },
    check: {
      width: 22,
      height: 22,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.colors.controlBorder,
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
      color: theme.colors.onPrimary,
    },
    checkTarget: { width: 40, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    textTarget: { minHeight: 24, justifyContent: 'center', gap: 4 },
    note: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
    content: {
      flex: 1,
      gap: 2,
    },
    title: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '500',
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
      width: 36,
      height: 48,
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
