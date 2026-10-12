const { randomUUID, createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createDomain } = require('../../src/domain/service');
const { loadRecordSources } = require('../../src/assistant/sources');
const { createAgentStore } = require('../../src/agent/store');

let db, domain, store;
const deps = { id: randomUUID, now: Date.now, digest: async text => createHash('sha256').update(text).digest('hex') };
const ui = command => domain.execute(command, { actor: 'ui', operationId: randomUUID() });
beforeEach(() => { db = sqliteHarness(); domain = createDomain(db, deps); store = createAgentStore(db, deps); });
afterEach(() => db.close());

test('habit edits keep checkins, creation metadata and order; stale editors and removed groups cannot overwrite', async () => {
  await db.execute("INSERT INTO habit_groups(id,name,revision,deleted) VALUES('g','生活',1,0),('gone','删除的组',1,1)");
  const first = await ui({ type: 'habit.create', name: '跑步', cadence: 'weekly', targetCount: 3, groupId: 'g' });
  const second = await ui({ type: 'habit.create', name: '阅读', cadence: 'daily', targetCount: 1, groupId: 'g' });
  await ui({ type: 'habit.checkin', id: first.entity.id, expectedRevision: 1, note: '今天跑了3km，感觉轻松' });
  const before = await db.getOptional('SELECT * FROM habits WHERE id=?', [first.entity.id]);
  const update = { type: 'habit.update', id: first.entity.id, expectedRevision: 1, name: '跑步', cadence: 'weekly', targetCount: 4, groupId: 'g' };
  await ui(update);
  await expect(ui(update)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  await expect(ui({ ...update, expectedRevision: 2, groupId: 'gone' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const after = await db.getOptional('SELECT * FROM habits WHERE id=?', [first.entity.id]);
  expect(after).toMatchObject({ target_count: 4, revision: 2, sort_order: before.sort_order, created_at: before.created_at });
  expect((await db.getOptional('SELECT sort_order FROM habits WHERE id=?', [second.entity.id])).sort_order).toBe(1);
  expect((await db.getOptional('SELECT note FROM checkins WHERE habit_id=?', [first.entity.id])).note).toContain('3km');
  expect((await ui({ ...update, expectedRevision: 2 })).disposition).toBe('unchanged');
  await db.execute('UPDATE habits SET archived_at=? WHERE id=?', [Date.now(), first.entity.id]);
  await expect(ui({ ...update, expectedRevision: 2 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test.each([
  { name: '', cadence: 'daily', targetCount: 1 },
  { name: 'x', cadence: 'hourly', targetCount: 1 },
  { name: 'x', cadence: 'daily', targetCount: 0 },
  { name: 'x', cadence: 'daily', targetCount: 1.5 },
  { name: 'x', cadence: 'daily', targetCount: 10000 },
  { name: 'x', cadence: 'daily', targetCount: 1, actor: 'ui' },
])('invalid habit setup leaves no row or receipt: %j', async fields => {
  await expect(ui({ type: 'habit.create', ...fields })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(await domain.listHabits()).toEqual([]);
  expect(await db.getAll('SELECT id FROM local_operations')).toEqual([]);
});

test('request writes are bounded across retries and concurrent duplicate checkins commit once', async () => {
  const habit = await ui({ type: 'habit.create', name: '阅读', cadence: 'daily', targetCount: 1 });
  const session = await store.newSession(), request = await store.begin(session, '今天读过了，也记一下其它事项', []);
  const context = { actor: 'agent', requestId: request.id };
  const command = { type: 'habit.checkin', id: habit.entity.id, expectedRevision: 1, note: '读完一章' };
  const receipts = await Promise.all([domain.executeRoutine(command, context), domain.executeRoutine(command, context)]);
  expect(receipts[0].entity.id).toBe(receipts[1].entity.id);
  expect(await db.getAll('SELECT id FROM checkins')).toHaveLength(1);
  for (let i = 0; i < 7; i++) await domain.executeRoutine({ type: 'task.create', title: `合成事项${i}` }, context);
  await store.finish(request.id, '', 'stopped', null); await store.restart(request.id);
  expect((await domain.executeRoutine(command, context)).disposition).toBe('replayed');
  await expect(domain.executeRoutine({ type: 'task.create', title: '第九项' }, context)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  expect(await domain.listTasks()).toHaveLength(7);
});

test('history acquisition is bounded, exact-versioned, transactional and cannot discover arbitrary attachments', async () => {
  const memo = await ui({ type: 'memo.create', title: '规格', body: '桌子120×60' });
  const session = await store.newSession(), request = await store.begin(session, '桌子多大', []);
  const ref = { id: memo.entity.id, revision: 1 };
  db.failOn('UPDATE local_agent_requests SET source_refs');
  await expect(store.captureSource(request.id, ref)).rejects.toThrow();
  expect(await db.getAll('SELECT id FROM local_agent_sources')).toEqual([]);
  db.failOn(null);
  expect(await store.captureSource(request.id, ref)).toEqual([ref]);
  expect(await store.captureSource(request.id, ref)).toEqual([ref]);
  await expect(store.captureSource(request.id, { ...ref, revision: 2 })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  await expect(store.captureSource(request.id, { id: 'arbitrary', revision: 1, kind: 'attachment' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  for (let i = 0; i < 3; i++) {
    const next = await ui({ type: 'memo.create', title: `相关${i}`, body: '合成' });
    await store.captureSource(request.id, { id: next.entity.id, revision: 1 });
  }
  const fifth = await ui({ type: 'memo.create', title: '第五份', body: '合成' });
  await expect(store.captureSource(request.id, { id: fifth.entity.id, revision: 1 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await ui({ type: 'memo.update', id: memo.entity.id, expectedRevision: 1, title: '规格', body: '更正', groupId: null });
  await expect(domain.executeRoutine({ type: 'task.create', title: '旧规格事项' }, { actor: 'agent', requestId: request.id })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  expect(await domain.listTasks()).toEqual([]);
  expect((await db.getOptional('SELECT body FROM local_agent_sources WHERE document_id=?', [memo.entity.id])).body).toBe('桌子120×60');
});


test('autonomous and restored results keep source evidence independently of ephemeral grants', async () => {
  const memo=await ui({type:'memo.create',title:'来源',body:'合成通知：周五提交材料'});
  const session=await store.newSession(), request=await store.begin(session,'整理通知',[{id:memo.entity.id,revision:1}]);
  const command={type:'task.create',title:'提交材料'},receipt=await domain.executeRoutine(command,{actor:'agent',requestId:request.id});
  expect((await loadRecordSources(db,'task',receipt.entity.id))[0].body).toContain('周五');
  await store.putResult('cached',request.id,{command,status:'saved',receipt});
  expect(await loadRecordSources(db,'task',receipt.entity.id)).toHaveLength(1);
  await db.execute('DELETE FROM local_agent_grants');
  await db.execute("UPDATE local_agent_requests SET status='restored'");
  expect((await loadRecordSources(db,'task',receipt.entity.id))[0].body).toContain('周五');
  expect(await loadRecordSources(db,'task','unrelated')).toEqual([]);
});
