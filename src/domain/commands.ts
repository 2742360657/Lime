import { z } from 'zod';
import { memoCommandSchemas } from '../memos/commands';
import { gradeCommandSchemas } from '../grades/commands';

export const identifier = z.string().trim().min(1).max(160);
export const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const documentRefsSchema = z.array(z.strictObject({ id: identifier, revision, kind: z.literal('attachment').optional() })).max(4);
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function dateKeyAt(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const dateKey = z.string().refine(isDateKey);
const timestamp = z.number().int().min(0).max(253402214400000);
const reminderFields = {
  title: z.string().trim().min(1).max(100), note: z.string().trim().max(300).default(''),
  mode: z.enum(['once', 'annual']), dateKey: dateKey.nullable().default(null),
  monthDay: z.string().regex(/^\d{2}-\d{2}$/).nullable().default(null),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  advanceDays: z.number().int().min(0).max(30).default(0), dayOf: z.boolean().default(true),
  enabled: z.boolean().default(true),
};
const taskFields = {
  title: z.string().trim().min(1).max(80), note: z.string().trim().max(300).default(''),
  dueDateKey: dateKey.nullable().default(null),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
};
export const commandSchema = z.discriminatedUnion('type', [
  ...memoCommandSchemas,
  ...gradeCommandSchemas,
  z.strictObject({ type: z.literal('reminder.create'), ...reminderFields }),
  z.strictObject({ type: z.literal('reminder.update'), id: identifier, expectedRevision: revision, ...reminderFields }),
  z.strictObject({ type: z.literal('reminder.cancel'), id: identifier, expectedRevision: revision }),
  z.strictObject({ type: z.literal('task.create'), ...taskFields }),
  z.strictObject({ type: z.literal('task.update'), id: identifier, expectedRevision: revision, ...taskFields }),
  z.strictObject({ type: z.literal('task.complete'), id: identifier, expectedRevision: revision, completed: z.boolean() }),
  z.strictObject({ type: z.literal('task.trash'), id: identifier, expectedRevision: revision }),
  z.strictObject({ type: z.literal('habit.checkin'), id: identifier, expectedRevision: revision,
    timestamp: timestamp.optional(), dateKey: dateKey.optional(), note: z.string().trim().max(300).default('') }),
  z.strictObject({ type: z.literal('memory.remember'), kind: z.enum(['fact', 'preference']),
    key: z.string().trim().min(1).max(100).transform(s => s.normalize('NFC').toLowerCase()),
    content: z.string().trim().min(1).max(2000) }),
  z.strictObject({ type: z.literal('memory.correct'), id: identifier, expectedRevision: revision,
    content: z.string().trim().min(1).max(2000) }),
  z.strictObject({ type: z.literal('memory.forget'), id: identifier, expectedRevision: revision }),
  z.strictObject({ type: z.literal('activity.start'), kind: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(100), note: z.string().trim().max(2000).default(''), habitId: identifier.nullable().default(null) }),
  z.strictObject({ type: z.literal('activity.complete'), id: identifier, expectedRevision: revision,
    note: z.string().trim().max(300).default('') }),
  z.strictObject({ type: z.literal('activity.cancel'), id: identifier, expectedRevision: revision }),
]).superRefine((command, ctx) => {
  if (command.type === 'reminder.create' || command.type === 'reminder.update') {
    if ((command.mode === 'once' && (!command.dateKey || command.monthDay !== null || command.advanceDays !== 0 || !command.dayOf)) ||
      (command.mode === 'annual' && (command.dateKey !== null || !command.monthDay || !isDateKey(`2000-${command.monthDay}`) || (!command.dayOf && command.advanceDays === 0))))
      ctx.addIssue({ code: 'custom', message: 'Invalid reminder recurrence', path: ['mode'] });
  }
  if ((command.type === 'task.create' || command.type === 'task.update') && command.dueTime && !command.dueDateKey)
    ctx.addIssue({ code: 'custom', message: 'A time requires a date', path: ['dueTime'] });
  if (command.type === 'habit.checkin' && command.dateKey && command.timestamp !== undefined && dateKeyAt(command.timestamp) !== command.dateKey)
    ctx.addIssue({ code: 'custom', message: 'Date and local timestamp differ', path: ['dateKey'] });
});
export type Command = z.infer<typeof commandSchema>;

// Stable ordering avoids treating harmless argument-key ordering as a new operation.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
