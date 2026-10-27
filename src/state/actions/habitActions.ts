import { clampToMinute } from '../../utils/date';
import { isValidHabitTarget } from '../../utils/habitTarget';
import { createId } from '../../utils/id';
import { nextOrderValue } from '../organize';
import { createCheckinRecord } from '../reducerHelpers';
import type { HabitInput } from '../storeTypes';
import type { ActionContext } from './types';

export function createHabitActions({ dispatch, getData }: ActionContext) {
  const organizeHabits = (placements: import('../organize').Placement[]) => dispatch({ type: 'organize-habits', placements });
  const moveHabitsToGroup = (ids: string[], groupId: string | null) => {
    if (ids.length > 0) dispatch({ type: 'move-habits-to-group', ids, groupId });
  };

  const deleteHabits = (ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'delete-habits', ids });
  };

  const addGroup = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分组名称不能为空。' });
        return false;
      }

      const exists = getData().groups.some(
        (group) => group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分组名称已存在，请换一个。' });
        return false;
      }

      dispatch({
        type: 'add-group',
        group: {
          id: createId(),
          name: trimmed,
          order: nextOrderValue(getData().groups),
          createdAt: Date.now(),
        },
      });
      return true;
    };

  const renameGroup = (groupId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分组名称不能为空。' });
        return false;
      }

      const exists = getData().groups.some(
        (group) => group.id !== groupId && group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分组名称已存在，请换一个。' });
        return false;
      }

      dispatch({ type: 'rename-group', groupId, name: trimmed });
      return true;
    };

  const deleteGroup = (groupId: string) => {
    dispatch({ type: 'delete-group', groupId });
  };

  const reorderGroups = (groupIds: string[]) => {
    dispatch({ type: 'reorder-groups', groupIds });
  };

  const addHabit = (input: HabitInput) => {
      if (!isValidHabitTarget(input.targetCount)) {
        dispatch({ type: 'set-error', error: '目标次数须为 1–9999 的整数，或不设目标。' });
        return false;
      }
      const trimmed = input.name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '习惯名称不能为空。' });
        return false;
      }

      const normalizedGroupId =
        input.groupId && getData().groups.some((group) => group.id === input.groupId)
          ? input.groupId
          : null;
      const nextOrder = nextOrderValue(getData().habits.filter(
        (habit) => habit.groupId === normalizedGroupId
      ));

      dispatch({
        type: 'add-habit',
        habit: {
          id: createId(),
          name: trimmed,
          groupId: normalizedGroupId,
          order: nextOrder,
          cadence: input.cadence,
          targetCount: input.targetCount,
          createdAt: Date.now(),
          archivedAt: null,
          checkins: [],
        },
      });
      return true;
    };

  const updateHabit = (habitId: string, input: HabitInput) => {
      if (!isValidHabitTarget(input.targetCount)) {
        dispatch({ type: 'set-error', error: '目标次数须为 1–9999 的整数，或不设目标。' });
        return false;
      }
      const trimmed = input.name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '习惯名称不能为空。' });
        return false;
      }
      const normalizedGroupId =
        input.groupId && getData().groups.some((group) => group.id === input.groupId)
          ? input.groupId
          : null;
      const currentHabit = getData().habits.find((habit) => habit.id === habitId);
      const nextOrder =
        currentHabit && currentHabit.groupId === normalizedGroupId
          ? currentHabit.order
          : nextOrderValue(getData().habits.filter((habit) => habit.groupId === normalizedGroupId));
      dispatch({
        type: 'update-habit',
        habitId,
        name: trimmed,
        groupId: normalizedGroupId,
        cadence: input.cadence,
        targetCount: input.targetCount,
        order: nextOrder,
      });
      return true;
    };



  const archiveHabit = (habitId: string) => {
    dispatch({ type: 'archive-habit', habitId });
  };

  const restoreArchivedHabit = (habitId: string) => {
    dispatch({ type: 'restore-archived-habit', habitId });
  };

  const deleteHabit = (habitId: string) => {
    dispatch({ type: 'delete-habit', habitId });
  };

  const addCheckinNow = (habitId: string) => {
    const timestamp = clampToMinute(Date.now());
    const record = createCheckinRecord(timestamp, '');
    dispatch({ type: 'add-checkin-now', habitId, record });
    return record.id;
  };

  const addCheckin = (habitId: string, timestamp: number, note: string) => {
    dispatch({ type: 'add-checkin', habitId, timestamp, note });
  };

  const updateCheckin = (habitId: string, recordId: string, timestamp: number, note: string) => {
      dispatch({ type: 'update-checkin', habitId, recordId, timestamp, note });
    };

  const deleteCheckin = (habitId: string, recordId: string) => {
    dispatch({ type: 'delete-checkin', habitId, recordId });
  };

  return { organizeHabits, moveHabitsToGroup, deleteHabits, addGroup, renameGroup, deleteGroup, reorderGroups, addHabit, updateHabit, archiveHabit, restoreArchivedHabit, deleteHabit, addCheckinNow, addCheckin, updateCheckin, deleteCheckin };
}
