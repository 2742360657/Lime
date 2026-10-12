const { createHash, randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createDomain } = require('../../src/domain/service');
const { createAgentStore } = require('../../src/agent/store');
const { commandSchema } = require('../../src/domain/commands');
const { tablePayloadSchema } = require('../../src/records/model');
const { captureBackup, restoreBackup } = require('../../src/backup/store');
const { validateManifest } = require('../../src/backup/model');

const digest = async text => createHash('sha256').update(text).digest('hex');
const now = Date.parse('2026-10-12T00:00:00Z');
const deps = { id: randomUUID, now: () => now, digest };
const ui = { actor: 'ui' };
const textRecord = (patch = {}) => ({ type: 'record.create', typeKey: '任意类别', schemaKey: 'text', title: '合成资料', body: ' 保留原文\r\n', payload: {}, tags: ['合成'], occurredAt: null, ...patch });
const table = (rows = [{ value: '188.33', weight: '1.25' }, { value: '199.01', weight: '2.75' }], unit = '任意单位') => ({
  columns: [{ key: 'value', label: '读数', kind: 'decimal', unit }, { key: 'weight', label: '权重', kind: 'decimal', unit: '' }], rows,
});
const tableRecord = (patch = {}) => textRecord({ schemaKey: 'table', payload: table(), ...patch });
const ref = receipt => ({ ...receipt.entity, kind: 'record' });
const restoreArgs = { digest: 'a'.repeat(64), archiveUri: 'file:///synthetic/package.zip', archiveSize: 100, now, fileUri: hash => 'file:///synthetic/' + hash };
let db, domain;
beforeEach(() => { db = sqliteHarness(); domain = createDomain(db, deps); });
afterEach(() => db.close());
const execute = (command, operationId = randomUUID()) => domain.execute(command, { ...ui, operationId });

test('one record shape supports independent categories and preserves raw text', async () => {
  for (const typeKey of ['成绩资料', '训练测量', '支出明细', '任意事件']) {
    const receipt = await execute(tableRecord({ typeKey }));
    const row = await domain.getRecord(receipt.entity.id, ui);
    expect(row.type_key).toBe(typeKey); expect(row.body).toBe(' 保留原文\r\n');
    expect(JSON.parse(row.payload).rows[0].value).toBe('188.33');
    expect(row.schema_version).toBe(1);
  }
  expect(db.sql.prepare('SELECT count(*) n FROM local_records').get().n).toBe(4);
  expect(db.sql.prepare("SELECT name FROM sqlite_master WHERE name='local_grades'").get()).toBeUndefined();
  expect(commandSchema.safeParse({ type: 'grade.create', course: 'x', score: '90' }).success).toBe(false);
});

