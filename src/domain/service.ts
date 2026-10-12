import { isRoutineCommand } from './policy';
import { mutateRecord, createRecordQueries } from '../records/store';
import { calculateRecords } from '../records/compute';
import { recordSource } from '../records/model';
import type { RecordCommand, RecordRow } from '../records/model';
import { createMemoryQueries } from '../memories/queries';
import { createActivityQueries } from '../daily/activities';
import { mutateMemo, listMemoMetadata, listMemoGroups } from '../memos/domain';
import type { MemoCommand } from '../memos/commands';
import { createDailyService } from '../daily/service';
import { shanghaiDate, shanghaiTimestamp, type ReminderRow } from '../reminders/planner';
import { canonicalJson, commandSchema, dateKeyAt, documentRefsSchema, identifier, isDateKey, revision, type Command } from './commands';
import { DomainError, type DocumentRef, type DomainDatabase, type DomainTransaction, type EntityRef, type ReadContext, type Receipt, type UiContext } from './types';

type BaseRow = { id: string; revision: number; deleted?: number };
export type TaskRow = BaseRow & { title: string; note: string; status: string; due_date_key: string | null; due_time: string | null; completed_at: number | null };
export type HabitRow = BaseRow & { name: string; archived_at: number | null; cadence: string; target_count: number; group_id: string | null; sort_order: number };
export type MemoryRow = BaseRow & { kind: 'fact' | 'preference'; key: string; content: string; forgotten: number };
export type ActivityRow = BaseRow & { kind: string; title: string; note: string; completion_note: string | null; status: string; habit_id: string | null; checkin_id: string | null };
export type ProposalRow = BaseRow & { command: string; source_refs: string; status: string; request_id: string; operation_id: string | null; receipt: string | null };
type SavedOperation = { fingerprint: string; receipt: string };
type Deps = { id: () => string; now: () => number; digest: (text: string) => Promise<string> };

