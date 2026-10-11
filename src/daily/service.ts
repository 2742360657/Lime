import { z } from 'zod';
import { canonicalJson, identifier, isDateKey, revision } from '../domain/commands';
import { type DomainDatabase, type DomainTransaction, type UiContext } from '../domain/types';
import { shanghaiTimestamp, DAY } from '../reminders/planner';
import { organizationPlanSchema, validateOrganizationBatch, type OrganizationBatch, type OrganizationPlan,
  type OrganizationReceipt, type OrganizationSnapshot } from './model';

type DailyCode = 'INVALID_ARGUMENT' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'BATCH_ID_REUSED' | 'BATCH_CLOSED';
const messages: Record<DailyCode, string> = {
  INVALID_ARGUMENT: '请核对日期、选择范围和操作内容。', PERMISSION_DENIED: '整理需要先由你选择记录并确认。',
  NOT_FOUND: '记录或分类已不存在，请重新选择。', VERSION_CONFLICT: '记录已被修改，请重新预览；本批没有覆盖后续修改。',
  BATCH_ID_REUSED: '这次整理的内容已变化，请重新预览。', BATCH_CLOSED: '这批整理已经处理，请查看回执。',
};
export class DailyError extends Error { constructor(public readonly code: DailyCode) { super(messages[code]); this.name = 'DailyError'; } }
type Deps = { now(): number; id(): string; digest(text: string): Promise<string> };
type RecordRow = Record<string, string | number | null> & { id: string; revision: number; deleted: number; title: string; group_id?: string | null; sort_order: number | null };
export type TrainingActivity = {
  id: string; kind: string; title: string; note: string; completion_note: string | null;
  status: 'active' | 'completed' | 'cancelled'; habit_id: string | null; habit_name: string | null;
  checkin_id: string | null; checkin_state: 'none' | 'linked' | 'missing'; checkin_note: string | null;
  created_at: number; completed_at: number | null; revision: number;
};
export type TrainingCheckin = { id: string; habit_id: string; habit_name: string | null; date_key: string; timestamp: number; note: string; revision: number; linked_activities: number };
export type Coverage = { matched: number; returned: number; complete: boolean; truncated: boolean };
export type TrainingHistory = {
  from: string; through: string; kind: string | null; habitId: string | null;
  activities: TrainingActivity[]; checkins: TrainingCheckin[];
  activityCoverage: Coverage; checkinCoverage: Coverage;
  statusCounts: { active: number; completed: number; cancelled: number };
  basis: string;
};
const recordColumns = {
  memo: ['id','owner_id','kind','title','body','date','group_id','sort_order','created_at','edited_at','deleted_at','revision','deleted','updated_at'],
  task: ['id','owner_id','title','status','document_id','due_at','note','due_date_key','due_time','sort_order','created_at','completed_at','revision','deleted','updated_at'],
};
const historySchema = z.strictObject({
  from: z.string().refine(isDateKey), through: z.string().refine(isDateKey),
  habitId: identifier.optional(), kind: z.string().trim().min(1).max(60).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).refine(v => v.from <= v.through && (shanghaiTimestamp(v.through, '00:00') - shanghaiTimestamp(v.from, '00:00')) / DAY < 366);

export function createDailyService(db: DomainDatabase, deps: Deps) {
  const requireUi = (context: UiContext) => { if (context?.actor !== 'ui') throw new DailyError('PERMISSION_DENIED'); };
  function parse<T>(schema: z.ZodType<T>, value: unknown): T { const r = schema.safeParse(value); if (!r.success) throw new DailyError('INVALID_ARGUMENT'); return r.data; }
  const validId = (value: unknown) => parse(identifier.refine(id => id.trim() === id), value);
  const validVersion = (value: unknown) => parse(revision, value);
  async function target(tx: DomainTransaction, entity: 'memo' | 'task', id: string) {
    const row = await tx.getOptional<RecordRow>(`SELECT ${recordColumns[entity].join(',')} FROM ${entity === 'memo' ? 'documents' : 'tasks'} WHERE id=?`, [id]);
    if (!row || (entity === 'memo' && row.kind !== 'memo')) throw new DailyError('NOT_FOUND');
    return row;
  }
  async function group(tx: DomainTransaction, id: string | null) {
    if (id && !await tx.getOptional("SELECT id FROM document_groups WHERE id=? AND kind='memo' AND deleted=0", [id])) throw new DailyError('NOT_FOUND');
  }
  async function snapshot(row: RecordRow, entity: 'memo' | 'task'): Promise<OrganizationSnapshot> {
    const hash = await deps.digest(canonicalJson(row));
    if (!/^[a-f0-9]{64}$/.test(hash) || row.revision >= Number.MAX_SAFE_INTEGER) throw new DailyError('INVALID_ARGUMENT');
    return { id: row.id, entity, revision: row.revision, groupId: entity === 'memo' ? row.group_id ?? null : null,
      sortOrder: row.sort_order ?? null, deleted: row.deleted as 0 | 1, title: (row.title ?? '').slice(0, 300), hash };
  }
  async function batch(tx: DomainTransaction, id: string) {
    const row = await tx.getOptional<OrganizationBatch>('SELECT * FROM local_organization_batches WHERE id=?', [id]);
    if (!row) throw new DailyError('NOT_FOUND');
    try { return validateOrganizationBatch(row); } catch { throw new DailyError('INVALID_ARGUMENT'); }
  }
  function decoded(row: OrganizationBatch) { return { ...row, plan: JSON.parse(row.plan) as OrganizationPlan,
    before: JSON.parse(row.before_snapshots) as OrganizationSnapshot[], after: JSON.parse(row.after_snapshots) as OrganizationSnapshot[] }; }
  function receipt(row: OrganizationBatch): OrganizationReceipt {
    if (!row.receipt || !['applied','undone'].includes(row.status)) throw new DailyError('BATCH_CLOSED');
    return { ...JSON.parse(row.receipt) as OrganizationReceipt, replayed: true };
  }
  return {
    async readTrainingHistory(value: unknown): Promise<TrainingHistory> {
      const options = parse(historySchema, value), begin = shanghaiTimestamp(options.from, '00:00'), end = shanghaiTimestamp(options.through, '00:00') + DAY;
      return db.readTransaction(async tx => {
        if (options.habitId && !await tx.getOptional('SELECT id FROM habits WHERE id=? AND deleted=0', [options.habitId])) throw new DailyError('NOT_FOUND');
        const clause = "(a.created_at>=? AND a.created_at<? OR a.completed_at>=? AND a.completed_at<?)" +
          (options.habitId ? ' AND a.habit_id=?' : '') + (options.kind ? ' AND a.kind=?' : '');
        const args: (string | number)[] = [begin,end,begin,end,...(options.habitId ? [options.habitId] : []),...(options.kind ? [options.kind] : [])];
        const counts = await tx.getAll<{ status: string; n: number }>(`SELECT a.status,COUNT(*) AS n FROM local_activities a WHERE ${clause} GROUP BY a.status`, args);
        const activities = await tx.getAll<TrainingActivity>(`SELECT a.id,a.kind,a.title,a.note,a.completion_note,a.status,a.habit_id,h.name AS habit_name,
          a.checkin_id,CASE WHEN a.checkin_id IS NULL THEN 'none' WHEN c.id IS NULL THEN 'missing' ELSE 'linked' END AS checkin_state,
          c.note AS checkin_note,a.created_at,a.completed_at,a.revision FROM local_activities a
          LEFT JOIN habits h ON h.id=a.habit_id AND h.deleted=0 LEFT JOIN checkins c ON c.id=a.checkin_id AND c.deleted=0
          WHERE ${clause} ORDER BY COALESCE(a.completed_at,a.created_at) DESC,a.id LIMIT ?`, [...args,options.limit]);
        const checkinClause = 'c.deleted=0 AND c.date_key>=? AND c.date_key<=?' + (options.habitId ? ' AND c.habit_id=?' : '') +
          (options.kind ? ' AND EXISTS(SELECT 1 FROM local_activities a WHERE a.checkin_id=c.id AND a.kind=?)' : '');
        const checkinArgs = [options.from,options.through,...(options.habitId ? [options.habitId] : []),...(options.kind ? [options.kind] : [])];
        const totalCheckins = (await tx.getOptional<{ n: number }>(`SELECT COUNT(*) AS n FROM checkins c WHERE ${checkinClause}`, checkinArgs))!.n;
        const checkins = await tx.getAll<TrainingCheckin>(`SELECT c.id,c.habit_id,h.name AS habit_name,c.date_key,c.timestamp,c.note,c.revision,
          (SELECT COUNT(*) FROM local_activities a WHERE a.checkin_id=c.id) AS linked_activities FROM checkins c LEFT JOIN habits h ON h.id=c.habit_id AND h.deleted=0
          WHERE ${checkinClause} ORDER BY c.timestamp DESC,c.id LIMIT ?`, [...checkinArgs,options.limit]);
        const statusCounts = { active: 0, completed: 0, cancelled: 0 };
        for (const row of counts) if (row.status in statusCounts) statusCounts[row.status as keyof typeof statusCounts] = row.n;
        const cover = (matched: number, returned: number): Coverage => ({ matched, returned, complete: matched === returned, truncated: matched > returned });
        return { from: options.from, through: options.through, kind: options.kind ?? null, habitId: options.habitId ?? null, activities,checkins,statusCounts,
          activityCoverage: cover(counts.reduce((n,row) => n + row.n,0),activities.length), checkinCoverage: cover(totalCheckins,checkins.length),
          basis: '上海日期；活动在此范围内开始或结束，打卡按记录日期。active是计划中，completed才是已完成，cancelled不计完成；关联打卡不重复计作训练次数。通用活动与打卡不证明运动量，未筛类型时不全部是训练。按类型筛选时，打卡只包含关联该类型活动的记录；独立打卡请按习惯查询。' };
      });
    },
    async listOrganizationCandidates(type: 'memo' | 'task', options: { limit?: number } = {}) {
      if (!['memo','task'].includes(type)) throw new DailyError('INVALID_ARGUMENT');
      const limit = parse(z.number().int().min(1).max(100), options.limit ?? 100);
      return db.readTransaction(tx => tx.getAll<{ id: string; title: string; revision: number; group_id: string | null }>(type === 'memo'
        ? "SELECT id,title,revision,group_id FROM documents WHERE kind='memo' AND deleted=0 ORDER BY edited_at DESC,id LIMIT ?"
        : 'SELECT id,title,revision,NULL AS group_id FROM tasks WHERE deleted=0 ORDER BY sort_order,id LIMIT ?', [limit]));
    },
    async listMemoGroups() { return db.readTransaction(tx => tx.getAll<{ id: string; name: string }>("SELECT id,name FROM document_groups WHERE kind='memo' AND deleted=0 ORDER BY sort_order,id LIMIT 100")); },
    async previewOrganization(value: unknown, context: UiContext & { batchId: string }) {
      requireUi(context); const plan = parse(organizationPlanSchema,value), id = validId(context.batchId);
      plan.targets.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const fingerprint = await deps.digest(canonicalJson(plan));
      return db.writeTransaction(async tx => {
        const previous = await tx.getOptional<OrganizationBatch>('SELECT * FROM local_organization_batches WHERE id=?', [id]);
        if (previous) { if (previous.fingerprint !== fingerprint) throw new DailyError('BATCH_ID_REUSED'); return decoded(await batch(tx,id)); }
        if (plan.type === 'memo.move') await group(tx,plan.groupId);
        const entity = plan.type === 'memo.move' ? 'memo' : 'task', before: OrganizationSnapshot[] = [], after: OrganizationSnapshot[] = [];
        const now = deps.now(), updated = new Date(now).toISOString();
        const order = plan.type === 'memo.move' ? (await tx.getOptional<{ n: number }>("SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM documents WHERE kind='memo' AND deleted=0 AND group_id IS ?", [plan.groupId]))!.n : 0;
        for (const ref of plan.targets) {
          const row = await target(tx,entity,ref.id);
          if (row.deleted || row.revision !== ref.expectedRevision) throw new DailyError('VERSION_CONFLICT');
          if (plan.type === 'memo.move' && (row.group_id ?? null) === plan.groupId) throw new DailyError('INVALID_ARGUMENT');
          before.push(await snapshot(row,entity));
          const changed = { ...row, revision: row.revision + 1, updated_at: updated,
            ...(plan.type === 'memo.move' ? { group_id: plan.groupId, sort_order: order + after.length } : { deleted: 1 }) };
          after.push(await snapshot(changed,entity));
        }
        const saved: OrganizationBatch = { id,fingerprint,plan:canonicalJson(plan),before_snapshots:JSON.stringify(before),after_snapshots:JSON.stringify(after),receipt:null,status:'preview',revision:1,created_at:now,updated_at:updated,undone_at:null };
        try { validateOrganizationBatch(saved); } catch { throw new DailyError('INVALID_ARGUMENT'); }
        await tx.execute('INSERT INTO local_organization_batches(id,fingerprint,plan,before_snapshots,after_snapshots,receipt,status,revision,created_at,updated_at,undone_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          [id,fingerprint,saved.plan,saved.before_snapshots,saved.after_snapshots,null,'preview',1,now,updated,null]);
        return decoded(saved);
      });
    },
    async confirmOrganization(batchId: string, expectedRevision: number, context: UiContext): Promise<OrganizationReceipt> {
      requireUi(context); validId(batchId); validVersion(expectedRevision);
      return db.writeTransaction(async tx => {
        const saved = await batch(tx,batchId);
        if (saved.status === 'applied') return receipt(saved);
        if (saved.status !== 'preview') throw new DailyError('BATCH_CLOSED');
        if (saved.revision !== expectedRevision) throw new DailyError('VERSION_CONFLICT');
        const view = decoded(saved), now = deps.now(), updated = new Date(now).toISOString();
        if (view.plan.type === 'memo.move') await group(tx,view.plan.groupId);
        // Check all rows before writing any row; the transaction also guards late failures.
        const rows: RecordRow[] = [];
        for (const before of view.before) {
          const row = await target(tx,before.entity,before.id);
          if ((await snapshot(row,before.entity)).hash !== before.hash) throw new DailyError('VERSION_CONFLICT');
          rows.push(row);
        }
        const after: OrganizationSnapshot[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i], prediction = view.after.find(ref => ref.id === row.id)!;
          if (view.plan.type === 'memo.move') await tx.execute('UPDATE documents SET group_id=?,sort_order=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', [view.plan.groupId,prediction.sortOrder,updated,row.id,row.revision]);
          else await tx.execute('UPDATE tasks SET deleted=1,revision=revision+1,updated_at=? WHERE id=? AND revision=?', [updated,row.id,row.revision]);
          after.push(await snapshot(await target(tx,prediction.entity,row.id),prediction.entity));
        }
        const committed: OrganizationReceipt = { batchId,status:'applied',revision:2,changed:rows.length,at:now };
        await tx.execute("UPDATE local_organization_batches SET after_snapshots=?,receipt=?,status='applied',revision=2,updated_at=? WHERE id=?", [JSON.stringify(after),JSON.stringify(committed),updated,batchId]);
        return committed;
      });
    },
    async undoOrganization(batchId: string, expectedRevision: number, context: UiContext): Promise<OrganizationReceipt> {
      requireUi(context); validId(batchId); validVersion(expectedRevision);
      return db.writeTransaction(async tx => {
        const saved = await batch(tx,batchId);
        if (saved.status === 'undone') return receipt(saved);
        if (saved.status !== 'applied') throw new DailyError('BATCH_CLOSED');
        if (saved.revision !== expectedRevision) throw new DailyError('VERSION_CONFLICT');
        const view = decoded(saved), now = deps.now(), updated = new Date(now).toISOString();
        for (const after of view.after) {
          const row = await target(tx,after.entity,after.id);
          if ((await snapshot(row,after.entity)).hash !== after.hash) throw new DailyError('VERSION_CONFLICT');
        }
        for (const before of view.before) {
          if (before.entity === 'memo') { await group(tx,before.groupId); await tx.execute('UPDATE documents SET group_id=?,sort_order=?,revision=revision+1,updated_at=? WHERE id=?', [before.groupId,before.sortOrder,updated,before.id]); }
          else await tx.execute('UPDATE tasks SET deleted=0,revision=revision+1,updated_at=? WHERE id=?', [updated,before.id]);
        }
        const undone: OrganizationReceipt = { batchId,status:'undone',revision:3,changed:view.before.length,at:now };
        await tx.execute("UPDATE local_organization_batches SET receipt=?,status='undone',revision=3,undone_at=?,updated_at=? WHERE id=?", [JSON.stringify(undone),now,updated,batchId]);
        return undone;
      });
    },
    async getOrganizationBatch(batchId: string) { validId(batchId); return db.readTransaction(async tx => decoded(await batch(tx,batchId))); },
    async listOrganizationBatches(options: { limit?: number; before?: { createdAt: number; id: string } } = {}) {
      const limit = parse(z.number().int().min(1).max(100), options.limit ?? 50);
      const before = options.before ? parse(z.strictObject({ createdAt:z.number().int().min(0),id:identifier }),options.before) : null;
      const args = before ? [before.createdAt,before.createdAt,before.id,limit] : [limit];
      return db.readTransaction(async tx => (await tx.getAll<OrganizationBatch>(`SELECT * FROM local_organization_batches${before ? ' WHERE created_at<? OR (created_at=? AND id>?)' : ''} ORDER BY created_at DESC,id LIMIT ?`, args)).map(row => {
        try { return decoded(validateOrganizationBatch(row)); } catch { throw new DailyError('INVALID_ARGUMENT'); }
      }));
    },
  };
}
