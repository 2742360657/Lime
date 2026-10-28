import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FilterBar } from '../components/FilterBar';
import { SectionHeading } from '../components/SectionHeading';
import { VirtualList, type VirtualRow } from '../components/VirtualList';
import { useAppActions, useHabitData, useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';


import { AddHabitModal } from '../components/AddHabitModal';
import { ArchivedHabitsModal } from '../components/ArchivedHabitsModal';
import { GroupManagerModal } from '../components/GroupManagerModal';
import { HabitActionModal } from '../components/HabitActionModal';
import { HabitCard } from '../components/HabitCard';
import { HabitHistoryModal } from '../components/HabitHistoryModal';
import { OrganizePanel } from '../components/OrganizePanel';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SelectCircle } from '../components/SelectCircle';
import { TextEntryModal } from '../components/TextEntryModal';
import { UndoToast } from '../components/UndoToast';
import { Habit } from '../types/app';

type HabitSection = {
  id: string;
  groupId: string | null;
  title: string;
  habits: Habit[];
};

export function HomeScreen() {
  const { habits, groups } = useHabitData();
  const theme = useTheme();
  const { addCheckinNow, deleteCheckin, addGroup, moveHabitsToGroup, deleteHabits, organizeHabits } = useAppActions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState('all');
  const [manage, setManage] = useState(false);
  const [archive, setArchive] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [isAddHabitVisible, setAddHabitVisible] = useState(false);
  const [isAddGroupVisible, setAddGroupVisible] = useState(false);
  const [actionHabit, setActionHabit] = useState<Habit | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [historyHabitId, setHistoryHabitId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<{ habitId: string; recordId: string } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const orderedGroups = useMemo(
    () => [...groups].sort((left, right) => left.order - right.order),
    [groups]
  );
  const sections = useMemo<HabitSection[]>(() => {
    const orderedHabits = [...habits].sort((left, right) => left.order - right.order);
    const result: HabitSection[] = orderedGroups.map((group) => ({
      id: group.id,
      groupId: group.id,
      title: group.name,
      habits: orderedHabits.filter((habit) => habit.groupId === group.id),
    }));
    const ungrouped = orderedHabits.filter((habit) => habit.groupId === null);
    result.push({ id: 'ungrouped', groupId: null, title: '未分组', habits: ungrouped });
    return result;
  }, [habits, orderedGroups]);

  const editingHabit = habits.find((habit) => habit.id === editingHabitId) ?? null;

  const handleAddCheckin = (habitId: string) => {
    const recordId = addCheckinNow(habitId);
    setUndoState({ habitId, recordId });
  };
  const dismissUndo = useCallback(() => setUndoState(null), []);
  /** 长按直接进入整理模式，并预选被长按的那一条。 */
  const scrollYRef = useRef(0);
  const [organizeScrollY, setOrganizeScrollY] = useState(0);

  const enterSelectMode = (id?: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedIds(id ? [id] : []);
    setSelectMode(true);
  };



  const boardGroups = useMemo(
    () => sections.filter((section) => filter === 'all' || filter === section.id).map((section) => ({ id: section.id, title: section.title, acceptsDrop: true })),
    [sections, filter]
  );
  const boardItems = useMemo(
    () =>
      [...habits].filter((habit) => filter === 'all' || (habit.groupId ?? 'ungrouped') === filter)
        .sort((left, right) => left.order - right.order)
        .map((habit) => ({
          id: habit.id,
          groupId: habit.groupId ?? 'ungrouped',
          label: habit.name,
          subtitle:
            habit.cadence === 'daily' ? '每天' : habit.cadence === 'weekly' ? '每周' : '每月',
          leading: (
            <SelectCircle checked={selectedIds.includes(habit.id)} accessibilityLabel={`选择 ${habit.name}`} />
          ),
        })),
    [habits, selectedIds, filter]
  );

  const groupOptions = useMemo(
    () => [
      { id: null, label: '未分组' },
      ...orderedGroups.map((group) => ({ id: group.id, label: group.name })),
    ],
    [orderedGroups]
  );


  const listRows: VirtualRow[] = [];
  for (const section of sections.filter(section => filter === 'all' || filter === section.id)) {
    const collapsed = collapsedSections[section.id] ?? false;
    listRows.push({ key: `header:${section.id}`, render: () => <SectionHeading title={section.title} meta={`${section.habits.length} 个`} collapsed={collapsed} onToggle={() => setCollapsedSections(current => ({ ...current, [section.id]: !current[section.id] }))} /> });
    if (!collapsed) {
      if (!section.habits.length) listRows.push({ key: `empty:${section.id}`, render: () => <Text style={styles.groupEmpty}>{habits.length ? '这个分组里还没有习惯' : '点顶部“新建”，从一件小事开始。'}</Text> });
      for (const habit of section.habits) listRows.push({ key: `habit:${habit.id}`, render: () => <HabitCard habit={habit} onAddCheckin={handleAddCheckin} onOpenDetails={setHistoryHabitId} onOpenActions={setActionHabit} onLongPress={() => setActionHabit(habit)} /> });
    }
  }

  return (
    <ScreenScaffold
      organizing={selectMode}
      panelTitle="习惯分组"
      onOrganize={!selectMode && boardItems.length > 0 ? () => enterSelectMode() : undefined}
      panelItems={[
        { id: 'all', label: `全部习惯 · ${habits.length}`, selected: filter === 'all', onPress: () => setFilter('all') },
        ...sections.map((section) => ({
          id: section.id,
          label: `${section.title} · ${section.habits.length}`,
          selected: filter === section.id,
          onPress: () => setFilter(section.id),
        })),
        { id: 'add-group', label: '＋ 新建分组', onPress: () => setAddGroupVisible(true) },
        { id: 'manage-group', label: '管理分组', onPress: () => setManage(true) },
        {
          id: 'archive',
          label: '归档习惯',
          bottom: true,
          onPress: () => setArchive(true),
        },
      ]}
      createAction={selectMode ? null : { label: '新建习惯', onPress: () => setAddHabitVisible(true) }}
    >
      <View style={styles.screen}>
        {selectMode ? (
          <OrganizePanel
            title="整理习惯"
            initialScrollY={organizeScrollY}
            onClose={() => { setSelectMode(false); setSelectedIds([]); }}
            items={boardItems}
            groups={boardGroups}
            selectedIds={selectedIds}
            onSetSelection={setSelectedIds}
            onCommit={ordered => organizeHabits(ordered.map(entry => ({ id: entry.id, groupId: entry.groupId === 'ungrouped' ? null : entry.groupId })))}
            onDelete={(ids) => {
              deleteHabits(ids);
              setSelectedIds([]);
              setSelectMode(false);
            }}
            groupOptions={groupOptions}
            onMoveToGroup={moveHabitsToGroup}
            moveTitle="移动到分组"
          />
        ) : (
        <>
        <FilterBar options={[{ id: 'all', label: '全部', count: habits.length }, ...sections.map((section) => ({ id: section.id, label: section.title, count: section.habits.length }))]} value={filter} onChange={setFilter} />
<VirtualList rows={listRows} contentStyle={styles.content} onScrollY={y => { scrollYRef.current = y; }} />
        </>
        )}
        <GroupManagerModal visible={manage} onClose={() => setManage(false)} />
        <ArchivedHabitsModal visible={archive} onClose={() => setArchive(false)} />
        <AddHabitModal visible={isAddHabitVisible} onClose={() => setAddHabitVisible(false)} />
        <AddHabitModal habit={editingHabit} visible={editingHabitId !== null} onClose={() => setEditingHabitId(null)} />
        <TextEntryModal
          visible={isAddGroupVisible}
          title="新建分组"
          placeholder="分组名称"
          submitLabel="保存"
          onClose={() => setAddGroupVisible(false)}
          onSubmit={addGroup}
        />
        <HabitActionModal
          habit={actionHabit}
          visible={actionHabit !== null}
          onClose={() => setActionHabit(null)}
          onEdit={setEditingHabitId}
          onOpenHistory={setHistoryHabitId}
          onOrganize={(habitId) => { setActionHabit(null); enterSelectMode(habitId); }}
        />
        <HabitHistoryModal
          habitId={historyHabitId}
          visible={historyHabitId !== null}
          onClose={() => setHistoryHabitId(null)}
        />
        <UndoToast
          message={undoState ? '已记录一次打卡' : null}
          onDismiss={dismissUndo}
          onUndo={() => {
            if (undoState) {
              deleteCheckin(undoState.habitId, undoState.recordId);
            }
            setUndoState(null);
          }}
        />
      </View>
    </ScreenScaffold>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screenOuter: { flex: 1 },
    screen: { flex: 1 },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 0 },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.textPrimary },
    habitList: { gap: 9 },
    groupEmpty: { paddingVertical: 14, fontSize: 13, color: theme.colors.textSecondary },
  });
}
