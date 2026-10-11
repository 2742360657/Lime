const { createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createWeixinInbox } = require('../../src/channels/weixin/inbox');
const { createWeixinIntake, projectWeixinMessage } = require('../../src/channels/weixin/intake');
const { createWeixinVault } = require('../../src/channels/weixin/vault');
const { createForegroundOperation } = require('../../src/channels/weixin/foreground');
const { createMaterialStore } = require('../../src/materials/store');
const { WeixinError, API_BASE } = require('../../src/channels/weixin/protocol');
const { captureBackup, restoreBackup } = require('../../src/backup/store');
const { validateManifest } = require('../../src/backup/model');
const digest = async s => createHash('sha256').update(s).digest('hex');
const binding = { token: 'SYNTHETIC_CREDENTIAL', botId: 'synthetic-bot', userId: 'synthetic-owner', baseUrl: API_BASE };
const text = value => ({ type: 1, text_item: { text: value } });
const media = { type: 4, file_item: { file_name: 'synthetic.txt', len: '6', media: { encrypt_query_param: 'SYNTHETIC_DOWNLOAD_CAPABILITY', aes_key: Buffer.from('0'.repeat(16)).toString('base64') } } };
const msg = (parts = [text('合成文本'), media], extra = {}) => ({ message_id: '18446744073709551615', from_user_id: binding.userId, message_type: 1, message_state: 2, item_list: parts, create_time_ms: 100, ...extra });
let db, target, secrets, vault, inbox, materials, intake, deps;
beforeEach(() => {
  db = sqliteHarness(); target = sqliteHarness(); secrets = new Map();
  vault = createWeixinVault({ getItemAsync: async key => secrets.get(key) ?? null, setItemAsync: async (key,value) => secrets.set(key,value), deleteItemAsync: async key => secrets.delete(key) }, 'synthetic-intake');
  inbox = createWeixinInbox(db, { digest, now: () => 100, stageMedia: vault.stageMedia, project: projectWeixinMessage });
  materials = createMaterialStore(db, { id: () => 'material', now: () => 100 });
  const save = () => materials.save({ name: 'synthetic.txt', uri: 'file:///synthetic.txt', hash: 'a'.repeat(64), size: 6, mime: 'text/plain' }, { kind: 'text', body: '合成文本', images: [], pages: 0, status: 'ready', note: '' });
  deps = { media: vault.media, releaseMedia: vault.releaseMedia, saveText: jest.fn(save), saveMedia: jest.fn(save) };
  intake = createWeixinIntake(db, materials, deps);
});
afterEach(() => { db.close(); target.close(); });
async function receive(message = msg(), cursor) { return inbox.commit(binding, cursor ?? await inbox.cursor(binding), { msgs: [message], get_updates_buf: 'next' }); }
const signal = () => new AbortController().signal;

