import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';

import { AccordionSection } from '../components/AccordionSection';
import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { FAB_CLEARANCE, handleFabScroll } from '../components/FloatingAddButton';
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
  const handleToggle = (todo: TodoItem) => {
    const completing = todo.completedAt === null;
    setTodoCompleted(todo.id, completing);
    if (completing) {
      setUndoTodoId(todo.id);
    }
  };
  const dismissUndo = useCallback(() => setUndoTodoId(null), []);

  /** 长按直接进入整理模式，并预选被长按的那一条。 */
  const enterSelectMode = (id: string) => {
    setSelectedIds([id]);
    setSelectMode(true);
  };

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
        leading: <SelectCircle checked={selectedIds.includes(todo.id)} accessibilityLabel={`选择 ${todo.title}`} />,
      })),
    [buckets, completedTodos, selectedIds]
  );

  if (selectMode) {
    return (
      <MultiSelectBoard
        title="整理待办"
        hint="点按待办选中 · 拖动排序；拖到别的分组会先确认是否改截止时间"
        onClose={() => { setSelectMode(false); setSelectedIds([]); }}
        items={boardItems}
        groups={boardGroups}
        selectedIds={selectedIds}
        onSetSelection={setSelectedIds}
        onCommit={(ordered) => {
          const reorderOnly = () => reorderTodos(ordered.map((entry) => entry.id));
          // 只有拖到别的分组才意味着改截止时间，组内拖动就是纯排序。
          const moves = ordered
            .map((entry) => {
              const todo = todos.find((item) => item.id === entry.id);
              if (!todo || entry.groupId === TODO_COMPLETED_BUCKET_ID) {
                return null;
              }
              if (todoGroupKey(todo, buckets) === entry.groupId) {
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
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onScroll={(event) => handleFabScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16}>
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
                      onLongPress={() => enterSelectMode(todo.id)}
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
                    onLongPress={() => enterSelectMode(todo.id)}
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
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: FAB_CLEARANCE, gap: 22 },
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
