import { Alert } from '../components/ThemedAlert';
import { useAppActions, useTodos } from '../state/AppProvider';
import { bucketToDueDateKey, buildTodoBuckets, hasTodoDateOrderConflict, TODO_BUCKET_TITLES, TODO_COMPLETED_BUCKET_ID, todoGroupKey, type TodoBucketId } from '../utils/todo';

/** One confirmation and one business command, shared by Today and Tasks. */
export function useTodoOrganize() {
  const { todos } = useTodos();
  const { organizeTodos } = useAppActions();
  return (ordered: Array<{ id: string; groupId: string }>) => {
    const ids = ordered.map(entry => entry.id);
    const reorderOnly = () => organizeTodos(ids);
    const buckets = buildTodoBuckets(todos);
    const byId = new Map(todos.map(todo => [todo.id, todo]));
    const moves = ordered.flatMap(entry => {
      const todo = byId.get(entry.id);
      if (!todo || todo.completedAt !== null || entry.groupId === TODO_COMPLETED_BUCKET_ID ||
        !(entry.groupId in TODO_BUCKET_TITLES) || todoGroupKey(todo, buckets) === entry.groupId) return [];
      return [{ id: todo.id, title: todo.title, groupId: entry.groupId as TodoBucketId }];
    });
    if (!moves.length) {
      if (hasTodoDateOrderConflict(ordered, todos)) Alert.alert('按截止时间排序', '不同截止日期或时间的待办会保持时间先后，相同截止时间内可自由排序。');
      reorderOnly();
      return;
    }
    const detail = moves.length === 1 ? `「${moves[0].title}」将移到「${TODO_BUCKET_TITLES[moves[0].groupId]}」。` : `${moves.length} 项待办将移动到新的日期分组。`;
    Alert.alert('要改截止时间吗？', `${detail}\n选择“只排序”会保留原截止日期。`, [
      { text: '只排序', style: 'cancel', onPress: reorderOnly },
      { text: '改时间', onPress: () => organizeTodos(ids, moves.map(move => ({ id: move.id, dueDateKey: bucketToDueDateKey(move.groupId) }))) },
    ], { cancelable: true, onDismiss: reorderOnly });
  };
}