export function createDomain(db: DomainDatabase, deps: Deps) {
  const daily = createDailyService(db, deps);
  const queryMemories = createMemoryQueries(db), queryActivities = createActivityQueries(db), records = createRecordQueries(db);
  function parse(value: unknown): Command {
    const result = commandSchema.safeParse(value);
    if (!result.success) throw new DomainError('INVALID_ARGUMENT');
    return result.data;
  }
  function requireUi(context: UiContext) {
    if (context?.actor !== 'ui') throw new DomainError('PERMISSION_DENIED');
  }
  function validId(value: string) {
    if (!identifier.safeParse(value).success || value.trim() !== value) throw new DomainError('INVALID_ARGUMENT');
    return value;
  }
  function validVersion(value: number) {
    if (!revision.safeParse(value).success) throw new DomainError('INVALID_ARGUMENT');
  }
  function limit(value = 50) {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new DomainError('INVALID_ARGUMENT');
    return value;
  }
  function checkedRefs(refs: DocumentRef[] = []) {
    const parsed = documentRefsSchema.safeParse(refs);
    if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
    return parsed.data;
  }
  async function verifyRefs(tx: DomainTransaction, refs: DocumentRef[]) {
    for (const ref of refs) {
      const table = ref.kind === 'attachment' ? 'local_materials' : ref.kind === 'record' ? 'local_records' : 'documents';
      const source = await tx.getOptional<BaseRow>(`SELECT id,revision,deleted FROM ${table} WHERE id=?${table === 'documents' ? " AND kind='memo'" : ''}`, [ref.id]);
      if (!source || source.deleted || source.revision !== ref.revision) throw new DomainError('SOURCE_CHANGED');
    }
  }
  async function target<T extends BaseRow>(tx: DomainTransaction, table: 'tasks' | 'habits' | 'local_memories' | 'local_activities' | 'local_reminder_rules', id: string, expected?: number): Promise<T> {
    const row = await tx.getOptional<T>(`SELECT * FROM ${table} WHERE id=?`, [id]);
    if (!row || row.deleted || ('forgotten' in row && row.forgotten)) throw new DomainError('NOT_FOUND');
    if (expected !== undefined && row.revision !== expected) throw new DomainError('VERSION_CONFLICT');
    return row;
  }
  async function activeHabit(tx: DomainTransaction, id: string, expected?: number) {
    const habit = await target<HabitRow>(tx, 'habits', id, expected);
    if (habit.archived_at !== null) throw new DomainError('NOT_FOUND');
    return habit;
  }
  async function addCheckin(tx: DomainTransaction, habitId: string, timestamp: number, dateKey: string, note: string): Promise<EntityRef> {
    const id = deps.id(), now = deps.now();
    await tx.execute('INSERT INTO checkins(id,habit_id,date_key,timestamp,note,created_at,revision,deleted,updated_at) VALUES(?,?,?,?,?,?,1,0,?)',
      [id, habitId, dateKey, timestamp, note, now, new Date(now).toISOString()]);
    return { kind: 'checkin', id, revision: 1 };
  }
  function verifyMemoProposal(cmd: Command, refs: DocumentRef[]) {
    if ((cmd.type === 'record.update' || cmd.type === 'record.trash') && !refs.some(ref => ref.kind === 'record' && ref.id === cmd.id && ref.revision === cmd.expectedRevision)) throw new DomainError('PERMISSION_DENIED');
    if (cmd.type === 'record.restore') throw new DomainError('PERMISSION_DENIED');
    if (cmd.type === 'memo.restore') throw new DomainError('PERMISSION_DENIED');
    if ((cmd.type === 'memo.update' || cmd.type === 'memo.trash') && !refs.some(ref => ref.kind === undefined && ref.id === cmd.id && ref.revision === cmd.expectedRevision)) throw new DomainError('PERMISSION_DENIED');
  }
  async function mutate(tx: DomainTransaction, cmd: Command, refs: DocumentRef[]): Promise<Omit<Receipt, 'operationId'>> {
    if (cmd.type.startsWith('record.')) return mutateRecord(tx, cmd as RecordCommand, deps, refs);
    if (cmd.type.startsWith('memo.')) return mutateMemo(tx, cmd as MemoCommand, deps);
    const now = deps.now(), updated = new Date(now).toISOString();
    const changed = (kind: EntityRef['kind'], id: string, revision: number, unchanged = false): Omit<Receipt, 'operationId'> =>
      ({ disposition: unchanged ? 'unchanged' : 'committed', entity: { kind, id, revision } });
    switch (cmd.type) {
      case 'reminder.create':
      case 'reminder.update': {
        if (cmd.mode === 'once' && cmd.enabled && shanghaiTimestamp(cmd.dateKey!, cmd.time) <= now) throw new DomainError('INVALID_ARGUMENT');
        const row = cmd.type === 'reminder.update' ? await target<ReminderRow>(tx, 'local_reminder_rules', cmd.id, cmd.expectedRevision) : null;
        const id = row?.id ?? deps.id();
        if (row) await tx.execute('UPDATE local_reminder_rules SET title=?,note=?,mode=?,date_key=?,month_day=?,time=?,advance_days=?,day_of=?,enabled=?,revision=revision+1,updated_at=? WHERE id=?',
          [cmd.title, cmd.note, cmd.mode, cmd.dateKey, cmd.monthDay, cmd.time, cmd.advanceDays, cmd.dayOf ? 1 : 0, cmd.enabled ? 1 : 0, updated, id]);
        else await tx.execute('INSERT INTO local_reminder_rules(id,title,note,mode,date_key,month_day,time,advance_days,day_of,enabled,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)',
          [id, cmd.title, cmd.note, cmd.mode, cmd.dateKey, cmd.monthDay, cmd.time, cmd.advanceDays, cmd.dayOf ? 1 : 0, cmd.enabled ? 1 : 0, now, updated]);
        return changed('reminder', id, (row?.revision ?? 0) + 1);
      }
      case 'reminder.cancel': {
        const row = await target<ReminderRow>(tx, 'local_reminder_rules', cmd.id, cmd.expectedRevision);
        if (!row.enabled) return changed('reminder', row.id, row.revision, true);
        await tx.execute('UPDATE local_reminder_rules SET enabled=0,revision=revision+1,updated_at=? WHERE id=?', [updated, row.id]);
        return changed('reminder', row.id, row.revision + 1);
      }
      case 'task.create': {
        const id = deps.id();
        const order = await tx.getOptional<{ next: number }>('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM tasks WHERE deleted=0');
        await tx.execute("INSERT INTO tasks(id,title,note,due_date_key,due_time,sort_order,created_at,completed_at,status,revision,deleted,updated_at) VALUES(?,?,?,?,?,?,?,NULL,'open',1,0,?)",
          [id, cmd.title, cmd.note, cmd.dueDateKey, cmd.dueTime, order?.next ?? 0, now, updated]);
        return changed('task', id, 1);
      }
      case 'task.update': {
        const row = await target<TaskRow>(tx, 'tasks', cmd.id, cmd.expectedRevision);
        if (row.title === cmd.title && (row.note ?? '') === cmd.note && row.due_date_key === cmd.dueDateKey && row.due_time === cmd.dueTime) return changed('task', row.id, row.revision, true);
        await tx.execute('UPDATE tasks SET title=?,note=?,due_date_key=?,due_time=?,revision=revision+1,updated_at=? WHERE id=?', [cmd.title, cmd.note, cmd.dueDateKey, cmd.dueTime, updated, cmd.id]);
        return changed('task', row.id, row.revision + 1);
      }
      case 'task.complete': {
        const row = await target<TaskRow>(tx, 'tasks', cmd.id, cmd.expectedRevision);
        if ((row.status === 'done') === cmd.completed) return changed('task', row.id, row.revision, true);
        await tx.execute('UPDATE tasks SET status=?,completed_at=?,revision=revision+1,updated_at=? WHERE id=?', [cmd.completed ? 'done' : 'open', cmd.completed ? now : null, updated, row.id]);
        return changed('task', row.id, row.revision + 1);
      }
      case 'task.trash': {
        const row = await target<TaskRow>(tx, 'tasks', cmd.id, cmd.expectedRevision);
        await tx.execute('UPDATE tasks SET deleted=1,revision=revision+1,updated_at=? WHERE id=?', [updated, row.id]);
        return changed('task', row.id, row.revision + 1);
      }
      case 'habit.create':
      case 'habit.update': {
        const row = cmd.type === 'habit.update' ? await activeHabit(tx, cmd.id, cmd.expectedRevision) : null;
        if (cmd.groupId !== null && !await tx.getOptional('SELECT id FROM habit_groups WHERE id=? AND deleted=0', [cmd.groupId])) throw new DomainError('NOT_FOUND');
        if (row && row.name === cmd.name && row.cadence === cmd.cadence && row.target_count === cmd.targetCount && row.group_id === cmd.groupId) return changed('habit', row.id, row.revision, true);
        if (row && row.revision >= Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_ARGUMENT');
        const order = row && row.group_id === cmd.groupId ? row.sort_order : (await tx.getOptional<{ next: number }>('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM habits WHERE deleted=0 AND archived_at IS NULL AND group_id IS ?', [cmd.groupId]))?.next ?? 0;
        const id = row?.id ?? deps.id();
        if (row) await tx.execute('UPDATE habits SET name=?,cadence=?,target_count=?,group_id=?,sort_order=?,revision=revision+1,updated_at=? WHERE id=?', [cmd.name, cmd.cadence, cmd.targetCount, cmd.groupId, order, updated, id]);
        else await tx.execute('INSERT INTO habits(id,name,cadence,target_count,group_id,sort_order,created_at,archived_at,revision,deleted,updated_at) VALUES(?,?,?,?,?,?,?,NULL,1,0,?)', [id, cmd.name, cmd.cadence, cmd.targetCount, cmd.groupId, order, now, updated]);
        return changed('habit', id, (row?.revision ?? 0) + 1);
      }
      case 'habit.checkin': {
        await activeHabit(tx, cmd.id, cmd.expectedRevision);
        const timestamp = cmd.timestamp ?? Math.floor(now / 60000) * 60000, dateKey = cmd.dateKey ?? dateKeyAt(timestamp);
        if (dateKey !== dateKeyAt(timestamp)) throw new DomainError('INVALID_ARGUMENT');
        const checkin = await addCheckin(tx, cmd.id, timestamp, dateKey, cmd.note);
        return changed('checkin', checkin.id, checkin.revision);
      }
      case 'memory.remember': {
        if (await tx.getOptional('SELECT id FROM local_memories WHERE kind=? AND key=? AND forgotten=0', [cmd.kind, cmd.key])) throw new DomainError('ALREADY_EXISTS');
        const id = deps.id();
        await tx.execute('INSERT INTO local_memories(id,kind,key,content,forgotten,revision,created_at,updated_at) VALUES(?,?,?,?,0,1,?,?)', [id, cmd.kind, cmd.key, cmd.content, now, updated]);
        return changed('memory', id, 1);
      }
      case 'memory.correct': {
        const row = await target<MemoryRow>(tx, 'local_memories', cmd.id, cmd.expectedRevision);
        if (row.content === cmd.content) return changed('memory', row.id, row.revision, true);
        if (row.revision >= Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_ARGUMENT');
        await tx.execute('UPDATE local_memories SET content=?,revision=revision+1,updated_at=? WHERE id=?', [cmd.content, updated, row.id]);
        return changed('memory', row.id, row.revision + 1);
      }
      case 'memory.forget': {
        const row = await target<MemoryRow>(tx, 'local_memories', cmd.id, cmd.expectedRevision);
        if (row.revision >= Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_ARGUMENT');
        await tx.execute("UPDATE local_memories SET content='',forgotten=1,revision=revision+1,updated_at=? WHERE id=?", [updated, row.id]);
        await tx.execute("INSERT OR REPLACE INTO local_meta(id,value) VALUES('agent-context-boundary',?)", [String(now)]);
        // Pending corrections must not resurrect a forgotten fact or retain its text.
        const proposals = await tx.getAll<ProposalRow>("SELECT * FROM local_proposals WHERE status='pending'");
        for (const proposal of proposals) {
          const command = parse(JSON.parse(proposal.command));
          if ((command.type === 'memory.correct' && command.id === row.id) ||
            (command.type === 'memory.remember' && command.kind === row.kind && command.key === row.key)) {
            await tx.execute("UPDATE local_proposals SET command='',status='rejected',revision=revision+1,updated_at=? WHERE id=?", [updated, proposal.id]);
          }
        }
        return changed('memory', row.id, row.revision + 1);
      }
      case 'activity.start': {
        if (cmd.habitId) await activeHabit(tx, cmd.habitId);
        const id = deps.id();
        await tx.execute("INSERT INTO local_activities(id,kind,title,note,habit_id,status,checkin_id,revision,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,'active',NULL,1,?,?,NULL)",
          [id, cmd.kind, cmd.title, cmd.note, cmd.habitId, now, updated]);
        return changed('activity', id, 1);
      }
      case 'activity.complete':
      case 'activity.cancel': {
        const row = await target<ActivityRow>(tx, 'local_activities', cmd.id);
        if (row.status !== 'active') throw new DomainError('ACTIVITY_CLOSED');
        if (row.revision !== cmd.expectedRevision) throw new DomainError('VERSION_CONFLICT');
        if (row.revision >= Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_ARGUMENT');
        let checkin: EntityRef | undefined;
        if (cmd.type === 'activity.complete' && row.habit_id) {
          await activeHabit(tx, row.habit_id);
          checkin = await addCheckin(tx, row.habit_id, Math.floor(now / 60000) * 60000, shanghaiDate(now), cmd.note);
        }
        await tx.execute('UPDATE local_activities SET status=?,completion_note=?,checkin_id=?,completed_at=?,revision=revision+1,updated_at=? WHERE id=?',
          [cmd.type === 'activity.complete' ? 'completed' : 'cancelled', cmd.type === 'activity.complete' ? cmd.note : null, checkin?.id ?? null, now, updated, row.id]);
        return { ...changed('activity', row.id, row.revision + 1), ...(checkin ? { related: checkin } : {}) };
      }
    }
    throw new DomainError('INVALID_ARGUMENT');
  }
  async function commit(tx: DomainTransaction, command: Command, operationId: string, fingerprint: string, refs: DocumentRef[] = []): Promise<Receipt> {
    const saved = await tx.getOptional<SavedOperation>('SELECT fingerprint,receipt FROM local_operations WHERE id=?', [operationId]);
    if (saved) {
      if (saved.fingerprint !== fingerprint) throw new DomainError('OPERATION_ID_REUSED');
      return { ...JSON.parse(saved.receipt) as Receipt, disposition: 'replayed' };
    }
    await verifyRefs(tx, refs);
    const receipt: Receipt = { ...await mutate(tx, command, refs), operationId };
    await tx.execute('INSERT INTO local_operations(id,fingerprint,receipt,created_at) VALUES(?,?,?,?)', [operationId, fingerprint, JSON.stringify(receipt), deps.now()]);
    return receipt;
  }

  return {
    async execute(value: unknown, context: UiContext & { operationId: string }): Promise<Receipt> {
      requireUi(context);
      const command = parse(value), operationId = validId(context.operationId);
      const fingerprint = await deps.digest(canonicalJson({ command, origin: 'ui' }));
      return db.writeTransaction(tx => commit(tx, command, operationId, fingerprint));
    },
    async executeRoutine(value: unknown, context: { actor: 'agent'; requestId: string }): Promise<Receipt> {
      if (context?.actor !== 'agent') throw new DomainError('PERMISSION_DENIED');
      const command = parse(value), requestId = validId(context.requestId);
      if (!isRoutineCommand(command)) throw new DomainError('PERMISSION_DENIED');
      const hash = await deps.digest(canonicalJson(command)), operationId = validId(`${requestId}:${hash}`);
      const fingerprint = await deps.digest(canonicalJson({ command, origin: `request:${requestId}` }));
      return db.writeTransaction(async tx => {
        const request = await tx.getOptional<{ status: string; source_refs: string; created_at: number }>('SELECT status,source_refs,created_at FROM local_agent_requests WHERE id=?', [requestId]);
        const boundary = Number((await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='agent-context-boundary'"))?.value ?? 0);
        if (!request || request.status !== 'running' || request.created_at <= boundary) throw new DomainError('PERMISSION_DENIED');
        const existing = await tx.getOptional('SELECT id FROM local_agent_grants WHERE id=? AND request_id=?', [operationId, requestId]);
        const count = await tx.getOptional<{ n: number }>('SELECT COUNT(*) AS n FROM local_agent_grants WHERE request_id=?', [requestId]);
        if (!existing && (count?.n ?? 0) >= 8) throw new DomainError('PERMISSION_DENIED');
        const refs = checkedRefs(JSON.parse(request.source_refs));
        const receipt = await commit(tx, command, operationId, fingerprint, refs);
        // Same transaction as the business change: retries and crash recovery use durable receipts.
        await tx.execute('INSERT OR REPLACE INTO local_agent_grants(id,request_id,command_type,target_id,fingerprint,receipt) VALUES(?,?,?,?,?,?)', [operationId, requestId, command.type, 'id' in command ? command.id : null, fingerprint, JSON.stringify(receipt)]);
        return receipt;
      });
    },
    async listTasks(options: { status?: 'open' | 'done' | 'all'; limit?: number } = {}): Promise<TaskRow[]> {
      const status = options.status ?? 'open';
      if (!['open', 'done', 'all'].includes(status)) throw new DomainError('INVALID_ARGUMENT');
      return db.readTransaction(tx => tx.getAll<TaskRow>(`SELECT * FROM tasks WHERE deleted=0${status === 'all' ? '' : ' AND status=?'} ORDER BY sort_order,id LIMIT ?`, status === 'all' ? [limit(options.limit)] : [status, limit(options.limit)]));
    },
    listMemos(options: Parameters<typeof listMemoMetadata>[1] = {}) { return db.readTransaction(tx => listMemoMetadata(tx, options)); },
    listMemoGroups() { return db.readTransaction(tx => listMemoGroups(tx)); },
    trainingHistory: daily.readTrainingHistory,
    async listHabits(options: { limit?: number } = {}): Promise<HabitRow[]> {
      return db.readTransaction(tx => tx.getAll<HabitRow>('SELECT * FROM habits WHERE deleted=0 AND archived_at IS NULL ORDER BY sort_order,id LIMIT ?', [limit(options.limit)]));
    },
    async listHabitGroups() { return db.readTransaction(tx => tx.getAll<{id: string; name: string; revision: number}>('SELECT id,name,revision FROM habit_groups WHERE deleted=0 ORDER BY sort_order,id LIMIT 100')); },
    async listReminders(options: { limit?: number } = {}): Promise<ReminderRow[]> {
      return db.readTransaction(tx => tx.getAll<ReminderRow>('SELECT * FROM local_reminder_rules ORDER BY enabled DESC,updated_at DESC,id LIMIT ?', [limit(options.limit)]));
    },
    async listCheckins(options: { habitId: string; from: string; through: string; limit?: number }) {
      validId(options.habitId);
      if (!isDateKey(options.from) || !isDateKey(options.through) || options.from > options.through) throw new DomainError('INVALID_ARGUMENT');
      return db.readTransaction(async tx => {
        await target<HabitRow>(tx, 'habits', options.habitId);
        return tx.getAll<{ id: string; habit_id: string; date_key: string; timestamp: number; note: string; revision: number }>('SELECT id,habit_id,date_key,timestamp,note,revision FROM checkins WHERE habit_id=? AND deleted=0 AND date_key>=? AND date_key<=? ORDER BY timestamp DESC,id LIMIT ?', [options.habitId, options.from, options.through, limit(options.limit)]);
      });
    },
    listRecords: records.list,
    getRecord: records.get,
    calculateRecords: (refs: DocumentRef[], input: Parameters<typeof calculateRecords>[2], context: ReadContext) => calculateRecords(db, refs, input, context),
    queryMemories,
    queryActivities,
    async listMemories(options: { limit?: number } = {}): Promise<MemoryRow[]> {
      return db.readTransaction(tx => tx.getAll<MemoryRow>('SELECT * FROM local_memories WHERE forgotten=0 ORDER BY updated_at DESC,id LIMIT ?', [limit(options.limit)]));
    },
    async listActivities(options: { status?: 'active' | 'completed' | 'cancelled'; limit?: number } = {}): Promise<ActivityRow[]> {
      const status = options.status ?? 'active';
      if (!['active', 'completed', 'cancelled'].includes(status)) throw new DomainError('INVALID_ARGUMENT');
      return db.readTransaction(tx => tx.getAll<ActivityRow>('SELECT * FROM local_activities WHERE status=? ORDER BY created_at DESC,id LIMIT ?', [status, limit(options.limit)]));
    },
    async readDocument(ref: DocumentRef, context: ReadContext) {
      checkedRefs([ref]);
      if (!context || !['ui', 'agent'].includes(context.actor) || (context.actor === 'agent' && !checkedRefs(context.documentRefs).some(r => r.id === ref.id && r.revision === ref.revision && r.kind === ref.kind))) throw new DomainError('PERMISSION_DENIED');
      return db.readTransaction(async tx => {
        await verifyRefs(tx, [ref]);
        if (ref.kind === 'record') {
          const row = await tx.getOptional<RecordRow>('SELECT * FROM local_records WHERE id=?', [ref.id]);
          if (!row) throw new DomainError('SOURCE_CHANGED');
          return recordSource(row);
        }
        if (ref.kind === 'attachment') {
          const material = await tx.getOptional<{ id: string; filename: string; body: string; note: string; status: string; revision: number }>('SELECT id,filename,body,note,status,revision FROM local_materials WHERE id=?', [ref.id]);
          if (!material || material.status !== 'ready') throw new DomainError('INVALID_ARGUMENT');
          return { id: material.id, kind: 'attachment', title: material.filename, body: material.body, date: '', revision: material.revision, note: material.note };
        }
        return tx.getOptional<{ id: string; kind: string; title: string; body: string; date: string; revision: number }>('SELECT id,kind,title,body,date,revision FROM documents WHERE id=?', [ref.id]);
      });
    },
    async propose(value: unknown, context: { proposalId: string; requestId: string; documentRefs?: DocumentRef[] }): Promise<ProposalRow> {
      const command = parse(value), id = validId(context.proposalId), requestId = validId(context.requestId), refs = checkedRefs(context.documentRefs);
      verifyMemoProposal(command, refs);
      const fingerprint = await deps.digest(canonicalJson({ command, refs, requestId }));
      return db.writeTransaction(async tx => {
        const existing = await tx.getOptional<ProposalRow & { fingerprint: string }>('SELECT * FROM local_proposals WHERE id=?', [id]);
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new DomainError('OPERATION_ID_REUSED');
          return existing;
        }
        await verifyRefs(tx, refs);
        const now = deps.now();
        await tx.execute("INSERT INTO local_proposals(id,command,fingerprint,source_refs,request_id,revision,status,operation_id,receipt,created_at,updated_at) VALUES(?,?,?,?,?,1,'pending',NULL,NULL,?,?)",
          [id, canonicalJson(command), fingerprint, JSON.stringify(refs), requestId, now, new Date(now).toISOString()]);
        return (await tx.getOptional<ProposalRow>('SELECT * FROM local_proposals WHERE id=?', [id]))!;
      });
    },
    async editProposal(id: string, expectedRevision: number, value: unknown, context: UiContext): Promise<ProposalRow> {
      requireUi(context); validId(id); validVersion(expectedRevision); const command = parse(value);
      return db.writeTransaction(async tx => {
        const proposal = await tx.getOptional<ProposalRow>('SELECT * FROM local_proposals WHERE id=?', [id]);
        if (!proposal || proposal.status !== 'pending' || proposal.revision !== expectedRevision) throw new DomainError('PROPOSAL_CLOSED');
        const refs = checkedRefs(JSON.parse(proposal.source_refs));
        verifyMemoProposal(command, refs);
        await verifyRefs(tx, refs);
        await tx.execute('UPDATE local_proposals SET command=?,revision=revision+1,updated_at=? WHERE id=?', [canonicalJson(command), new Date(deps.now()).toISOString(), id]);
        // fingerprint describes the original request, so a retried generation cannot undo a UI edit.
        return (await tx.getOptional<ProposalRow>('SELECT * FROM local_proposals WHERE id=?', [id]))!;
      });
    },
    async rejectProposal(id: string, expectedRevision: number, context: UiContext): Promise<void> {
      requireUi(context); validId(id); validVersion(expectedRevision);
      return db.writeTransaction(async tx => {
        const proposal = await tx.getOptional<ProposalRow>('SELECT * FROM local_proposals WHERE id=?', [id]);
        if (!proposal || proposal.status !== 'pending' || proposal.revision !== expectedRevision) throw new DomainError('PROPOSAL_CLOSED');
        await tx.execute("UPDATE local_proposals SET command='',status='rejected',revision=revision+1,updated_at=? WHERE id=?", [new Date(deps.now()).toISOString(), id]);
      });
    },
    async acceptProposal(id: string, expectedRevision: number, context: UiContext & { operationId: string }): Promise<Receipt> {
      requireUi(context); validId(id); validVersion(expectedRevision); const operationId = validId(context.operationId);
      return db.writeTransaction(async tx => {
        const proposal = await tx.getOptional<ProposalRow>('SELECT * FROM local_proposals WHERE id=?', [id]);
        if (!proposal) throw new DomainError('PROPOSAL_CLOSED');
        if (proposal.status === 'accepted' && proposal.receipt) {
          if (proposal.revision !== expectedRevision + 1) throw new DomainError('PROPOSAL_CLOSED');
          // Reserve repeat-tap IDs too: later commands must not reuse them with other parameters.
          if (operationId !== proposal.operation_id) {
            const fingerprint = await deps.digest(canonicalJson({ origin: `proposal-replay:${id}`, acceptedRevision: expectedRevision }));
            const existing = await tx.getOptional<SavedOperation>('SELECT fingerprint,receipt FROM local_operations WHERE id=?', [operationId]);
            if (existing && existing.fingerprint !== fingerprint) throw new DomainError('OPERATION_ID_REUSED');
            if (!existing) await tx.execute('INSERT INTO local_operations(id,fingerprint,receipt,created_at) VALUES(?,?,?,?)', [operationId, fingerprint, proposal.receipt, deps.now()]);
          }
          return { ...JSON.parse(proposal.receipt) as Receipt, disposition: 'replayed' };
        }
        if (proposal.status !== 'pending' || proposal.revision !== expectedRevision) throw new DomainError('PROPOSAL_CLOSED');
        const command = parse(JSON.parse(proposal.command)), refs = checkedRefs(JSON.parse(proposal.source_refs));
        verifyMemoProposal(command, refs);
        const fingerprint = await deps.digest(canonicalJson({ command, refs, origin: `proposal:${id}` }));
        const receipt = await commit(tx, command, operationId, fingerprint, refs);
        await tx.execute("UPDATE local_proposals SET status='accepted',revision=revision+1,operation_id=?,receipt=?,command='',updated_at=? WHERE id=?",
          [operationId, JSON.stringify(receipt), new Date(deps.now()).toISOString(), id]);
        return receipt;
      });
    },
  };
}
