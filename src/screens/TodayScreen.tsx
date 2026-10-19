import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';

import { AccordionSection } from '../components/AccordionSection';
import { AddHabitModal } from '../components/AddHabitModal';
import { CheckinDetailModal } from '../components/CheckinDetailModal';
import { HabitCard } from '../components/HabitCard';
import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { SelectCircle } from '../components/SelectCircle';
import { FAB_CLEARANCE, handleFabScroll } from '../components/FloatingAddButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TodoEditorModal } from '../components/TodoEditorModal';
import { TodoRow } from '../components/TodoRow';
import { UndoToast } from '../components/UndoToast';
import { useHabits } from '../state/HabitStore';
import { TodoItem } from '../types/habit';
import { getCheckinTodayKey } from '../utils/date';
import { getHabitProgress, getHabitSummary } from '../utils/habit';
import {
  bucketToDueDateKey,
  buildTodoBuckets,
  compareTodosSmart,
  todoGroupKey,
  TODO_COMPLETED_BUCKET_ID,
} from '../utils/todo';

type UndoState =
  | { kind: 'todo'; todoId: string }
  | { kind: 'checkin'; habitId: string; recordId: string }
  | null;

export function TodayScreen() {
  const {
    todos,
    habits,
    groups,
    theme,
    setTodoCompleted,
    addCheckinNow,
    deleteCheckin,
    settings,
    setTodoBucketCollapsed,
    deleteTodo,
    moveTodosToBucket,
    reorderTodos,
    moveHabitsToGroup,
    reorderHabits,
    deleteHabits,
    archiveHabit,
  } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [todoSelectMode, setTodoSelectMode] = useState(false);
  const [habitSelectMode, setHabitSelectMode] = useState(false);
  const [selectedTodoIds, setSelectedTodoIds] = useState<string[]>([]);
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);

  const allBuckets = useMemo(() => buildTodoBuckets(todos), [todos]);
  const activeBuckets = useMemo(
    () => allBuckets.filter((bucket) => bucket.id === 'overdue' || bucket.id === 'today'),
    [allBuckets]
  );
  const noDateTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.completedAt === null && todo.dueDateKey === null)
        .sort(compareTodosSmart),
    [todos]
  );
  const orderedHabits = useMemo(
    () => [...habits].sort((left, right) => left.order - right.order),
    [habits]
  );
  const collapsed = useMemo(
    () => new Set(settings.collapsedTodoBuckets),
    [settings.collapsedTodoBuckets]
  );

  const toggleBucket = (bucketId: string) =>
    setTodoBucketCollapsed(bucketId, !collapsed.has(bucketId));

  const openEditor = (todo: TodoItem | null) => {
    setEditingTodo(todo);
    setEditorVisible(true);
  };
  const handleToggleTodo = (todo: TodoItem) => {
    const completing = todo.completedAt === null;
    setTodoCompleted(todo.id, completing);
    if (completing) {
      setUndoState({ kind: 'todo', todoId: todo.id });
    }
  };

  /** 长按直接进入整理模式，并预选被长按的那一条。 */
  const [actionTodoId, setActionTodoId] = useState<string | null>(null);
  const actionTodo = todos.find((todo) => todo.id === actionTodoId) ?? null;
  const [dueTodoId, setDueTodoId] = useState<string | null>(null);
  const dueTodo = todos.find((todo) => todo.id === dueTodoId) ?? null;
  const [actionHabitId, setActionHabitId] = useState<string | null>(null);
  const actionHabit = habits.find((habit) => habit.id === actionHabitId) ?? null;

  const scrollYRef = useRef(0);
  const [organizeScrollY, setOrganizeScrollY] = useState(0);

  const enterTodoSelect = (id: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedTodoIds([id]);
    setTodoSelectMode(true);
  };

  const enterHabitSelect = (id: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedHabitIds([id]);
    setHabitSelectMode(true);
  };

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const dismissUndo = useCallback(() => setUndoState(null), []);

  const groupOptions = useMemo(
    () => [{ id: null, label: '未分组' }, ...groups.map((group) => ({ id: group.id, label: group.name }))],
    [groups]
  );

  // 今天页的多选只用于批量整理当天可见的条目。
  const todayTodoIds = useMemo(() => {
    const ids = [...activeBuckets.flatMap((bucket) => bucket.todos.map((todo) => todo.id)), ...noDateTodos.slice(0, 3).map((todo) => todo.id)];
    return [...new Set(ids)];
  }, [activeBuckets, noDateTodos]);

  const boardGroups = useMemo(() => {
    const result = activeBuckets.map((bucket) => ({
      id: bucket.id,
      title: bucket.title,
      acceptsDrop: false,
    }));
    if (noDateTodos.length > 0) {
      result.push({ id: 'no-date', title: '无日期', acceptsDrop: false });
    }
    return result;
  }, [activeBuckets, noDateTodos.length]);

  const boardItems = useMemo(
    () =>
      todayTodoIds.map((id) => {
        const todo = todos.find((entry) => entry.id === id);
        return {
          id,
          groupId: todo ? todoGroupKey(todo, allBuckets) : 'no-date',
          label: todo?.title ?? '',
          subtitle: todo ? undefined : undefined,
          leading: <SelectCircle checked={selectedTodoIds.includes(id)} accessibilityLabel={`选择 ${todo?.title ?? ''}`} />,
        };
      }),
    [allBuckets, selectedTodoIds, todayTodoIds, todos]
  );

  const habitGroups = useMemo(
    () => [
      { id: 'ungrouped', title: '未分组' },
      ...groups.map((group) => ({ id: group.id, title: group.name })),
    ],
    [groups]
  );

  const habitBoardItems = useMemo(
    () =>
      orderedHabits.map((habit) => ({
        id: habit.id,
        groupId: habit.groupId ?? 'ungrouped',
        label: habit.name,
        subtitle: getHabitProgress(habit).label,
        leading: <SelectCircle checked={selectedHabitIds.includes(habit.id)} accessibilityLabel={`选择 ${habit.name}`} />,
      })),
    [orderedHabits, selectedHabitIds]
  );

  return (
    <View style={styles.screen}>
      <ScreenScaffold
      panelTitle="首页"
      panelItems={[]}
      fab={todoSelectMode || habitSelectMode ? null : { label: '新建待办', onPress: () => openEditor(null) }}
    >
        {todoSelectMode ? (
          <OrganizePanel
        title="整理待办"
        hint="点按待办选中 · 拖动排序；拖到别的分组会先确认是否改截止时间"
        onClose={() => { setTodoSelectMode(false); setSelectedTodoIds([]); }}
        items={boardItems}
        groups={boardGroups}
        selectedIds={selectedTodoIds}
        onSetSelection={setSelectedTodoIds}
        onCommit={(ordered) => {
          const reorderOnly = () => reorderTodos(ordered.map((entry) => entry.id));
          const moves = ordered
            .map((entry) => {
              const todo = todos.find((item) => item.id === entry.id);
              if (!todo || entry.groupId === TODO_COMPLETED_BUCKET_ID) {
                return null;
              }
              if (todoGroupKey(todo, allBuckets) === entry.groupId) {
                return null;
              }
              return { id: entry.id, title: todo.title, groupId: entry.groupId };
            })
            .filter((move): move is { id: string; title: string; groupId: string } => move !== null);

          if (moves.length === 0) {
            reorderOnly();
            return;
          }

          const labelOf = (groupId: string) =>
            boardGroups.find((group) => group.id === groupId)?.title ?? '新的分组';
          const detail =
            moves.length === 1
              ? `「${moves[0].title}」会挪到「${labelOf(moves[0].groupId)}」，截止时间跟着变。`
              : `${moves.length} 项待办会跟着分组改截止时间。`;

          Alert.alert(
            '要改截止时间吗？',
            `${detail}\n只排序的话，它们仍留在原来的日期分组里。`,
            [
              { text: '只排序', style: 'cancel', onPress: reorderOnly },
              {
                text: '改时间',
                onPress: () => {
                  moves.forEach((move) => {
                    moveTodosToBucket([move.id], bucketToDueDateKey(move.groupId));
                  });
                  reorderOnly();
                },
              },
            ],
            { cancelable: true, onDismiss: reorderOnly }
          );
        }}
        onDelete={(ids) => {
          ids.forEach((id) => deleteTodo(id));
          setSelectedTodoIds([]);
          setTodoSelectMode(false);
        }}
        groupOptions={[
          { id: 'today', label: '今天' },
          { id: 'tomorrow', label: '明天' },
          { id: 'soon', label: '未来 7 天' },
          { id: 'later', label: '稍后' },
          { id: null, label: '无日期' },
        ]}
        onMoveToGroup={(ids, groupId) => moveTodosToBucket(ids, bucketToDueDateKey(groupId ?? 'no-date'))}
        moveTitle="移动到日期分组"
        deleteLabel="删除"
                />
        ) : habitSelectMode ? (
          <OrganizePanel
        title="整理习惯"
        hint="点按习惯选中 · 拖动右侧把手排序或换分组"
        onClose={() => { setHabitSelectMode(false); setSelectedHabitIds([]); }}
        items={habitBoardItems}
        groups={habitGroups}
        selectedIds={selectedHabitIds}
        onSetSelection={setSelectedHabitIds}
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
          ids.forEach((id) => deleteHabits([id]));
          setSelectedHabitIds([]);
          setHabitSelectMode(false);
        }}
        groupOptions={groupOptions}
        onMoveToGroup={moveHabitsToGroup}
        moveTitle="移动到分组"
                />
        ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onScroll={(event) => { scrollYRef.current = event.nativeEvent.contentOffset.y; handleFabScroll(event.nativeEvent.contentOffset.y); }} scrollEventThrottle={16}>
          <AccordionSection
            title="待办"
            meta={`${todayTodoIds.length} 项`}
            collapsed={collapsed.has('home-todos')}
            onToggle={() => toggleBucket('home-todos')}
            accessibilityLabel="折叠今天的待办"
          >
            {activeBuckets.map((bucket) => (
              <AccordionSection
                key={bucket.id}
                title={bucket.title}
                danger={bucket.id === 'overdue'}
                meta={`${bucket.todos.length} 项`}
                collapsed={collapsed.has(bucket.id)}
                onToggle={() => toggleBucket(bucket.id)}
              >
                <Animated.View layout={LIST_LAYOUT} style={styles.list}>
                  {bucket.todos.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} onToggle={handleToggleTodo} onPress={openEditor} onLongPress={() => setActionTodoId(todo.id)}
                    onPickDue={(item) => setDueTodoId(item.id)} compact />
                  ))}
                </Animated.View>
              </AccordionSection>
            ))}
            {noDateTodos.length > 0 ? (
              <AccordionSection
                title="无日期"
                meta={`${noDateTodos.length} 项`}
                collapsed={collapsed.has('no-date')}
                onToggle={() => toggleBucket('no-date')}
              >
                <Animated.View layout={LIST_LAYOUT} style={styles.list}>
                  {noDateTodos.slice(0, 3).map((todo) => (
                    <TodoRow key={todo.id} todo={todo} onToggle={handleToggleTodo} onPress={openEditor} onLongPress={() => setActionTodoId(todo.id)}
                    onPickDue={(item) => setDueTodoId(item.id)} compact />
                  ))}
                </Animated.View>
              </AccordionSection>
            ) : null}
            {todayTodoIds.length === 0 ? <Text style={styles.emptyText}>今天暂无待办</Text> : null}
          </AccordionSection>

          <AccordionSection
            title="习惯"
            meta={getHabitSummary(habits)}
            collapsed={collapsed.has('habits')}
            onToggle={() => toggleBucket('habits')}
            accessibilityLabel="折叠今天的习惯"
          >
            {orderedHabits.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>还没有习惯</Text>
              </View>
            ) : (
              <Animated.View layout={LIST_LAYOUT} style={styles.list}>
                {orderedHabits.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    compact
                    onOpenDetails={setDetailHabitId}
                    onLongPress={() => setActionHabitId(habit.id)}
                    onAddCheckin={(habitId) => {
                      const recordId = addCheckinNow(habitId);
                      setUndoState({ kind: 'checkin', habitId, recordId });
                    }}
                  />
                ))}
              </Animated.View>
            )}
          </AccordionSection>
        </ScrollView>
        )}

        <TodoEditorModal
          visible={editorVisible}
          todo={editingTodo}
          onClose={() => {
            setEditorVisible(false);
            setEditingTodo(null);
          }}
        />
        <AddHabitModal
          habit={editingHabitId ? habits.find((habit) => habit.id === editingHabitId) ?? null : null}
          visible={editingHabitId !== null}
          onClose={() => setEditingHabitId(null)}
        />
        <CheckinDetailModal
          habitId={detailHabitId}
          dateKey={detailHabitId ? getCheckinTodayKey() : null}
          visible={detailHabitId !== null}
          onClose={() => setDetailHabitId(null)}
        />
        <UndoToast
          message={undoState?.kind === 'todo' ? '待办已完成' : undoState?.kind === 'checkin' ? '已记录一次打卡' : null}
          onDismiss={dismissUndo}
          onUndo={() => {
            if (undoState?.kind === 'todo') {
              setTodoCompleted(undoState.todoId, false);
            } else if (undoState?.kind === 'checkin') {
              deleteCheckin(undoState.habitId, undoState.recordId);
            }
            setUndoState(null);
          }}
        />
        <ItemActionSheet
          visible={dueTodo !== null}
          title={dueTodo?.title ?? ''}
          subtitle="不改内容，只改截止时间"
          actions={[
            { label: '今天', onPress: () => { if (dueTodo) { moveTodosToBucket([dueTodo.id], bucketToDueDateKey('today')); } } },
            { label: '明天', onPress: () => { if (dueTodo) { moveTodosToBucket([dueTodo.id], bucketToDueDateKey('tomorrow')); } } },
            { label: '未来 7 天', onPress: () => { if (dueTodo) { moveTodosToBucket([dueTodo.id], bucketToDueDateKey('soon')); } } },
            { label: '稍后', onPress: () => { if (dueTodo) { moveTodosToBucket([dueTodo.id], bucketToDueDateKey('later')); } } },
            { label: '无日期', onPress: () => { if (dueTodo) { moveTodosToBucket([dueTodo.id], bucketToDueDateKey('no-date')); } } },
            { label: '自定义时间…', onPress: () => { if (dueTodo) { openEditor(dueTodo); } } },
          ]}
          onClose={() => setDueTodoId(null)}
        />
        <ItemActionSheet
          visible={actionTodo !== null}
          title={actionTodo?.title ?? ''}
          subtitle="长按后可以改信息、进整理或删掉它"
          actions={[
            { label: '编辑信息', onPress: () => { if (actionTodo) { openEditor(actionTodo); } } },
            { label: '多选整理', onPress: () => { if (actionTodo) { enterTodoSelect(actionTodo.id); } } },
            { label: '删除待办', danger: true, onPress: () => { if (actionTodo) { deleteTodo(actionTodo.id); } } },
          ]}
          onClose={() => setActionTodoId(null)}
        />
        <ItemActionSheet
          visible={actionHabit !== null}
          title={actionHabit?.name ?? ''}
          subtitle="长按后可以改信息、看历史或进整理"
          actions={[
            { label: '编辑习惯', onPress: () => { if (actionHabit) { setEditingHabitId(actionHabit.id); } } },
            { label: '查看历史', onPress: () => { if (actionHabit) { setDetailHabitId(actionHabit.id); } } },
            { label: '多选整理', onPress: () => { if (actionHabit) { enterHabitSelect(actionHabit.id); } } },
            {
              label: '归档习惯',
              onPress: () => {
                const habit = actionHabit;
                if (!habit) {
                  return;
                }
                Alert.alert(
                  '归档习惯',
                  `归档“${habit.name}”后，它会从打卡页移除，并在设置页的归档习惯中只读查看。`,
                  [
                    { text: '取消', style: 'cancel' },
                    { text: '确认归档', onPress: () => archiveHabit(habit.id) },
                  ]
                );
              },
            },
            {
              label: '删除习惯',
              danger: true,
              onPress: () => {
                const habit = actionHabit;
                if (!habit) {
                  return;
                }
                Alert.alert('确认删除习惯', `删除“${habit.name}”后，相关全部打卡历史会一并清除，且无法恢复。`, [
                  { text: '取消', style: 'cancel' },
                  { text: '确认删除', style: 'destructive', onPress: () => deleteHabits([habit.id]) },
                ]);
              },
            },
          ]}
          onClose={() => setActionHabitId(null)}
        />
      </ScreenScaffold>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: FAB_CLEARANCE, gap: 22 },
    list: { gap: 8 },
    emptyText: { fontSize: 13, color: theme.colors.textSecondary },
    emptyCard: {
      borderRadius: theme.radius.medium,
      padding: 16,
      gap: 5,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary },
  });
}
