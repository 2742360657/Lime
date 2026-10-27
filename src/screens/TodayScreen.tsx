import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SectionHeading } from '../components/SectionHeading';
import { Alert } from '../components/ThemedAlert';
import { VirtualList, type VirtualRow } from '../components/VirtualList';
import { useTodoOrganize } from '../hooks/useTodoOrganize';
import { useAppActions, useHabitData, useSettings, useTheme, useTodos } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import { useDateTick } from '../utils/useDateTick';


import { AddHabitModal } from '../components/AddHabitModal';
import { CheckinDetailModal } from '../components/CheckinDetailModal';
import { HabitCard } from '../components/HabitCard';
import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SelectCircle } from '../components/SelectCircle';
import { TodoEditorModal } from '../components/TodoEditorModal';
import { TodoRow } from '../components/TodoRow';
import { UndoToast } from '../components/UndoToast';
import { TodoItem } from '../types/app';
import { getCheckinTodayKey } from '../utils/date';
import { getHabitProgress, getHabitSummary } from '../utils/habit';
import {
  bucketToDueDateKey,
  buildTodoBuckets,
  getTodoDateOptions,
  todoGroupKey
} from '../utils/todo';

type UndoState =
  | { kind: 'todo'; todoId: string }
  | { kind: 'checkin'; habitId: string; recordId: string }
  | null;

