import { Alert } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { TodoInput, useHabits } from '../state/HabitStore';
import { TodoItem } from '../types/habit';
import { TaskSources } from '../assistant/TaskSources';
import {
  addDaysToDateKey,
  getTodayKey,
  parseFlexibleDateInput,
  parseFlexibleTimeInput,
} from '../utils/date';

type DueMode = 'none' | 'today' | 'tomorrow' | 'custom';

type TodoEditorModalProps = {
  visible: boolean;
  todo?: TodoItem | null;
  onClose: () => void;
};

export function TodoEditorModal({ visible, todo = null, onClose }: TodoEditorModalProps) {
  const { theme, addTodo, updateTodo, deleteTodo } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueMode, setDueMode] = useState<DueMode>('none');
  const [customDate, setCustomDate] = useState(getTodayKey());
  const [dueTime, setDueTime] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    const todayKey = getTodayKey();
    const tomorrowKey = addDaysToDateKey(todayKey, 1);
    setTitle(todo?.title ?? '');
    setNote(todo?.note ?? '');
    setCustomDate(todo?.dueDateKey ?? todayKey);
    setDueTime(todo?.dueTime ?? '');
    setDueMode(
      !todo?.dueDateKey
        ? 'none'
        : todo.dueDateKey === todayKey
          ? 'today'
          : todo.dueDateKey === tomorrowKey
            ? 'tomorrow'
            : 'custom'
    );
  }, [todo, visible]);

  const handleSubmit = () => {
    const todayKey = getTodayKey();
    let dueDateKey: string | null = null;
    if (dueMode === 'today') {
      dueDateKey = todayKey;
    } else if (dueMode === 'tomorrow') {
      dueDateKey = addDaysToDateKey(todayKey, 1);
    } else if (dueMode === 'custom') {
      dueDateKey = parseFlexibleDateInput(customDate);
      if (!dueDateKey) {
        Alert.alert('没认出这个日期', '可以试试 6.9、6-9、6 9、明天或 Jun 9。');
        return;
      }
    }

    const normalizedTime = dueTime.trim() ? parseFlexibleTimeInput(dueTime) : null;
    if (dueDateKey && dueTime.trim() && !normalizedTime) {
      Alert.alert('没认出这个时间', '可以试试 8:30、830、下午3点或 3pm。');
      return;
    }

    const input: TodoInput = {
      title,
      note,
      dueDateKey,
      dueTime: dueDateKey ? normalizedTime : null,
    };
    const success = todo ? updateTodo(todo.id, input) : addTodo(input);
    if (success) {
      onClose();
    }
  };

  const handleDelete = () => {
    if (!todo) {
      return;
    }
    Alert.alert('删除待办', `确认删除“${todo.title}”吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteTodo(todo.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{todo ? '编辑待办' : '新建待办'}</Text>
          <TouchableOpacity onPress={handleSubmit} style={[styles.headerButton, styles.saveButton]}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>要做什么</Text>
            <TextInput
              autoFocus
              maxLength={80}
              placeholder="待办名称"
              placeholderTextColor={theme.colors.textMuted}
              value={title}
              onChangeText={setTitle}
              style={styles.titleInput}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>截止时间</Text>
            <View style={styles.chips}>
              <Choice label="无日期" active={dueMode === 'none'} onPress={() => setDueMode('none')} />
              <Choice label="今天" active={dueMode === 'today'} onPress={() => setDueMode('today')} />
              <Choice label="明天" active={dueMode === 'tomorrow'} onPress={() => setDueMode('tomorrow')} />
              <Choice label="自定义" active={dueMode === 'custom'} onPress={() => setDueMode('custom')} />
            </View>
            {dueMode === 'custom' ? (
              <TextInput
                value={customDate}
                onChangeText={setCustomDate}
                onBlur={() => {
                  const normalized = parseFlexibleDateInput(customDate);
                  if (normalized) setCustomDate(normalized);
                }}
                maxLength={30}
                placeholder="日期"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
              />
            ) : null}
            {dueMode !== 'none' ? (
              <View style={styles.timeRow}>
                <Text style={styles.timeTitle}>时间</Text>
                <TextInput
                  value={dueTime}
                  onChangeText={setDueTime}
                  onBlur={() => {
                    if (!dueTime.trim()) return;
                    const normalized = parseFlexibleTimeInput(dueTime);
                    if (normalized) setDueTime(normalized);
                  }}
                  maxLength={20}
                  placeholder="时间"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.timeInput}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>备注</Text>
            <TextInput
              multiline
              maxLength={300}
              value={note}
              onChangeText={setNote}
              placeholder="备注"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.noteInput]}
            />
          </View>

          {todo ? <TaskSources key={todo.id} taskId={todo.id}/> : null}

          {todo ? (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>删除这个待办</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  function Choice({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.chip, active && styles.chipActive]}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
    headerButton: { minWidth: 60, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
    headerButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
    saveButton: { borderRadius: 12, backgroundColor: theme.colors.primary },
    saveButtonText: { fontSize: 14, fontWeight: '800', color: theme.colors.white },
    content: { padding: 20, gap: 22, paddingBottom: 44 },
    field: { gap: 10 },
    label: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary },
    titleInput: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 14,
      fontSize: 21,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
    },
    noteInput: { minHeight: 112, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: theme.colors.surface,
    },
    chipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    chipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    chipTextActive: { color: theme.colors.primary },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
    },
    timeTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
    timeInput: {
      width: 128,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      textAlign: 'center',
      fontSize: 15,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
    },
    deleteButton: {
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 14,
      backgroundColor: theme.colors.dangerSoft,
    },
    deleteButtonText: { fontSize: 14, fontWeight: '800', color: theme.colors.danger },
  });
}
