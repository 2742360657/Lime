const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { createSnapshotRepository } = require('../src/storage/snapshotRepository.ts');
const { createAppStore } = require('../src/state/appStore.ts');
const { initialState } = require('../src/state/storeTypes.ts');

function fixture(initial = new Map()) {
  const files = new Map(initial);
  let writes = 0, fail = false, truncate = false;
  const io = { exists: async p => files.has(p), read: async p => files.get(p), mkdir: async () => {},
    write: async (p, text) => { writes++; if (fail) throw new Error('disk full'); files.set(p, truncate ? text.slice(0, 20) : text); } };
  const repository = () => createSnapshotRepository(io, '/data/', value => {
    if (value?.version !== 7 || !Array.isArray(value.todos)) throw new Error('bad data');
    return value;
  }, () => structuredClone(initialState.appData));
  return { files, repository, get writes() { return writes; }, set fail(value) { fail = value; }, set truncate(value) { truncate = value; } };
}
const data = name => ({ ...structuredClone(initialState.appData), settings: { ...initialState.appData.settings, profileName: name } });

test('unreadable legacy data is not replaced by defaults, even after business commands and flush', async () => {
  const f = fixture(new Map([['/data/data.json', '{broken original']]));
  const store = createAppStore(f.repository());
  await store.load();
  assert.equal(store.getSnapshot().isHydrated, false);
  assert.ok(store.getSnapshot().loadError);
  store.actions.addTodo({ title: 'must not write', note: '', dueDateKey: null, dueTime: null });
  await assert.rejects(store.flush());
  assert.equal(f.writes, 0);
  assert.equal(f.files.get('/data/data.json'), '{broken original');
});

test('upgrade reads legacy bytes unchanged; interrupted next save recovers the preceding complete snapshot', async () => {
  const original = JSON.stringify(data('legacy'));
  const f = fixture(new Map([['/data/data.json', original]]));
  const repo = f.repository();
  assert.equal((await repo.load()).data.settings.profileName, 'legacy');
  await repo.save(data('first'));
  await repo.save(data('second'));
  f.truncate = true;
  await assert.rejects(repo.save(data('interrupted')));
  const recovered = await f.repository().load();
  assert.equal(recovered.data.settings.profileName, 'second');
  assert.equal(recovered.recovered, true);
  assert.equal(f.files.get('/data/data.json'), original);
});

test('corrupt journal slots do not silently load the stale legacy copy', async () => {
  const f = fixture(new Map([['/data/data.json', JSON.stringify(data('ancient'))], ['/data/data.0.json', 'bad'], ['/data/data.1.json', 'bad']]));
  await assert.rejects(f.repository().load());
  assert.equal(f.writes, 0);
});

test('checksum rejects a syntactically valid payload changed by corruption', async () => {
  const f = fixture(); const repo = f.repository(); await repo.load(); await repo.save(data('original'));
  const envelope = JSON.parse(f.files.get('/data/data.0.json'));
  envelope.payload = envelope.payload.replace('original', 'modified');
  f.files.set('/data/data.0.json', JSON.stringify(envelope));
  await assert.rejects(f.repository().load());
});

test('checksum covers generation metadata so corruption cannot silently select a stale snapshot', async () => {
  const f = fixture(); const repo = f.repository(); await repo.load(); await repo.save(data('original'));
  const envelope = JSON.parse(f.files.get('/data/data.0.json'));
  envelope.generation = 999;
  f.files.set('/data/data.0.json', JSON.stringify(envelope));
  await assert.rejects(f.repository().load());
});

test('failed writes stay visibly unsaved; retry persists the newest state and survives restart', async () => {
  const f = fixture(); const store = createAppStore(f.repository()); await store.load();
  f.fail = true;
  store.actions.updateProfile('first', '', null);
  await assert.rejects(store.flush());
  assert.equal(store.getSnapshot().saveStatus, 'error');
  assert.equal(store.getSnapshot().appData.settings.profileName, 'first');
  store.actions.updateProfile('newest', '', null);
  await assert.rejects(store.flush());
  f.fail = false; await store.flush();
  assert.equal(store.getSnapshot().saveStatus, 'saved');
  assert.equal((await f.repository().load()).data.settings.profileName, 'newest');
});

test('bursts coalesce; edits arriving during a write are drained before flush acknowledges', async () => {
  let release; let count = 0; let last;
  const gate = new Promise(resolve => release = resolve);
  const repo = { load: async () => ({ data: data('start'), recovered: false }), preserveForRecovery: async () => {},
    save: async value => { if (++count === 1) await gate; last = value; } };
  const store = createAppStore(repo); await store.load();
  store.actions.updateProfile('A', '', null); store.actions.updateProfile('B', '', null);
  await Promise.resolve();
  store.actions.updateProfile('C', '', null);
  const flushed = store.flush(); release(); await flushed;
  assert.equal(count, 2); assert.equal(last.settings.profileName, 'C');
});

test('restore preserves original bytes, acknowledges disk success and chooses imported data on restart', async () => {
  const f = fixture(); const store = createAppStore(f.repository()); await store.load();
  store.actions.updateProfile('old1', '', null); await store.flush();
  store.actions.updateProfile('old2', '', null); await store.flush();
  const before = new Map(f.files);
  await store.actions.replaceAppData(data('restored'));
  assert.equal((await f.repository().load()).data.settings.profileName, 'restored');
  for (const [path, contents] of before) assert.ok([...f.files].some(([p, text]) => p.includes('/recovery-') && p.endsWith(path.split('/').at(-1)) && text === contents));
});

test('failed restore never reports success or replaces the live view; blocked startup can explicitly recover', async () => {
  const f = fixture(new Map([['/data/data.json', 'damaged']])); const store = createAppStore(f.repository()); await store.load();
  f.fail = true; await assert.rejects(store.actions.replaceAppData(data('restored')));
  assert.equal(store.getSnapshot().isHydrated, false);
  assert.equal(f.files.get('/data/data.json'), 'damaged');
  f.fail = false; await store.actions.replaceAppData(data('restored'));
  assert.equal(store.getSnapshot().isHydrated, true);
  assert.equal((await f.repository().load()).data.settings.profileName, 'restored');
});
