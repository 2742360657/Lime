import { Alert } from 'react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getGroupUsageCount } from '../storage/habitStorage';
import { useHabits } from '../state/HabitStore';
import { HabitGroup } from '../types/habit';
import { ReorderModal } from './ReorderModal';
import { TextEntryModal } from './TextEntryModal';

type GroupManagerModalProps = {
  visible: boolean;
  onClose: () => void;
  /** 不传则管理习惯分组。 */
  title?: string;
  groups?: HabitGroup[];
  onAdd?: (name: string) => boolean;
  onRename?: (groupId: string, name: string) => boolean;
  onDelete?: (groupId: string) => void;
  onReorder?: (groupIds: string[]) => void;
  usageLabel?: (groupId: string) => string;
  deleteConfirmText?: (name: string, usageText: string) => string;
};

export function GroupManagerModal({
  visible,
  onClose,
  title = '分组管理',
  groups: groupsProp,
  onAdd,
  onRename,
  onDelete,
  onReorder,
  usageLabel,
  deleteConfirmText,
}: GroupManagerModalProps) {
  const {
    allHabits,
    groups: habitGroups,
    theme,
    addGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
  } = useHabits();
  const groups = groupsProp ?? habitGroups;
  const handleAdd = onAdd ?? addGroup;
  const handleRename = onRename ?? renameGroup;
  const handleDelete = onDelete ?? deleteGroup;
  const handleReorder = onReorder ?? reorderGroups;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<HabitGroup | null>(null);
  const [reorderVisible, setReorderVisible] = useState(false);
  const orderedGroups = [...groups].sort((left, right) => left.order - right.order);

  const usageText = (groupId: string) =>
    usageLabel
      ? usageLabel(groupId)
      : `${getGroupUsageCount(allHabits, groupId)} 个习惯`;

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    const usage = usageText(groupId);
    const message = deleteConfirmText
      ? deleteConfirmText(groupName, usage)
      : usageLabel
        ? `删除“${groupName}”后，其中 ${usage} 会移到未分类。`
        : Number.parseInt(usage, 10) > 0
          ? `删除“${groupName}”后，该分组下的 ${usage}会自动移到“未分组”。`
          : `删除“${groupName}”后，该分组会被直接移除。`;

    Alert.alert(
      '确认删除分组',
      message,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: () => {
            handleDelete(groupId);
          },
        },
      ]
    );
  };

  return (
    <>
      <Modal
        visible={visible && !addingGroup && editingGroup === null && !reorderVisible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => setAddingGroup(true)} style={styles.addButton}>
                  <Text style={styles.addButtonText}>新增</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {groups.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>还没有分组</Text>
                </View>
              ) : (
                orderedGroups.map((group) => (
                  <View key={group.id} style={styles.row}>
                    <TouchableOpacity
                      delayLongPress={360}
                      onLongPress={() => {
                        if (orderedGroups.length > 1) setReorderVisible(true);
                      }}
                      onPress={() => setEditingGroup(group)}
                      style={styles.meta}
                    >
                      <Text style={styles.name}>{group.name}</Text>
                      <Text style={styles.usage}>{usageText(group.id)}</Text>
                    </TouchableOpacity>
                    <View style={styles.rowActions}>
                      <TouchableOpacity onPress={() => setEditingGroup(group)} style={styles.editButton}>
                        <Text style={styles.editButtonText}>重命名</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteGroup(group.id, group.name)}
                        style={styles.deleteButton}
                      >
                        <Text style={styles.deleteButtonText}>删除</Text>
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

      <TextEntryModal
        visible={addingGroup}
        title="新建分组"
        placeholder="分组名称"
        submitLabel="保存"
        onClose={() => setAddingGroup(false)}
        onSubmit={handleAdd}
      />
      <TextEntryModal
        visible={editingGroup !== null}
        title="重命名分组"
        placeholder="分组名称"
        submitLabel="保存"
        initialValue={editingGroup?.name ?? ''}
        onClose={() => setEditingGroup(null)}
        onSubmit={(name) => (editingGroup ? handleRename(editingGroup.id, name) : false)}
      />
      <ReorderModal
        visible={reorderVisible}
        title="调整顺序"
        items={orderedGroups.map((group) => ({
          id: group.id,
          label: group.name,
          subtitle: usageText(group.id),
        }))}
        onClose={() => setReorderVisible(false)}
        onSave={handleReorder}
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
      maxHeight: '80%',
      borderRadius: theme.radius.large,
      padding: 20,
      backgroundColor: theme.colors.surface,
      gap: 14,
      ...theme.shadow,
    },
    header: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    headerText: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    addButton: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.primary,
    },
    addButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.white,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    meta: {
      flex: 1,
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
    deleteButton: {
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: theme.colors.dangerSoft,
    },
    deleteButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    rowActions: { flexDirection: 'row', gap: 7 },
    editButton: {
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: theme.colors.surfaceMuted,
    },
    editButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
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