test.each([
  { columns: [{ key: 'x', label: 'x', kind: 'decimal' }], rows: [{ x: 1.1 }] },
  { columns: [{ key: 'x', label: 'x', kind: 'decimal' }], rows: [{ x: '1e2' }] },
  { columns: [{ key: 'x', label: 'x', kind: 'decimal' }], rows: [{ x: '1.1234567890123' }] },
  { columns: [{ key: 'x', label: 'x', kind: 'text' }], rows: [{ sql: 'DROP TABLE tasks' }] },
  { columns: [{ key: 'x', label: 'x', kind: 'text' }, { key: 'x', label: 'duplicate', kind: 'text' }], rows: [] },
  { columns: [{ key: '__proto__', label: 'x', kind: 'text' }], rows: [] },
  { columns: [{ key: 'x', label: 'x', kind: 'date' }], rows: [{ x: '2026-02-29' }] },
  { columns: [{ key: 'x', label: 'x', kind: 'boolean' }], rows: [{ x: 'true' }] },
  { columns: [{ key: 'x', label: 'x', kind: 'text' }], rows: Array(201).fill({ x: null }) },
  { columns: [{ key: 'x', label: 'x', kind: 'text' }], rows: Array(20).fill({ x: 'x'.repeat(2000) }) },
])('invalid table structures never create records or receipts: %j', async payload => {
  await expect(execute(tableRecord({ payload }))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(await db.getAll('SELECT * FROM local_records')).toEqual([]);
  expect(await db.getAll('SELECT * FROM local_operations')).toEqual([]);
});

test('schema mismatch and arbitrary payload extensions are rejected; decimal/date/boolean cells remain typed', async () => {
  for (const command of [textRecord({ payload: table() }), tableRecord({ payload: {} }), tableRecord({ payload: { ...table(), script: 'anything' } })]) {
    await expect(execute(command)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  }
  expect(tablePayloadSchema.parse({ columns: [{ key: 'v', label: '负数', kind: 'decimal' }, { key: 'd', label: '日期', kind: 'date' }, { key: 'b', label: '确认', kind: 'boolean' }], rows: [{ v: '-999999999999999999.123456789012', d: '2028-02-29', b: false }, { v: null }] }).rows[0].b).toBe(false);
});

test('create/update/trash/restore commits versions and receipts atomically and replays without duplication', async () => {
  const command = textRecord();
  const receipt = await execute(command, 'same-create');
  expect((await execute(command, 'same-create')).disposition).toBe('replayed');
  await expect(execute(textRecord({ body: 'changed' }), 'same-create')).rejects.toMatchObject({ code: 'OPERATION_ID_REUSED' });
  const update = { ...command, type: 'record.update', id: receipt.entity.id, expectedRevision: 1, body: ' 新原文\n' };
  db.failOn('INSERT INTO local_operations');
  await expect(execute(update)).rejects.toThrow('Synthetic');
  expect((await domain.getRecord(receipt.entity.id, ui)).body).toBe(command.body);
  db.failOn(null);
  expect((await execute(update)).entity.revision).toBe(2);
  expect((await execute({ ...update, expectedRevision: 2 })).disposition).toBe('unchanged');
  await expect(execute(update)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  await execute({ type: 'record.trash', id: receipt.entity.id, expectedRevision: 2 });
  expect((await domain.listRecords()).matched).toBe(0);
  expect((await domain.listRecords({ deleted: true })).matched).toBe(1);
  await expect(execute({ ...update, expectedRevision: 3 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await execute({ type: 'record.restore', id: receipt.entity.id, expectedRevision: 3 });
  expect(await domain.getRecord(receipt.entity.id, ui)).toMatchObject({ revision: 4, deleted: 0, body: ' 新原文\n' });
});

test('metadata queries use literal title/type/tags/time, stable pages, and never expose unselected bodies or tables', async () => {
  for (let i = 0; i < 105; i++) await execute(tableRecord({ title: i === 0 ? '100%_\\特殊' : '合成标题', tags: ['查询标签'], occurredAt: now + i }));
  const first = await domain.listRecords({ typeKey: '任意类别', tag: '查询标签', from: now, through: now + 104, limit: 40 });
  expect(first.matched).toBe(105); expect(first.nextCursor).not.toBeNull();
  let cursor = first.nextCursor, rows = [...first.records];
  while (cursor) { const page = await domain.listRecords({ limit: 40, cursor }); rows.push(...page.records); cursor = page.nextCursor; }
  expect(new Set(rows.map(r => r.id)).size).toBe(105);
  expect(JSON.stringify(rows)).not.toContain('保留原文'); expect(JSON.stringify(rows)).not.toContain('188.33');
  for (const query of ['%', '_', '\\']) expect((await domain.listRecords({ query })).matched).toBe(1);
  expect((await domain.listRecords({ query: '188.33' })).matched).toBe(0);
  expect((await domain.listRecords({ tag: '查询' })).matched).toBe(0);
  expect((await domain.listRecords({ from: now + 100, through: now + 104 })).matched).toBe(5);
  await expect(domain.listRecords({ from: 10, through: 1 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
});

test('body read, calculation and target changes require selected kind and exact revision; stale references fail', async () => {
  const receipt = await execute(tableRecord()), selected = ref(receipt), agent = { actor: 'agent', documentRefs: [selected] };
  await expect(domain.getRecord(selected.id, agent)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(domain.readDocument(selected, { actor: 'agent', documentRefs: [] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(domain.calculateRecords([selected], { column: 'value', operation: 'sum' }, { actor: 'agent', documentRefs: [{ ...selected, kind: 'attachment' }] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  expect((await domain.readDocument(selected, agent)).body).toContain('188.33');
  expect(await domain.calculateRecords([selected], { column: 'value', operation: 'average' }, agent)).toMatchObject({ value: '193.67', complete: true, rows: 2, unit: '任意单位' });
  await execute({ ...tableRecord(), type: 'record.update', id: selected.id, expectedRevision: 1, body: 'changed' });
  await expect(domain.readDocument(selected, agent)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  await expect(domain.calculateRecords([selected], { column: 'value', operation: 'sum' }, agent)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
});

test('calculations preserve high precision, negative values, exact weighted averages and complete selected scope', async () => {
  const a = ref(await execute(tableRecord()));
  expect((await domain.calculateRecords([a], { column: 'value', operation: 'weightedAverage', weightColumn: 'weight' }, ui)).value).toBe('195.67');
  const b = ref(await execute(tableRecord({ payload: table([{ value: '-0.005', weight: '1' }]) })));
  expect((await domain.calculateRecords([b], { column: 'value', operation: 'sum' }, ui)).value).toBe('-0.01');
  const c = ref(await execute(tableRecord({ payload: table([{ value: '999999999999999999.123456789012', weight: '1' }]) })));
  expect((await domain.calculateRecords([c], { column: 'value', operation: 'sum', precision: 12 }, ui)).value).toBe('999999999999999999.123456789012');
  expect((await domain.calculateRecords([a, b], { column: 'value', operation: 'min', precision: 3 }, ui)).value).toBe('-0.005');
  expect((await domain.calculateRecords([a, b], { column: 'value', operation: 'max' }, ui)).value).toBe('199.01');
  const d = ref(await execute(tableRecord({ payload: table([{ value: '20', weight: '1' }], '另一单位') })));
  for (const refs of [[], [a, a], [a, d]]) await expect(domain.calculateRecords(refs, { column: 'value', operation: 'sum' }, ui)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
});

test.each([
  { rows: [{ value: null, weight: '1' }] }, { rows: [{ value: '1', weight: null }] }, { rows: [{ value: '1', weight: '0' }] }, { rows: [{ value: '1', weight: '-1' }] }, { rows: [] },
])('missing/invalid rows refuse partial weighted calculations: %j', async ({ rows }) => {
  const selected = ref(await execute(tableRecord({ payload: table(rows) })));
  expect(await domain.calculateRecords([selected], { column: 'value', operation: 'weightedAverage', weightColumn: 'weight' }, ui)).toMatchObject({ value: null, complete: false });
});

test('selected record proposals remain editable; source snapshots survive edits without granting later reads', async () => {
  const selected = ref(await execute(tableRecord()));
  const store = createAgentStore(db, deps), session = await store.newSession();
  const request = await store.begin(session, '根据这份资料整理', [selected]);
  expect(await store.grants(request.id)).toEqual([]);
  const command = { ...tableRecord(), type: 'record.update', id: selected.id, expectedRevision: selected.revision, body: '候选' };
  await expect(domain.propose(command, { requestId: request.id, proposalId: 'denied', documentRefs: [] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await expect(domain.propose(command, { requestId: request.id, proposalId: 'wrong-kind', documentRefs: [{ ...selected, kind: undefined }] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  const proposal = await domain.propose(command, { requestId: request.id, proposalId: 'proposal', documentRefs: [selected] });
  await domain.editProposal(proposal.id, 1, { ...command, body: '人工修订' }, ui);
  const receipt = await domain.acceptProposal(proposal.id, 2, { ...ui, operationId: 'accepted' });
  expect(receipt.entity.revision).toBe(2);
  expect((await domain.getRecord(selected.id, ui)).body).toBe('人工修订');
  expect((await db.getOptional('SELECT body FROM local_agent_sources WHERE request_id=?', [request.id])).body).toContain('保留原文');
  expect(await store.contextMessages(session)).toEqual([]);
  await expect(domain.propose({ type: 'record.restore', id: selected.id, expectedRevision: 2 }, { requestId: request.id, proposalId: 'restore', documentRefs: [selected] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
});

test('same-ID different source kinds retain independent snapshots; duplicate sources are rejected atomically', async () => {
  const selected = ref(await execute(tableRecord()));
  await db.execute("INSERT INTO documents(id,kind,title,body,date,revision,deleted) VALUES(?,'memo','合成','另一份原文','2026-10-12',1,0)", [selected.id]);
  const store = createAgentStore(db, deps), session = await store.newSession();
  const request = await store.begin(session, '比较两份资料', [selected, { id: selected.id, revision: 1 }]);
  expect(await db.getAll('SELECT * FROM local_agent_sources WHERE request_id=?', [request.id])).toHaveLength(2);
  await expect(store.begin(session, '重复来源', [selected, selected])).rejects.toThrow('一次');
  expect(await store.requests(session)).toHaveLength(1);
});

test('current backup round-trips generic records and history, isolates version conflicts and rolls back late failures', async () => {
  const original = await execute(tableRecord());
  const store = createAgentStore(db, deps), session = await store.newSession();
  const request = await store.begin(session, '合成记录', [ref(original)]);
  await store.finish(request.id, '合成回答', 'complete', null);
  const m = validateManifest(await captureBackup(db));
  expect(m.version).toBe(4); expect(m.rows.local_records).toHaveLength(1); expect(m.rows.local_grades).toBeUndefined();
  const target = sqliteHarness();
  try {
    target.failOn('INSERT INTO local_backup_imports');
    await expect(restoreBackup(target, m, restoreArgs)).rejects.toThrow('Synthetic');
    expect(await target.getAll('SELECT * FROM local_records')).toEqual([]);
    target.failOn(null);
    expect((await restoreBackup(target, m, restoreArgs)).conflicts).toBe(0);
    expect((await createDomain(target, deps).getRecord(original.entity.id, ui)).payload).toBe((await domain.getRecord(original.entity.id, ui)).payload);
    expect((await target.getAll('SELECT * FROM local_agent_sources'))[0].body).toContain('188.33');
    const targetDomain = createDomain(target, deps);
    await targetDomain.execute({ ...tableRecord(), type: 'record.update', id: original.entity.id, expectedRevision: 1, body: '本机后来修改' }, { ...ui, operationId: 'target-change' });
    const result = await restoreBackup(target, m, { ...restoreArgs, digest: 'b'.repeat(64) });
    expect(result.conflicts).toBeGreaterThan(0);
    expect((await targetDomain.getRecord(original.entity.id, ui)).body).toBe('本机后来修改');
    expect(await target.getAll('SELECT * FROM local_backup_archives')).toHaveLength(1);
    const invalid = structuredClone(m); invalid.rows.local_records[0].payload = '{"arbitrary":true}';
    expect(() => validateManifest(invalid)).toThrow();
  } finally { target.close(); }
});

test('record contents, selection versions and receipts survive SQLite close/reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lime-records-')), filename = join(dir, 'isolated.sqlite');
  let disk = sqliteHarness(filename);
  try {
    let d = createDomain(disk, deps);
    const receipt = await d.execute(tableRecord(), { ...ui, operationId: 'persist' });
    disk.close(); disk = sqliteHarness(filename); d = createDomain(disk, deps);
    expect((await d.execute(tableRecord(), { ...ui, operationId: 'persist' })).disposition).toBe('replayed');
    expect((await d.calculateRecords([ref(receipt)], { column: 'value', operation: 'sum' }, ui)).value).toBe('387.34');
  } finally { disk.close(); rmSync(dir, { recursive: true, force: true }); }
});
