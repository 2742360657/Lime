import { reorderSubset } from '../organize';
import type { AppAction, AppState } from '../storeTypes';

export function todoReducer(state: AppState, action: AppAction): AppState | null {
  switch(action.type) {
    case 'organize-todos': {
      const moves = new Map(action.moves.map(move => [move.id, move.dueDateKey]));
      const todos = reorderSubset(state.appData.todos, action.ids).map(todo =>
        moves.has(todo.id) && todo.completedAt === null ? { ...todo, dueDateKey: moves.get(todo.id)! } : todo);
      return { ...state, appData: { ...state.appData, todos } };
    }
    case 'delete-todos': {
      const ids = new Set(action.ids);
      return { ...state, appData: { ...state.appData, todos: state.appData.todos.filter(todo => !ids.has(todo.id)) } };
    }
    case 'set-todo-bucket-collapsed': {
      const current = state.appData.settings.collapsedTodoBuckets;
      const next = action.collapsed
        ? [...new Set([...current, action.bucketId])]
        : current.filter(id => id !== action.bucketId);
      return { ...state, appData: { ...state.appData, settings: { ...state.appData.settings, collapsedTodoBuckets: next } } };
    }
    case 'move-todos-to-bucket': {
      const target = new Set(action.todoIds);
      return {
        ...state,
        appData: {
          ...state.appData,
          todos: state.appData.todos.map(todo =>
            target.has(todo.id) ? { ...todo, dueDateKey: action.dueDateKey } : todo
          ),
        },
      };
    }
    case 'add-todo':
      return {
        ...state,
        appData: {
          ...state.appData,
          todos: [...state.appData.todos, action.todo],
        },
      };
    case 'update-todo':
      return {
        ...state,
        appData: {
          ...state.appData,
          todos: state.appData.todos.map((todo) =>
            todo.id === action.todoId
              ? {
                  ...todo,
                  title: action.title,
                  note: action.note,
                  dueDateKey: action.dueDateKey,
                  dueTime: action.dueTime,
                }
              : todo
          ),
        },
      };
    case 'set-todo-completed':
      return {
        ...state,
        appData: {
          ...state.appData,
          todos: state.appData.todos.map((todo) =>
            todo.id === action.todoId ? { ...todo, completedAt: action.completedAt } : todo
          ),
        },
      };
    case 'delete-todo':
      return {
        ...state,
        appData: {
          ...state.appData,
          todos: state.appData.todos.filter((todo) => todo.id !== action.todoId),
        },
      };

    default: return null;
  }
}
