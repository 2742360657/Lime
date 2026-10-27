import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FilterBar } from '../components/FilterBar';
import { SectionHeading } from '../components/SectionHeading';
import { Alert } from '../components/ThemedAlert';
import { VirtualList, type VirtualRow } from '../components/VirtualList';
import { useTodoOrganize } from '../hooks/useTodoOrganize';
import { useAppActions, useSettings, useTheme, useTodos } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import { useDateTick } from '../utils/useDateTick';


import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SelectCircle } from '../components/SelectCircle';
import { TodoEditorModal } from '../components/TodoEditorModal';
import { TodoRow } from '../components/TodoRow';
import { UndoToast } from '../components/UndoToast';
import { TodoItem } from '../types/app';
import {
  bucketToDueDateKey,
  buildTodoBuckets,
  formatTodoDue,
  getTodoDateOptions,
  TODO_BUCKET_TITLES,
  TODO_COMPLETED_BUCKET_ID,
  todoGroupKey
} from '../utils/todo';

export function TasksScreen() {
  const commitTodoOrder = useTodoOrganize();
  const { todos } = useTodos();
  const theme = useTheme();
  const { setTodoCompleted, setTodoBucketCollapsed, deleteTodo, moveTodosToBucket, deleteTodos } = useAppActions();
  const { settings } = useSettings();
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


  const listRows: VirtualRow[] = [{ key: 'sort-hint', render: () => <Text style={styles.sortExplanation}>按截止日期、时间排列 · 相同时间可手动排序</Text> }];
  const appendTodos = (id: string, title: string, entries: TodoItem[]) => {
    listRows.push({ key: `header:${id}`, render: () => <SectionHeading title={title} meta={`${entries.length} 项`} danger={id === 'overdue'} collapsed={collapsed.has(id)} onToggle={() => toggleBucket(id)} /> });
    if (!collapsed.has(id)) for (const todo of entries) listRows.push({ key: `todo:${todo.id}`, render: () => <TodoRow todo={todo} onToggle={handleToggle} onPress={openEditor} onLongPress={() => setActionTodoId(todo.id)} onPickDue={todo.completedAt === null ? item => setDueTodoId(item.id) : undefined} /> });
  };
  for (const bucket of visibleBuckets) appendTodos(bucket.id, bucket.title, bucket.todos);
  if (showCompleted && completedTodos.length) appendTodos(TODO_COMPLETED_BUCKET_ID, '已完成', completedTodos);
  if (listRows.length === 1) listRows.push({ key: 'empty', render: () => <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{filter === 'completed' ? '还没有已完成待办' : filter === 'all' ? '没有未完成待办，轻松一下' : '这个日期分组没有待办'}</Text></View> });

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
            initialScrollY={organizeScrollY}
            onClose={() => { setSelectMode(false); setSelectedIds([]); }}
            items={boardItems}
            groups={boardGroups}
            selectedIds={selectedIds}
            onSetSelection={setSelectedIds}
            onCommit={commitTodoOrder}
            onDelete={(ids) => {
              deleteTodos(ids);
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
<VirtualList rows={listRows} contentStyle={styles.content} onScrollY={y => { scrollYRef.current = y; }} />
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    sortExplanation: { fontSize: 12, lineHeight: 19, color: theme.colors.textSecondary },
    content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 8 },
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
