import { Alert } from 'react-native';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useHabits } from '../state/HabitStore';
import { CheckinRecord } from '../types/habit';
import { formatDateLabel, formatTime, isFutureDateKey } from '../utils/date';
import { getCheckinRecordsByDate } from '../utils/habit';
import { CheckinRecordEditorModal } from './CheckinRecordEditorModal';

type CheckinDetailModalProps = {
  habitId: string | null;
  dateKey: string | null;
  visible: boolean;
  readonly?: boolean;
  onClose: () => void;
};

type EditorState =
  | { mode: 'add' }
  | { mode: 'edit'; record: CheckinRecord }
  | null;

export function CheckinDetailModal({
  habitId,
  dateKey,
  visible,
  readonly = false,
  onClose,
}: CheckinDetailModalProps) {
  const { allHabits, theme, addCheckin, updateCheckin, deleteCheckin } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [editorState, setEditorState] = useState<EditorState>(null);

  const habit = useMemo(
    () => allHabits.find((item) => item.id === habitId) ?? null,
    [allHabits, habitId]
  );
  const records = habit && dateKey ? getCheckinRecordsByDate(habit, dateKey) : [];
  const editable = !readonly && !!dateKey && !isFutureDateKey(dateKey);

  const handleDelete = (record: CheckinRecord) => {
    if (!habit) {
      return;
    }

    Alert.alert('删除记录', `确认删除 ${formatTime(record.timestamp)} 这条记录吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteCheckin(habit.id, record.id);
        },
      },
    ]);
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{habit?.name ?? '记录详情'}</Text>
                <Text style={styles.subtitle}>
                  {dateKey ? formatDateLabel(dateKey) : ''} · 共 {records.length} 次
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>关闭</Text>
              </TouchableOpacity>
            </View>

            {readonly ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>已归档 · 只读</Text>
              </View>
            ) : isFutureDateKey(dateKey ?? '') ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>未来日期不可编辑</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditorState({ mode: 'add' })} style={styles.addButton}>
                <Text style={styles.addButtonText}>新增记录</Text>
              </TouchableOpacity>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              {records.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>这一天还没有记录</Text>
                </View>
              ) : (
                records.map((record) => (
                  <View key={record.id} style={styles.recordRow}>
                    <View style={styles.recordMeta}>
                      <Text style={styles.recordTime}>{formatTime(record.timestamp)}</Text>
                      <Text style={styles.recordNote}>{record.note || '无备注'}</Text>
                    </View>
                    {editable ? (
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          onPress={() => setEditorState({ mode: 'edit', record })}
                          style={styles.secondaryAction}
                        >
                          <Text style={styles.secondaryActionText}>编辑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(record)} style={styles.deleteAction}>
                          <Text style={styles.deleteActionText}>删除</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {dateKey ? (
        <CheckinRecordEditorModal
          visible={editorState !== null}
          dateKey={dateKey}
          title={editorState?.mode === 'edit' ? '编辑打卡记录' : '新增打卡记录'}
          initialTimestamp={editorState?.mode === 'edit' ? editorState.record.timestamp : undefined}
          initialNote={editorState?.mode === 'edit' ? editorState.record.note : ''}
          onClose={() => setEditorState(null)}
          onSubmit={(timestamp, note) => {
            if (!habit) {
              return;
            }

            if (editorState?.mode === 'edit') {
              updateCheckin(habit.id, editorState.record.id, timestamp, note);
            } else {
              addCheckin(habit.id, dateKey, timestamp, note);
            }

            setEditorState(null);
          }}
        />
      ) : null}
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
      backgroundColor: theme.colors.surface,
      padding: 20,
      gap: 14,
      ...theme.shadow,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    headerText: {
      flex: 1,
      gap: 6,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    closeButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
    },
    closeButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    banner: {
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.surfaceMuted,
    },
    bannerText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    addButton: {
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    addButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.white,
    },
    content: {
      gap: 10,
    },
    emptyState: {
      borderRadius: theme.radius.medium,
      padding: 18,
      backgroundColor: theme.colors.background,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    recordRow: {
      borderRadius: theme.radius.medium,
      padding: 14,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
    },
    recordMeta: {
      gap: 4,
    },
    recordTime: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    recordNote: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    rowActions: {
      flexDirection: 'row',
      gap: 10,
    },
    secondaryAction: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    secondaryActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    deleteAction: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.colors.dangerSoft,
    },
    deleteActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.danger,
    },
  });
}
