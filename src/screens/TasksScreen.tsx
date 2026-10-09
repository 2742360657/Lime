import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';

import { AccordionSection } from '../components/AccordionSection';
import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TodoEditorModal } from '../components/TodoEditorModal';
import { TodoRow } from '../components/TodoRow';
import { UndoToast } from '../components/UndoToast';
import { useHabits } from '../state/HabitStore';
import { TodoItem } from '../types/habit';
import {
  bucketToDueDateKey,
  buildTodoBuckets,
  formatTodoDue,
  TODO_BUCKET_TITLES,
  TODO_COMPLETED_BUCKET_ID,
  todoGroupKey,
} from '../utils/todo';

export function TasksScreen() {
  const {
    todos,
    theme,
    setTodoCompleted,
    settings,
    setTodoBucketCollapsed,
    deleteTodo,
    moveTodosToBucket,
    reorderTodos,
  } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState('all');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [undoTodoId, setUndoTodoId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const route = useRoute();
  const reminderParams = route.params as { reminderTaskId?: string; reminderNonce?: string } | undefined;
  const consumedReminder = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!reminderParams?.reminderNonce || consumedReminder.current === reminderParams.reminderNonce) return;
    consumedReminder.current = reminderParams.reminderNonce;
    const todo = todos.find(item => item.id === reminderParams.reminderTaskId);
    if (todo) { setEditingTodo(todo); setEditorVisible(true); }
  }, [reminderParams?.reminderNonce, reminderParams?.reminderTaskId, todos]);

  const buckets = useMemo(() => buildTodoBuckets(todos), [todos]);
  const completedTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.completedAt !== null)
        .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0)),
    [todos]
  );
  const openTodos = useMemo(() => todos.filter((todo) => todo.completedAt === null), [todos]);
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
  const handleToggle = async (todo: TodoItem) => {
    const completing = todo.completedAt === null;
    const success = await setTodoCompleted(todo.id, completing, todo.revision);
    if (success && completing) {
      setUndoTodoId(todo.id);
    }
  };
  const dismissUndo = useCallback(() => setUndoTodoId(null), []);

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const visibleBuckets = buckets.filter(
    (bucket) => filter === 'all' || filter === bucket.id
  );
  const showCompleted = filter === 'all' || filter === TODO_COMPLETED_BUCKET_ID;

  const sidebarItems = useMemo(
    () => [
      { id: 'all', label: `全部待办 · ${openTodos.length}`, selected: filter === 'all', onPress: () => setFilter('all') },
      ...buckets.map((bucket) => ({
        id: bucket.id,
        label: `${TODO_BUCKET_TITLES[bucket.id]} · ${bucket.todos.length}`,
        selected: filter === bucket.id,
        onPress: () => setFilter(bucket.id),
      })),
      {
        id: TODO_COMPLETED_BUCKET_ID,
        label: `已完成 · ${completedTodos.length}`,
        selected: filter === TODO_COMPLETED_BUCKET_ID,
        onPress: () => {
          setFilter(TODO_COMPLETED_BUCKET_ID);
          setTodoBucketCollapsed(TODO_COMPLETED_BUCKET_ID, false);
        },
      },
    ],
    [buckets, completedTodos.length, filter, openTodos.length, setTodoBucketCollapsed]
  );

  const boardGroups = useMemo(
    () => [
      ...buckets.map((bucket) => ({ id: bucket.id, title: bucket.title, acceptsDrop: true })),
      ...(completedTodos.length > 0
        ? [{ id: TODO_COMPLETED_BUCKET_ID, title: '已完成', acceptsDrop: false }]
        : []),
    ],
    [buckets, completedTodos.length]
  );

  const boardItems = useMemo(
    () =>
      [...buckets.flatMap((bucket) => bucket.todos), ...completedTodos].map((todo) => ({
        id: todo.id,
        groupId: todoGroupKey(todo, buckets),
        label: todo.title,
        subtitle: formatTodoDue(todo),
        leading: (
          <SelectCircle
            checked={selectedIds.includes(todo.id)}
            accessibilityLabel={`选择 ${todo.title}`}
            onPress={() => setSelectedIds((current) => toggleId(current, todo.id))}
          />
        ),
      })),
    [buckets, completedTodos, selectedIds]
  );

  if (selectMode) {
    return (
      <MultiSelectBoard
        title="整理待办"
        onClose={() => { setSelectMode(false); setSelectedIds([]); }}
        items={boardItems}
        groups={boardGroups}
        selectedIds={selectedIds}
        onSetSelection={setSelectedIds}
        onCommit={(ordered) => {
          ordered.forEach((entry) => {
            const todo = todos.find((item) => item.id === entry.id);
            if (todo && todoGroupKey(todo, buckets) !== entry.groupId && entry.groupId !== 'completed') {
              moveTodosToBucket([entry.id], bucketToDueDateKey(entry.groupId));
            }
          });
          reorderTodos(ordered.map((entry) => entry.id));
        }}
        onDelete={(ids) => {
          ids.forEach((id) => deleteTodo(id));
          setSelectedIds([]);
          setSelectMode(false);
        }}
        groupOptions={[
          { id: 'today', label: '今天' },
          { id: 'tomorrow', label: '明天' },
          { id: 'soon', label: '未来 7 天' },
          { id: 'later', label: '稍后' },
          { id: null, label: '无日期' },
        ]}
        onMoveToGroup={(ids, groupId) =>
          moveTodosToBucket(ids, bucketToDueDateKey(groupId ?? 'no-date'))
        }
        moveTitle="移动到日期分组"
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenScaffold
      panelTitle="待办"
      panelItems={sidebarItems}
      fab={selectMode ? null : { label: '新建待办', onPress: () => openEditor(null) }}
    >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={{fontSize:16,fontWeight:'700',color:theme.colors.textPrimary}}>本机待办</Text>
          {openTodos.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>暂时没有未完成待办</Text>
            </View>
          ) : (
            visibleBuckets.map((bucket) => (
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
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={handleToggle}
                      onPress={openEditor}
                      onLongPress={() => setSelectMode(true)}
                    />
                  ))}
                </Animated.View>
              </AccordionSection>
            ))
          )}

          {completedTodos.length > 0 && showCompleted ? (
            <AccordionSection
              title="已完成"
              meta={`${completedTodos.length} 项`}
              collapsed={collapsed.has(TODO_COMPLETED_BUCKET_ID)}
              onToggle={() => toggleBucket(TODO_COMPLETED_BUCKET_ID)}
            >
              <Animated.View layout={LIST_LAYOUT} style={styles.list}>
                {completedTodos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={handleToggle}
                    onPress={openEditor}
                    onLongPress={() => setSelectMode(true)}
                  />
                ))}
              </Animated.View>
            </AccordionSection>
          ) : null}
        </ScrollView>

        <TodoEditorModal
          visible={editorVisible}
          todo={editingTodo}
          onClose={() => {
            setEditorVisible(false);
            setEditingTodo(null);
          }}
        />
        <UndoToast
          message={undoTodoId ? '待办已完成' : null}
          onDismiss={dismissUndo}
          onUndo={() => {
            if (undoTodoId) {
              setTodoCompleted(undoTodoId, false);
            }
            setUndoTodoId(null);
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
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
  });
}
