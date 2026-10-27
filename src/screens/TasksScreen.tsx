import { Alert } from '../components/ThemedAlert';
import { useDateTick } from '../utils/useDateTick';
import { FilterBar } from '../components/FilterBar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';

import { AccordionSection } from '../components/AccordionSection';
import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { SelectCircle } from '../components/SelectCircle';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TodoEditorModal } from '../components/TodoEditorModal';
import { TodoRow } from '../components/TodoRow';
import { UndoToast } from '../components/UndoToast';
import { useHabits } from '../state/HabitStore';
import { TodoItem } from '../types/habit';
import {
  hasTodoDateOrderConflict,
  getTodoDateOptions,
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

  const dateTick = useDateTick();
  const buckets = useMemo(() => buildTodoBuckets(todos), [todos, dateTick]);
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
  const [actionTodoId, setActionTodoId] = useState<string | null>(null);
  const actionTodo = todos.find((todo) => todo.id === actionTodoId) ?? null;
  const [dueTodoId, setDueTodoId] = useState<string | null>(null);
  const dueTodo = todos.find((todo) => todo.id === dueTodoId) ?? null;

  const scrollYRef = useRef(0);
  const [organizeScrollY, setOrganizeScrollY] = useState(0);

  const enterSelectMode = (id?: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedIds(id ? [id] : []);
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
      ...buckets.filter((bucket) => filter === 'all' || filter === bucket.id).map((bucket) => ({ id: bucket.id, title: bucket.title, acceptsDrop: true })),
      ...((filter === 'all' || filter === 'completed') && completedTodos.length > 0
        ? [{ id: TODO_COMPLETED_BUCKET_ID, title: '已完成', acceptsDrop: false }]
        : []),
    ],
    [buckets, completedTodos.length, filter]
  );

  const boardItems = useMemo(
    () =>
      [...buckets.filter((bucket) => filter === 'all' || filter === bucket.id).flatMap((bucket) => bucket.todos), ...((filter === 'all' || filter === 'completed') ? completedTodos : [])].map((todo) => ({
        id: todo.id,
        groupId: todoGroupKey(todo, buckets),
        label: todo.title,
        sortable: todo.completedAt === null,
        subtitle: formatTodoDue(todo),
        leading: <SelectCircle checked={selectedIds.includes(todo.id)} accessibilityLabel={`选择 ${todo.title}`} />,
      })),
    [buckets, completedTodos, selectedIds, filter]
  );

  return (
    <View style={styles.screen}>
      <ScreenScaffold
      organizing={selectMode}
      panelTitle="待办日期"
      onOrganize={!selectMode && boardItems.length > 0 ? () => enterSelectMode() : undefined}
      panelItems={sidebarItems}
      createAction={selectMode ? null : { label: '新建待办', onPress: () => openEditor(null) }}
    >
        {selectMode ? (
          <OrganizePanel
            title="整理待办"
            allowSort={filter !== TODO_COMPLETED_BUCKET_ID}
            sortHint="按截止日期、时间优先排列；相同时间内可手动排序。跨日期分组会先确认改期。"
            hint="点按待办选中 · 按住右侧把手拖动排序，拖到别的分组会先确认是否改截止时间"
            initialScrollY={organizeScrollY}
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
                if (hasTodoDateOrderConflict(ordered, todos)) Alert.alert('按截止时间排序', '不同截止日期或时间的待办会保持时间先后。相同截止时间内可自由排序；需要调整日期可点条目的日期。');
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
            groupOptions={getTodoDateOptions().map(({ id, label }) => ({ id: id === 'no-date' ? null : id, label }))}
            onMoveToGroup={(ids, groupId) =>
              moveTodosToBucket(ids, bucketToDueDateKey(groupId ?? 'no-date'))
            }
            moveTitle="更改截止日期"
          />
        ) : (
        <>
        <FilterBar options={[{ id: 'all', label: '全部', count: openTodos.length }, ...Object.entries(TODO_BUCKET_TITLES).map(([id, label]) => ({ id, label, count: buckets.find((bucket) => bucket.id === id)?.todos.length ?? 0 })), { id: 'completed', label: '已完成', count: completedTodos.length }]} value={filter} onChange={(id) => { setFilter(id); if (id === 'completed') setTodoBucketCollapsed('completed', false); }} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onScroll={(event) => { scrollYRef.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
          <Text style={styles.sortExplanation}>按截止日期、时间排列 · 相同时间可手动排序</Text>
          {visibleBuckets.length === 0 && (filter !== 'completed' || completedTodos.length === 0) ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{filter === 'completed' ? '还没有已完成待办' : filter === 'all' ? '没有未完成待办，轻松一下' : '这个日期分组没有待办'}</Text>
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
                      onLongPress={() => setActionTodoId(todo.id)}
                      onPickDue={(item) => setDueTodoId(item.id)}
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
                    onLongPress={() => setActionTodoId(todo.id)}
                  />
                ))}
              </Animated.View>
            </AccordionSection>
          ) : null}
        </ScrollView>
        </>
        )}

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
            { label: '多选整理', onPress: () => { if (actionTodo) { enterSelectMode(actionTodo.id); } } },
            { label: '删除待办', danger: true, onPress: () => { if (actionTodo) Alert.alert('删除待办？', `将删除“${actionTodo.title}”，此操作无法撤销。`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteTodo(actionTodo.id) }]); } },
          ]}
          onClose={() => setActionTodoId(null)}
        />
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
    sortExplanation: { fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 14 },
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
