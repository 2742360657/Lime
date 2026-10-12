import { CheckinRecord, Habit } from '../types/habit';

export function sortRecords(records: CheckinRecord[]) {
  return [...records].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return right.createdAt - left.createdAt;
  });
}

export function withUpdatedHabit(habits: Habit[], habitId: string, updater: (habit: Habit) => Habit) {
  return habits.map((habit) => (habit.id === habitId ? updater(habit) : habit));
}
