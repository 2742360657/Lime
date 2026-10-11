import { z } from 'zod';
import { identifier, revision } from '../domain/commands';

const id = identifier.refine(value => value.trim() === value);
const selected = z.array(z.strictObject({ id, expectedRevision: revision })).min(1).max(20)
  .refine(rows => new Set(rows.map(row => row.id)).size === rows.length);
export const organizationPlanSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('memo.move'), targets: selected, groupId: id.nullable() }),
  z.strictObject({ type: z.literal('task.trash'), targets: selected }),
]);
export type OrganizationPlan = z.infer<typeof organizationPlanSchema>;
export const organizationSnapshotSchema = z.strictObject({
  id, entity: z.enum(['memo', 'task']), revision,
  groupId: id.nullable(), sortOrder: z.number().int().min(0).nullable(),
  deleted: z.union([z.literal(0), z.literal(1)]),
  title: z.string().max(300), hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type OrganizationSnapshot = z.infer<typeof organizationSnapshotSchema>;
const coverageRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const organizationReceiptSchema = z.strictObject({
  batchId: id, status: z.enum(['applied', 'undone']), revision: coverageRevision,
  changed: z.number().int().min(0).max(20), at: z.number().int().min(0),
});
export type OrganizationReceipt = z.infer<typeof organizationReceiptSchema> & { replayed?: boolean };
export type OrganizationBatch = {
  id: string; fingerprint: string; plan: string; before_snapshots: string; after_snapshots: string;
  receipt: string | null; status: 'preview' | 'applied' | 'undone' | 'restored'; revision: number;
  created_at: number; updated_at: string; undone_at: number | null;
};
const batchSchema = z.strictObject({
  id, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), plan: z.string().max(16000),
  before_snapshots: z.string().max(32000), after_snapshots: z.string().max(32000),
  receipt: z.string().max(4000).nullable(), status: z.enum(['preview', 'applied', 'undone', 'restored']),
  revision: coverageRevision, created_at: z.number().int().min(0),
  updated_at: z.string().datetime(), undone_at: z.number().int().min(0).nullable(),
});

// Used at both the local receipt boundary and the full-backup boundary.
export function validateOrganizationBatch(value: unknown): OrganizationBatch {
  const row = batchSchema.parse(value), plan = organizationPlanSchema.parse(JSON.parse(row.plan));
  const snapshots = z.array(organizationSnapshotSchema).min(1).max(20);
  const before = snapshots.parse(JSON.parse(row.before_snapshots));
  const after = snapshots.parse(JSON.parse(row.after_snapshots));
  const targets = new Map(plan.targets.map(ref => [ref.id, ref]));
  if (before.length !== targets.size || after.length !== targets.size ||
    new Set(before.map(ref => ref.id)).size !== targets.size || new Set(after.map(ref => ref.id)).size !== targets.size)
    throw new Error('Invalid organization snapshots');
  const entity = plan.type === 'memo.move' ? 'memo' : 'task';
  for (const snapshot of before) {
    const target = targets.get(snapshot.id), next = after.find(ref => ref.id === snapshot.id);
    if (!target || snapshot.revision !== target.expectedRevision || snapshot.entity !== entity || snapshot.deleted !== 0 ||
      !next || next.entity !== entity || next.title !== snapshot.title ||
      next.revision !== snapshot.revision + 1 ||
      (plan.type === 'memo.move' ? next.groupId !== plan.groupId || next.deleted !== 0 : next.deleted !== 1 || next.groupId !== null) ||
      (entity === 'task' && (snapshot.groupId !== null || next.sortOrder !== snapshot.sortOrder)))
      throw new Error('Invalid organization transitions');
  }
  if (row.status === 'preview' && (row.receipt !== null || row.revision !== 1 || row.undone_at !== null)) throw new Error('Invalid organization preview');
  if (row.receipt !== null) {
    const receipt = organizationReceiptSchema.parse(JSON.parse(row.receipt ?? 'null'));
    if (receipt.batchId !== row.id || (row.status !== 'restored' && receipt.status !== row.status) || receipt.revision !== row.revision || receipt.changed !== before.length ||
      (receipt.status === 'applied' ? row.revision !== 2 || row.undone_at !== null : row.revision !== 3 || row.undone_at !== receipt.at))
      throw new Error('Invalid organization receipt');
  }
  if (['applied','undone'].includes(row.status) && row.receipt === null) throw new Error('Missing organization receipt');
  if (row.status === 'restored' && row.receipt === null && (row.revision !== 1 || row.undone_at !== null)) throw new Error('Invalid restored preview');
  return row;
}

export function organizationDependencies(value: unknown): { table: 'documents' | 'tasks' | 'document_groups'; id: string; historical: true }[] {
  const row = validateOrganizationBatch(value), plan = organizationPlanSchema.parse(JSON.parse(row.plan));
  const refs = plan.targets.map(target => ({ table: plan.type === 'memo.move' ? 'documents' as const : 'tasks' as const, id: target.id, historical: true as const }));
  const groups: { table: 'document_groups'; id: string; historical: true }[] = [];
  if (plan.type === 'memo.move') {
    const before = JSON.parse(row.before_snapshots) as OrganizationSnapshot[];
    for (const id of new Set([plan.groupId,...before.map(snapshot => snapshot.groupId)])) if (id) groups.push({ table:'document_groups',id,historical:true });
  }
  return [...refs,...groups];
}
