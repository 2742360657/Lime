const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { organizeGroups, reorderSubset } = require('../src/state/organize.ts');
const { createAppStore } = require('../src/state/appStore.ts');
const { initialState } = require('../src/state/storeTypes.ts');
const item = (id, groupId, order, extra = {}) => ({ id, groupId, order, ...extra });

test('filtered reordering preserves hidden entries, unique ranks and requested visible order', () => {
  const entries = [item('a', null, 0), item('hidden', null, 1), item('b', null, 2), item('other', null, 3)];
  const sorted = reorderSubset(entries, ['b', 'unknown', 'b', 'a']).sort((a, b) => a.order - b.order);
  assert.deepEqual(sorted.map(x => x.id), ['b', 'hidden', 'a', 'other']);
  assert.equal(new Set(sorted.map(x => x.order)).size, entries.length);
});

test('cross-group organizing ignores stale IDs, duplicate placements and invalid categories', () => {
  const entries = [item('a', 'one', 0), item('hidden', 'two', 0), item('b', 'two', 1), item('archived', 'one', 4, { archivedAt: 1 })];
  const result = organizeGroups(entries, [item('a', 'two'), item('a', null), item('b', 'two'), item('archived', 'two'), item('unknown', 'two'), item('hidden', 'invalid')], new Set(['one', 'two']), x => !x.archivedAt);
  assert.equal(result.find(x => x.id === 'a').groupId, 'two');
  assert.equal(result.find(x => x.id === 'hidden').groupId, 'two');
  assert.equal(result.find(x => x.id === 'archived').groupId, 'one');
  assert.deepEqual(result.filter(x => x.groupId === 'two').sort((a, b) => a.order - b.order).map(x => x.id), ['hidden', 'a', 'b']);
});

test('move-and-reorder is one business update and persists together, including deadline changes', async () => {
  const data = structuredClone(initialState.appData);
  data.todos = [item('a', null, 0, { title: 'A', completedAt: null, dueDateKey: null, dueTime: '09:30' }), item('done', null, 1, { completedAt: 1, dueDateKey: '2026-10-01' }), item('b', null, 2, { title: 'B', completedAt: null, dueDateKey: null })];
  let persisted;
  const store = createAppStore({ load: async () => ({ data, recovered: false }), save: async x => persisted = x, preserveForRecovery: async () => {} });
  await store.load(); let changes = 0, previous = store.getSnapshot().appData;
  store.subscribe(() => { const next = store.getSnapshot().appData; if (next !== previous) changes++; previous = next; });
  store.actions.organizeTodos(['b', 'a'], [{ id: 'a', dueDateKey: '2026-11-01' }, { id: 'done', dueDateKey: '2026-12-01' }]);
  await store.flush();
  assert.equal(changes, 1);
  assert.equal(persisted.todos.find(x => x.id === 'a').dueDateKey, '2026-11-01');
  assert.equal(persisted.todos.find(x => x.id === 'a').dueTime, '09:30');
  assert.equal(persisted.todos.find(x => x.id === 'done').dueDateKey, '2026-10-01');
  assert.deepEqual(persisted.todos.slice().sort((a, b) => a.order - b.order).map(x => x.id), ['b', 'done', 'a']);
});

test('stable actions read current state for consecutive creates; identical memo updates do not rewrite data', async () => {
  let saves = 0;
  const store = createAppStore({ load: async () => ({ data: structuredClone(initialState.appData), recovered: false }), save: async () => saves++, preserveForRecovery: async () => {} });
  await store.load();
  const first = store.actions.addMemo(null), second = store.actions.addMemo(null);
  assert.equal(new Set(store.getSnapshot().appData.memos.map(x => x.order)).size, 2);
  await store.flush(); const before = saves;
  store.actions.updateMemo(first, { title: '', body: '', groupId: null });
  await store.flush(); assert.equal(saves, before);
  store.actions.updateMemo(second, { body: 'new content' }); await store.flush(); assert.equal(saves, before + 1);
});


test('creation and group moves append after gaps, including ranks held by trashed memos', async () => {
  const data = structuredClone(initialState.appData);
  data.todos = [{ id: 'last', title: 'old', order: 8, completedAt: null }];
  data.memos = [{ id: 'active', title: 'one', body: '', groupId: null, order: 2, deletedAt: null }, { id: 'trash', title: 'two', body: '', groupId: null, order: 9, deletedAt: 1 }];
  const store = createAppStore({ load: async () => ({ data, recovered: false }), save: async () => {}, preserveForRecovery: async () => {} });
  await store.load();
  store.actions.addTodo({ title: 'appended', note: '', dueDateKey: null, dueTime: null });
  const id = store.actions.addMemo(null);
  assert.equal(store.getSnapshot().appData.todos.at(-1).order, 9);
  assert.equal(store.getSnapshot().appData.memos.find(m => m.id === id).order, 10);
  store.actions.restoreMemos(['trash']);
  assert.equal(new Set(store.getSnapshot().appData.memos.map(m => m.order)).size, 3);
  await store.flush();
});


test('drag indices follow displayed groups when storage ranks interleave different categories', () => {
  const { orderByVisibleGroups } = require('../src/utils/dragOrder.ts');
  const stored = [item('m0', 'group-a', 0), item('m1', 'uncategorized', 1), item('m2', 'uncategorized', 2)];
  const visual = orderByVisibleGroups(stored, [{ id: 'uncategorized' }, { id: 'group-a' }]);
  assert.deepEqual(visual.map(x => x.id), ['m1', 'm2', 'm0']);
  const withoutDragged = visual.filter(x => x.id !== 'm1');
  withoutDragged.splice(1, 0, visual[0]);
  assert.deepEqual(withoutDragged.filter(x => x.groupId === 'uncategorized').map(x => x.id), ['m2', 'm1']);
  assert.deepEqual(stored.map(x => x.id), ['m0', 'm1', 'm2']);
});
