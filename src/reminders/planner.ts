import { isDateKey } from '../domain/commands';

export const DAY = 86400000;
export const LATE_GRACE_MS = DAY;
export const WINDOW_DAYS = 400;
export const MAX_SCHEDULED = 128;
export const NOTIFICATION_PREFIX = 'lime-reminder-';
export type ReminderRow = { id: string; title: string; note: string; mode: 'once' | 'annual'; date_key: string | null; month_day: string | null; time: string; advance_days: number; day_of: number; enabled: number; revision: number };
export type ReminderTask = { id: string; title: string; due_date_key: string | null; due_time: string | null; status: string; deleted: number; revision: number };
export type Occurrence = { key: string; sourceKind: 'rule' | 'task'; sourceId: string; sourceRevision: number; at: number; title: string; body: string };

// Explicit Asia/Shanghai wall time. Device timezone must not silently move a birthday.
export function shanghaiTimestamp(date: string, time: string): number {
  if (!isDateKey(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  return Date.parse(`${date}T${time}:00+08:00`);
}
export function shanghaiDate(at: number) { return new Date(at + 8 * 3600000).toISOString().slice(0, 10); }
function collectOccurrences(rules: ReminderRow[], tasks: ReminderTask[], taskEnabled: boolean, after: number, end: number) {
  const occurrences: Occurrence[] = [];
  let farther = 0;
  function add(kind: Occurrence['sourceKind'], id: string, revision: number, at: number, title: string, body: string, suffix = '') {
    if (!Number.isFinite(at) || at <= after) return;
    if (at > end) { farther++; return; }
    occurrences.push({ key: JSON.stringify([kind, id, revision, at, suffix]), sourceKind: kind, sourceId: id, sourceRevision: revision, at, title, body });
  }
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.mode === 'once') add('rule', rule.id, rule.revision, shanghaiTimestamp(rule.date_key!, rule.time), rule.title, rule.note || '查看提醒');
    else {
      const year = Number(shanghaiDate(after).slice(0, 4));
      // Include the year after the rolling window: its advance reminder can cross the boundary.
      const throughYear = Number(shanghaiDate(end + 30 * DAY).slice(0, 4));
      for (let y = year; y <= throughYear; y++) {
        const date = `${y}-${rule.month_day}`;
        if (!isDateKey(date)) continue; // February 29 occurs only in leap years.
        const at = shanghaiTimestamp(date, rule.time);
        if (rule.day_of) add('rule', rule.id, rule.revision, at, rule.title, rule.note || '今天有一项年度提醒', 'day');
        if (rule.advance_days > 0) add('rule', rule.id, rule.revision, at - rule.advance_days * DAY, rule.title, `还有${rule.advance_days}天 · ${rule.note || '要不要提前准备？'}`, 'advance');
      }
    }
  }
  if (taskEnabled) for (const task of tasks) {
    if (task.deleted || task.status !== 'open' || !task.due_date_key) continue;
    add('task', task.id, task.revision, shanghaiTimestamp(task.due_date_key, task.due_time || '09:00'), task.title, '待办到期了，打开查看');
  }
  occurrences.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  return { occurrences, farther };
}
export function planReminders(rules: ReminderRow[], tasks: ReminderTask[], taskEnabled: boolean, now: number) {
  const { occurrences, farther } = collectOccurrences(rules, tasks, taskEnabled, now, now + WINDOW_DAYS * DAY);
  return { occurrences: occurrences.slice(0, MAX_SCHEDULED), deferred: Math.max(0, occurrences.length - MAX_SCHEDULED), farther };
}
// Candidates only: the service must also verify the persisted instance and actual OS queue.
// The exclusive lower bound expires a queued notification exactly at the 24-hour boundary.
export function findDelayedReminders(rules: ReminderRow[], tasks: ReminderTask[], taskEnabled: boolean, now: number) {
  return collectOccurrences(rules, tasks, taskEnabled, now - LATE_GRACE_MS, now).occurrences;
}
