const { sqliteHarness } = require('./sqliteHarness.cjs');
const { readBusiness, writeBusiness } = require('../../src/assistant/businessStore');
const { readAppSettings, writeAppSettings } = require('../../src/storage/appSettings');
const { captureBackup } = require('../../src/backup/store');
let db;
beforeEach(() => { db = sqliteHarness(); });
afterEach(() => db.close());
const empty = async () => ({ habits: [], groups: [], todos: [], memoGroups: [], memos: [], settings: await readAppSettings(db.tx) });
const task = { id:'synthetic-task',title:'合成待办',note:' 保留原文\r\n',dueDateKey:null,dueTime:null,order:0,createdAt:100,completedAt:null };

test('business records and appearance settings use one SQLite transaction; failed writes cannot save half an action', async () => {
  const before = await empty(), after = { ...before, todos:[task], settings:{...before.settings,profileName:'合成名字',themeId:'forest'} };
  db.failOn('app-settings');
  await expect(db.writeTransaction(async tx => { await writeBusiness(tx,before,after); await writeAppSettings(tx,after.settings); })).rejects.toThrow('Synthetic');
  expect(await db.getAll('SELECT * FROM tasks')).toEqual([]);
  expect((await readAppSettings(db.tx)).profileName).not.toBe('合成名字');
  db.failOn(null);
  await db.writeTransaction(async tx => { await writeBusiness(tx,before,after); await writeAppSettings(tx,after.settings); });
  const hydrated = await db.readTransaction(async tx => readBusiness(tx,{...before,settings:await readAppSettings(tx)}));
  expect(hydrated.todos[0]).toMatchObject({...task,revision:1});
  expect(hydrated.settings.profileName).toBe('合成名字');
  expect((await captureBackup(db)).rows.local_meta).toEqual([]);
});

test('database hydration ignores stale in-memory business arrays and retains current revisions/deletions', async () => {
  const before=await empty(),created={...before,todos:[task]};
  await db.writeTransaction(tx=>writeBusiness(tx,before,created));
  const current=await readBusiness(db.tx,before);
  await db.writeTransaction(tx=>writeBusiness(tx,current,{...current,todos:[]}));
  expect((await readBusiness(db.tx,created)).todos).toEqual([]);
  expect(await db.getOptional('SELECT revision,deleted,note FROM tasks')).toEqual({revision:2,deleted:1,note:task.note});
});
