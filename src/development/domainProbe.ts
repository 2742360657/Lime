import { PowerSyncDatabase } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { createDomain } from '../domain/service';
import { DomainError, type DomainDatabase } from '../domain/types';

// Separate synthetic database. Never reads the application's records or credentials.
export async function runDomainProbe() {
  const filename = `lime-dev-domain-${Crypto.randomUUID()}.sqlite`;
  let db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
  let failReceipt = false;
  function service() {
    const adapter: DomainDatabase = {
      readTransaction: fn => db.readTransaction(tx => fn(tx)),
      writeTransaction: fn => db.writeTransaction(tx => fn({
        getOptional: (sql, args) => tx.getOptional(sql, args), getAll: (sql, args) => tx.getAll(sql, args),
        execute: (sql, args) => {
          if (failReceipt && sql.startsWith('INSERT INTO local_operations')) throw new Error('Synthetic interruption');
          return tx.execute(sql, args);
        },
      })),
    };
    return createDomain(adapter, { id: () => Crypto.randomUUID(), now: () => Date.now(), digest: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text) });
  }
  const ensure = (value: unknown) => { if (!value) throw new Error('Synthetic domain check failed'); };
  const ui = { actor: 'ui' as const };
  try {
    await db.init();
    await db.execute("INSERT INTO habits(id,name,cadence,target_count,sort_order,archived_at,revision,deleted) VALUES('synthetic-habit','合成训练','weekly',3,0,NULL,1,0)");
    let domain = service();
    const activity = await domain.execute({ type: 'activity.start', kind: 'training', title: '合成活动', habitId: 'synthetic-habit' }, { ...ui, operationId: 'start' });
    await domain.execute({ type: 'memory.remember', kind: 'preference', key: 'synthetic', content: '合成偏好' }, { ...ui, operationId: 'memory' });
    await domain.propose({ type: 'task.create', title: '合成候选待办' }, { proposalId: 'synthetic-proposal', requestId: 'synthetic-request' });
    ensure((await domain.listTasks()).length === 0);
    const task = await domain.acceptProposal('synthetic-proposal', 1, { ...ui, operationId: 'accept' });
    const repeated = await domain.acceptProposal('synthetic-proposal', 1, { ...ui, operationId: 'accept-again' });
    ensure(task.entity.id === repeated.entity.id && repeated.disposition === 'replayed');
    const finish = { type: 'activity.complete', id: activity.entity.id, expectedRevision: 1, note: '合成完成感受' };
    failReceipt = true;
    let failed = false;
    try { await domain.execute(finish, { ...ui, operationId: 'finish' }); } catch { failed = true; }
    ensure(failed && (await db.get<{ n: number }>('SELECT count(*) AS n FROM checkins')).n === 0);
    ensure((await domain.listActivities()).length === 1);
    failReceipt = false;
    // Full database close/open models a later session using durable activity state.
    await db.close();
    db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
    await db.init(); domain = service();
    ensure((await domain.listMemories()).length === 1 && (await domain.listActivities()).length === 1);
    const completed = await domain.execute(finish, { ...ui, operationId: 'finish' });
    ensure(completed.related?.kind === 'checkin');
    ensure((await domain.execute(finish, { ...ui, operationId: 'finish' })).disposition === 'replayed');
    let closed = false;
    try { await domain.execute(finish, { ...ui, operationId: 'different-finish' }); }
    catch (error) { closed = error instanceof DomainError && error.code === 'ACTIVITY_CLOSED'; }
    ensure(closed && (await db.get<{ n: number }>('SELECT count(*) AS n FROM checkins')).n === 1);
    ensure((await db.getUploadQueueStats()).count === 0);
    await db.close();
    db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
    await db.init(); domain = service();
    ensure((await domain.execute(finish, { ...ui, operationId: 'finish' })).disposition === 'replayed');
    ensure((await domain.listActivities({ status: 'completed' }))[0].completion_note === '合成完成感受');
    ensure((await domain.listTasks()).length === 1 && (await db.getUploadQueueStats()).count === 0);
    const result = { status: 'passed', atomicRollback: true, pendingReopen: true, completedReopen: true,
      explicitMemory: true, proposalAccept: true, replay: true, checkins: 1, localQueue: 0 };
    new File(Paths.document, 'lime-p2-domain-probe.json').write(JSON.stringify(result));
    console.info('[LimeP2DomainProbe]', JSON.stringify(result));
    return result;
  } finally { await db.close(); }
}
