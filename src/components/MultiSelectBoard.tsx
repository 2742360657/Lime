import { Alert } from 'react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useBackHandler } from '../navigation/back';
import { useHabits } from '../state/HabitStore';
import { DraggableList, DragGroup, DragItem } from './DraggableList';
import { GroupPickerModal } from './GroupPickerModal';

export type MultiSelectTarget = 'habits' | 'memos' | 'todos';

type MultiSelectBoardProps = {
  title: string;
  onClose: () => void;
  items: DragItem[];
  groups: DragGroup[];
  selectedIds: string[];
  onSetSelection: (ids: string[]) => void;
  onCommit: (ordered: Array<{ id: string; groupId: string }>) => void;
  onDelete: (ids: string[]) => void;
  /** 分组候选（含未分组）。为空时隐藏“移动分组”。 */
  groupOptions?: Array<{ id: string | null; label: string }>;
  onMoveToGroup?: (ids: string[], groupId: string | null) => void;
  moveTitle?: string;
  deleteLabel?: string;
};

/**
 * 多选页：常态下条目行只显示“选择圆圈 + 名称”，
 * 右侧两条横线仅在此页出现，长按可拖动排序、跨分组移动。
 */
export function MultiSelectBoard({
  title,
  onClose,
  items,
  groups,
  selectedIds,
  onSetSelection,
  onCommit,
  onDelete,
  groupOptions,
  onMoveToGroup,
  moveTitle = '移动到分组',
  deleteLabel = '删除',
}: MultiSelectBoardProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moveVisible, setMoveVisible] = useState(false);

  useBackHandler(() => { onClose(); return true; });

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const canMove = !!groupOptions && !!onMoveToGroup;

  const handleDelete = () => {
    if (selectedIds.length === 0) {
      return;
    }
    Alert.alert(`${deleteLabel}确认`, `将${deleteLabel}选中的 ${selectedIds.length} 个条目，是否继续？`, [
      { text: '取消', style: 'cancel' },
      { text: deleteLabel, style: 'destructive', onPress: () => onDelete(selectedIds) },
    ]);
  };

  return (
    <View style={styles.board}>
      <View style={styles.toolbar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="完成整理" onPress={onClose} style={styles.action}>
          <Text style={styles.actionText}>完成</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityLabel="全选"
          accessibilityState={{ checked: allSelected }}
          onPress={() => onSetSelection(allSelected ? [] : items.map((item) => item.id))}
          style={[styles.circle, allSelected && styles.circleOn]}
        >
          {allSelected ? <Text style={styles.circleTick}>✓</Text> : null}
        </TouchableOpacity>
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {title}
          {selectedIds.length > 0 ? ` · 已选 ${selectedIds.length}` : ''}
        </Text>
        {canMove ? (
          <TouchableOpacity
            disabled={selectedIds.length === 0}
            onPress={() => setMoveVisible(true)}
            style={[styles.action, selectedIds.length === 0 && styles.actionDisabled]}
          >
            <Text style={styles.actionText}>移动</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          disabled={selectedIds.length === 0}
          onPress={handleDelete}
          style={[styles.action, styles.dangerAction, selectedIds.length === 0 && styles.actionDisabled]}
        >
          <Text style={[styles.actionText, styles.dangerActionText]}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>

      <DraggableList
        groups={groups}
        items={items}
        onCommit={onCommit}
        emptyText="没有可整理的条目"
        contentPaddingBottom={160}
      />

      {canMove ? (
        <GroupPickerModal
          visible={moveVisible}
          title={moveTitle}
          selectedGroupId={null}
          allowNull
          nullLabel="未分组"
          options={groupOptions ?? []}
          onClose={() => setMoveVisible(false)}
          onSubmit={(groupId) => onMoveToGroup?.(selectedIds, groupId)}
        />
      ) : null}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    board: { flex: 1 },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 12,
    },
    circle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
    circleTick: { fontSize: 14, fontWeight: '900', color: theme.colors.white },
    toolbarTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary },
    action: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: theme.colors.primarySoft,
    },
    actionDisabled: { opacity: 0.45 },
    actionText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
    dangerAction: { backgroundColor: theme.colors.dangerSoft },
    dangerActionText: { color: theme.colors.danger },
  });
}

/** 多选页条目左侧的选择圆圈。 */
export function SelectCircle({
  checked,
  accessibilityLabel,
  onPress,
}: {
  checked: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { theme } = useHabits();
  const styles = useMemo(() => createCircleStyles(theme), [theme]);
  return (
    <TouchableOpacity
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[styles.circle, checked && styles.circleOn]}
    >
      {checked ? <Text style={styles.tick}>✓</Text> : null}
    </TouchableOpacity>
  );
}

function createCircleStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    circle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
    tick: { fontSize: 14, fontWeight: '900', color: theme.colors.white },
  });
}
