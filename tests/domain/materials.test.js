const { randomUUID, createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createMaterialStore } = require('../../src/materials/store');
const { createDomain } = require('../../src/domain/service');
const { createAgentStore } = require('../../src/agent/store');
const { createAgentRuntime } = require('../../src/agent/runtime');
const deps = { id: randomUUID, now: Date.now, digest: text => Promise.resolve(createHash('sha256').update(text).digest('hex')) };
const copy = { name: 'synthetic.txt', uri: 'file:///synthetic/material.txt', hash: 'a'.repeat(64), size: 10, mime: 'text/plain' };
const analysis = { kind: 'text', body: '合成通知：明天交表。', images: [], pages: 0, status: 'ready', note: '合成正文。' };
function sse(delta, finish = 'stop') {
  const chunk = (delta, reason) => 'data: ' + JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: reason }] }) + '\n\n';
  return new Response(chunk(delta, null) + chunk({}, finish) + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
describe('local material storage and agent boundaries', () => {
  let db, materials, domain, store;
  beforeEach(() => { db = sqliteHarness(); materials = createMaterialStore(db, deps); domain = createDomain(db, deps); store = createAgentStore(db, deps); });
  afterEach(() => db.close());
  test('content dedup and import/staging receipts survive acknowledgement gap without duplicates', async () => {
    const first = await materials.save(copy, analysis), second = await materials.save({ ...copy, name: 'renamed.txt' }, analysis);
    expect(first.id).toBe(second.id);
    const outcome = { refs: [{ id: first.id, revision: 1, kind: 'attachment' }], errors: ['合成权限失败'] };
    db.failOn('INSERT OR REPLACE INTO local_meta');
    await expect(materials.stage('synthetic-batch', outcome)).rejects.toThrow();
    expect(await materials.receipt('synthetic-batch')).toBeNull(); expect(await materials.inbox()).toHaveLength(0);
    db.failOn(null); await materials.stage('synthetic-batch', outcome); await materials.stage('synthetic-batch', outcome);
    expect(await materials.inbox()).toHaveLength(1); expect(await materials.receipt('synthetic-batch')).toEqual(outcome);
    await materials.dismissInbox(['synthetic-batch']); expect(await materials.inbox()).toHaveLength(0); expect(await materials.receipt('synthetic-batch')).toEqual(outcome);
    expect(await materials.list()).toHaveLength(1);
  });
  test('unsupported originals cannot become model sources; revision and archive invalidate pending proposals', async () => {
    const original = await materials.save(copy, { ...analysis, status: 'unsupported', kind: 'unsupported', body: '' });
    const ref = { id: original.id, revision: 1, kind: 'attachment' };
    await expect(domain.readDocument(ref, { actor: 'agent', documentRefs: [] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(domain.readDocument(ref, { actor: 'agent', documentRefs: [ref] })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await materials.revise(original.id, 1, analysis);
    const source = { ...ref, revision: 2 };
    expect((await domain.readDocument(source, { actor: 'agent', documentRefs: [source] })).body).toBe(analysis.body);
    await expect(domain.readDocument(source, { actor: 'agent', documentRefs: [{ ...source, kind: undefined }] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const p = await domain.propose({ type: 'task.create', title: '合成待办' }, { proposalId: randomUUID(), requestId: randomUUID(), documentRefs: [source] });
    await materials.archive(original.id, 2);
    await expect(domain.acceptProposal(p.id, 1, { actor: 'ui', operationId: randomUUID() })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(await domain.listTasks()).toHaveLength(0); expect((await materials.get(original.id)).uri).toBe(copy.uri);
  });
  test('selected image uses actual SDK multimodal wire format, routine results commit and source context is not reused', async () => {
    const image = await materials.save({ ...copy, name: 'synthetic.png', hash: 'b'.repeat(64) }, { ...analysis, kind: 'image', body: '', images: [{ uri: 'file:///synthetic/visual.jpg', label: '截图' }] });
    const session = await store.newSession(), captured = []; let calls = 0;
    const runtime = createAgentRuntime({ ...deps, domain, store, key: async () => 'synthetic-not-a-real-key', materialImages: async refs => { expect(refs[0].id).toBe(image.id); return [{ id: image.id, label: '截图', data: 'AA==' }]; }, fetch: async (_url, init) => {
      captured.push(JSON.parse(init.body)); calls++;
      return calls === 1 ? sse({ tool_calls: [{ index: 0, id: 'synthetic-call', type: 'function', function: { name: 'change_record', arguments: JSON.stringify({ type: 'task.create', title: '合成截图事项' }) } }] }, 'tool_calls') : sse({ content: '已保存截图事项。' });
    } });
    await materials.saveDraft(session, [{ id: image.id, revision: 1, kind: 'attachment' }]);
    await runtime.start(session, '新建待办：处理截图', [{ id: image.id, revision: 1, kind: 'attachment' }]);
    const request = (await store.requests(session))[0], result = (await store.results(request.id))[0];
    expect(result.status).toBe('saved'); expect(await domain.listTasks()).toHaveLength(1); expect(await store.grants(request.id)).toHaveLength(1);
    const imageBlock = captured[0].messages.flatMap(m => Array.isArray(m.content) ? m.content : []).find(p => p.type === 'image_url');
    expect(imageBlock.image_url.url).toBe('data:image/jpeg;base64,AA=='); expect(JSON.stringify(captured[0])).not.toContain('file:///');
    expect(await materials.draft(session)).toHaveLength(0);
    expect(await domain.listTasks()).toHaveLength(1);
    await runtime.start(session, '你好');
    expect(JSON.stringify(captured.at(-1))).not.toContain('data:image/'); expect(JSON.stringify(captured.at(-1))).not.toContain('已保存截图事项。');
  });
  test('text correction prevents old request retry and stale selection from creating snapshots', async () => {
    const material = await materials.save(copy, analysis), session = await store.newSession(), ref = { id: material.id, revision: 1, kind: 'attachment' };
    const request = await store.begin(session, '概括材料', [ref]); await store.finish(request.id, '', 'error', '合成中断');
    await materials.revise(material.id, 1, { ...analysis, body: '经核对的新正文' });
    await expect(store.begin(session, '概括材料', [ref])).rejects.toThrow('引用已变化');
    const captured = [];
    const runtime = createAgentRuntime({ ...deps, store, domain, key: async () => 'synthetic', fetch: async (_u, init) => { captured.push(init); return sse({ content: '不应发送' }); } });
    await runtime.start(session, '', [], request.id); expect(captured).toHaveLength(0); expect((await store.request(request.id)).status).toBe('error');
    const snapshot = db.sql.prepare('SELECT body FROM local_agent_sources WHERE request_id=?').get(request.id); expect(snapshot.body).toBe(analysis.body);
  });
});
