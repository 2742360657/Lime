import type { DomainDatabase } from '../domain/types';
import { NOTIFICATION_PREFIX, planReminders, type Occurrence, type ReminderRow, type ReminderTask } from './planner';

export type NotificationDriver = {
  allowed(): Promise<boolean>;
  pending(): Promise<string[]>;
  cancel(id: string): Promise<void>;
  schedule(id: string, occurrence: Occurrence): Promise<void>;
};
export type ReminderStatus = { busy: boolean; enabled: boolean; allowed: boolean; scheduled: number; deferred: number; farther: number; error: string | null };
const EMPTY: ReminderStatus = { busy: false, enabled: false, allowed: false, scheduled: 0, deferred: 0, farther: 0, error: null };

export function createReminderService(db: DomainDatabase, driver: NotificationDriver, deps: { now(): number; digest(value: string): Promise<string> }) {
  let state = EMPTY, tail: Promise<void> | null = null, dirty = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ReminderStatus>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  async function reconcile() {
    const snapshot = await db.readTransaction(async tx => ({
      meta: await tx.getAll<{ id: string; value: string }>("SELECT id,value FROM local_meta WHERE id IN ('reminders-enabled','reminders-tasks')"),
      rules: await tx.getAll<ReminderRow>('SELECT * FROM local_reminder_rules'),
      tasks: await tx.getAll<ReminderTask>('SELECT * FROM tasks'),
    }));
    const enabled = snapshot.meta.some(m => m.id === 'reminders-enabled' && m.value === '1');
    const taskEnabled = snapshot.meta.some(m => m.id === 'reminders-tasks' && m.value === '1');
    const allowed = enabled && await driver.allowed();
    const plan = planReminders(snapshot.rules, snapshot.tasks, taskEnabled, deps.now());
    const desired = new Map<string, Occurrence>();
    if (allowed) for (const occurrence of plan.occurrences) desired.set(NOTIFICATION_PREFIX + await deps.digest(occurrence.key), occurrence);
    const pending = new Set((await driver.pending()).filter(id => id.startsWith(NOTIFICATION_PREFIX)));
    // A failure to cancel must abort this reconciliation, rather than report a successful replacement.
    for (const id of pending) if (!desired.has(id)) { await driver.cancel(id); pending.delete(id); }
    await db.writeTransaction(async tx => {
      const previous = await tx.getAll<{ id: string; scheduled_at: number; status: string }>('SELECT id,scheduled_at,status FROM local_reminder_instances');
      for (const instance of previous) if (!desired.has(instance.id) && ['planned', 'scheduled', 'error', 'blocked'].includes(instance.status))
        await tx.execute('UPDATE local_reminder_instances SET status=?,updated_at=? WHERE id=?', [instance.scheduled_at <= deps.now() ? 'elapsed' : 'cancelled', deps.now(), instance.id]);
    });
    let scheduled = 0;
    for (const [id, occurrence] of desired) {
      if (dirty) return; // A record changed during network/native calls; restart with fresh versions.
      const values = [occurrence.sourceKind, occurrence.sourceId, occurrence.sourceRevision, occurrence.at, occurrence.title, occurrence.body];
      await db.writeTransaction(tx => tx.execute('INSERT OR REPLACE INTO local_reminder_instances(id,source_kind,source_id,source_revision,scheduled_at,title,body,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [id, ...values, 'planned', deps.now()]));
      if (occurrence.at <= deps.now()) {
        await db.writeTransaction(tx => tx.execute("UPDATE local_reminder_instances SET status='elapsed',updated_at=? WHERE id=?", [deps.now(), id]));
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
    publish({ enabled, allowed: !!allowed, scheduled, deferred: plan.deferred, farther: plan.farther, error: null });
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
