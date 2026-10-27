import { clampToMinute, toCheckinDateKey } from '../../utils/date';
import { nextOrderValue, organizeGroups } from '../organize';
import { createCheckinRecord, sortRecords, withUpdatedHabit } from '../reducerHelpers';
import type { AppAction, AppState } from '../storeTypes';

export function habitReducer(state: AppState, action: AppAction): AppState | null {
  switch(action.type) {
    case 'organize-habits': {
      const habits = organizeGroups(state.appData.habits, action.placements,
        new Set(state.appData.groups.map(group => group.id)), habit => habit.archivedAt === null);
      return { ...state, appData: { ...state.appData, habits } };
    }
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
      let nextUngroupedOrder = nextOrderValue(state.appData.habits.filter((habit) => habit.groupId === null));
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

    case 'move-habits-to-group': {
      const target = new Set(action.ids);
      let nextOrder = nextOrderValue(state.appData.habits.filter(
        (habit) => habit.groupId === action.groupId && habit.archivedAt === null
      ));
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
    default: return null;
  }
}
