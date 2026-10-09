import { CheckinRecord, Habit } from '../types/habit';
import { getDaysInMonth, getTodayKey } from './date';

function sortCheckinRecords(left: CheckinRecord, right: CheckinRecord) {
  if (left.timestamp !== right.timestamp) {
    return right.timestamp - left.timestamp;
  }

  return right.createdAt - left.createdAt;
}

export function getCheckinRecordsByDate(habit: Habit, dateKey: string) {
  return habit.checkins
    .filter((record) => record.dateKey === dateKey)
    .sort(sortCheckinRecords);
}

export function getTodayCheckins(habit: Habit) {
  return getCheckinRecordsByDate(habit, getTodayKey());
}

export function getTodayCount(habit: Habit) {
  return getTodayCheckins(habit).length;
}

function getPeriodRange(habit: Habit, reference = new Date()) {
  if (habit.cadence === 'daily') {
    const key = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}-${String(reference.getDate()).padStart(2, '0')}`;
    return { startKey: key, endKey: key };
  }

  if (habit.cadence === 'weekly') {
    const mondayOffset = (reference.getDay() + 6) % 7;
    const monday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - mondayOffset, 12);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12);
    const toKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { startKey: toKey(monday), endKey: toKey(sunday) };
  }

  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    startKey: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    endKey: `${year}-${String(month + 1).padStart(2, '0')}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`,
  };
}

export function getHabitProgress(habit: Habit, reference = new Date()) {
  const { startKey, endKey } = getPeriodRange(habit, reference);
  const count = habit.checkins.filter(
    (record) => record.dateKey >= startKey && record.dateKey <= endKey
  ).length;
  const periodLabel =
    habit.cadence === 'daily' ? '今日' : habit.cadence === 'weekly' ? '本周' : '本月';

  return {
    count,
    target: habit.targetCount,
    completed: count >= habit.targetCount,
    label: `${periodLabel} ${count} / ${habit.targetCount}`,
  };
}

export function buildDateCountMap(habit: Habit) {
  return habit.checkins.reduce<Record<string, number>>((result, record) => {
    result[record.dateKey] = (result[record.dateKey] ?? 0) + 1;
    return result;
  }, {});
}

export function getMonthTotal(habit: Habit, year: number, monthIndex: number) {
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  return habit.checkins.reduce((count, record) => {
    return count + (record.dateKey.slice(0, 7) === monthKey ? 1 : 0);
  }, 0);
}

export function getYearTotal(habit: Habit, year: number) {
  return habit.checkins.reduce((count, record) => {
    return count + (record.dateKey.startsWith(`${year}-`) ? 1 : 0);
  }, 0);
}

export function getActiveDayCountInMonth(habit: Habit, year: number, monthIndex: number) {
  const dateCountMap = buildDateCountMap(habit);
  const daysInMonth = getDaysInMonth(year, monthIndex);
  let activeDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateCountMap[key]) {
      activeDays += 1;
    }
  }

  return activeDays;
}
