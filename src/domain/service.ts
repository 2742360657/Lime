import { z } from 'zod';
import { canonicalJson, commandSchema, dateKeyAt, identifier, isDateKey, revision, type Command } from './commands';
import { DomainError, type DocumentRef, type DomainDatabase, type DomainTransaction, type EntityRef, type ReadContext, type Receipt, type UiContext } from './types';

type BaseRow = { id: string; revision: number; deleted?: number };
export type TaskRow = BaseRow & { title: string; note: string; status: string; due_date_key: string | null; due_time: string | null; completed_at: number | null };
export type HabitRow = BaseRow & { name: string; archived_at: number | null; cadence: string; target_count: number };
export type MemoryRow = BaseRow & { kind: 'fact' | 'preference'; key: string; content: string; forgotten: number };
export type ActivityRow = BaseRow & { kind: string; title: string; note: string; completion_note: string | null; status: string; habit_id: string | null; checkin_id: string | null };
export type ProposalRow = BaseRow & { command: string; source_refs: string; status: string; request_id: string; operation_id: string | null; receipt: string | null };
type SavedOperation = { fingerprint: string; receipt: string };
type Deps = { id: () => string; now: () => number; digest: (text: string) => Promise<string> };
const refsSchema = z.array(z.strictObject({ id: identifier, revision })).max(4);

export function createDomain(db: DomainDatabase, deps: Deps) {
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
    const parsed = refsSchema.safeParse(refs);
    if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
    return parsed.data;
  }
  async function verifyRefs(tx: DomainTransaction, refs: DocumentRef[]) {
    for (const ref of refs) {
      const source = await tx.getOptional<BaseRow>('SELECT id,revision,deleted FROM documents WHERE id=?', [ref.id]);
      if (!source || source.deleted || source.revision !== ref.revision) throw new DomainError('SOURCE_CHANGED');
    }
  }
  async function target<T extends BaseRow>(tx: DomainTransaction, table: 'tasks' | 'habits' | 'local_memories' | 'local_activities', id: string, expected?: number): Promise<T> {
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
  async function mutate(tx: DomainTransaction, cmd: Command): Promise<Omit<Receipt, 'operationId'>> {
    const now = deps.now(), updated = new Date(now).toISOString();
    const changed = (kind: EntityRef['kind'], id: string, revision: number, unchanged = false): Omit<Receipt, 'operationId'> =>
      ({ disposition: unchanged ? 'unchanged' : 'committed', entity: { kind, id, revision } });
    switch (cmd.type) {
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
        await tx.execute('UPDATE local_memories SET content=?,revision=revision+1,updated_at=? WHERE id=?', [cmd.content, updated, row.id]);
        return changed('memory', row.id, row.revision + 1);
      }
      case 'memory.forget': {
        const row = await target<MemoryRow>(tx, 'local_memories', cmd.id, cmd.expectedRevision);
        await tx.execute("UPDATE local_memories SET content='',forgotten=1,revision=revision+1,updated_at=? WHERE id=?", [updated, row.id]);
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
        let checkin: EntityRef | undefined;
        if (cmd.type === 'activity.complete' && row.habit_id) {
          await activeHabit(tx, row.habit_id);
          checkin = await addCheckin(tx, row.habit_id, Math.floor(now / 60000) * 60000, dateKeyAt(now), cmd.note);
        }
        await tx.execute('UPDATE local_activities SET status=?,completion_note=?,checkin_id=?,completed_at=?,revision=revision+1,updated_at=? WHERE id=?',
          [cmd.type === 'activity.complete' ? 'completed' : 'cancelled', cmd.type === 'activity.complete' ? cmd.note : null, checkin?.id ?? null, now, updated, row.id]);
        return { ...changed('activity', row.id, row.revision + 1), ...(checkin ? { related: checkin } : {}) };
      }
    }
  }
  async function commit(tx: DomainTransaction, command: Command, operationId: string, fingerprint: string, refs: DocumentRef[] = []): Promise<Receipt> {
    const saved = await tx.getOptional<SavedOperation>('SELECT fingerprint,receipt FROM local_operations WHERE id=?', [operationId]);
    if (saved) {
      if (saved.fingerprint !== fingerprint) throw new DomainError('OPERATION_ID_REUSED');
      return { ...JSON.parse(saved.receipt) as Receipt, disposition: 'replayed' };
    }
    await verifyRefs(tx, refs);
    const receipt: Receipt = { ...await mutate(tx, command), operationId };
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
    async listTasks(options: { status?: 'open' | 'done' | 'all'; limit?: number } = {}): Promise<TaskRow[]> {
      const status = options.status ?? 'open';
      if (!['open', 'done', 'all'].includes(status)) throw new DomainError('INVALID_ARGUMENT');
      return db.readTransaction(tx => tx.getAll<TaskRow>(`SELECT * FROM tasks WHERE deleted=0${status === 'all' ? '' : ' AND status=?'} ORDER BY sort_order,id LIMIT ?`, status === 'all' ? [limit(options.limit)] : [status, limit(options.limit)]));
    },
    async listHabits(options: { limit?: number } = {}): Promise<HabitRow[]> {
      return db.readTransaction(tx => tx.getAll<HabitRow>('SELECT * FROM habits WHERE deleted=0 AND archived_at IS NULL ORDER BY sort_order,id LIMIT ?', [limit(options.limit)]));
    },
    async listCheckins(options: { habitId: string; from: string; through: string; limit?: number }) {
      validId(options.habitId);
      if (!isDateKey(options.from) || !isDateKey(options.through) || options.from > options.through) throw new DomainError('INVALID_ARGUMENT');
      return db.readTransaction(async tx => {
        await target<HabitRow>(tx, 'habits', options.habitId);
        return tx.getAll<{ id: string; habit_id: string; date_key: string; timestamp: number; note: string; revision: number }>('SELECT id,habit_id,date_key,timestamp,note,revision FROM checkins WHERE habit_id=? AND deleted=0 AND date_key>=? AND date_key<=? ORDER BY timestamp DESC,id LIMIT ?', [options.habitId, options.from, options.through, limit(options.limit)]);
      });
    },
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
      if (!context || !['ui', 'agent'].includes(context.actor) || (context.actor === 'agent' && !checkedRefs(context.documentRefs).some(r => r.id === ref.id && r.revision === ref.revision))) throw new DomainError('PERMISSION_DENIED');
      return db.readTransaction(async tx => {
        await verifyRefs(tx, [ref]);
        return tx.getOptional<{ id: string; kind: string; title: string; body: string; date: string; revision: number }>('SELECT id,kind,title,body,date,revision FROM documents WHERE id=?', [ref.id]);
      });
    },
    async propose(value: unknown, context: { proposalId: string; requestId: string; documentRefs?: DocumentRef[] }): Promise<ProposalRow> {
      const command = parse(value), id = validId(context.proposalId), requestId = validId(context.requestId), refs = checkedRefs(context.documentRefs);
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
        await verifyRefs(tx, checkedRefs(JSON.parse(proposal.source_refs)));
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
        const fingerprint = await deps.digest(canonicalJson({ command, refs, origin: `proposal:${id}` }));
        const receipt = await commit(tx, command, operationId, fingerprint, refs);
        await tx.execute("UPDATE local_proposals SET status='accepted',revision=revision+1,operation_id=?,receipt=?,command='',updated_at=? WHERE id=?",
          [operationId, JSON.stringify(receipt), new Date(deps.now()).toISOString(), id]);
        return receipt;
      });
    },
  };
}
