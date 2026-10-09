import { PowerSyncDatabase } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { migrateLocalDatabase, LOCAL_MIGRATION_KEY } from '../storage/localMigration';

// Synthetic, isolated databases only. No application records, credentials or server access.
export async function runLocalMigrationProbe() {
  const nonce = Crypto.randomUUID();
  const sourceName = `lime-dev-source-${nonce}.sqlite`, targetName = `lime-dev-target-${nonce}.sqlite`;
  const source = new PowerSyncDatabase({ schema: createDatabaseSchema(false), database: { dbFilename: sourceName } });
  const target = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: targetName } });
  let sourceClosed = false, targetClosed = false;
  const ensure = (value: unknown, label: string) => { if (!value) throw new Error(`合成验证失败：${label}`); };
  try {
    await source.init(); await target.init();
    await source.writeTransaction(async tx => {
      for (let n = 0; n < 205; n++) await tx.execute('INSERT INTO documents(id,kind,title,body,date,revision,deleted) VALUES(?,?,?,?,?,?,?)', [`fixture-${String(n).padStart(4, '0')}`, 'diary', '合成日记', `原文 ${n}`, '2026-10-09', 2, 0]);
      await tx.execute('INSERT INTO habits(id,name,target_count,revision,deleted) VALUES(?,?,?,?,?)', ['habit', '合成习惯', 1, 1, 0]);
      await tx.execute('INSERT INTO checkins(id,habit_id,note,revision,deleted) VALUES(?,?,?,?,?)', ['checkin', 'habit', '合成感受', 1, 0]);
      await tx.execute('INSERT INTO tasks(id,title,status,revision,deleted) VALUES(?,?,?,?,?)', ['task', '合成待办', 'open', 1, 0]);
      await tx.execute('INSERT INTO local_drafts(id,document_id,kind,body,base_revision) VALUES(?,?,?,?,?)', ['draft', 'fixture-0000', 'diary', '合成草稿', 2]);
      await tx.execute('INSERT INTO local_meta(id,value) VALUES(?,?)', ['business-import-v1', '1']);
    });
    const sourceQueue = (await source.getUploadQueueStats()).count;
    ensure(sourceQueue > 0, '同步表未connect仍产生队列');
    await migrateLocalDatabase(target, source);
    ensure((await target.get<{ n: number }>('SELECT count(*) AS n FROM documents')).n === 205, '分页记录搬运');
    ensure((await target.get<{ body: string }>('SELECT body FROM local_drafts WHERE id=?', ['draft'])).body === '合成草稿', '草稿');
    ensure((await target.getUploadQueueStats()).count === 0, '迁移后没有上传队列');
    await target.execute('UPDATE tasks SET title=?,revision=revision+1 WHERE id=?', ['新的本地内容', 'task']);
    await migrateLocalDatabase(target, source);
    ensure((await target.get<{ title: string }>('SELECT title FROM tasks WHERE id=?', ['task'])).title === '新的本地内容', '不重新导入旧库');
    ensure((await target.getUploadQueueStats()).count === 0, '后续本地写入没有队列');
    await source.close(); sourceClosed = true;
    await target.close(); targetClosed = true;
    const reopened = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: targetName } });
    try {
      await reopened.init();
      ensure((await reopened.get<{ title: string }>('SELECT title FROM tasks WHERE id=?', ['task'])).title === '新的本地内容', '关闭重开');
      ensure((await reopened.get<{ note: string }>('SELECT note FROM checkins WHERE id=?', ['checkin'])).note === '合成感受', '打卡');
      ensure(!!await reopened.getOptional('SELECT value FROM local_meta WHERE id=?', [LOCAL_MIGRATION_KEY]), '完成回执');
      ensure((await reopened.getUploadQueueStats()).count === 0, '重开仍没有队列');
    } finally { await reopened.close(); }
    const result = { status: 'passed', sourceName, targetName, sourceQueue, localQueue: 0, documents: 205, draft: true, checkin: true, reopen: true, repeatReceipt: true };
    new File(Paths.document, 'lime-p1-native-probe.json').write(JSON.stringify(result));
    console.info('[LimeP1Probe]', JSON.stringify(result));
    return result;
  } finally {
    if (!sourceClosed) await source.close();
    if (!targetClosed) await target.close();
  }
}
