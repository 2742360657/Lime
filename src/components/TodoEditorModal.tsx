import { useAppActions, useTheme } from '../state/AppProvider';
import type { TodoInput } from '../state/storeTypes';
import type { AppTheme } from '../theme';
import { EditorLayout, useConfirmDiscard } from './EditorLayout';
import { Alert } from './ThemedAlert';
import { ThemedTextInput as TextInput } from './ThemedTextInput';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { TodoItem } from '../types/app';
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
  const theme = useTheme();
  const { addTodo, updateTodo, deleteTodo } = useAppActions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueMode, setDueMode] = useState<DueMode>('none');
  const [customDate, setCustomDate] = useState(getTodayKey());
  const [dueTime, setDueTime] = useState('');
  const snapshot = useRef('');
  const dirty = visible && snapshot.current !== JSON.stringify({ title, note, dueMode, customDate, dueTime });
  const requestClose = useConfirmDiscard(dirty, onClose);


  useEffect(() => {
    if (!visible) {
      return;
    }

    const todayKey = getTodayKey();
    const tomorrowKey = addDaysToDateKey(todayKey, 1);
    const initialMode: DueMode = !todo?.dueDateKey ? 'none' : todo.dueDateKey === todayKey ? 'today' : todo.dueDateKey === tomorrowKey ? 'tomorrow' : 'custom';
    snapshot.current = JSON.stringify({ title: todo?.title ?? '', note: todo?.note ?? '', dueMode: initialMode, customDate: todo?.dueDateKey ?? todayKey, dueTime: todo?.dueTime ?? '' });
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
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
      <EditorLayout title={todo ? '编辑待办' : '新建待办'} onClose={requestClose} onSave={handleSubmit} disabled={!title.trim()}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>要做什么</Text>
            <TextInput
              autoFocus
              maxLength={80}
              accessibilityLabel="待办名称"
              placeholder="例如：整理本周学习计划"
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
            <Text style={styles.fieldHint}>日期决定自动分组；时间可留空，表示当天内完成。</Text>
            {dueMode === 'custom' ? (
              <TextInput
                value={customDate}
                onChangeText={setCustomDate}
                onBlur={() => {
                  const normalized = parseFlexibleDateInput(customDate);
                  if (normalized) setCustomDate(normalized);
                }}
                maxLength={30}
                accessibilityLabel="截止日期"
                placeholder="例如：10月28日、10.28 或明天"
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
                  accessibilityLabel="截止时间"
                  placeholder="选填，如 18:30"
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
              accessibilityLabel="待办备注"
              placeholder="补充步骤、地点或需要准备的内容（选填）"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.noteInput]}
            />
          </View>

          {todo ? (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>删除这个待办</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </EditorLayout>
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: { padding: 16, gap: 18, paddingBottom: 44 },
    field: { gap: 10 },
    fieldHint: { fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    label: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary },
    titleInput: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 14,
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
    },
    noteInput: { minHeight: 112, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    chip: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      minHeight: 48,
      paddingVertical: 12,
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
      borderRadius: 8,
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
      borderRadius: 8,
      backgroundColor: theme.colors.dangerSoft,
    },
    deleteButtonText: { fontSize: 13, fontWeight: '700', color: theme.colors.danger },
  });
}
