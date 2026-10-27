import type { Memo } from '../../types/app';
import { createId } from '../../utils/id';
import { nextOrderValue } from '../organize';
import type { ActionContext } from './types';

export function createMemoActions({ dispatch, getData }: ActionContext) {
  const organizeMemos = (placements: import('../organize').Placement[]) => dispatch({ type: 'organize-memos', placements });
  const addMemo = (groupId: string | null) => {
    const id = createId();
    const now = Date.now();
    dispatch({
      type: 'memo-add',
      memo: {
        id,
        title: '',
        body: '',
        groupId,
        order: nextOrderValue(getData().memos.filter((memo) => memo.groupId === groupId)),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });
    return id;
  };

  const updateMemo = (id: string, patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>) =>
      dispatch({ type: 'memo-update', id, patch });

  const trashMemos = (ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'memo-soft-delete', ids });
  };

  const restoreMemos = (ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'memo-restore', ids });
  };

  const purgeMemos = (ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'memo-purge', ids });
  };

  const purgeAllMemos = () => dispatch({ type: 'memo-purge-all' });

  const moveMemosToGroup = (ids: string[], groupId: string | null) => {
    if (ids.length > 0) dispatch({ type: 'memo-move-group', ids, groupId });
  };



  const addMemoGroup = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分类名称不能为空。' });
        return false;
      }
      const exists = getData().memoGroups.some(
        (group) => group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分类名称已存在，请换一个。' });
        return false;
      }
      dispatch({
        type: 'memo-group-add',
        group: { id: createId(), name: trimmed, order: nextOrderValue(getData().memoGroups), createdAt: Date.now() },
      });
      return true;
    };

  const renameMemoGroup = (groupId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分类名称不能为空。' });
        return false;
      }
      const exists = getData().memoGroups.some(
        (group) => group.id !== groupId && group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分类名称已存在，请换一个。' });
        return false;
      }
      dispatch({ type: 'memo-group-rename', groupId, name: trimmed });
      return true;
    };

  const deleteMemoGroup = (groupId: string) => {
    dispatch({ type: 'memo-group-delete', groupId });
  };

  const reorderMemoGroups = (groupIds: string[]) => {
    dispatch({ type: 'memo-group-reorder', groupIds });
  };

  return { organizeMemos, addMemo, updateMemo, trashMemos, restoreMemos, purgeMemos, purgeAllMemos, moveMemosToGroup, addMemoGroup, renameMemoGroup, deleteMemoGroup, reorderMemoGroups };
}
