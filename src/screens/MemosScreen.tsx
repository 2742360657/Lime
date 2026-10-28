import { AppIcon } from '../components/AppIcon';
import { FilterBar } from '../components/FilterBar';
import { MemoEditor } from '../components/MemoEditor';
import { ThemedTextInput as TextInput } from '../components/ThemedTextInput';
import { VirtualList, type VirtualRow } from '../components/VirtualList';
import { useAppActions, useMemos, useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { GroupManagerModal } from '../components/GroupManagerModal';
import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SelectCircle } from '../components/SelectCircle';
import { TextEntryModal } from '../components/TextEntryModal';
import { useBackHandler } from '../navigation/back';
import type { NavigationTarget } from '../navigation/types';

import { Memo } from '../types/app';

const UNCATEGORIZED_FILTER = 'uncategorized';

export function MemosScreen() {
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void }>();
  const { activeMemos, trashedMemos, memoGroups } = useMemos();
  const theme = useTheme();
  const { addMemo, updateMemo, trashMemos, purgeMemos, moveMemosToGroup, deleteMemoGroup: removeMemoGroup, addMemoGroup, renameMemoGroup, reorderMemoGroups, organizeMemos } = useAppActions();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newMemoId, setNewMemoId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manageVisible, setManageVisible] = useState(false);
  const [newGroupVisible, setNewGroupVisible] = useState(false);

  const orderedGroups = useMemo(
    () => [...memoGroups].sort((left, right) => left.order - right.order),
    [memoGroups]
  );

  const baseList = useMemo(
    () =>
      [...activeMemos].sort(
        (left, right) => left.order - right.order || right.updatedAt - left.updatedAt
      ),
    [activeMemos]
  );

  const list = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return baseList.filter((memo) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === UNCATEGORIZED_FILTER
            ? memo.groupId === null
            : memo.groupId === filter;
      if (!matchesFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const groupName = orderedGroups.find((group) => group.id === memo.groupId)?.name ?? '未分类';
      return `${memo.title}\n${memo.body}\n${groupName}`.toLowerCase().includes(keyword);
    });
  }, [baseList, filter, orderedGroups, query]);

  const editingMemo = editingId ? activeMemos.find((memo) => memo.id === editingId) ?? null : null;
  const updateEditingMemo = useCallback((patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>) => {
    if (editingId) updateMemo(editingId, patch);
  }, [editingId, updateMemo]);

  const groupLabel = (groupId: string | null) =>
    orderedGroups.find((group) => group.id === groupId)?.name ?? '未分类';

  const groupOptions = useMemo(
    () => [
      { id: null, label: '未分类' },
      ...orderedGroups.map((group) => ({ id: group.id, label: group.name })),
    ],
    [orderedGroups]
  );

  /** 长按直接进入整理模式，并预选被长按的那一条。 */
  const [actionMemoId, setActionMemoId] = useState<string | null>(null);
  const actionMemo = list.find((memo) => memo.id === actionMemoId) ?? null;

  const scrollYRef = useRef(0);
  const [organizeScrollY, setOrganizeScrollY] = useState(0);

  const enterSelectMode = (id?: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedIds(id ? [id] : []);
    setSelectMode(true);
  };



  useBackHandler(
    useCallback(() => {
      setSelectedIds([]);
      setSelectMode(false);
      return true;
    }, []),
    selectMode
  );

  const createMemo = () => {
    const groupId =
      filter !== 'all' && filter !== UNCATEGORIZED_FILTER ? filter : null;
    const id = addMemo(groupId);
    setNewMemoId(id);
    setEditingId(id);
  };

  const closeEditor = () => {
    setEditingId(null);
    setNewMemoId(null);
  };

  // 新建后没留下内容的备忘录直接清掉，避免列表里出现空条目。
  const discardEditor = () => {
    const id = editingId;
    const createdNow = id !== null && id === newMemoId;
    if (createdNow && id) {
      purgeMemos([id]);
    }
  };


  const listRows: VirtualRow[] = list.map(memo => ({ key: memo.id, render: () => (<View style={styles.memoRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`打开 ${memo.title || '未命名备忘录'}`}
                  onPress={() => setEditingId(memo.id)}
                  onLongPress={() => setActionMemoId(memo.id)}
                  delayLongPress={360}
                  style={styles.card}
                >
                  <Text numberOfLines={2} style={styles.cardTitle}>
                    {memo.title || '未命名备忘录'}
                  </Text>
                  <Text numberOfLines={2} style={styles.cardBody}>
                    {memo.body.replace(/\s+/g, ' ').trim() || '暂无正文'}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {groupLabel(memo.groupId)} · {formatMemoTime(memo.updatedAt)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`备忘录操作：${memo.title || '未命名备忘录'}`} onPress={() => setActionMemoId(memo.id)} style={styles.memoMore}><AppIcon name="more" color={theme.colors.textSecondary} /></TouchableOpacity>
                </View>) }));

  return (
    <ScreenScaffold
      organizing={selectMode}
      panelTitle="备忘录分类"
      onOrganize={!selectMode && !editingMemo && list.length > 0 ? () => enterSelectMode() : undefined}
      panelItems={[
        { id: 'all', label: `全部备忘录 · ${activeMemos.length}`, selected: filter === 'all', onPress: () => setFilter('all') },
        { id: UNCATEGORIZED_FILTER, label: `未分类 · ${activeMemos.filter((memo) => memo.groupId === null).length}`, selected: filter === UNCATEGORIZED_FILTER, onPress: () => setFilter(UNCATEGORIZED_FILTER) },
        ...orderedGroups.map((group) => ({
          id: group.id,
          label: `${group.name} · ${activeMemos.filter((memo) => memo.groupId === group.id).length}`,
          selected: filter === group.id,
          onPress: () => setFilter(group.id),
        })),
        { id: 'add-group', label: '＋ 新建分类', onPress: () => setNewGroupVisible(true) },
        { id: 'manage-group', label: '管理分类', onPress: () => setManageVisible(true) },
        {
          id: 'trash',
          label: `回收站 · ${trashedMemos.length}`,
          bottom: true,
          onPress: () => navigation.navigate('trash'),
        },
      ]}
      createAction={selectMode ? null : { label: '新建备忘录', onPress: createMemo }}
    >
      {editingMemo ? (
        <MemoEditor
          key={editingMemo.id}
          memo={editingMemo}
          isNew={editingMemo.id === newMemoId}
          initialGroupId={editingMemo.groupId}
          groupOptions={groupOptions}
          onClose={closeEditor}
          onDiscard={discardEditor}
          onChange={updateEditingMemo}
        />
      ) : null}
      <View style={styles.screen}>
        {selectMode ? (
          <OrganizePanel
            title="整理备忘录"
            initialScrollY={organizeScrollY}
            onClose={() => { setSelectMode(false); setSelectedIds([]); }}
            items={list.map((memo) => ({
              id: memo.id,
              groupId: memo.groupId ?? UNCATEGORIZED_FILTER,
              label: memo.title || '未命名备忘录',
              subtitle: memo.body.replace(/\s+/g, ' ').trim().slice(0, 40) || '暂无正文',
              leading: (
                <SelectCircle checked={selectedIds.includes(memo.id)} accessibilityLabel={`选择 ${memo.title || '未命名备忘录'}`} />
              ),
            }))}
            groups={[
              { id: UNCATEGORIZED_FILTER, title: '未分类', acceptsDrop: true },
              ...orderedGroups.map((group) => ({ id: group.id, title: group.name, acceptsDrop: true })),
            ]}
            selectedIds={selectedIds}
            onSetSelection={setSelectedIds}
            onCommit={ordered => organizeMemos(ordered.map(entry => ({ id: entry.id, groupId: entry.groupId === UNCATEGORIZED_FILTER ? null : entry.groupId })))}
            onDelete={(ids) => {
              trashMemos(ids);
              setSelectedIds([]);
              setSelectMode(false);
            }}
            groupOptions={groupOptions}
            onMoveToGroup={moveMemosToGroup}
            moveTitle="移动到分类"
            deleteLabel="删除"
          />
        ) : (
        <>
        <FilterBar options={[{ id: 'all', label: '全部', count: activeMemos.length }, { id: UNCATEGORIZED_FILTER, label: '未分类' }, ...orderedGroups.map((group) => ({ id: group.id, label: group.name }))]} value={filter} onChange={setFilter} />
<View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
            <TextInput accessibilityLabel="搜索备忘录" placeholder="搜索标题、正文或分类" value={query} onChangeText={setQuery} style={styles.search} />
            <Text style={styles.resultCount}>{list.length} 条备忘录</Text>
          </View>
          <VirtualList rows={listRows} contentStyle={styles.content} onScrollY={y => { scrollYRef.current = y; }} empty={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{baseList.length ? '没有符合条件的备忘录' : '还没有备忘录'}</Text><Text style={styles.emptyHint}>{baseList.length ? '换个关键词或分类再试试。' : '点顶部“新建”，可以写标题和正文。'}</Text></View>} />
        </View>
        </>
        )}

        <ItemActionSheet
          visible={actionMemo !== null}
          title={actionMemo?.title || '未命名备忘录'}
          subtitle="长按后可以改内容、进整理或移入回收站"
          actions={[
            { label: '编辑内容', onPress: () => { if (actionMemo) { setEditingId(actionMemo.id); } } },
            { label: '多选整理', onPress: () => { if (actionMemo) { enterSelectMode(actionMemo.id); } } },
            { label: '移入回收站', danger: true, onPress: () => { if (actionMemo) { trashMemos([actionMemo.id]); } } },
          ]}
          onClose={() => setActionMemoId(null)}
        />
        <TextEntryModal
          visible={newGroupVisible}
          title="新建分类"
          placeholder="分类名称"
          submitLabel="保存"
          onClose={() => setNewGroupVisible(false)}
          onSubmit={addMemoGroup}
        />
        <GroupManagerModal
          visible={manageVisible}
          onClose={() => setManageVisible(false)}
          title="管理分类"
          groups={orderedGroups}
          onAdd={addMemoGroup}
          onRename={renameMemoGroup}
          onDelete={removeMemoGroup}
          onReorder={reorderMemoGroups}
          usageLabel={(groupId) => `${activeMemos.filter((memo) => memo.groupId === groupId).length} 条`}
          deleteConfirmText={(name, usage) =>
            `删除分类“${name}”？其中 ${usage} 条备忘录会移到未分类。`
          }
        />
      </View>
    </ScreenScaffold>
  );
}

function formatMemoTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}


function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    resultCount: { fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 0 },
    search: {
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.small,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
    },
    list: { gap: 9 },
    memoRow: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface },
    memoMore: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    card: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 14,
      gap: 6,
      backgroundColor: theme.colors.surface,
    },
    cardTitle: { fontSize: 15, fontWeight: '500', color: theme.colors.textPrimary },
    cardBody: { fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary },
    cardMeta: { fontSize: 12, color: theme.colors.textMuted },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 6,
      backgroundColor: theme.colors.surface,
    },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary },
    emptyHint: { fontSize: 12, color: theme.colors.textSecondary },
  });
}
