import { CheckinRecord, Habit } from '../types/habit';
import { clampToMinute, toCheckinDateKey } from '../utils/date';
import { createId } from '../utils/id';

export function sortRecords(records: CheckinRecord[]) {
  return [...records].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return right.createdAt - left.createdAt;
  });
}

/** 记录日期由时间戳统一推导（04:00 切日），避免 dateKey 和时间不一致。 */
export function createCheckinRecord(timestamp: number, note: string): CheckinRecord {
  const normalizedTimestamp = clampToMinute(timestamp);
  return {
    id: createId(),
    dateKey: toCheckinDateKey(normalizedTimestamp),
    timestamp: normalizedTimestamp,
    note: note.trim(),
    createdAt: Date.now(),
  };
}

export function withUpdatedHabit(habits: Habit[], habitId: string, updater: (habit: Habit) => Habit) {
  return habits.map((habit) => (habit.id === habitId ? updater(habit) : habit));
}
