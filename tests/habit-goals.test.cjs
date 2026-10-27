const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the shipped TypeScript modules without starting a React Native runtime.
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
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
const { parseHabitTarget, normalizeHabitTarget, isValidHabitTarget } = require('../src/utils/habitTarget.ts');
const { getHabitProgress, getHabitSummary } = require('../src/utils/habit.ts');
const { coerceAppData, saveAppDataToDisk, loadAppDataFromDisk, buildBackupPayload, importBackupFile } = require('../src/storage/habitStorage.ts');
Module._load = originalLoad;

const reference = new Date(2026, 9, 12, 12);
const stamp = reference.getTime();
const habit = (targetCount, checkins = []) => ({ id: 'reading', name: '阅读', groupId: null,
  order: 0, cadence: 'daily', targetCount, createdAt: stamp, archivedAt: null, checkins });
const record = { id: 'checkin', dateKey: '2026-10-12', timestamp: stamp, note: '一章', createdAt: stamp };

test('free recording ignores a hidden goal; enabled goals require an explicit positive integer', () => {
  assert.equal(parseHabitTarget(false, ''), 0);
  assert.equal(parseHabitTarget(false, 'bad'), 0);
  assert.equal(parseHabitTarget(true, '3'), 3);
  assert.equal(parseHabitTarget(true, '9999'), 9999);
  for (const text of ['', '0', '-1', '1.5', '12abc', '10000']) assert.equal(parseHabitTarget(true, text), null);
  for (const value of [-1, NaN, Infinity, 1.5, 10000]) assert.equal(isValidHabitTarget(value), false);
});

test('unbounded habits show actual counts without becoming completed or dividing by zero', () => {
  assert.deepEqual(getHabitProgress(habit(0, [record]), reference), {
    count: 1, target: 0, hasTarget: false, completed: false, label: '今日已记录 1 次',
  });
  assert.equal(getHabitProgress(habit(0), reference).completed, false);
  assert.equal(getHabitSummary([habit(1, [record]), habit(0)], reference), '1/1 达标 · 1 项自由记录');
  assert.equal(getHabitSummary([habit(0)], reference), '1 项自由记录');
});

test('switching goals preserves historical check-ins and weekly/monthly counting', () => {
  const entry = habit(0, [record, { ...record, id: 'old', dateKey: '2026-10-05' }]);
  assert.equal(getHabitProgress(entry, reference).count, 1);
  assert.equal(getHabitProgress({ ...entry, targetCount: 2 }, reference).completed, false);
  assert.equal(getHabitProgress({ ...entry, cadence: 'weekly' }, reference).label, '本周已记录 1 次');
  assert.equal(getHabitProgress({ ...entry, cadence: 'monthly' }, reference).label, '本月已记录 2 次');
});

test('explicit no-goal values survive disk load and JSON backup import; old missing goals retain the old default', async () => {
  const app = { version: 7, habits: [habit(0, [record])], groups: [], todos: [], memoGroups: [], memos: [], settings: {} };
  await loadAppDataFromDisk();
  await saveAppDataToDisk(app);
  const loaded = await loadAppDataFromDisk();
  assert.equal(loaded.habits[0].targetCount, 0);
  assert.equal(loaded.habits[0].checkins.length, 1);
  files.set('memory://backup', buildBackupPayload(loaded));
  assert.equal((await importBackupFile('memory://backup')).habits[0].targetCount, 0);
  const legacy = { ...habit(3), targetCount: undefined };
  await loadAppDataFromDisk();
  await saveAppDataToDisk({ ...app, habits: [legacy] });
  assert.equal((await loadAppDataFromDisk()).habits[0].targetCount, 1);
  assert.equal(normalizeHabitTarget(0), 0);
  assert.equal(normalizeHabitTarget(3), 3);
});

test('old backups acquire update defaults and update preferences survive disk and backup roundtrips', async () => {
  const app = { version: 7, habits: [], groups: [], todos: [], memoGroups: [], memos: [], settings: {} };
  await loadAppDataFromDisk();
  await saveAppDataToDisk(app);
  const loaded = await loadAppDataFromDisk();
  assert.equal(loaded.settings.autoCheckUpdates, true);
  assert.equal(loaded.settings.lastUpdateCheckAt, 0);
  assert.equal(loaded.settings.skippedUpdateVersionCode, 0);
  const prefs = { autoCheckUpdates: false, lastUpdateCheckAt: stamp, skippedUpdateVersionCode: 11 };
  await loadAppDataFromDisk();
  await saveAppDataToDisk({ ...loaded, settings: { ...loaded.settings, ...prefs } });
  files.set('memory://updates-backup', buildBackupPayload(await loadAppDataFromDisk()));
  const restored = await importBackupFile('memory://updates-backup');
  for (const key of Object.keys(prefs)) assert.equal(restored.settings[key], prefs[key]);
  await loadAppDataFromDisk();
  await saveAppDataToDisk({ ...loaded, settings: { ...loaded.settings, autoCheckUpdates: 'false', lastUpdateCheckAt: -1, skippedUpdateVersionCode: 1.5 } });
  const invalid = await loadAppDataFromDisk();
  assert.equal(invalid.settings.autoCheckUpdates, true);
  assert.equal(invalid.settings.lastUpdateCheckAt, 0);
  assert.equal(invalid.settings.skippedUpdateVersionCode, 0);
});


test('v1-v7 migrations retain records and are stable after the normalized snapshot is written', () => {
  for (let version = 1; version <= 7; version++) {
    const legacyHabit = version < 3 ? { ...habit(1), checkins: [stamp] } : version === 3 ? { ...habit(1), checkins: [{ id: 'record', dateKey: '2026-10-12', timestamp: stamp, hasTime: true, createdAt: stamp }] } : habit(0, [record]);
    const app = { version, habits: [legacyHabit], groups: [], todos: [], memoGroups: [], memos: [], settings: {} };
    if (version === 5 || version === 6) app.memos.push({ id: 'legacy-memo', title: 'Memo', body: 'Text', category: 'Old category', order: 0, createdAt: stamp, updatedAt: stamp, deletedAt: null });
    const migrated = coerceAppData(app);
    assert.equal(migrated.version, 7);
    assert.equal(migrated.habits.length, 1);
    assert.equal(migrated.habits[0].checkins.length, 1);
    assert.deepEqual(coerceAppData(JSON.parse(buildBackupPayload(migrated))), migrated);
    if (version === 5 || version === 6) {
      assert.equal(migrated.memos[0].body, 'Text');
      assert.equal(migrated.memoGroups[0].name, 'Old category');
      assert.equal(migrated.memos[0].groupId, migrated.memoGroups[0].id);
    }
  }
});

test('incomplete or malformed current backups are rejected instead of normalizing to empty data', () => {
  assert.throws(() => coerceAppData({ version: 7 }));
  assert.throws(() => coerceAppData({ version: 7, habits: [], groups: [], todos: 'broken', memoGroups: [], memos: [] }));
  assert.throws(() => coerceAppData({ version: 1, habits: null }));
});
