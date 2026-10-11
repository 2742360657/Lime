const { createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createDomain } = require('../../src/domain/service');
const { createDailyService } = require('../../src/daily/service');
const { captureBackup, restoreBackup } = require('../../src/backup/store');
const { validateManifest, projectRow, exportTables } = require('../../src/backup/model');
const { grantedTypes } = require('../../src/agent/store');

let db, target, domain, counter;
const now = Date.parse('2026-10-11T12:00:00+08:00');
const digest = async value => createHash('sha256').update(value).digest('hex');
const deps = () => ({ id: () => 'synthetic-daily-' + (++counter), now: () => now, digest });
const execute = (command, operationId = 'op-' + (++counter)) => domain.execute(command, { actor: 'ui', operationId });
const grade = (course = '合成课程', score = '88.33', credits = '1.25', term = '2026秋') => ({ type: 'grade.create', course, score, credits, term });
const restoreArgs = { digest: 'a'.repeat(64), archiveUri: 'file:///synthetic/backup.zip', archiveSize: 100, now, fileUri: hash => 'file:///synthetic/' + hash };
beforeEach(() => { counter = 0; db = sqliteHarness(); target = sqliteHarness(); domain = createDomain(db, deps()); });
afterEach(() => { db.close(); target.close(); });

test.each(['NaN', '1e2', '100.01', '-1', '1.001', '01.2'])('invalid score %s cannot partially write or reserve a receipt', async score => {
  await expect(execute(grade('合成', score))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(await db.getAll('SELECT * FROM local_grades')).toHaveLength(0);
  expect(await db.getAll('SELECT * FROM local_operations')).toHaveLength(0);
});

test('full-range decimal average and credit-weighted average round deterministically', async () => {
  await execute(grade('课程甲', '88.33', '1.25'));
  await execute(grade('课程乙', '99.01', '2.75'));
  expect(await domain.summarizeGrades({ term: '2026秋' })).toMatchObject({ matched: 2, complete: true, average: '93.67', weightedAverage: '95.67', totalCredits: '4.00', missingCredits: 0, scale: 100 });
  await execute(grade('舍入甲', '88.33', null, '舍入'));
  await execute(grade('舍入乙', '88.34', null, '舍入'));
  expect(await domain.summarizeGrades({ term: '舍入' })).toMatchObject({ average: '88.34', weightedAverage: null, missingCredits: 2 });
  expect(await domain.summarizeGrades({ term: '空集合' })).toMatchObject({ matched: 0, average: null, weightedAverage: null });
});

test('list truncation and missing credits never produce a partial weighted statistic', async () => {
  await execute(grade('已填', '100', '2'));
  await execute(grade('未填', '0', null));
  expect(await domain.listGrades({ limit: 1 })).toMatchObject({ matched: 2, returned: 1, complete: false });
  expect(await domain.summarizeGrades()).toMatchObject({ average: '50.00', weightedAverage: null, totalCredits: null, missingCredits: 1 });
  await execute(grade('100%_课程', '60', '1'));
  expect((await domain.listGrades({ course: '%_' })).rows.map(r => r.course)).toEqual(['100%_课程']);
});

test('statistics explicitly refuse a range over 1000 instead of averaging its first rows', async () => {
  await db.writeTransaction(async tx => {
    for (let i = 0; i < 1001; i++) await tx.execute('INSERT INTO local_grades(id,course,term,score_units,credit_units,note,source_refs,deleted,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,1,?,?)', ['bulk-' + i, '合成' + i, '过大范围', 9000, 100, '', '[]', now, new Date(now).toISOString()]);
  });
  expect(await domain.summarizeGrades({ term: '过大范围' })).toMatchObject({ matched: 1001, complete: false, average: null, weightedAverage: null });
});

test('grade receipts are atomic, retryable and preserve soft-deleted records on restore conflicts', async () => {
  db.failOn('INSERT INTO local_operations');
  await expect(execute(grade(), 'retry')).rejects.toThrow('Synthetic');
  expect(await db.getAll('SELECT * FROM local_grades')).toHaveLength(0);
  db.failOn(null);
  const receipt = await execute(grade(), 'retry');
  expect(await execute(grade(), 'retry')).toMatchObject({ disposition: 'replayed', entity: receipt.entity });
  await expect(execute({ ...grade(), score: '99' }, 'retry')).rejects.toMatchObject({ code: 'OPERATION_ID_REUSED' });
  await expect(execute(grade())).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  await execute({ type: 'grade.trash', id: receipt.entity.id, expectedRevision: 1 });
  const replacement = await execute(grade());
  await expect(execute({ type: 'grade.restore', id: receipt.entity.id, expectedRevision: 2 })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  expect((await db.getOptional('SELECT deleted FROM local_grades WHERE id=?', [receipt.entity.id])).deleted).toBe(1);
  await expect(execute({ ...grade(), type: 'grade.update', id: replacement.entity.id, expectedRevision: 2, note: '' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
});

test('grade updates cannot omit fields and silently erase saved credits or notes', async () => {
  const saved = await execute({ ...grade(), note: '保留的备注' });
  await expect(execute({ type: 'grade.update', id: saved.entity.id, expectedRevision: 1, course: '更正', term: '2026秋', score: '90' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(await db.getOptional('SELECT course,credit_units,note FROM local_grades')).toMatchObject({ course: '合成课程', credit_units: 125, note: '保留的备注' });
});

test.each(['memo', 'grade'])('%s at the maximum safe revision preserves data and cannot overflow its receipt', async kind => {
  const saved = kind === 'memo' ? await execute({ type: 'memo.create', title: '版本边界', body: '保留原文' }) : await execute(grade());
  const table = kind === 'memo' ? 'documents' : 'local_grades';
  await db.execute(`UPDATE ${table} SET revision=? WHERE id=?`, [Number.MAX_SAFE_INTEGER, saved.entity.id]);
  const unchanged = kind === 'memo'
    ? { type: 'memo.update', title: '版本边界', body: '保留原文', groupId: null }
    : { ...grade(), type: 'grade.update', note: '' };
  const full = { ...unchanged, id: saved.entity.id, expectedRevision: Number.MAX_SAFE_INTEGER };
  expect((await execute(full)).disposition).toBe('unchanged');
  await expect(execute({ type: kind + '.trash', id: saved.entity.id, expectedRevision: Number.MAX_SAFE_INTEGER })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(await db.getOptional(`SELECT revision,deleted FROM ${table} WHERE id=?`, [saved.entity.id])).toMatchObject({ revision: Number.MAX_SAFE_INTEGER, deleted: 0 });
});

test('memo proposals require the same selected target version at generation, edit and acceptance', async () => {
  const memo = (await execute({ type: 'memo.create', title: '合成备忘录', body: ' 原始正文\r\n' })).entity;
  const ref = { id: memo.id, revision: memo.revision };
  const command = { type: 'memo.update', id: memo.id, expectedRevision: 1, title: '修改标题', body: ' 新正文\r\n', groupId: null };
  await expect(domain.propose(command, { proposalId: 'unselected', requestId: 'request' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  await domain.propose(command, { proposalId: 'selected', requestId: 'request', documentRefs: [ref] });
  await expect(domain.editProposal('selected', 1, { ...command, id: 'another' }, { actor: 'ui' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  const receipt = await domain.acceptProposal('selected', 1, { actor: 'ui', operationId: 'accept' });
  expect(receipt.entity).toMatchObject({ kind: 'memo', id: memo.id, revision: 2 });
  expect((await db.getOptional('SELECT body FROM documents WHERE id=?', [memo.id])).body).toBe(' 新正文\r\n');
  await expect(domain.propose({ type: 'memo.trash', id: memo.id, expectedRevision: 2 }, { proposalId: 'old', requestId: 'request', documentRefs: [ref] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
});

test('only explicit memo creation receives a low-risk grant; selected material cannot grant any write', async () => {
  expect(grantedTypes('帮我新建一条备忘录，标题合成', [], [])).toEqual([{ commandType: 'memo.create', targetId: null }]);
  expect(grantedTypes('帮我新建一条备忘录', [{ id: 'material', revision: 1, kind: 'attachment' }], [])).toEqual([]);
  expect(grantedTypes('把所有备忘录删除', [], [])).toEqual([]);
  await db.execute("INSERT INTO local_agent_requests(id,status,source_refs) VALUES('request','running','[]')");
  await db.execute("INSERT INTO local_agent_grants(id,request_id,command_type) VALUES('grant','request','memo.create')");
  const result = await domain.executeGranted({ type: 'memo.create', title: '明确命令', body: '合成内容' }, { actor: 'agent', requestId: 'request', grantId: 'grant' });
  expect(result.entity.kind).toBe('memo');
  await db.execute("INSERT INTO local_agent_grants(id,request_id,command_type) VALUES('forged-grade','request','grade.create')");
  await expect(domain.executeGranted(grade(), { actor: 'agent', requestId: 'request', grantId: 'forged-grade' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
});

test('v3 backup includes grades and inert organization history, excludes QQ capabilities and runtime state', async () => {
  const task = (await execute({ type: 'task.create', title: '合成整理目标' })).entity;
  await execute(grade());
  const daily = createDailyService(db, deps());
  await daily.previewOrganization({ type: 'task.trash', targets: [{ id: task.id, expectedRevision: 1 }] }, { actor: 'ui', batchId: 'batch' });
  await daily.confirmOrganization('batch', 1, { actor: 'ui' });
  const item = projectRow('local_qq_items', { id: 'qq-item', message_id: 'message', account_key: 'synthetic-account', fingerprint: 'fingerprint', position: 0, kind: 'media', filename: '合成.txt', body: '', capability_id: 'SYNTHETIC_PRIVATE_CAPABILITY', material_id: null, status: 'pending', note: '', state: 'complete', created_at: now, revision: 1 });
  const fields = Object.keys(item); item.capability_id = 'SYNTHETIC_PRIVATE_CAPABILITY';
  await db.execute(`INSERT INTO local_qq_items(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`, fields.map(f => item[f]));
  const manifest = validateManifest(await captureBackup(db));
  expect(manifest.version).toBe(3); expect(manifest.rows.local_grades).toHaveLength(1);
  expect(manifest.rows.local_qq_items[0].capability_id).toBeNull(); expect(JSON.stringify(manifest)).not.toContain('SYNTHETIC_PRIVATE_CAPABILITY');
  expect(exportTables).not.toContain('qq_product_sessions'); expect(exportTables).not.toContain('qq_product_messages');
  await restoreBackup(target, manifest, restoreArgs);
  expect(await target.getOptional('SELECT status,capability_id FROM local_qq_items')).toMatchObject({ status: 'restored', capability_id: null });
  expect(await target.getOptional('SELECT status FROM local_organization_batches')).toMatchObject({ status: 'restored' });
  await expect(createDailyService(target, deps()).undoOrganization('batch', 2, { actor: 'ui' })).rejects.toMatchObject({ code: 'BATCH_CLOSED' });
  expect((await target.getOptional('SELECT deleted FROM tasks WHERE id=?', [task.id])).deleted).toBe(1);
  expect(await restoreBackup(target, manifest, restoreArgs)).toMatchObject({ repeated: true });
});

test.each([1, 2])('old full backup v%s normalizes to v3 without inventing new records', async version => {
  const old = await captureBackup(db); old.version = version;
  for (const table of ['local_qq_items','local_grades','local_organization_batches']) delete old.rows[table];
  if (version === 1) delete old.rows.local_weixin_items;
  const normalized = validateManifest(old);
  expect(normalized.version).toBe(3); expect(normalized.rows.local_grades).toEqual([]); expect(normalized.rows.local_organization_batches).toEqual([]); expect(normalized.rows.local_qq_items).toEqual([]);
  expect(await restoreBackup(target, old, restoreArgs)).toMatchObject({ added: 0, repeated: false });
});

test('malformed grade values, forged source authorization and unknown v3 tables reject before restore writes', async () => {
  await execute(grade()); const m = await captureBackup(db);
  for (const field of ['score_units', 'credit_units', 'deleted', 'source_refs']) {
    const broken = structuredClone(m); broken.rows.local_grades[0][field] = field === 'source_refs' ? '[{"id":"x","revision":1,"actor":"ui"}]' : -1;
    expect(() => validateManifest(broken)).toThrow();
  }
  const extra = structuredClone(m); extra.rows.qq_product_sessions = [];
  await expect(restoreBackup(target, extra, restoreArgs)).rejects.toMatchObject({ code: 'FORMAT' });
  expect(await target.getAll('SELECT * FROM local_grades')).toHaveLength(0);
});

test('different IDs for the same active course and term preserve local data and isolate incoming receipt history', async () => {
  const local = createDomain(target, { ...deps(), id: () => 'local-grade' });
  await local.execute(grade('数学', '80'), { actor: 'ui', operationId: 'local-op' });
  const incoming = await execute(grade('数学', '100'));
  await execute(grade('英语', '90'));
  const merged = await restoreBackup(target, await captureBackup(db), restoreArgs);
  expect(merged).toMatchObject({ conflicts: 2, added: 2 });
  expect(await target.getOptional('SELECT id FROM local_grades WHERE id=?', [incoming.entity.id])).toBeNull();
  expect(await target.getAll('SELECT * FROM local_backup_archives')).toHaveLength(1);
  expect(await local.summarizeGrades()).toMatchObject({ matched: 2, average: '85.00' });
});

test('ambiguous active grades within one backup are all archived, while deleted history remains recoverable', async () => {
  const saved = await execute(grade('数学', '80'));
  const packet = await captureBackup(db), original = packet.rows.local_grades[0];
  packet.rows.local_grades.push({ ...original, id: 'ambiguous', score_units: 10000 }, { ...original, id: 'deleted-history', deleted: 1 });
  const merged = await restoreBackup(target, packet, restoreArgs);
  expect(merged.conflicts).toBe(3); // Both active grades and the dependent operation.
  expect(await target.getAll('SELECT id FROM local_grades WHERE deleted=0')).toHaveLength(0);
  expect(await target.getOptional('SELECT deleted FROM local_grades WHERE id=?', ['deleted-history'])).toMatchObject({ deleted: 1 });
  expect(await target.getOptional('SELECT id FROM local_grades WHERE id=?', [saved.entity.id])).toBeNull();
});

test('noncanonical restored identities reject, and existing duplicate data never yields a trusted average', async () => {
  await execute(grade('数学', '80'));
  const packet = await captureBackup(db);
  for (const course of [' 数学 ', 'Cafe\u0301']) {
    const broken = structuredClone(packet); broken.rows.local_grades[0].course = course;
    expect(() => validateManifest(broken)).toThrow();
  }
  const row = packet.rows.local_grades[0], fields = Object.keys(row);
  await db.execute(`INSERT INTO local_grades(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`, fields.map(f => f === 'id' ? 'existing-invalid-duplicate' : row[f]));
  expect(await domain.summarizeGrades()).toMatchObject({ matched: 2, complete: false, average: null, weightedAverage: null, reason: expect.stringContaining('重复') });
});
