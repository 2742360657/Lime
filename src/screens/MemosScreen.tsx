import { AppIcon } from '../components/AppIcon';
import { FilterBar } from '../components/FilterBar';
import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { GroupManagerModal } from '../components/GroupManagerModal';
import { GroupPickerModal } from '../components/GroupPickerModal';
import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { SelectCircle } from '../components/SelectCircle';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TextEntryModal } from '../components/TextEntryModal';
import { useBackHandler } from '../navigation/back';
import type { NavigationTarget } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LIST_ITEM_ENTERING, LIST_ITEM_EXITING, LIST_LAYOUT } from '../theme/animation';
import { useHabits } from '../state/HabitStore';
import { Memo } from '../types/habit';

const UNCATEGORIZED_FILTER = 'uncategorized';

export function MemosScreen() {
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void }>();
  const {
    activeMemos,
    trashedMemos,
    memoGroups,
    theme,
    addMemo,
    updateMemo,
    trashMemos,
    purgeMemos,
    moveMemosToGroup,
    reorderMemos,
    deleteMemoGroup: removeMemoGroup,
    addMemoGroup,
    renameMemoGroup,
    reorderMemoGroups,
  } = useHabits();
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

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];

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
    closeEditor();
    if (createdNow && id) {
      purgeMemos([id]);
    }
  };

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
            hint="点按备忘录选中 · 按住右侧把手拖动排序，拖到别的分类即可移动"
            initialScrollY={organizeScrollY}
            onClose={() => { setSelectMode(false); setSelectedIds([]); }}
            items={list.map((memo) => ({
              id: memo.id,
              groupId: memo.groupId ?? UNCATEGORIZED_FILTER,
              label: memo.title || '未命名备忘录',
              subtitle: memo.body.trim().slice(0, 40) || '暂无正文',
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
            onCommit={(ordered) => {
              ordered.forEach((entry) => {
                const memo = list.find((item) => item.id === entry.id);
                if (!memo) {
                  return;
                }
                if ((memo.groupId ?? UNCATEGORIZED_FILTER) !== entry.groupId) {
                  moveMemosToGroup([entry.id], entry.groupId === UNCATEGORIZED_FILTER ? null : entry.groupId);
                }
              });
              for (const groupId of new Set(ordered.map((entry) => entry.groupId))) {
                reorderMemos(groupId === UNCATEGORIZED_FILTER ? null : groupId,
                  ordered.filter((entry) => entry.groupId === groupId).map((entry) => entry.id));
              }
            }}
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => { scrollYRef.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          <Text style={styles.resultCount}>{list.length} 条备忘录 · 点开编辑，更多操作见条目菜单</Text>
          <TextInput
            accessibilityLabel="搜索备忘录"
            placeholder="搜索标题、正文或分类"
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={styles.search}
          />

          {list.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {baseList.length === 0 ? '还没有备忘录' : '没有符合条件的备忘录'}
              </Text>
              <Text style={styles.emptyHint}>
                {baseList.length === 0
                  ? '点顶部“新建”，可以写标题和正文。'
                  : '换个关键词或分类再试试。'}
              </Text>
            </View>
          ) : (
            <Animated.View layout={LIST_LAYOUT} style={styles.list}>
              {list.map((memo) => (
                <Animated.View
                  key={memo.id}
                  entering={LIST_ITEM_ENTERING}
                  exiting={LIST_ITEM_EXITING}
                  layout={LIST_LAYOUT}
                >
                <View style={styles.memoRow}>
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
                    {memo.body.trim() || '暂无正文'}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {groupLabel(memo.groupId)} · {formatMemoTime(memo.updatedAt)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`备忘录操作：${memo.title || '未命名备忘录'}`} onPress={() => setActionMemoId(memo.id)} style={styles.memoMore}><AppIcon name="more" color={theme.colors.textSecondary} /></TouchableOpacity>
                </View>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </ScrollView>
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

/** 新建/编辑页：只有标题、分类和正文；返回时先确认保存，右上角也提供保存入口。 */
function MemoEditor({
  memo,
  initialGroupId,
  groupOptions,
  isNew,
  onClose,
  onDiscard,
  onChange,
}: {
  memo: Memo;
  isNew: boolean;
  initialGroupId: string | null;
  groupOptions: Array<{ id: string | null; label: string }>;
  onClose: () => void;
  onDiscard: () => void;
  onChange: (patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>) => void;
}) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState(memo.title);
  const [body, setBody] = useState(memo.body);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const initialRef = useRef({ title: memo.title, body: memo.body, groupId: memo.groupId });
  // 与打开编辑器时的快照比较：自动保存会同步更新 memo，拿 memo 比对会让“有改动”在
  // 600ms 自动保存后永远变成 false，返回时便不再询问是否保存。
  const dirty =
    title !== initialRef.current.title ||
    body !== initialRef.current.body ||
    groupId !== initialRef.current.groupId;
  const hasContent = title.trim() !== '' || body.trim() !== '';

  // 输入停顿后自动写回，避免切走应用时丢掉正在编辑的内容。
  useEffect(() => {
    if (!dirty || !hasContent) {
      return;
    }
    const timer = setTimeout(() => {
      onChange({ title, body, groupId });
    }, 600);
    return () => clearTimeout(timer);
  }, [body, dirty, groupId, hasContent, onChange, title]);

  const persist = useCallback(() => {
    onChange({ title, body, groupId });
  }, [body, groupId, onChange, title]);

  const handleSave = useCallback(() => {
    if (!hasContent) {
      Alert.alert('还没有内容', '标题和正文都是空的，先写点内容再保存。');
      return;
    }
    persist();
    onClose();
  }, [hasContent, onClose, persist]);

  // 放弃编辑：新建的直接丢弃，已有的回滚到打开编辑器时的内容。
  const discard = useCallback(() => {
    if (isNew) {
      onDiscard();
      return;
    }
    onChange(initialRef.current);
    onClose();
  }, [isNew, onChange, onClose, onDiscard]);

  const handleBack = useCallback(() => {
    if (!dirty) {
      // 没有改动：新建的空备忘录直接清掉，已有的直接退出。
      if (isNew) {
        onDiscard();
      } else {
        onClose();
      }
      return true;
    }
    if (!hasContent) {
      Alert.alert(
        isNew ? '放弃这条备忘录？' : '清空这条备忘录？',
        isNew ? '标题和正文都是空的，返回后不会保存。' : '返回会恢复打开时的内容。',
        [
          { text: '继续编辑', style: 'cancel' },
          { text: '放弃修改', style: 'destructive', onPress: discard },
        ]
      );
      return true;
    }
    Alert.alert(
      '保存这条备忘录？',
      '返回前可以先保存当前内容；选择“不保存”会撤销本次修改。',
      [
        { text: '不保存', style: 'destructive', onPress: discard },
        { text: '保存', onPress: handleSave },
      ]
    );
    return true;
  }, [discard, dirty, handleSave, hasContent, isNew, onClose, onDiscard]);

  // 编辑态优先消费系统返回，避免直接退出应用。
  // 原生 Modal 的返回键由 onRequestClose 接管，所以两个入口都要走 handleBack。
  useBackHandler(handleBack);

  const groupLabel = groupOptions.find((option) => option.id === groupId)?.label ?? '未分类';

  // Android edge-to-edge 下 Modal 可能保持全屏高度，显式避让键盘以保留末行的滚动空间。
  return (
    <Modal visible animationType="slide" onRequestClose={handleBack}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          <View style={styles.editorHeader}>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="返回备忘录列表"
              onPress={handleBack}
              hitSlop={12}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>‹ 返回</Text>
            </TouchableOpacity>
            <View style={styles.editorHeading}>
              <Text style={styles.editorTitle}>{isNew ? '新建备忘录' : '编辑备忘录'}</Text>
              <Text style={styles.editorHint}>编辑后自动保存</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="保存备忘录"
              onPress={handleSave}
              hitSlop={8}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>保存</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.editorScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.editorContent}
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              accessibilityLabel="备忘录标题"
              placeholder="标题"
              placeholderTextColor={theme.colors.textMuted}
              value={title}
              onChangeText={setTitle}
              style={styles.titleInput}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="选择分类"
              onPress={() => setPickerVisible(true)}
              style={styles.groupField}
            >
              <Text style={styles.groupFieldLabel}>分类</Text>
              <Text style={styles.groupFieldValue}>{groupLabel}</Text>
            </TouchableOpacity>

            <TextInput
              accessibilityLabel="备忘录正文"
              placeholder="开始记录…"
              placeholderTextColor={theme.colors.textMuted}
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
              style={styles.bodyInput}
            />
          </ScrollView>

          <GroupPickerModal
            visible={pickerVisible}
            title="选择分类"
            selectedGroupId={groupId}
            options={groupOptions}
            nullLabel="未分类"
            onClose={() => setPickerVisible(false)}
            onSubmit={(next) => setGroupId(next)}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    resultCount: { fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 16 },
    search: {
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.medium,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    list: { gap: 9 },
    memoRow: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.medium, backgroundColor: theme.colors.surface },
    memoMore: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    card: {
      flex: 1,
      borderRadius: theme.radius.medium,
      padding: 12,
      gap: 6,
      backgroundColor: theme.colors.surface,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    cardBody: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
    cardMeta: { fontSize: 11, color: theme.colors.textMuted },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 6,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
    emptyHint: { fontSize: 12, color: theme.colors.textSecondary },
    editorHeading: { flex: 1, gap: 3, paddingHorizontal: 8 },
    editorTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    editorHint: { fontSize: 11, color: theme.colors.textSecondary },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 6,
    },
    backLink: { minHeight: 48, justifyContent: 'center', paddingVertical: 8, paddingRight: 12 },
    backLinkText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
    saveButton: {
      minHeight: 48,
      justifyContent: 'center',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: theme.colors.primary,
    },
    saveButtonText: { fontSize: 14, fontWeight: '800', color: theme.colors.white },
    editorScroll: { flex: 1 },
    editorContent: { paddingHorizontal: 16, paddingTop: 8, gap: 14, paddingBottom: 40 },
    titleInput: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      paddingVertical: 6,
    },
    groupField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: theme.radius.medium,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    groupFieldLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    groupFieldValue: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
    bodyInput: {
      minHeight: 340,
      fontSize: 15,
      lineHeight: 24,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.medium,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
  });
}
