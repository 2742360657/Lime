const { parseHabitTarget, normalizeHabitTarget } = require('../../src/utils/habitTarget');
const { getHabitProgress, getHabitSummary } = require('../../src/utils/habit');
const reference = new Date(2026, 9, 12, 12);
const habit = (targetCount, checkins = []) => ({ id: 'reading', name: '阅读', groupId: null, order: 0, cadence: 'daily', targetCount, createdAt: 100, archivedAt: null, checkins });
const record = { id: 'one', dateKey: '2026-10-12', timestamp: reference.getTime(), createdAt: 100, note: '' };

test('optional targets validate explicit goals and retain the legacy default', () => {
  expect(parseHabitTarget(false, '')).toBe(0);
  expect(parseHabitTarget(true, '3')).toBe(3);
  for (const value of ['', '0', '-1', '1.5', '10000']) expect(parseHabitTarget(true, value)).toBeNull();
  expect(normalizeHabitTarget(0)).toBe(0);
  expect(normalizeHabitTarget(undefined)).toBe(1);
});
test('free recording displays counts and is excluded from goal completion totals', () => {
  expect(getHabitProgress(habit(0, [record]), reference)).toMatchObject({ count: 1, completed: false, label: '今日已记录 1 次' });
  expect(getHabitSummary([habit(1, [record]), habit(0)], reference)).toBe('1/1 达标 · 1 项自由记录');
  expect(getHabitSummary([habit(0)], reference)).toBe('1 项自由记录');
});