export function TodayScreen() {
  const commitTodoOrder = useTodoOrganize();
  const { todos } = useTodos();
  const { habits, groups } = useHabitData();
  const theme = useTheme();
  const { setTodoCompleted, addCheckinNow, deleteCheckin, setTodoBucketCollapsed, deleteTodo, moveTodosToBucket, moveHabitsToGroup, deleteHabits, archiveHabit, organizeHabits, deleteTodos } = useAppActions();
  const { settings } = useSettings();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [organizerVisible, setOrganizerVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [todoSelectMode, setTodoSelectMode] = useState(false);
  const [habitSelectMode, setHabitSelectMode] = useState(false);
  const [selectedTodoIds, setSelectedTodoIds] = useState<string[]>([]);
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);

  const dateTick = useDateTick();
  const allBuckets = useMemo(() => buildTodoBuckets(todos), [todos, dateTick]);
  const activeBuckets = allBuckets.filter((bucket) => bucket.id === 'overdue' || bucket.id === 'today');
  const laterBuckets = allBuckets.filter((bucket) => bucket.id !== 'overdue' && bucket.id !== 'today');
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

  const enterTodoSelect = (id?: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedTodoIds(id ? [id] : []);
    setTodoSelectMode(true);
  };

  const enterHabitSelect = (id?: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedHabitIds(id ? [id] : []);
    setHabitSelectMode(true);
  };



  const dismissUndo = useCallback(() => setUndoState(null), []);

  const groupOptions = useMemo(
    () => [{ id: null, label: '未分组' }, ...groups.map((group) => ({ id: group.id, label: group.name }))],
    [groups]
  );

  // 今天页的多选只用于批量整理当天可见的条目。
  const todayTodoIds = useMemo(() => allBuckets.flatMap((bucket) => bucket.todos.map((todo) => todo.id)), [allBuckets]);
  const boardGroups = useMemo(() => allBuckets.map((bucket) => ({ id: bucket.id, title: bucket.title, acceptsDrop: true })), [allBuckets]);
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


  const listRows: VirtualRow[] = [{ key: 'overview', render: () => <View style={styles.overview}><Text style={styles.overviewBody}>{todayTodoIds.length} 项未完成待办 · {habits.length} 个可记录的习惯</Text><Text style={styles.overviewHint}>先处理临近截止的事，其他任务也能提前做。</Text></View> }];
  const heading = (id: string, title: string, meta: string) => listRows.push({ key: `header:${id}`, render: () => <SectionHeading title={title} meta={meta} collapsed={collapsed.has(id)} danger={id === 'overdue'} onToggle={() => toggleBucket(id)} /> });
  const appendBuckets = (buckets: typeof allBuckets) => {
    for (const bucket of buckets) {
      heading(bucket.id, bucket.title, `${bucket.todos.length} 项`);
      if (!collapsed.has(bucket.id)) for (const todo of bucket.todos) listRows.push({ key: `todo:${todo.id}`, render: () => <TodoRow todo={todo} onToggle={handleToggleTodo} onPress={openEditor} onLongPress={() => setActionTodoId(todo.id)} onPickDue={item => setDueTodoId(item.id)} compact /> });
    }
  };
  heading('home-todos', '优先处理', `${activeBuckets.reduce((n, bucket) => n + bucket.todos.length, 0)} 项`);
  if (!collapsed.has('home-todos')) {
    appendBuckets(activeBuckets);
    if (!activeBuckets.length) listRows.push({ key: 'no-urgent', render: () => <Text style={styles.emptyText}>没有逾期或今天截止的事项，可以记录习惯，或推进下面的其他待办。</Text> });
  }
  heading('habits', '可记录的习惯', getHabitSummary(habits));
  if (!collapsed.has('habits')) {
    if (!orderedHabits.length) listRows.push({ key: 'no-habits', render: () => <Text style={styles.emptyText}>还没有习惯</Text> });
    for (const habit of orderedHabits) listRows.push({ key: `habit:${habit.id}`, render: () => <HabitCard habit={habit} compact onOpenActions={item => setActionHabitId(item.id)} onOpenDetails={setDetailHabitId} onLongPress={() => setActionHabitId(habit.id)} onAddCheckin={habitId => { const recordId = addCheckinNow(habitId); setUndoState({ kind: 'checkin', habitId, recordId }); }} /> });
  }
  if (laterBuckets.length) {
    heading('home-upcoming', '其他可推进的待办', `${laterBuckets.reduce((n, bucket) => n + bucket.todos.length, 0)} 项`);
    if (!collapsed.has('home-upcoming')) appendBuckets(laterBuckets);
  }

  return (
    <View style={styles.screen}>
      <ScreenScaffold
      organizing={todoSelectMode || habitSelectMode}
      panelTitle="今日"
      onOrganize={!todoSelectMode && !habitSelectMode && (todayTodoIds.length > 0 || habits.length > 0) ? () => setOrganizerVisible(true) : undefined}
      panelItems={[]}
      createAction={todoSelectMode || habitSelectMode ? null : { label: '新建待办', onPress: () => openEditor(null) }}
    >
        {todoSelectMode ? (
          <OrganizePanel
        initialScrollY={organizeScrollY}
        title="整理待办"
        sortHint="按截止日期、时间优先排列；相同时间内可手动排序。跨日期分组会先确认改期。"
        onClose={() => { setTodoSelectMode(false); setSelectedTodoIds([]); }}
        items={boardItems}
        groups={boardGroups}
        selectedIds={selectedTodoIds}
        onSetSelection={setSelectedTodoIds}
        onCommit={commitTodoOrder}
        onDelete={(ids) => {
          deleteTodos(ids);
          setSelectedTodoIds([]);
          setTodoSelectMode(false);
        }}
        groupOptions={getTodoDateOptions().map(({ id, label }) => ({ id: id === 'no-date' ? null : id, label }))}
        onMoveToGroup={(ids, groupId) => moveTodosToBucket(ids, bucketToDueDateKey(groupId ?? 'no-date'))}
        moveTitle="更改截止日期"
        deleteLabel="删除"
                />
        ) : habitSelectMode ? (
          <OrganizePanel
        initialScrollY={organizeScrollY}
        title="整理习惯"
        onClose={() => { setHabitSelectMode(false); setSelectedHabitIds([]); }}
        items={habitBoardItems}
        groups={habitGroups}
        selectedIds={selectedHabitIds}
        onSetSelection={setSelectedHabitIds}
        onCommit={ordered => organizeHabits(ordered.map(entry => ({ id: entry.id, groupId: entry.groupId === 'ungrouped' ? null : entry.groupId })))}
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
<VirtualList rows={listRows} contentStyle={styles.content} onScrollY={y => { scrollYRef.current = y; }} />
        )}

        <ItemActionSheet visible={organizerVisible} title="整理事项" subtitle="分别整理待办和习惯，完成后回到当前页面。" onClose={() => setOrganizerVisible(false)} actions={[
          { label: '整理待办', onPress: () => enterTodoSelect() },
          { label: '整理习惯', onPress: () => enterHabitSelect() },
        ]} />
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
          subtitle="更改截止日期；原有具体时间保持不变。"
          actions={[
            ...getTodoDateOptions().map((option) => ({ label: option.label, onPress: () => { if (dueTodo) moveTodosToBucket([dueTodo.id], option.dueDateKey); } })),
            { label: '自定义日期和时间…', onPress: () => { if (dueTodo) openEditor(dueTodo); } },
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
            { label: '删除待办', danger: true, onPress: () => { if (actionTodo) Alert.alert('删除待办？', `将删除“${actionTodo.title}”，此操作无法撤销。`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteTodo(actionTodo.id) }]); } },
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    overview: { paddingVertical: 10, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
    overviewTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.textPrimary },
    overviewBody: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
    overviewHint: { fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 8 },
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
