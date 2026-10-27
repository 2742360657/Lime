import { Alert } from './ThemedAlert';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  sortHint?: string;
  allowSort?: boolean;
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
  selectedIds: rawSelectedIds,
  onSetSelection,
  onCommit,
  onDelete,
  groupOptions,
  onMoveToGroup,
  moveTitle = '移动到分组',
  deleteLabel = '删除',
  hint = '点按条目选中 · 按住右侧把手拖动排序',
  initialScrollY = 0,
  sortHint,
  allowSort = true,
}: OrganizePanelProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selectedIds = useMemo(() => {
    const visibleIds = new Set(items.map((item) => item.id));
    return rawSelectedIds.filter((id) => visibleIds.has(id));
  }, [items, rawSelectedIds]);
  useEffect(() => {
    if (selectedIds.length !== rawSelectedIds.length) onSetSelection(selectedIds);
  }, [selectedIds, rawSelectedIds, onSetSelection]);
  const [moveVisible, setMoveVisible] = useState(false);
  const [mode, setMode] = useState<'select' | 'sort'>('select');

  useBackHandler(() => {
    onClose();
    return true;
  });

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const canMove = !!groupOptions && !!onMoveToGroup;
  const displayItems = useMemo(() => items.map((item) => ({
    ...item, selected: selected.has(item.id), leading: mode === 'select' ? item.leading : undefined,
  })), [items, selected, mode]);

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
        <Text style={styles.toolbarTitle}>{title}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="完成整理" onPress={onClose} style={styles.action}>
          <Text style={styles.actionText}>完成</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.modes}>
        {((allowSort ? ['select', 'sort'] : ['select']) as Array<'select' | 'sort'>).map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={value === 'select' ? '多选模式' : '排序模式'} accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={[styles.mode, mode === value && styles.modeActive]}>
          <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{value === 'select' ? '多选' : '排序'}</Text>
        </TouchableOpacity>)}
      </View>
      {mode === 'select' ? <View style={styles.selectionBar}>
        <Text style={styles.selectionCount}>已选 {selectedIds.length} / {items.length}</Text>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="全选" accessibilityState={{ checked: allSelected }} onPress={() => onSetSelection(allSelected ? [] : items.map((item) => item.id))} style={styles.action}>
          <Text style={styles.actionText}>{allSelected ? '取消全选' : '全选'}</Text>
        </TouchableOpacity>
      </View> : <Text style={styles.hint}>{sortHint ?? hint}
按住右侧把手拖动，松手即保存。跨组移动会改变所属分组。</Text>}
      <DraggableList
        groups={groups}
        items={displayItems}
        onCommit={onCommit}
        onToggleSelect={mode === 'select' ? toggleSelected : undefined}
        dragEnabled={mode === 'sort'}
        emptyText="没有可整理的条目"
        contentPaddingBottom={24}
        initialScrollY={initialScrollY}
        autoScroll
      />
      {mode === 'select' && <View style={styles.bottomActions}>
        {canMove && <TouchableOpacity accessibilityRole="button" accessibilityLabel={moveTitle} disabled={selectedIds.length === 0} onPress={() => setMoveVisible(true)} style={[styles.batchAction, styles.moveAction, selectedIds.length === 0 && styles.actionDisabled]}>
          <Text style={styles.actionText}>{moveTitle.includes('日期') ? '更改截止日期' : '移动分组'}</Text>
        </TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${deleteLabel}选中`} disabled={selectedIds.length === 0} onPress={handleDelete} style={[styles.batchAction, styles.dangerAction, selectedIds.length === 0 && styles.actionDisabled]}>
          <Text style={styles.dangerActionText}>{deleteLabel} {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</Text>
        </TouchableOpacity>
      </View>}
      {canMove && <GroupPickerModal visible={moveVisible} title={moveTitle} selectedGroupId={null} allowNull nullLabel="未分组" options={groupOptions ?? []} onClose={() => setMoveVisible(false)} onSubmit={(groupId) => { onMoveToGroup?.(selectedIds, groupId); onSetSelection([]); }} />}
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: theme.colors.background },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
    toolbarTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
    modes: { marginHorizontal: 16, padding: 4, flexDirection: 'row', borderRadius: 10, backgroundColor: theme.colors.surfaceMuted },
    mode: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    modeActive: { backgroundColor: theme.colors.surface },
    modeText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
    modeTextActive: { color: theme.colors.primary, fontWeight: '800' },
    selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
    selectionCount: { fontSize: 13, color: theme.colors.textSecondary },
    hint: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    action: { minHeight: 48, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 14, backgroundColor: theme.colors.primarySoft },
    actionDisabled: { opacity: 0.4 },
    actionText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
    bottomActions: { flexDirection: 'row', gap: 12, padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
    batchAction: { flex: 1, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    moveAction: { backgroundColor: theme.colors.primarySoft },
    dangerAction: { backgroundColor: theme.colors.dangerSoft },
    dangerActionText: { fontSize: 14, fontWeight: '700', color: theme.colors.danger },
  });
}
