const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Exercise the shipped TypeScript date/check-in helpers without a React Native runtime.
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);

const {
  CHECKIN_DAY_START_HOUR,
  buildTimestampForCheckinDay,
  formatCheckinTime,
  getCheckinReferenceDate,
  toCheckinDateKey,
} = require('../src/utils/date.ts');
const Module = require('node:module');
const files = new Map();
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'expo-document-picker') return {};
  if (name === 'expo-sharing') return {};
  if (name === 'expo-file-system/legacy') return {
    documentDirectory: 'memory://documents/', cacheDirectory: 'memory://cache/',
    getInfoAsync: async path => ({ exists: files.has(path) }),
    makeDirectoryAsync: async path => files.set(path, ''),
    readAsStringAsync: async path => files.get(path),
    writeAsStringAsync: async (path, value) => files.set(path, value),
  };
  return originalLoad.call(this, name, ...args);
};
const { getHabitProgress } = require('../src/utils/habit.ts');
const { createCheckinRecord } = require('../src/state/reducerHelpers.ts');
const { saveAppDataToDisk, loadAppDataFromDisk } = require('../src/storage/habitStorage.ts');
Module._load = originalLoad;

const timestampAt = (year, month, day, hour, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

const record = (dateKey, timestamp) => ({
  id: `${dateKey}-${timestamp}`,
  dateKey,
  timestamp,
  note: '',
  createdAt: timestamp,
});

const habit = (cadence, checkins) => ({
  id: 'reading',
  name: '阅读',
  groupId: null,
  order: 0,
  cadence,
  targetCount: 0,
  createdAt: 0,
  archivedAt: null,
  checkins,
});

test('check-in days start at 04:00 instead of midnight', () => {
  assert.equal(CHECKIN_DAY_START_HOUR, 4);
  assert.equal(toCheckinDateKey(timestampAt(2026, 10, 12, 0, 0)), '2026-10-11');
  assert.equal(toCheckinDateKey(timestampAt(2026, 10, 12, 3, 59)), '2026-10-11');
  assert.equal(toCheckinDateKey(timestampAt(2026, 10, 12, 4, 0)), '2026-10-12');
  assert.equal(toCheckinDateKey(timestampAt(2026, 10, 12, 23, 59)), '2026-10-12');
  assert.equal(getCheckinReferenceDate(new Date(timestampAt(2026, 10, 12, 2, 0))).getDate(), 11);
});

test('early-morning timestamps round-trip to the selected check-in day', () => {
  const lateNight = buildTimestampForCheckinDay('2026-10-12', 1, 30);
  assert.equal(toCheckinDateKey(lateNight), '2026-10-12');
  assert.equal(new Date(lateNight).getDate(), 13);
  assert.equal(new Date(lateNight).getHours(), 1);

  const morning = buildTimestampForCheckinDay('2026-10-12', 4, 0);
  assert.equal(toCheckinDateKey(morning), '2026-10-12');
  assert.equal(new Date(morning).getDate(), 12);

  const evening = buildTimestampForCheckinDay('2026-10-12', 23, 30);
  assert.equal(toCheckinDateKey(evening), '2026-10-12');
  assert.equal(new Date(evening).getDate(), 12);
  assert.equal(buildTimestampForCheckinDay('2026-10-12', 24, 0), null);
});

test('records derive their dateKey from the timestamp and clamp seconds', () => {
  const created = createCheckinRecord(timestampAt(2026, 10, 12, 2, 30) + 42_000, ' 一章 ');
  assert.equal(created.dateKey, '2026-10-11');
  assert.equal(created.note, '一章');
  assert.equal(new Date(created.timestamp).getSeconds(), 0);

  const afterFour = createCheckinRecord(timestampAt(2026, 10, 12, 4, 0), '');
  assert.equal(afterFour.dateKey, '2026-10-12');
});

test('daily progress follows the 04:00 boundary', () => {
  const checkedIn = habit('daily', [
    record('2026-10-11', timestampAt(2026, 10, 12, 1, 20)),
    record('2026-10-12', timestampAt(2026, 10, 12, 9, 0)),
  ]);

  assert.equal(getHabitProgress(checkedIn, new Date(timestampAt(2026, 10, 12, 2, 0))).count, 1);
  assert.equal(getHabitProgress(checkedIn, new Date(timestampAt(2026, 10, 12, 12, 0))).count, 1);
  assert.equal(getHabitProgress(checkedIn, new Date(timestampAt(2026, 10, 13, 2, 0))).count, 1);
});

test('weekly and monthly ranges start from the check-in day, not the clock day', () => {
  // Monday 02:00 still belongs to the previous check-in day (Sunday),
  // so a Sunday-night record stays in the old week until 04:00.
  const sundayOnly = habit('weekly', [record('2026-10-11', timestampAt(2026, 10, 11, 23, 0))]);

  assert.equal(getHabitProgress(sundayOnly, new Date(timestampAt(2026, 10, 12, 2, 0))).count, 1);
  assert.equal(getHabitProgress(sundayOnly, new Date(timestampAt(2026, 10, 12, 12, 0))).count, 0);

  // The first hours of Nov 1 still count towards October.
  const monthly = habit('monthly', [
    record('2026-10-31', timestampAt(2026, 11, 1, 2, 0)),
    record('2026-11-01', timestampAt(2026, 11, 1, 9, 0)),
  ]);

  assert.equal(getHabitProgress(monthly, new Date(timestampAt(2026, 11, 1, 2, 0))).count, 1);
  assert.equal(getHabitProgress(monthly, new Date(timestampAt(2026, 11, 1, 12, 0))).count, 1);
});

test('early-morning record times are labelled as the next day', () => {
  assert.equal(formatCheckinTime(timestampAt(2026, 10, 13, 1, 30)), '次日 01:30');
  assert.equal(formatCheckinTime(timestampAt(2026, 10, 12, 4, 0)), '04:00');
  assert.equal(formatCheckinTime(timestampAt(2026, 10, 12, 23, 30)), '23:30');
});

test('loading stored data re-attributes old check-ins to the 04:00 boundary', async () => {
  const early = {
    id: 'early',
    dateKey: '2026-10-12',
    timestamp: timestampAt(2026, 10, 12, 1, 30) + 15_000,
    note: '  夜读  ',
    createdAt: timestampAt(2026, 10, 12, 1, 30),
  };
  const morning = {
    id: 'morning',
    dateKey: '2026-10-12',
    timestamp: timestampAt(2026, 10, 12, 9, 0),
    note: '',
    createdAt: timestampAt(2026, 10, 12, 9, 0),
  };
  const app = {
    version: 7,
    habits: [habit('daily', [early, morning])],
    groups: [],
    todos: [],
    memoGroups: [],
    memos: [],
    settings: {},
  };

  await loadAppDataFromDisk();
  await saveAppDataToDisk(app);
  const loaded = await loadAppDataFromDisk();
  const stored = loaded.habits[0].checkins;

  assert.deepEqual(stored.map((item) => item.dateKey).sort(), ['2026-10-11', '2026-10-12']);
  assert.equal(stored.find((item) => item.id === 'early').note, '夜读');
  assert.equal(new Date(stored.find((item) => item.id === 'early').timestamp).getSeconds(), 0);
});
