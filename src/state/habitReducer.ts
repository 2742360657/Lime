import { clampToMinute, toCheckinDateKey } from '../utils/date';

import { createCheckinRecord, sortRecords, withUpdatedHabit } from './reducerHelpers';
import type { HabitAction, HabitState } from './storeTypes';

export function habitReducer(state: HabitState, action: HabitAction): HabitState {
  switch (action.type) {
    case 'update-preferences':
      return { ...state, appData: { ...state.appData, settings: { ...state.appData.settings, ...action.patch } } };
    case 'memo-add':
      return { ...state, appData: { ...state.appData, memos: [...state.appData.memos, action.memo] } };
    case 'memo-update':
      return { ...state, appData: { ...state.appData, memos: state.appData.memos.map(m => m.id === action.id ? { ...m, ...action.patch, updatedAt: Date.now() } : m) } };
    case 'memo-soft-delete': {
      const target = new Set(action.ids);
      const now = Date.now();
      return { ...state, appData: { ...state.appData, memos: state.appData.memos.map(m => target.has(m.id) ? { ...m, deletedAt: now } : m) } };
    }
    case 'memo-restore': {
      const target = new Set(action.ids);
      return { ...state, appData: { ...state.appData, memos: state.appData.memos.map(m => target.has(m.id) ? { ...m, deletedAt: null, updatedAt: Date.now() } : m) } };
    }
    case 'memo-purge': {
      const target = new Set(action.ids);
      return { ...state, appData: { ...state.appData, memos: state.appData.memos.filter(m => !target.has(m.id)) } };
    }
    case 'memo-purge-all':
      return { ...state, appData: { ...state.appData, memos: state.appData.memos.filter(m => m.deletedAt === null) } };
    case 'memo-move-group': {
      const target = new Set(action.ids);
      let nextOrder = state.appData.memos.filter(m => m.deletedAt === null && m.groupId === action.groupId).length;
      return {
        ...state,
        appData: {
          ...state.appData,
          memos: state.appData.memos.map(m => {
            if (!target.has(m.id) || m.groupId === action.groupId) {
              return m;
            }
            const moved = { ...m, groupId: action.groupId, order: nextOrder, updatedAt: Date.now() };
            nextOrder += 1;
            return moved;
          }),
        },
      };
    }
    case 'memo-reorder': {
      const orderMap = new Map(action.orderedIds.map((id, index) => [id, index]));
      return {
        ...state,
        appData: {
          ...state.appData,
          memos: state.appData.memos.map(m =>
            m.groupId === action.groupId && orderMap.has(m.id)
              ? { ...m, order: orderMap.get(m.id) as number }
              : m
          ),
        },
      };
    }
    case 'memo-group-add':
      return { ...state, appData: { ...state.appData, memoGroups: [...state.appData.memoGroups, action.group] } };
    case 'memo-group-rename':
      return {
        ...state,
        appData: {
          ...state.appData,
          memoGroups: state.appData.memoGroups.map(group =>
            group.id === action.groupId ? { ...group, name: action.name } : group
          ),
        },
      };
    case 'memo-group-delete': {
      const remaining = state.appData.memoGroups.filter(group => group.id !== action.groupId);
      let nextOrder = state.appData.memos.filter(m => m.groupId === null).length;
      return {
        ...state,
        appData: {
          ...state.appData,
          memoGroups: remaining,
          memos: state.appData.memos.map(m => {
            if (m.groupId !== action.groupId) {
              return m;
            }
            const moved = { ...m, groupId: null, order: nextOrder };
            nextOrder += 1;
            return moved;
          }),
        },
      };
    }
    case 'memo-group-reorder': {
      const orderMap = new Map(action.groupIds.map((id, index) => [id, index]));
      return {
        ...state,
        appData: {
          ...state.appData,
          memoGroups: state.appData.memoGroups.map(group =>
            orderMap.has(group.id) ? { ...group, order: orderMap.get(group.id) as number } : group
          ),
        },
      };
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
    case 'hydrate':
      return {
        ...state,
        appData: action.appData,
        isLoading: false,
        isHydrated: true,
      };
    case 'set-error':
      return { ...state, error: action.error };
    case 'clear-error':
      return { ...state, error: null };
    case 'replace-app-data':
      return { ...state, appData: action.appData };
    case 'set-theme-id':
      return {
        ...state,
        appData: {
          ...state.appData,
          settings: {
            ...state.appData.settings,
            themeId: action.themeId,
          },
        },
      };
    case 'update-profile':
      return {
        ...state,
        appData: {
          ...state.appData,
          settings: {
            ...state.appData.settings,
            profileName: action.name,
            profileSignature: action.signature,
            avatarUri: action.avatarUri,
          },
        },
      };
    case 'add-group':
      return {
        ...state,
        appData: {
          ...state.appData,
          groups: [...state.appData.groups, action.group],
        },
      };
    case 'rename-group':
      return {
        ...state,
        appData: {
          ...state.appData,
          groups: state.appData.groups.map((group) =>
            group.id === action.groupId ? { ...group, name: action.name } : group
          ),
        },
      };
    case 'delete-group': {
      let nextUngroupedOrder = state.appData.habits.filter((habit) => habit.groupId === null).length;
      return {
        ...state,
        appData: {
          ...state.appData,
          groups: state.appData.groups.filter((group) => group.id !== action.groupId),
          habits: state.appData.habits.map((habit) => {
            if (habit.groupId !== action.groupId) {
              return habit;
            }
            const movedHabit = { ...habit, groupId: null, order: nextUngroupedOrder };
            nextUngroupedOrder += 1;
            return movedHabit;
          }),
        },
      };
    }
    case 'reorder-groups': {
      const orderMap = new Map(action.groupIds.map((id, index) => [id, index]));
      return {
        ...state,
        appData: {
          ...state.appData,
          groups: state.appData.groups
            .map((group) => ({ ...group, order: orderMap.get(group.id) ?? group.order }))
            .sort((left, right) => left.order - right.order),
        },
      };
    }
    case 'add-habit':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: [...state.appData.habits, action.habit],
        },
      };
    case 'update-habit':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => ({
            ...habit,
            name: action.name,
            groupId: action.groupId,
            cadence: action.cadence,
            targetCount: action.targetCount,
            order: action.order,
          })),
        },
      };
    case 'reorder-habits': {
      const orderMap = new Map(action.habitIds.map((id, index) => [id, index]));
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: state.appData.habits.map((habit) =>
            habit.groupId === action.groupId && orderMap.has(habit.id)
              ? { ...habit, order: orderMap.get(habit.id) ?? habit.order }
              : habit
          ),
        },
      };
    }
    case 'move-habits-to-group': {
      const target = new Set(action.ids);
      let nextOrder = state.appData.habits.filter(
        (habit) => habit.groupId === action.groupId && habit.archivedAt === null
      ).length;
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: state.appData.habits.map((habit) => {
            if (!target.has(habit.id) || habit.groupId === action.groupId) {
              return habit;
            }
            const moved = { ...habit, groupId: action.groupId, order: nextOrder };
            nextOrder += 1;
            return moved;
          }),
        },
      };
    }
    case 'delete-habits': {
      const target = new Set(action.ids);
      return {
        ...state,
        appData: { ...state.appData, habits: state.appData.habits.filter((habit) => !target.has(habit.id)) },
      };
    }
    case 'archive-habit':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => ({
            ...habit,
            archivedAt: Date.now(),
          })),
        },
      };
    case 'restore-archived-habit':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => ({
            ...habit,
            archivedAt: null,
          })),
        },
      };
    case 'delete-habit':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: state.appData.habits.filter((habit) => habit.id !== action.habitId),
        },
      };
    case 'add-checkin-now':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => {
            return {
              ...habit,
              checkins: sortRecords([...habit.checkins, action.record]),
            };
          }),
        },
      };
    case 'add-checkin':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => ({
            ...habit,
            checkins: sortRecords([
              ...habit.checkins,
              createCheckinRecord(action.timestamp, action.note),
            ]),
          })),
        },
      };
    case 'update-checkin':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => ({
            ...habit,
            checkins: sortRecords(
              habit.checkins.map((record) => {
                if (record.id !== action.recordId) {
                  return record;
                }
                const timestamp = clampToMinute(action.timestamp);
                return {
                  ...record,
                  timestamp,
                  dateKey: toCheckinDateKey(timestamp),
                  note: action.note.trim(),
                };
              })
            ),
          })),
        },
      };
    case 'delete-checkin':
      return {
        ...state,
        appData: {
          ...state.appData,
          habits: withUpdatedHabit(state.appData.habits, action.habitId, (habit) => ({
            ...habit,
            checkins: habit.checkins.filter((record) => record.id !== action.recordId),
          })),
        },
      };
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
    case 'reorder-todos': {
      const selectedIds = new Set(action.todoIds);
      const availableOrders = state.appData.todos
        .filter((todo) => selectedIds.has(todo.id))
        .map((todo) => todo.order)
        .sort((left, right) => left - right);
      const orderMap = new Map(
        action.todoIds.map((id, index) => [id, availableOrders[index] ?? index])
      );
      return {
        ...state,
        appData: {
          ...state.appData,
          todos: state.appData.todos.map((todo) => ({
            ...todo,
            order: orderMap.get(todo.id) ?? todo.order,
          })),
        },
      };
    }
    default:
      return state;
  }
}
