import type { Command } from './commands';

// Product authority belongs to application code, never tool arguments or imported text.
// Natural language intent is interpreted by the assistant; no exact-phrase permission gate.
// Whole-body replacements, removals and cancellations retain concrete review and recovery.
const routineTypes = new Set<Command['type']>([
  'task.create', 'task.update', 'task.complete', 'habit.create', 'habit.update', 'habit.checkin',
  'memo.create', 'record.create', 'memory.remember', 'memory.correct',
  'activity.start', 'activity.complete', 'reminder.create', 'reminder.update',
]);
export function isRoutineCommand(command: Command): boolean { return routineTypes.has(command.type); }
