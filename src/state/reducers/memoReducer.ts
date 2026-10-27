import { nextOrderValue, organizeGroups } from '../organize';
import type { AppAction, AppState } from '../storeTypes';

export function memoReducer(state: AppState, action: AppAction): AppState | null {
  switch(action.type) {
    case 'organize-memos': {
      const originalGroups = new Map(state.appData.memos.map(memo => [memo.id, memo.groupId]));
      const now = Date.now();
      const memos = organizeGroups(state.appData.memos, action.placements,
        new Set(state.appData.memoGroups.map(group => group.id)), memo => memo.deletedAt === null)
        .map(memo => memo.groupId !== originalGroups.get(memo.id) ? { ...memo, updatedAt: now } : memo);
      return { ...state, appData: { ...state.appData, memos } };
    }
    case 'memo-add':
      return { ...state, appData: { ...state.appData, memos: [...state.appData.memos, action.memo] } };
    case 'memo-update': {
      const current = state.appData.memos.find(memo => memo.id === action.id);
      if (!current || Object.entries(action.patch).every(([key, value]) => current[key as keyof typeof action.patch] === value)) return state;
      return { ...state, appData: { ...state.appData, memos: state.appData.memos.map(m => m.id === action.id ? { ...m, ...action.patch, updatedAt: Date.now() } : m) } };
    }
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
      let nextOrder = nextOrderValue(state.appData.memos.filter(m => m.groupId === action.groupId));
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
      let nextOrder = nextOrderValue(state.appData.memos.filter(m => m.groupId === null));
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
    default: return null;
  }
}
