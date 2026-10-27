import { createId } from '../../utils/id';
import { nextOrderValue } from '../organize';
import type { TodoInput } from '../storeTypes';
import type { ActionContext } from './types';

export function createTodoActions({ dispatch, getData }: ActionContext) {
  const organizeTodos = (ids: string[], moves: Array<{ id: string; dueDateKey: string | null }> = []) => dispatch({ type: 'organize-todos', ids, moves });
  const deleteTodos = (ids: string[]) => dispatch({ type: 'delete-todos', ids });
  const setTodoBucketCollapsed = (bucketId: string, collapsed: boolean) => {
    dispatch({ type: 'set-todo-bucket-collapsed', bucketId, collapsed });
  };

  const moveTodosToBucket = (todoIds: string[], dueDateKey: string | null) => {
    if (todoIds.length > 0) dispatch({ type: 'move-todos-to-bucket', todoIds, dueDateKey });
  };

  const addTodo = (input: TodoInput) => {
      const title = input.title.trim();
      if (!title) {
        dispatch({ type: 'set-error', error: '待办标题不能为空。' });
        return false;
      }

      dispatch({
        type: 'add-todo',
        todo: {
          id: createId(),
          title,
          note: input.note.trim(),
          dueDateKey: input.dueDateKey,
          dueTime: input.dueTime,
          order: nextOrderValue(getData().todos),
          createdAt: Date.now(),
          completedAt: null,
        },
      });
      return true;
    };

  const updateTodo = (todoId: string, input: TodoInput) => {
    const title = input.title.trim();
    if (!title) {
      dispatch({ type: 'set-error', error: '待办标题不能为空。' });
      return false;
    }

    dispatch({
      type: 'update-todo',
      todoId,
      title,
      note: input.note.trim(),
      dueDateKey: input.dueDateKey,
      dueTime: input.dueTime,
    });
    return true;
  };

  const setTodoCompleted = (todoId: string, completed: boolean) => {
    dispatch({ type: 'set-todo-completed', todoId, completedAt: completed ? Date.now() : null });
  };

  const deleteTodo = (todoId: string) => {
    dispatch({ type: 'delete-todo', todoId });
  };



  return { organizeTodos, deleteTodos, setTodoBucketCollapsed, moveTodosToBucket, addTodo, updateTodo, setTodoCompleted, deleteTodo };
}
