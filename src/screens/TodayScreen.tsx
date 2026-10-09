import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';

import { AccordionSection } from '../components/AccordionSection';
import { CheckinDetailModal } from '../components/CheckinDetailModal';
import { HabitCard } from '../components/HabitCard';
import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TodoEditorModal } from '../components/TodoEditorModal';
import { TodoRow } from '../components/TodoRow';
import { UndoToast } from '../components/UndoToast';
import { useHabits } from '../state/HabitStore';
import { TodoItem } from '../types/habit';
import { getTodayKey } from '../utils/date';
import { getHabitProgress } from '../utils/habit';
import {
  bucketToDueDateKey,
  buildTodoBuckets,
  compareTodosSmart,
  todoGroupKey,
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
  } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
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
          leading: (
            <SelectCircle
              checked={selectedTodoIds.includes(id)}
              accessibilityLabel={`选择 ${todo?.title ?? ''}`}
              onPress={() => setSelectedTodoIds((current) => toggleId(current, id))}
            />
          ),
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
        leading: (
          <SelectCircle
            checked={selectedHabitIds.includes(habit.id)}
            accessibilityLabel={`选择 ${habit.name}`}
            onPress={() => setSelectedHabitIds((current) => toggleId(current, habit.id))}
          />
        ),
      })),
    [orderedHabits, selectedHabitIds]
  );

  if (todoSelectMode) {
    return (
      <MultiSelectBoard
        title="整理待办"
        onClose={() => { setTodoSelectMode(false); setSelectedTodoIds([]); }}
        items={boardItems}
        groups={boardGroups}
        selectedIds={selectedTodoIds}
        onSetSelection={setSelectedTodoIds}
        onCommit={(ordered) => {
          ordered.forEach((entry) => {
            const todo = todos.find((item) => item.id === entry.id);
            if (todo && todoGroupKey(todo, allBuckets) !== entry.groupId && entry.groupId !== 'completed') {
              moveTodosToBucket([entry.id], bucketToDueDateKey(entry.groupId));
            }
          });
          reorderTodos(ordered.map((entry) => entry.id));
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
    );
  }

  if (habitSelectMode) {
    return (
      <MultiSelectBoard
        title="整理习惯"
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
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenScaffold
      panelTitle="首页"
      panelItems={[]}
      fab={{ label: '新建待办', onPress: () => openEditor(null) }}
    >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                    <TodoRow key={todo.id} todo={todo} onToggle={handleToggleTodo} onPress={openEditor} onLongPress={() => setTodoSelectMode(true)} compact />
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
                    <TodoRow key={todo.id} todo={todo} onToggle={handleToggleTodo} onPress={openEditor} onLongPress={() => setTodoSelectMode(true)} compact />
                  ))}
                </Animated.View>
              </AccordionSection>
            ) : null}
            {todayTodoIds.length === 0 ? <Text style={styles.emptyText}>今天暂无待办</Text> : null}
          </AccordionSection>

          <AccordionSection
            title="习惯"
            meta={`${habits.filter((habit) => getHabitProgress(habit).completed).length}/${habits.length}`}
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
                    onLongPress={() => setHabitSelectMode(true)}
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

        <TodoEditorModal
          visible={editorVisible}
          todo={editingTodo}
          onClose={() => {
            setEditorVisible(false);
            setEditingTodo(null);
          }}
        />
        <CheckinDetailModal
          habitId={detailHabitId}
          dateKey={detailHabitId ? getTodayKey() : null}
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
      </ScreenScaffold>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 130, gap: 22 },
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
