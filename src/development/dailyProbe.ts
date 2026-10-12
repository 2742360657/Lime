import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { createDomain } from '../domain/service';
import { createAgentStore } from '../agent/store';
import { createDailyService, DailyError } from '../daily/service';
import { createUiRetry } from '../domain/uiRetry';
import { shanghaiDate } from '../reminders/planner';
import { DomainError } from '../domain/types';

// One random local-only database, no singleton ordinary database or native material access.
// All content, requests and IDs below are synthetic; this probe never calls a model.
export async function runDailyProbe() {
  if (!__DEV__) throw new Error('Development only');
  const filename = `lime-dev-daily-${Crypto.randomUUID()}.sqlite`;
  let db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
  let tick = Date.parse('2026-10-11T12:00:00+08:00'), phase = 'database', passed = false;
  const flags: Record<string, boolean> = {};
  const deps = {
    id: () => Crypto.randomUUID(), now: () => ++tick,
    digest: (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
  };
  const ui = { actor: 'ui' as const };
  const ensure = (value: unknown) => { if (!value) throw new Error('Synthetic daily check failed'); };
  const rejects = async (action: () => Promise<unknown>, code: string) => {
    try { await action(); return false; }
    catch (error) { return (error instanceof DomainError || error instanceof DailyError) && error.code === code; }
  };
  try {
    await db.init();
    ensure((await db.getUploadQueueStats()).count === 0);
    let domain = createDomain(db, deps), daily = createDailyService(db, deps);
    const agent = createAgentStore(db, deps), groupOld = deps.id(), groupNew = deps.id();
    await db.writeTransaction(async tx => {
      for (const [id, name, order] of [[groupOld, '合成旧分类', 0], [groupNew, '合成新分类', 1]] as const)
        await tx.execute("INSERT INTO document_groups(id,kind,name,sort_order,created_at,revision,deleted,updated_at) VALUES(?,'memo',?,?,?,1,0,?)", [id, name, order, tick, new Date(tick).toISOString()]);
    });

    phase = 'memo-authorization';
    const memo = await domain.execute({ type: 'memo.create', title: '合成原始标题', body: ' 原始合成正文\r\n', groupId: groupOld }, { ...ui, operationId: deps.id() });
    const session = await agent.newSession(), ref = { id: memo.entity.id, revision: 1 };
    const request = await agent.begin(session, '合成选择备忘录修改，不调用模型。', [ref]);
    const change = { type: 'memo.update' as const, id: memo.entity.id, expectedRevision: 1, title: '合成修改标题', body: ' 修改后的合成正文\r\n', groupId: groupOld };
    ensure(await rejects(() => domain.propose(change, { proposalId: deps.id(), requestId: request.id }), 'PERMISSION_DENIED'));
    ensure(await rejects(() => domain.readDocument(ref, { actor: 'agent', documentRefs: [] }), 'PERMISSION_DENIED'));
    flags.memoUnselectedDenied = true;
    await db.execute("INSERT INTO local_drafts(id,document_id,kind,title,body,date,group_id,base_revision,base_content) VALUES(?,?,'memo','合成草稿标题','合成未提交草稿','2026-10-11',?,1,?)", [memo.entity.id, memo.entity.id, groupOld, JSON.stringify({ title: '合成原始标题', body: ' 原始合成正文\r\n', date: '2026-10-11', group_id: groupOld })]);
    const proposal = await domain.propose(change, { proposalId: deps.id(), requestId: request.id, documentRefs: [ref] });
    ensure((await db.get<{ body: string }>('SELECT body FROM documents WHERE id=?', [memo.entity.id])).body === ' 原始合成正文\r\n');
    const updated = await domain.acceptProposal(proposal.id, 1, { ...ui, operationId: deps.id() });
    const replay = await domain.acceptProposal(proposal.id, 1, { ...ui, operationId: deps.id() });
    ensure(updated.entity.kind === 'memo' && updated.entity.revision === 2 && replay.disposition === 'replayed');
    const savedMemo = await db.get<{ body: string; revision: number }>('SELECT body,revision FROM documents WHERE id=?', [memo.entity.id]);
    const savedDraft = await db.get<{ body: string; base_revision: number }>('SELECT body,base_revision FROM local_drafts WHERE id=?', [memo.entity.id]);
    const savedSource = await db.get<{ body: string; revision: number }>('SELECT body,revision FROM local_agent_sources WHERE request_id=?', [request.id]);
    ensure(savedMemo.body === change.body && savedMemo.revision === 2);
    ensure(savedDraft.body === '合成未提交草稿' && savedDraft.base_revision === 1);
    ensure(savedSource.body === ' 原始合成正文\r\n' && savedSource.revision === 1);
    ensure(!JSON.stringify(await domain.listMemos()).includes(change.body));
    flags.memoSelectedProposal = true; flags.memoDraftPreserved = true; flags.memoHistoricalSource = true; flags.memoMetadataPrivate = true;
    await agent.finish(request.id, '合成请求已结束；没有模型调用。', 'complete', null);

    phase = 'generic-records';
    const record = await domain.execute({type:'record.create',typeKey:'合成广泛资料',schemaKey:'table',title:'合成数值表',body:'同一模型存任意领域',tags:['合成范围'],occurredAt:tick,payload:{columns:[{key:'value',label:'数值',kind:'decimal',unit:''},{key:'weight',label:'权重',kind:'decimal',unit:''}],rows:[{value:'188.33',weight:'1.25'},{value:'199.01',weight:'2.75'}]}},{...ui,operationId:deps.id()});
    const recordRef={id:record.entity.id,revision:1,kind:'record' as const};
    const metadata=await domain.listRecords({typeKey:'合成广泛资料',tag:'合成范围',from:tick-100,through:tick+100});
    ensure(metadata.matched===1 && !JSON.stringify(metadata).includes('188.33'));
    ensure(await rejects(()=>domain.readDocument(recordRef,{actor:'agent',documentRefs:[]}), 'PERMISSION_DENIED'));
    const tableAverage=await domain.calculateRecords([recordRef],{column:'value',operation:'average'},{actor:'agent',documentRefs:[recordRef]});
    const weighted=await domain.calculateRecords([recordRef],{column:'value',operation:'weightedAverage',weightColumn:'weight'},{actor:'agent',documentRefs:[recordRef]});
    ensure(tableAverage.value==='193.67' && weighted.value==='195.67');
    flags.recordGenericPayload=true;flags.recordMetadataPrivate=true;flags.recordSelectedCalculation=true;

    phase = 'training';
    const habit = deps.id();
    await db.execute("INSERT INTO habits(id,name,group_id,cadence,target_count,sort_order,created_at,archived_at,revision,deleted,updated_at) VALUES(?,'合成训练习惯',NULL,'weekly',3,0,?,NULL,1,0,?)", [habit, tick, new Date(tick).toISOString()]);
    const activity = await domain.execute({ type: 'activity.start', kind: 'training', title: '合成完成训练', habitId: habit }, { ...ui, operationId: deps.id() });
    const finish = { type: 'activity.complete', id: activity.entity.id, expectedRevision: 1, note: '合成完成感受' }, finishId = deps.id();
    const finished = await domain.execute(finish, { ...ui, operationId: finishId });
    ensure(finished.related?.kind === 'checkin');
    ensure((await domain.execute(finish, { ...ui, operationId: finishId })).disposition === 'replayed');
    ensure(await rejects(() => domain.execute(finish, { ...ui, operationId: deps.id() }), 'ACTIVITY_CLOSED'));
    const cancelled = await domain.execute({ type: 'activity.start', kind: 'training', title: '合成取消训练', habitId: habit }, { ...ui, operationId: deps.id() });
    await domain.execute({ type: 'activity.cancel', id: cancelled.entity.id, expectedRevision: 1 }, { ...ui, operationId: deps.id() });
    await domain.execute({ type: 'activity.start', kind: 'training', title: '合成待完成训练', habitId: habit }, { ...ui, operationId: deps.id() });
    const history = await daily.readTrainingHistory({ from: '2026-10-11', through: '2026-10-11', kind: 'training', habitId: habit, limit: 2 });
    ensure(history.statusCounts.active === 1 && history.statusCounts.completed === 1 && history.statusCounts.cancelled === 1);
    ensure(history.activityCoverage.matched === 3 && history.activityCoverage.returned === 2 && history.activityCoverage.truncated);
    ensure(history.checkinCoverage.matched === 1 && history.checkins.length === 1 && history.checkins[0].linked_activities === 1);
    ensure((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM checkins')).n === 1);
    flags.activityCompletionReplay = true; flags.singleCheckin = true; flags.trainingCounts = true; flags.trainingCoverage = true;

    phase = 'offline-memory-search';
    const oldMemory = deps.id();
    await db.writeTransaction(async tx => {
      await tx.execute("INSERT INTO local_memories(id,kind,key,content,forgotten,revision,created_at,updated_at) VALUES(?,'preference','合成旧偏好','不喝合成咖啡',0,1,?,?)", [oldMemory, tick, '2026-01-01T00:00:00.000Z']);
      for (let i = 0; i < 105; i++) await tx.execute("INSERT INTO local_memories(id,kind,key,content,forgotten,revision,created_at,updated_at) VALUES(?,'fact',?,'合成分页内容',0,1,?,?)", [`synthetic-memory-${String(i).padStart(3, '0')}`, '合成分页' + i, tick, new Date(tick).toISOString()]);
    });
    ensure(!(await domain.listMemories({ limit: 100 })).some(row => row.id === oldMemory));
    const oldPage = await domain.queryMemories({ query: '咖啡', kind: 'preference' });
    ensure(oldPage.matched === 1 && oldPage.records[0].id === oldMemory && !oldPage.nextCursor);
    const page1 = await domain.queryMemories({ query: '合成分页', limit: 40 });
    const page2 = await domain.queryMemories({ query: '合成分页', limit: 40, cursor: page1.nextCursor });
    const page3 = await domain.queryMemories({ query: '合成分页', limit: 40, cursor: page2.nextCursor });
    ensure(page1.matched === 105 && page2.remaining === 65 && page3.remaining === 25 && !page3.nextCursor);
    ensure(new Set([...page1.records, ...page2.records, ...page3.records].map(row => row.id)).size === 105);
    flags.memoryOlderSearch = true; flags.memoryStablePages = true;
    for (const keyword of ['%', '_', '\\']) {
      const receipt = await domain.execute({ type: 'memory.remember', kind: 'fact', key: '合成字面' + keyword, content: '合成边界字符' }, { ...ui, operationId: deps.id() });
      const page = await domain.queryMemories({ query: keyword });
      ensure(page.matched === 1 && page.records[0].id === receipt.entity.id);
    }
    flags.memoryLiteralKeywords = true;
    await domain.execute({ type: 'memory.forget', id: oldMemory, expectedRevision: 1 }, { ...ui, operationId: deps.id() });
    ensure((await domain.queryMemories({ query: '咖啡' })).matched === 0);
    ensure((await db.get<{ content: string; forgotten: number }>('SELECT content,forgotten FROM local_memories WHERE id=?', [oldMemory])).content === '');
    flags.memoryForgottenExcluded = true;

    phase = 'offline-activity-pages';
    const all1 = await domain.queryActivities({ status: 'all', limit: 2 });
    const all2 = await domain.queryActivities({ status: 'all', limit: 2, cursor: all1.nextCursor });
    ensure(all1.matched === 3 && all2.remaining === 1 && new Set([...all1.records, ...all2.records].map(row => row.id)).size === 3);
    ensure((await domain.queryActivities({ status: 'completed' })).records[0].checkin_state === 'linked');
    flags.activityStablePages = true;
    const uiRetry = createUiRetry(deps.id), plan = { type: 'activity.start' as const, kind: '合成午夜', title: '合成_%活动', note: '', habitId: habit };
    const lostResponse = await domain.execute(plan, { ...ui, operationId: uiRetry.operation(plan) });
    const retried = await domain.execute(plan, { ...ui, operationId: uiRetry.operation({ ...plan }) });
    ensure(retried.disposition === 'replayed' && retried.entity.id === lostResponse.entity.id);
    ensure((await domain.queryActivities({ query: '_%' })).matched === 1);
    uiRetry.committed();
    tick = Date.parse('2026-10-11T16:30:00Z');
    const close = { type: 'activity.complete' as const, id: lostResponse.entity.id, expectedRevision: 1, note: '合成午夜完成' };
    const midnight = await domain.execute(close, { ...ui, operationId: uiRetry.operation(close) });
    ensure((await domain.execute(close, { ...ui, operationId: uiRetry.operation(close) })).disposition === 'replayed');
    const checkin = await db.get<{ date_key: string }>('SELECT date_key FROM checkins WHERE id=?', [midnight.related!.id]);
    ensure(checkin.date_key === '2026-10-12' && checkin.date_key === shanghaiDate(tick));
    ensure((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM checkins')).n === 2);
    flags.uiRetryReplay = true; flags.shanghaiCompletionDate = true;

    phase = 'organization-preview-guard';
    const createMemo = (title: string) => domain.execute({ type: 'memo.create', title, body: '合成整理正文保持原样', groupId: groupOld }, { ...ui, operationId: deps.id() });
    const left = await createMemo('合成守卫甲'), right = await createMemo('合成守卫乙'), staleBatch = deps.id();
    await daily.previewOrganization({ type: 'memo.move', groupId: groupNew, targets: [left, right].map(receipt => ({ id: receipt.entity.id, expectedRevision: 1 })) }, { ...ui, batchId: staleBatch });
    ensure((await db.get<{ group_id: string }>('SELECT group_id FROM documents WHERE id=?', [left.entity.id])).group_id === groupOld);
    await db.execute('UPDATE documents SET body=? WHERE id=?', ['合成稍后修改，不增版本也须识别', right.entity.id]);
    ensure(await rejects(() => daily.confirmOrganization(staleBatch, 1, ui), 'VERSION_CONFLICT'));
    ensure((await db.get<{ group_id: string }>('SELECT group_id FROM documents WHERE id=?', [left.entity.id])).group_id === groupOld);
    ensure((await db.get<{ body: string }>('SELECT body FROM documents WHERE id=?', [right.entity.id])).body === '合成稍后修改，不增版本也须识别');
    flags.organizationPreview = true; flags.organizationVersionGuard = true;

    phase = 'organization-undo';
    const movable = await createMemo('合成可撤销备忘录'), moveBatch = deps.id();
    await daily.previewOrganization({ type: 'memo.move', groupId: groupNew, targets: [{ id: movable.entity.id, expectedRevision: 1 }] }, { ...ui, batchId: moveBatch });
    ensure((await daily.confirmOrganization(moveBatch, 1, ui)).changed === 1);
    ensure((await db.get<{ group_id: string }>('SELECT group_id FROM documents WHERE id=?', [movable.entity.id])).group_id === groupNew);
    await daily.undoOrganization(moveBatch, 2, ui);
    const reverted = await db.get<{ group_id: string; body: string; revision: number }>('SELECT group_id,body,revision FROM documents WHERE id=?', [movable.entity.id]);
    ensure(reverted.group_id === groupOld && reverted.body === '合成整理正文保持原样' && reverted.revision === 3);
    flags.organizationConfirm = true; flags.organizationUndo = true;

    phase = 'organization-reopen';
    const task = await domain.execute({ type: 'task.create', title: '合成重开后恢复待办', note: '合成原备注' }, { ...ui, operationId: deps.id() }), taskBatch = deps.id();
    await daily.previewOrganization({ type: 'task.trash', targets: [{ id: task.entity.id, expectedRevision: 1 }] }, { ...ui, batchId: taskBatch });
    await daily.confirmOrganization(taskBatch, 1, ui);
    await db.close();
    db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
    await db.init(); domain = createDomain(db, deps); daily = createDailyService(db, deps);
    ensure((await daily.getOrganizationBatch(taskBatch)).status === 'applied');
    await daily.undoOrganization(taskBatch, 2, ui);
    ensure((await daily.undoOrganization(taskBatch, 2, ui)).replayed);
    const restored = await db.get<{ deleted: number; revision: number; note: string }>('SELECT deleted,revision,note FROM tasks WHERE id=?', [task.entity.id]);
    ensure(restored.deleted === 0 && restored.revision === 3 && restored.note === '合成原备注');
    ensure((await domain.execute(finish, { ...ui, operationId: finishId })).disposition === 'replayed');
    ensure((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM checkins')).n === 2);
    flags.organizationReopenUndo = true; flags.reopenReceiptReplay = true;
    phase = 'queue'; ensure((await db.getUploadQueueStats()).count === 0); flags.localQueueZero = true;
    phase = 'complete'; passed = true;
  } catch {
    passed = false;
  } finally {
    let cleaned = true;
    try { await db.close(); } catch { cleaned = false; }
    for (const suffix of ['', '-wal', '-shm']) {
      try { const file = new File(`file://${ANDROID_DATABASE_PATH}/${filename}${suffix}`); if (file.exists) file.delete(); if (file.exists) cleaned = false; }
      catch { cleaned = false; }
    }
    flags.isolatedDatabaseCleaned = cleaned;
    if (!cleaned) { passed = false; phase = 'cleanup'; }
    const result = { batch: 'offline-management', status: passed ? 'passed' : 'failed', phase, syntheticOnly: true, ordinaryDatabaseAccessed: false, modelCalls: 0, localQueue: flags.localQueueZero ? 0 : null, flags };
    new File(Paths.document, 'lime-p5-daily-probe.json').write(JSON.stringify(result));
  }
  if (!passed) throw new Error('Synthetic daily probe failed');
  return { status: 'passed', flags };
}