test('product parts, messages and cursor are one transaction, including a late SQL failure', async () => {
  db.failOn('INSERT OR IGNORE INTO local_weixin_items');
  await expect(receive()).rejects.toThrow('Synthetic');
  expect(await inbox.cursor(binding)).toBe(''); expect(await inbox.list(binding)).toHaveLength(0); expect(await intake.list()).toHaveLength(0);
  db.failOn(null); await receive(); expect(await intake.list()).toHaveLength(2);
  expect(await receive(msg(), 'next')).toMatchObject({ duplicates: 1, saved: 0 }); expect(await intake.list()).toHaveLength(2);
  const serialized = JSON.stringify(await intake.list()); expect(serialized).not.toContain(binding.token); expect(serialized).not.toContain('SYNTHETIC_DOWNLOAD_CAPABILITY');
});
test('only complete owner messages can be saved; partial, unsupported and withdrawn remain visible', async () => {
  await receive(msg([text('不完整')], { message_state: 0 }));
  await expect(intake.save((await intake.list())[0].id, signal())).rejects.toMatchObject({ code: 'PROTOCOL' });
  await receive(msg([{ type: 99 }])); await expect(intake.save((await intake.list()).find(i => i.state === 'complete').id, signal())).rejects.toMatchObject({ code: 'PROTOCOL' });
  await receive(msg([], { delete_time_ms: 1 })); expect((await intake.list()).every(i => i.state === 'deleted')).toBe(true);
  expect(deps.saveText).not.toHaveBeenCalled(); expect(deps.saveMedia).not.toHaveBeenCalled();
});
test('saved text shares P3 material IDs, and media redelivery never recreates released capability', async () => {
  await receive(); const items = await intake.list();
  const item = items.find(i => i.kind === 'media');
  expect((await intake.save(item.id, signal())).id).toBe('material'); expect(await vault.media(item.capability_id)).toBeNull();
  await receive(msg(), 'next'); expect(await vault.media(item.capability_id)).toBeNull();
  expect((await intake.save(item.id, signal())).id).toBe('material'); expect(deps.saveMedia).toHaveBeenCalledTimes(1);
  await intake.save(items.find(i => i.kind === 'text').id, signal()); expect(await db.getAll('SELECT * FROM local_materials')).toHaveLength(1);
});
test('a failed attachment does not erase message/cursor or block another item; explicit retry succeeds', async () => {
  await receive(); const items = await intake.list(), attachment = items.find(i => i.kind === 'media');
  deps.saveMedia.mockRejectedValueOnce(new Error('PRIVATE_RAW_NATIVE_DETAILS'));
  await expect(intake.save(attachment.id, signal())).rejects.toMatchObject({ code: 'NETWORK' });
  expect(await intake.get(attachment.id)).toMatchObject({ status: 'error', material_id: null }); expect((await intake.get(attachment.id)).note).not.toContain('PRIVATE_RAW');
  expect(await inbox.cursor(binding)).toBe('next'); await intake.save(items.find(i => i.kind === 'text').id, signal());
  await intake.save(attachment.id, signal()); expect(await intake.get(attachment.id)).toMatchObject({ status: 'saved', material_id: 'material' });
});
test('interruption after material commit leaves no false receipt; retry reuses original and releases capability once', async () => {
  await receive(); const item = (await intake.list()).find(i => i.kind === 'media');
  db.failOn('UPDATE local_weixin_items SET material_id');
  await expect(intake.save(item.id, signal())).rejects.toThrow('Synthetic');
  expect(await intake.get(item.id)).toMatchObject({ status: 'pending', material_id: null }); expect(await vault.media(item.capability_id)).not.toBeNull();
  expect(await materials.list()).toHaveLength(1);
  db.failOn(null); await intake.save(item.id, signal()); expect(await materials.list()).toHaveLength(1);
});
test('withdrawal/version change during download blocks stale receipt, preserves original, and remains retryable', async () => {
  await receive(); const item = (await intake.list()).find(i => i.kind === 'media');
  deps.saveMedia.mockImplementationOnce(async () => {
    const material = await deps.saveText(); await receive(msg([], { delete_time_ms: 1 }), 'next'); return material;
  });
  await expect(intake.save(item.id, signal())).rejects.toMatchObject({ code: 'BUSY' });
  expect(await intake.get(item.id)).toMatchObject({ state: 'deleted', material_id: null }); expect(await materials.list()).toHaveLength(1);
});
test('duplicate action and external cancellation cannot attach a late result', async () => {
  await receive(); const item = (await intake.list()).find(i => i.kind === 'media');
  let finish; deps.saveMedia.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const abort = new AbortController(), pending = intake.save(item.id, abort.signal);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await expect(intake.save(item.id, signal())).rejects.toMatchObject({ code: 'BUSY' });
  abort.abort(); finish(await deps.saveText()); await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  expect((await intake.get(item.id)).material_id).toBeNull(); await intake.save(item.id, signal());
});
test('unbind removes credentials/capabilities but keeps saved originals and history', async () => {
  await vault.save(binding); await receive(); const item = (await intake.list()).find(i => i.kind === 'text'); await intake.save(item.id, signal());
  await vault.remove(); expect(secrets.size).toBe(0); expect(await intake.list()).toHaveLength(2); expect(await materials.list()).toHaveLength(1);
  await expect(intake.save((await intake.list()).find(i => i.kind === 'media').id, signal())).rejects.toMatchObject({ code: 'SESSION' });
});
test('foreground operation refuses background start, cancels background/close, serializes and removes subscription', async () => {
  let active = false, listener, finish; const dispose = jest.fn();
  const foreground = createForegroundOperation({ active: () => active, subscribe: fn => { listener = fn; return dispose; } });
  await expect(foreground.run(async () => 1)).rejects.toMatchObject({ code: 'CANCELLED' });
  active = true; let runningSignal;
  const pending = foreground.run(s => { runningSignal = s; return new Promise(resolve => { finish = resolve; }); });
  await expect(foreground.run(async () => 2)).rejects.toMatchObject({ code: 'BUSY' });
  active = false; listener(); expect(runningSignal.aborted).toBe(true); finish(1); await pending; expect(dispose).toHaveBeenCalledTimes(1);
  active = true; await foreground.run(async s => { foreground.cancel(); expect(s.aborted).toBe(true); }); expect(dispose).toHaveBeenCalledTimes(2);
});
const restoreArgs = { digest: 'b'.repeat(64), archiveUri: 'file:///synthetic-package.zip', archiveSize: 10, now: 100, fileUri: h => 'file:///restored/'+h+'.bin' };
async function packageSnapshot() {
  const m = await captureBackup(db);
  for (const row of m.rows.local_materials) row.uri = 'blob:' + row.hash;
  if (m.rows.local_materials.length) m.blobs = [{ hash: 'a'.repeat(64), size: 6, role: 'material' }];
  return validateManifest(m);
}
test('v2 exports saved material references and inert pending history, excludes all transport identity/cursor/capabilities', async () => {
  await receive(); await intake.save((await intake.list()).find(i => i.kind === 'text').id, signal());
  const m = await packageSnapshot(); expect(m.version).toBe(3); expect(m.rows.local_weixin_items).toHaveLength(2);
  expect(m.rows.weixin_accounts).toBeUndefined(); expect(JSON.stringify(m)).not.toContain(binding.userId); expect(JSON.stringify(m)).not.toContain('SYNTHETIC_DOWNLOAD_CAPABILITY');
  expect(m.rows.local_weixin_items.every(i => i.capability_id === null)).toBe(true);
  expect(await restoreBackup(target,m,restoreArgs)).toMatchObject({ added: 3, conflicts: 0 });
  const rows = await target.getAll('SELECT * FROM local_weixin_items'); expect(rows.find(i => i.kind === 'media')).toMatchObject({ status: 'restored', capability_id: null }); expect(rows.find(i => i.kind === 'text')).toMatchObject({ status: 'saved', material_id: 'material' });
  const restored = createWeixinIntake(target, createMaterialStore(target,{id:()=> 'unused',now:()=>100}),deps);
  await expect(restored.save(rows.find(i=>i.kind==='media').id,signal())).rejects.toMatchObject({code:'PROTOCOL'});
  expect(await restoreBackup(target,m,{...restoreArgs,digest:'c'.repeat(64)})).toMatchObject({added:0,skipped:3,conflicts:0});
});
test('old 24-table version 1 ZIP manifests still normalize and restore', async () => {
  const m = await captureBackup(db); m.version = 1;
  for (const table of ['local_weixin_items','local_qq_items','local_grades','local_organization_batches']) delete m.rows[table];
  const normalized = validateManifest(m); expect(normalized.rows.local_weixin_items).toEqual([]); expect(normalized.version).toBe(3);
  expect(await restoreBackup(target,m,restoreArgs)).toMatchObject({added:0,conflicts:0});
});
test('incoming capability fields, bad material references and conflicting parents never become executable restored items', async () => {
  await receive(); await intake.save((await intake.list()).find(i => i.kind === 'text').id, signal()); const m = await packageSnapshot();
  const bad = structuredClone(m); bad.rows.local_weixin_items[0].capability_id = 'not-exportable'; expect(()=>validateManifest(bad)).toThrow();
  const missing = structuredClone(m); missing.rows.local_materials = []; missing.blobs=[]; expect(()=>validateManifest(missing)).toThrow();
  const material = await deps.saveText();
  await target.execute('INSERT INTO local_materials(id,filename,uri,hash,size,mime,kind,body,images,pages,status,note,revision,deleted,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',Object.values({...material,body:'冲突版本'}));
  const result = await restoreBackup(target,m,restoreArgs); expect(result.conflicts).toBe(2); expect((await target.getAll('SELECT * FROM local_weixin_items')).every(i=>i.kind==='media')).toBe(true);
});
