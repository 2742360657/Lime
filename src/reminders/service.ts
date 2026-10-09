import type { DomainDatabase } from '../domain/types';
import { LATE_GRACE_MS, MAX_SCHEDULED, NOTIFICATION_PREFIX, findDelayedReminders, planReminders, type Occurrence, type ReminderRow, type ReminderTask } from './planner';

export type NotificationDriver = {
  allowed(): Promise<boolean>;
  pending(): Promise<string[]>;
  cancel(id: string): Promise<void>;
  schedule(id: string, occurrence: Occurrence): Promise<void>;
};
export type ReminderStatus = { busy: boolean; enabled: boolean; allowed: boolean; scheduled: number; delayed: number; deferred: number; farther: number; error: string | null };
type Instance = { id: string; source_kind: string; source_id: string; source_revision: number; scheduled_at: number; status: string };
const EMPTY: ReminderStatus = { busy: false, enabled: false, allowed: false, scheduled: 0, delayed: 0, deferred: 0, farther: 0, error: null };

export function createReminderService(db: DomainDatabase, driver: NotificationDriver, deps: { now(): number; digest(value: string): Promise<string> }) {
  let state = EMPTY, tail: Promise<void> | null = null, dirty = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ReminderStatus>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  async function reconcile() {
    const snapshot = await db.readTransaction(async tx => ({
      meta: await tx.getAll<{ id: string; value: string }>("SELECT id,value FROM local_meta WHERE id IN ('reminders-enabled','reminders-tasks')"),
      rules: await tx.getAll<ReminderRow>('SELECT * FROM local_reminder_rules'),
      tasks: await tx.getAll<ReminderTask>('SELECT * FROM tasks'),
      instances: await tx.getAll<Instance>('SELECT * FROM local_reminder_instances'),
    }));
    const enabled = snapshot.meta.some(m => m.id === 'reminders-enabled' && m.value === '1');
    const taskEnabled = snapshot.meta.some(m => m.id === 'reminders-tasks' && m.value === '1');
    const allowed = enabled && await driver.allowed();
    const now = deps.now();
    const plan = planReminders(snapshot.rules, snapshot.tasks, taskEnabled, now);
    const desired = new Map<string, Occurrence>();
    const pending = new Set((await driver.pending()).filter(id => id.startsWith(NOTIFICATION_PREFIX)));
    const previous = new Map(snapshot.instances.map(instance => [instance.id, instance]));
    let retained = 0;
    if (allowed) {
      for (const occurrence of findDelayedReminders(snapshot.rules, snapshot.tasks, taskEnabled, now)) {
        const id = NOTIFICATION_PREFIX + await deps.digest(occurrence.key), instance = previous.get(id);
        if (!pending.has(id) || !instance || !['planned', 'scheduled', 'delayed', 'error'].includes(instance.status)
          || instance.source_kind !== occurrence.sourceKind || instance.source_id !== occurrence.sourceId
          || instance.source_revision !== occurrence.sourceRevision || instance.scheduled_at !== occurrence.at) continue;
        // Existing valid notifications reserve slots; expired records alone never create a notification.
        if (retained < MAX_SCHEDULED) { desired.set(id, occurrence); retained++; }
      }
      for (const occurrence of plan.occurrences.slice(0, MAX_SCHEDULED - retained))
        desired.set(NOTIFICATION_PREFIX + await deps.digest(occurrence.key), occurrence);
    }
    // A failure to cancel must abort this reconciliation, rather than report a successful replacement.
    for (const id of pending) if (!desired.has(id)) { await driver.cancel(id); pending.delete(id); }
    await db.writeTransaction(async tx => {
      for (const instance of snapshot.instances) if (!desired.has(instance.id) && ['planned', 'scheduled', 'delayed', 'error', 'blocked'].includes(instance.status))
        await tx.execute('UPDATE local_reminder_instances SET status=?,updated_at=? WHERE id=?', [instance.scheduled_at <= deps.now() ? 'elapsed' : 'cancelled', deps.now(), instance.id]);
    });
    let scheduled = 0, delayed = 0;
    for (const [id, occurrence] of desired) {
      if (dirty) return; // A record changed during network/native calls; restart with fresh versions.
      const values = [occurrence.sourceKind, occurrence.sourceId, occurrence.sourceRevision, occurrence.at, occurrence.title, occurrence.body];
      await db.writeTransaction(tx => tx.execute('INSERT OR REPLACE INTO local_reminder_instances(id,source_kind,source_id,source_revision,scheduled_at,title,body,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [id, ...values, 'planned', deps.now()]));
      if (occurrence.at <= deps.now()) {
        if (pending.has(id) && deps.now() < occurrence.at + LATE_GRACE_MS) {
          await db.writeTransaction(tx => tx.execute("UPDATE local_reminder_instances SET status='delayed',updated_at=? WHERE id=?", [deps.now(), id]));
          delayed++;
        } else {
          if (pending.has(id)) await driver.cancel(id);
          await db.writeTransaction(tx => tx.execute("UPDATE local_reminder_instances SET status='elapsed',updated_at=? WHERE id=?", [deps.now(), id]));
        }
        continue;
      }
      try {
        if (!pending.has(id)) await driver.schedule(id, occurrence);
        // Stable ID + actual OS queue recovers a crash between this native call and the DB update.
        await db.writeTransaction(tx => tx.execute("UPDATE local_reminder_instances SET status='scheduled',updated_at=? WHERE id=?", [deps.now(), id]));
        scheduled++;
      } catch (error) {
        await db.writeTransaction(tx => tx.execute("UPDATE local_reminder_instances SET status='error',updated_at=? WHERE id=?", [deps.now(), id]));
        throw error;
      }
    }
    publish({ enabled, allowed: !!allowed, scheduled, delayed, deferred: plan.deferred + (allowed ? Math.max(0, plan.occurrences.length - (MAX_SCHEDULED - retained)) : 0), farther: plan.farther, error: null });
  }
  function refresh(): Promise<void> {
    dirty = true;
    if (!tail) {
      publish({ busy: true });
      tail = (async () => {
        try { while (dirty) { dirty = false; await reconcile(); } }
        catch { dirty = false; publish({ error: '提醒排程未完成，规则仍保留。请检查通知设置后重新核对。' }); }
        finally { tail = null; publish({ busy: false }); }
      })();
    }
    return tail;
  }
  return { refresh, getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async settings() {
      return db.readTransaction(async tx => ({
        enabled: (await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='reminders-enabled'"))?.value === '1',
        taskEnabled: (await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='reminders-tasks'"))?.value === '1',
      }));
    },
    async setSetting(key: 'enabled' | 'tasks', enabled: boolean) {
      await db.writeTransaction(tx => tx.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)', [`reminders-${key}`, enabled ? '1' : '0']));
      await refresh();
    },
  };
}
