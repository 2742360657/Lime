import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { createDomain } from '../domain/service';
import { createReminderService, type NotificationDriver } from '../reminders/service';
import { notificationDriver } from '../reminders/native';
import { NOTIFICATION_PREFIX, shanghaiDate } from '../reminders/planner';

export async function runReminderProbe() {
  if (!__DEV__) throw new Error('Development-only probe');
  const filename = `lime-dev-reminder-${Crypto.randomUUID()}.sqlite`;
  let db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } });
  const prefix = `lime-probe-${Crypto.randomUUID()}-`;
  const nativeId = (id: string) => id.replace(NOTIFICATION_PREFIX, prefix);
  // Real Android schedule/cancel APIs, isolated identifiers. No permission request or ordinary records.
  const driver: NotificationDriver = {
    allowed: async () => true,
    pending: async () => (await notificationDriver.pending()).filter(id => id.startsWith(prefix)).map(id => id.replace(prefix, NOTIFICATION_PREFIX)),
    cancel: id => notificationDriver.cancel(nativeId(id)),
    schedule: (id, occurrence) => notificationDriver.schedule(nativeId(id), occurrence),
  };
  const deps = { id: Crypto.randomUUID, now: Date.now, digest: (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value) };
  const ensure = (value: unknown) => { if (!value) throw new Error('Synthetic reminder check failed'); };
  try {
    await db.init(); let domain = createDomain(db, deps), service = createReminderService(db, driver, deps);
    const command = { type: 'reminder.create', title: '合成提醒原生探针', mode: 'once', dateKey: shanghaiDate(Date.now() + 86400000), time: '09:00' };
    const operationId = Crypto.randomUUID(), created = await domain.execute(command, { actor: 'ui', operationId });
    ensure((await domain.execute(command, { actor: 'ui', operationId })).entity.id === created.entity.id);
    await service.setSetting('enabled', true); ensure(!service.getSnapshot().error && (await driver.pending()).length === 1);
    const first = (await driver.pending())[0];
    await db.close(); db = new PowerSyncDatabase({ schema: createDatabaseSchema(), database: { dbFilename: filename } }); await db.init();
    domain = createDomain(db, deps); service = createReminderService(db, driver, deps);
    ensure((await domain.listReminders()).length === 1); await service.refresh(); ensure((await driver.pending())[0] === first && (await driver.pending()).length === 1);
    await domain.execute({ ...command, type: 'reminder.update', id: created.entity.id, expectedRevision: 1, time: '10:30' }, { actor: 'ui', operationId: Crypto.randomUUID() });
    await service.refresh(); ensure(!service.getSnapshot().error && (await driver.pending()).length === 1 && (await driver.pending())[0] !== first);
    await domain.execute({ type: 'reminder.cancel', id: created.entity.id, expectedRevision: 2 }, { actor: 'ui', operationId: Crypto.randomUUID() });
    await service.refresh(); ensure(!service.getSnapshot().error && (await driver.pending()).length === 0);
    ensure((await domain.listReminders())[0].revision === 3);
    const queue = await db.getUploadQueueStats(); ensure(queue.count === 0);
    new File(Paths.document, 'lime-p4-reminder-probe.json').write(JSON.stringify({ status: 'passed', localQueue: queue.count, nativeSchedule: true, reopenedOnce: true, replaceOld: true, cancel: true, softRule: true, permissionRequested: false, deliveryTested: false }));
  } finally {
    for (const id of await notificationDriver.pending()) if (id.startsWith(prefix)) await notificationDriver.cancel(id);
    try { await db.close(); } catch {}
    for (const suffix of ['', '-wal', '-shm']) { try { const file = new File(`file://${ANDROID_DATABASE_PATH}/${filename}${suffix}`); if (file.exists) file.delete(); } catch {} }
  }
}
