import { CheckinRecord, Habit } from '../types/habit';
import { clampToMinute } from '../utils/date';
import { createId } from '../utils/id';

export function sortRecords(records: CheckinRecord[]) {
  return [...records].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return right.createdAt - left.createdAt;
  });
}

export function createCheckinRecord(dateKey: string, timestamp: number, note: string): CheckinRecord {
  return {
    id: createId(),
    dateKey,
    timestamp: clampToMinute(timestamp),
    note: note.trim(),
    createdAt: Date.now(),
  };
}

export function withUpdatedHabit(habits: Habit[], habitId: string, updater: (habit: Habit) => Habit) {
  return habits.map((habit) => (habit.id === habitId ? updater(habit) : habit));
}
