import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';

import { AccordionSection } from '../components/AccordionSection';
import { AddHabitModal } from '../components/AddHabitModal';
import { ArchivedHabitsModal } from '../components/ArchivedHabitsModal';
import { GroupManagerModal } from '../components/GroupManagerModal';
import { HabitActionModal } from '../components/HabitActionModal';
import { HabitCard } from '../components/HabitCard';
import { HabitHistoryModal } from '../components/HabitHistoryModal';
import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TextEntryModal } from '../components/TextEntryModal';
import { UndoToast } from '../components/UndoToast';
import { useHabits } from '../state/HabitStore';
import { Habit } from '../types/habit';

type HabitSection = {
  id: string;
  groupId: string | null;
  title: string;
  habits: Habit[];
};

export function HomeScreen() {
  const {
    habits,
    groups,
    theme,
    addCheckinNow,
    deleteCheckin,
    addGroup,
    moveHabitsToGroup,
    reorderHabits,
    deleteHabits,
  } = useHabits();
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
  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const boardGroups = useMemo(
    () => sections.map((section) => ({ id: section.id, title: section.title, acceptsDrop: true })),
    [sections]
  );
  const boardItems = useMemo(
    () =>
      [...habits]
        .sort((left, right) => left.order - right.order)
        .map((habit) => ({
          id: habit.id,
          groupId: habit.groupId ?? 'ungrouped',
          label: habit.name,
          subtitle:
            habit.cadence === 'daily' ? '每天' : habit.cadence === 'weekly' ? '每周' : '每月',
          leading: (
            <SelectCircle
              checked={selectedIds.includes(habit.id)}
              accessibilityLabel={`选择 ${habit.name}`}
              onPress={() => setSelectedIds((current) => toggleId(current, habit.id))}
            />
          ),
        })),
    [habits, selectedIds]
  );

  const groupOptions = useMemo(
    () => [
      { id: null, label: '未分组' },
      ...orderedGroups.map((group) => ({ id: group.id, label: group.name })),
    ],
    [orderedGroups]
  );

  if (selectMode) {
    return (
      <MultiSelectBoard
        title="整理习惯"
        onClose={() => { setSelectMode(false); setSelectedIds([]); }}
        items={boardItems}
        groups={boardGroups}
        selectedIds={selectedIds}
        onSetSelection={setSelectedIds}
        onCommit={(ordered) => {
          ordered.forEach((entry) => {
            moveHabitsToGroup([entry.id], entry.groupId === 'ungrouped' ? null : entry.groupId);
          });
          for (const groupId of new Set(ordered.map((entry) => entry.groupId))) {
            reorderHabits(groupId === 'ungrouped' ? null : groupId,
              ordered.filter((entry) => entry.groupId === groupId).map((entry) => entry.id));
          }
        }}
        onDelete={(ids) => {
          deleteHabits(ids);
          setSelectedIds([]);
          setSelectMode(false);
        }}
        groupOptions={groupOptions}
        onMoveToGroup={moveHabitsToGroup}
        moveTitle="移动到分组"
      />
    );
  }

  return (
    <ScreenScaffold
      panelTitle="习惯分组"
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
      fab={{ label: '新建习惯', onPress: () => setAddHabitVisible(true) }}
    >
      <View style={styles.screen}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {habits.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>还没有习惯</Text>
            </View>
          ) : (
            sections
              .filter((section) => filter === 'all' || filter === section.id)
              .map((section) => {
                const collapsed = collapsedSections[section.id] ?? false;
                return (
                  <AccordionSection
                    key={section.id}
                    title={section.title}
                    meta={`${section.habits.length} 个`}
                    collapsed={collapsed}
                    onToggle={() =>
                      setCollapsedSections((current) => ({
                        ...current,
                        [section.id]: !current[section.id],
                      }))
                    }
                  >
                    {section.habits.length === 0 ? (
                      <Text style={styles.groupEmpty}>这个分组里还没有习惯</Text>
                    ) : (
                      <Animated.View layout={LIST_LAYOUT} style={styles.habitList}>
                        {section.habits.map((habit) => (
                          <HabitCard
                            key={habit.id}
                            habit={habit}
                            onAddCheckin={handleAddCheckin}
                            onOpenDetails={setHistoryHabitId}
                            onOpenActions={setActionHabit}
                            onLongPress={() => setSelectMode(true)}
                          />
                        ))}
                      </Animated.View>
                    )}
                  </AccordionSection>
                );
              })
          )}
        </ScrollView>

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

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screenOuter: { flex: 1 },
    screen: { flex: 1 },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 130, gap: 20 },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
    habitList: { gap: 9 },
    groupEmpty: { paddingVertical: 14, fontSize: 13, color: theme.colors.textSecondary },
  });
}
