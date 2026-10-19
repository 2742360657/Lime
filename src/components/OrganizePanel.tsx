import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useBackHandler } from '../navigation/back';
import { useHabits } from '../state/HabitStore';
import { LIST_LAYOUT } from '../theme/animation';
import { DraggableList, DragGroup, DragItem } from './DraggableList';
import { GroupPickerModal } from './GroupPickerModal';

type OrganizePanelProps = {
  /** 可选标题，仅在多选页顶部展示（例如「整理待办」）。 */
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
  /** 整理模式的操作说明，展示在工具栏下方。 */
  hint?: string;
  /** 进入整理时滚动到的位置，保持和之前看到的一致。 */
  initialScrollY?: number;
};

/**
 * 原地整理面板：不替换整页，直接渲染在当前页面的内容区里，
 * 顶部资料条与底部导航保持可见，退出后回到原来的列表。
 *
 * - 点按整行切换选中；按住右侧把手拖动排序。
 * - 拖动时其余行实时让位、目标分组高亮。
 * - 松手一次性落位。
 */
export function OrganizePanel({
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
  hint = '点按条目选中 · 按住右侧把手拖动排序',
  initialScrollY = 0,
}: OrganizePanelProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moveVisible, setMoveVisible] = useState(false);

  useBackHandler(() => {
    onClose();
    return true;
  });

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const canMove = !!groupOptions && !!onMoveToGroup;

  const toggleSelected = (id: string) => {
    onSetSelection(selected.has(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]);
  };

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
    <Animated.View layout={LIST_LAYOUT} style={styles.panel}>
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
        </Text>
        {canMove ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="移动分组"
            disabled={selectedIds.length === 0}
            onPress={() => setMoveVisible(true)}
            style={[styles.action, selectedIds.length === 0 && styles.actionDisabled]}
          >
            <Text style={styles.actionText}>移动</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${deleteLabel}选中`}
          disabled={selectedIds.length === 0}
          onPress={handleDelete}
          style={[styles.action, styles.dangerAction, selectedIds.length === 0 && styles.actionDisabled]}
        >
          <Text style={[styles.actionText, styles.dangerActionText]}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        {selectedIds.length > 0 ? `已选 ${selectedIds.length} · ` : ''}
        {hint}
      </Text>

      <DraggableList
        groups={groups}
        items={items}
        onCommit={onCommit}
        onToggleSelect={toggleSelected}
        emptyText="没有可整理的条目"
        contentPaddingBottom={160}
        initialScrollY={initialScrollY}
        autoScroll
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
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: theme.colors.background },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 8,
    },
    hint: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      fontSize: 12,
      color: theme.colors.textSecondary,
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
