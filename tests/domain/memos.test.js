const { randomUUID } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { memoCommandSchema } = require('../../src/memos/commands');
const { mutateMemo, listMemoMetadata, listMemoGroups } = require('../../src/memos/domain');
const { createMemoDraftSession, decodeMemoDraft } = require('../../src/memos/draftSession');
const { assertMemoUpdate, MemoClassificationError } = require('../../src/memos/editGuard');
const { emptyRows, mergeRecords, portableRow } = require('../../src/assistant/recoveryRecords');

describe('memos reuse canonical documents with bounded metadata', () => {
  let db, now;
  const deps = { id: randomUUID, now: () => ++now };
  beforeEach(() => { db = sqliteHarness(); now = 1791676800000; });
  afterEach(() => db.close());
  const mutate = value => db.writeTransaction(tx => mutateMemo(tx, memoCommandSchema.parse(value), deps));
  async function group(id, name, kind = 'memo', deleted = 0) {
    await db.execute('INSERT INTO document_groups(id,name,kind,sort_order,revision,deleted) VALUES(?,?,?,0,1,?)', [id, name, kind, deleted]);
  }
  test('strict commands preserve exact text and require complete rewrites', () => {
    expect(memoCommandSchema.parse({ type: 'memo.create', title: ' 合成\r\n', body: '  第一行\n第二行\n' }).body).toBe('  第一行\n第二行\n');
    expect(memoCommandSchema.safeParse({ type: 'memo.create', body: '  ' }).success).toBe(false);
    expect(memoCommandSchema.safeParse({ type: 'memo.create', body: 'x', revision: 1 }).success).toBe(false);
    expect(memoCommandSchema.safeParse({ type: 'memo.update', id: 'm', expectedRevision: 1, title: 'x' }).success).toBe(false);
    expect(memoCommandSchema.safeParse({ type: 'memo.create', title: 'x'.repeat(301) }).success).toBe(false);
  });
  test('create, versioned rewrite and no-op use existing memo rows, preserve drafts and original dates', async () => {
    await group('g', '分类');
    const receipt = await mutate({ type: 'memo.create', title: ' 合成 ', body: '正文\r\n', groupId: 'g' });
    const before = db.sql.prepare('SELECT * FROM documents WHERE id=?').get(receipt.entity.id);
    expect(before.kind).toBe('memo'); expect(before.title).toBe(' 合成 '); expect(receipt.entity.revision).toBe(1);
    await db.execute("INSERT INTO local_drafts(id,document_id,kind,body,base_revision) VALUES(?,?,'memo','未提交草稿',1)", [before.id, before.id]);
    const command = { type: 'memo.update', id: before.id, expectedRevision: 1, title: '', body: ' 新正文\n', groupId: null };
    expect((await mutate(command)).entity.revision).toBe(2);
    const after = db.sql.prepare('SELECT * FROM documents WHERE id=?').get(before.id);
    expect(after.date).toBe(before.date); expect(after.created_at).toBe(before.created_at); expect(after.body).toBe(' 新正文\n');
    expect(db.sql.prepare('SELECT body,base_revision FROM local_drafts WHERE id=?').get(before.id)).toEqual({ body: '未提交草稿', base_revision: 1 });
    expect((await mutate({ ...command, expectedRevision: 2 })).disposition).toBe('unchanged');
    await expect(mutate(command)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
  test('wrong-kind or removed classification and diary targets are rejected', async () => {
    await group('wrong', '日记分类', 'diary'); await group('removed', '已删分类', 'memo', 1);
    for (const groupId of ['wrong', 'removed', 'missing']) await expect(mutate({ type: 'memo.create', title: '合成', groupId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.execute("INSERT INTO documents(id,kind,title,body,revision,deleted) VALUES('diary','diary','日记','保留',1,0)");
    await expect(mutate({ type: 'memo.update', id: 'diary', expectedRevision: 1, title: '改写', body: '', groupId: null })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(db.sql.prepare("SELECT body FROM documents WHERE id='diary'").get().body).toBe('保留');
  });
  test('soft delete keeps content and draft; restore falls back to unclassified and advances version', async () => {
    await group('g', '合成分类');
    const { entity } = await mutate({ type: 'memo.create', title: '标题', body: '保留正文', groupId: 'g' });
    const trash = { type: 'memo.trash', id: entity.id, expectedRevision: 1 };
    expect((await mutate(trash)).entity.revision).toBe(2);
    expect((await mutate({ ...trash, expectedRevision: 2 })).disposition).toBe('unchanged');
    await expect(mutate({ type: 'memo.update', id: entity.id, expectedRevision: 2, title: 'x', body: 'x', groupId: null })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.execute("UPDATE document_groups SET deleted=1 WHERE id='g'");
    expect((await mutate({ type: 'memo.restore', id: entity.id, expectedRevision: 2 })).entity.revision).toBe(3);
    const stored = db.sql.prepare('SELECT * FROM documents WHERE id=?').get(entity.id);
    expect(stored.body).toBe('保留正文'); expect(stored.group_id).toBeNull(); expect(stored.deleted_at).toBeNull(); expect(stored.deleted).toBe(0);
  });
  test('metadata excludes bodies and searches only literal title/classification, with limits', async () => {
    await group('g', '出行'); await group('hidden', '私人日记分类', 'diary');
    await mutate({ type: 'memo.create', title: '100%_预算', body: 'UNSELECTED-SYNTHETIC-BODY', groupId: 'g' });
    await mutate({ type: 'memo.create', title: '其它标题', body: '预算在正文' });
    const rows = await db.readTransaction(tx => listMemoMetadata(tx, { query: '%_', limit: 1 }));
    expect(rows).toHaveLength(1); expect(rows[0].title).toBe('100%_预算'); expect(rows[0].groupName).toBe('出行');
    expect(JSON.stringify(rows)).not.toContain('UNSELECTED-SYNTHETIC-BODY'); expect(rows[0]).not.toHaveProperty('body');
    expect(await db.readTransaction(tx => listMemoMetadata(tx, { query: '预算在正文' }))).toEqual([]);
    expect(await db.readTransaction(tx => listMemoMetadata(tx, { query: '出行' }))).toHaveLength(1);
    expect(await db.readTransaction(tx => listMemoGroups(tx))).toHaveLength(1);
    await expect(db.readTransaction(tx => listMemoMetadata(tx, { limit: 101 }))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
  test('a failed mutation rolls back the whole document write', async () => {
    db.failOn('INSERT INTO documents');
    await expect(mutate({ type: 'memo.create', body: '合成' })).rejects.toThrow();
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM documents').get().n).toBe(0);
  });
  test('manual memo guard rejects other document kinds and soft-deleted records even without a version argument', async () => {
    await db.execute("INSERT INTO documents(id,kind,title,body,revision,deleted,group_id) VALUES('diary','diary','日记','原文',1,0,NULL),('gone','memo','备忘录','保留',2,1,NULL)");
    for (const id of ['diary', 'gone', 'missing']) await expect(db.writeTransaction(tx => assertMemoUpdate(tx, id, { title: '新标题' }))).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(db.sql.prepare("SELECT body FROM documents WHERE id='diary'").get().body).toBe('原文');
  });
  test('manual memo guard validates classification kind/deletion and preserves strict date/content/version conflicts', async () => {
    await group('g', '正常'); await group('wrong', '日记', 'diary'); await group('gone', '已删除', 'memo', 1);
    const { entity } = await mutate({ type: 'memo.create', title: '原标题', body: '原文', groupId: 'g' });
    const row = db.sql.prepare('SELECT * FROM documents WHERE id=?').get(entity.id);
    const base = { title: row.title, body: row.body, date: row.date, group_id: row.group_id };
    for (const groupId of ['wrong', 'gone', 'missing']) await expect(db.writeTransaction(tx => assertMemoUpdate(tx, row.id, { groupId }, 1, base))).rejects.toBeInstanceOf(MemoClassificationError);
    await expect(db.writeTransaction(tx => assertMemoUpdate(tx, row.id, { groupId: null, body: '新输入' }, 1, base))).resolves.toBeUndefined();
    await expect(db.writeTransaction(tx => assertMemoUpdate(tx, row.id, { title: '新输入' }, 1, { ...base, date: '2026-10-10' }))).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    await db.execute("UPDATE document_groups SET deleted=1 WHERE id='g'");
    await db.execute('UPDATE documents SET group_id=NULL,revision=revision+1 WHERE id=?', [row.id]);
    // Picking a new classification does not authorize an implicit stale-draft rebase.
    await expect(db.writeTransaction(tx => assertMemoUpdate(tx, row.id, { groupId: null, body: '新输入' }, 1, base))).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(db.sql.prepare('SELECT body FROM documents WHERE id=?').get(row.id).body).toBe('原文');
  });
  test('conflicting memo draft can be copied to unclassified without overwriting the current version', async () => {
    await group('g', '后来删除的分类');
    const { entity } = await mutate({ type: 'memo.create', title: '当前标题', body: '当前原文', groupId: 'g' });
    const row = db.sql.prepare('SELECT * FROM documents WHERE id=?').get(entity.id);
    await db.execute("UPDATE document_groups SET deleted=1 WHERE id='g'");
    const rows = emptyRows(); rows.documents = [portableRow('documents', { ...row, title: '草稿标题', body: ' 草稿输入\r\n', deleted: 0 })];
    const result = await db.writeTransaction(tx => mergeRecords(tx, { rows, drafts: [], recovery: [] }, randomUUID, true));
    expect(result.added).toBe(1); expect(result.detached).toBe(1);
    const original = db.sql.prepare('SELECT * FROM documents WHERE id=?').get(row.id);
    const copied = db.sql.prepare('SELECT * FROM documents WHERE id<>?').get(row.id);
    expect(original.body).toBe('当前原文'); expect(original.revision).toBe(1);
    expect(copied.group_id).toBeNull(); expect(copied.body).toBe(' 草稿输入\r\n'); expect(copied.kind).toBe('memo');
  });
});

describe('memo draft session handles asynchronous saves and recovery', () => {
  let session, stored, canonical, saves, persistence;
  const initial = () => ({ value: { title: '标题', body: '原文', groupId: null }, revision: 1, base: { title: '标题', body: '原文', date: '2026-10-11', group_id: null } });
  const copy = value => JSON.parse(JSON.stringify(value));
  function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
  beforeEach(() => {
    jest.useFakeTimers(); stored = null; canonical = initial(); saves = [];
    persistence = {
      read: async () => stored,
      write: async draft => { stored = copy(draft); },
      save: async (value, revision, base) => { saves.push(copy({ value, revision, base })); canonical = { value: copy(value), revision: revision + 1, base: { ...base, ...value } }; return revision + 1; },
      updateBase: async (revision, base) => { if (stored) stored = { ...stored, revision, base: copy(base) }; },
      remove: async () => { stored = null; },
    };
  });
  afterEach(() => { session?.dispose(); jest.useRealTimers(); });
  test('loading blocks typing, so a delayed recovered draft cannot erase new input', async () => {
    const read = deferred(); session = createMemoDraftSession(initial(), { ...persistence, read: () => read.promise });
    const loading = session.initialize(); session.change('body', '不能越过加载');
    expect(session.getSnapshot().value.body).toBe('原文'); expect(session.getSnapshot().ready).toBe(false);
    const recovered = initial(); recovered.value.body = '合成草稿'; read.resolve(recovered); await loading;
    expect(session.getSnapshot().value.body).toBe('合成草稿'); session.change('body', '新输入'); await session.finish();
    expect(canonical.value.body).toBe('新输入'); expect(stored).toBeNull();
  });
  test('failed/malformed draft reads preserve the existing row and require retry before edits', async () => {
    const broken = { title: '', body: '旧草稿', group_id: null, base_revision: 1, base_content: '{broken' };
    session = createMemoDraftSession(initial(), { ...persistence, read: async () => decodeMemoDraft(broken, initial()) });
    await session.initialize(); session.change('body', '新输入');
    expect(session.getSnapshot().ready).toBe(false); expect(saves).toHaveLength(0); expect(broken.body).toBe('旧草稿');
    await expect(session.finish()).rejects.toThrow('DRAFT_NOT_READY');
  });
  test('older in-flight save cannot report newer input saved; later save uses committed version', async () => {
    const blocked = deferred(); let first = true;
    session = createMemoDraftSession(initial(), { ...persistence, save: async (...args) => { if (first) { first = false; await blocked.promise; } return persistence.save(...args); } });
    await session.initialize(); session.change('body', '第一版');
    const older = session.flush(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    session.change('body', '第二版'); blocked.resolve(); await older;
    expect(session.getSnapshot().value.body).toBe('第二版'); expect(session.getSnapshot().status).toBe('正在保存…');
    await session.finish(); expect(saves.map(save => save.value.body)).toEqual(['第一版', '第二版']);
    expect(saves[1].revision).toBe(2); expect(saves[1].base.body).toBe('第一版'); expect(stored).toBeNull();
  });
  test('background-style flush cancels debounce and commits latest input once; draft remains until close', async () => {
    session = createMemoDraftSession(initial(), persistence); await session.initialize(); session.change('body', '后台前输入');
    await session.flush(); await jest.advanceTimersByTimeAsync(1000);
    expect(saves).toHaveLength(1); expect(stored.value.body).toBe('后台前输入'); expect(session.getSnapshot().status).toBe('已保存到本机');
  });
  test('concurrent close is serialized and failures keep exact input plus its old base', async () => {
    session = createMemoDraftSession(initial(), { ...persistence, save: async () => { throw new Error('SOURCE_CHANGED'); } });
    await session.initialize(); session.change('body', ' 当前输入\r\n');
    const finish = session.finish(); expect(session.finish()).toBe(finish);
    await expect(finish).rejects.toThrow('SOURCE_CHANGED'); await session.keepDraft();
    expect(stored.value.body).toBe(' 当前输入\r\n'); expect(stored.base.body).toBe('原文'); expect(stored.revision).toBe(1);
    expect(canonical.value.body).toBe('原文');
  });
  test('legacy draft decoder preserves raw text and rejects unsupported content rather than truncating it', () => {
    const row = { title: ' 标题 ', body: '正文\r\n', group_id: null, base_revision: null, base_content: null };
    expect(decodeMemoDraft(row, initial())).toEqual({ ...initial(), value: { title: ' 标题 ', body: '正文\r\n', groupId: null } });
    expect(() => decodeMemoDraft({ ...row, body: 'x'.repeat(100001) }, initial())).toThrow('INVALID_DRAFT');
  });
});
