import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { createDomain } from '../domain/service';
import { createAgentStore } from '../agent/store';
import { createDailyService, DailyError } from '../daily/service';
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
    const request = await agent.begin(session, '合成选择备忘录修改，不调用模型。', [ref], []);
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

    phase = 'grades';
    const grade = (course: string, score: string, credits: string | null, term = '合成2026秋') =>
      domain.execute({ type: 'grade.create', course, score, credits, term }, { ...ui, operationId: deps.id() });
    await grade('合成课程甲', '88.33', '1.25'); await grade('合成课程乙', '99.01', '2.75');
    const bounded = await domain.listGrades({ term: '合成2026秋', limit: 1 }), full = await domain.summarizeGrades({ term: '合成2026秋' });
    ensure(bounded.rows.length === 1 && bounded.matched === 2 && !bounded.complete);
    ensure(full.complete && full.matched === 2 && full.average === '93.67' && full.weightedAverage === '95.67');
    flags.gradeDecimal = true; flags.gradeFullRange = true;
    await grade('合成缺学分课程', '50.00', null, '合成缺学分');
    const missing = await domain.summarizeGrades({ term: '合成缺学分' });
    ensure(missing.complete && missing.average === '50.00' && missing.weightedAverage === null && 'missingCredits' in missing && missing.missingCredits === 1);
    ensure(await rejects(() => grade('合成课程甲', '70.00', '1.00'), 'ALREADY_EXISTS'));
    ensure(await rejects(() => grade('合成无效小数', '88.333', '1.00'), 'INVALID_ARGUMENT'));
    flags.gradeMissingCredits = true; flags.gradeDuplicateDenied = true;

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
    ensure((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM checkins')).n === 1);
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
    const result = { status: passed ? 'passed' : 'failed', phase, syntheticOnly: true, ordinaryDatabaseAccessed: false, modelCalls: 0, localQueue: flags.localQueueZero ? 0 : null, flags };
    new File(Paths.document, 'lime-p5-daily-probe.json').write(JSON.stringify(result));
  }
  if (!passed) throw new Error('Synthetic daily probe failed');
  return { status: 'passed', flags };
}
