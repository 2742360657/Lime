import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { FAB_CLEARANCE } from '../components/FloatingAddButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TextEntryModal } from '../components/TextEntryModal';
import { useBackHandler } from '../navigation/back';
import type { NavigationTarget } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import Animated from 'react-native-reanimated';

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

  const groupLabel = (groupId: string | null) =>
    orderedGroups.find((group) => group.id === groupId)?.name ?? '未分类';

  const groupOptions = useMemo(
    () => [
      { id: null, label: '未分类' },
      ...orderedGroups.map((group) => ({ id: group.id, label: group.name })),
    ],
    [orderedGroups]
  );

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
    setEditingId(addMemo(groupId));
  };

  if (selectMode) {
    return (
      <MultiSelectBoard
        title="整理备忘录"
        onClose={() => { setSelectMode(false); setSelectedIds([]); }}
        items={list.map((memo) => ({
          id: memo.id,
          groupId: memo.groupId ?? UNCATEGORIZED_FILTER,
          label: memo.title || '未命名备忘录',
          subtitle: memo.body.trim().slice(0, 40) || '暂无正文',
          leading: (
            <SelectCircle
              checked={selectedIds.includes(memo.id)}
              accessibilityLabel={`选择 ${memo.title || '未命名备忘录'}`}
              onPress={() => setSelectedIds((current) => toggleId(current, memo.id))}
            />
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
            moveMemosToGroup(
              [entry.id],
              entry.groupId === UNCATEGORIZED_FILTER ? null : entry.groupId
            );
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
    );
  }

  return (
    <ScreenScaffold
      panelTitle="备忘录分类"
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
      fab={selectMode ? null : { label: '新建备忘录', onPress: createMemo }}
    >
      {/* 编辑器用原生 Modal + slide 转场，与待办/习惯的编辑器保持一致；
          onRequestClose 让系统返回键先走「保存/放弃」确认，而不是直接回首页。 */}
      {editingMemo ? (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => setEditingId(null)}
        >
          <MemoEditor
            memo={editingMemo}
            initialGroupId={editingMemo.groupId}
            groupOptions={groupOptions}
            onClose={() => setEditingId(null)}
            onChange={(patch) => updateMemo(editingMemo.id, patch)}
          />
        </Modal>
      ) : null}
      <View style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
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
              <Text style={styles.emptyTitle}>还没有备忘录</Text>
              <Text style={styles.emptyHint}>点右下角 + 新建，可以写标题和正文。</Text>
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
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`打开 ${memo.title || '未命名备忘录'}`}
                  onPress={() => setEditingId(memo.id)}
                  onLongPress={() => setSelectMode(true)}
                  delayLongPress={360}
                  style={styles.card}
                >
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {memo.title || '未命名备忘录'}
                  </Text>
                  <Text numberOfLines={2} style={styles.cardBody}>
                    {memo.body.trim() || '暂无正文'}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {groupLabel(memo.groupId)} · {formatMemoTime(memo.updatedAt)}
                  </Text>
                </TouchableOpacity>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </ScrollView>

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

/** 新建/编辑页：只有标题、分类和正文，返回时询问是否保存。 */
function MemoEditor({
  memo,
  initialGroupId,
  groupOptions,
  onClose,
  onChange,
}: {
  memo: Memo;
  initialGroupId: string | null;
  groupOptions: Array<{ id: string | null; label: string }>;
  onClose: () => void;
  onChange: (patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>) => void;
}) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState(memo.title);
  const [body, setBody] = useState(memo.body);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const dirty = title !== memo.title || body !== memo.body || groupId !== memo.groupId;
  const hasContent = title.trim() !== '' || body.trim() !== '';

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

  const handleBack = useCallback(() => {
    if (!dirty) {
      // 新建且没有任何内容：直接丢弃，不留下空条目。
      onClose();
      return true;
    }
    if (!hasContent) {
      Alert.alert('放弃这条备忘录？', '标题和正文都是空的，返回后将不会保存。', [
        { text: '继续编辑', style: 'cancel' },
        { text: '放弃', style: 'destructive', onPress: onClose },
      ]);
      return true;
    }
    Alert.alert('保存这条备忘录？', '返回前可以先保存当前内容。', [
      { text: '不保存', style: 'destructive', onPress: onClose },
      {
        text: '保存',
        onPress: () => {
          persist();
          onClose();
        },
      },
    ]);
    return true;
  }, [dirty, hasContent, onClose, persist]);

  // 编辑态优先消费系统返回，避免直接退出应用。
  useBackHandler(handleBack);

  const groupLabel = groupOptions.find((option) => option.id === groupId)?.label ?? '未分类';

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.editorContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="返回备忘录列表"
          onPress={handleBack}
          hitSlop={12}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>‹ 返回</Text>
        </TouchableOpacity>

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
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screenOuter: { flex: 1 },
    screen: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: FAB_CLEARANCE, gap: 16 },
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
    card: {
      borderRadius: theme.radius.medium,
      padding: 16,
      gap: 6,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
    cardBody: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
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
    backLink: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12 },
    backLinkText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
    editorContent: { padding: 20, gap: 14, paddingBottom: 80 },
    titleInput: {
      fontSize: 22,
      fontWeight: '800',
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
