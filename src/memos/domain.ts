import { z } from 'zod';
import { DomainError, type DomainTransaction } from '../domain/types';
import { memoCommandSchema, type MemoCommand } from './commands';

type Deps = { id: () => string; now: () => number };
type MemoRow = {
  id: string; kind: string; title: string; body: string; date: string;
  group_id: string | null; sort_order: number; revision: number; deleted: number;
};
type MemoMutation = {
  disposition: 'committed' | 'unchanged';
  entity: { kind: 'memo'; id: string; revision: number };
};
export type MemoMetadata = {
  id: string; kind: 'memo'; title: string; groupId: string | null; groupName: string | null;
  revision: number; updatedAt: number; deletedAt: number | null;
};
export type MemoGroupMetadata = { id: string; name: string; revision: number };

async function checkGroup(tx: DomainTransaction, id: string | null) {
  if (id !== null && !await tx.getOptional("SELECT id FROM document_groups WHERE id=? AND kind='memo' AND deleted=0", [id]))
    throw new DomainError('NOT_FOUND');
}
async function nextOrder(tx: DomainTransaction, groupId: string | null, excluding = '') {
  const row = await tx.getOptional<{ next: number }>("SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM documents WHERE kind='memo' AND deleted=0 AND group_id IS ? AND id<>?", [groupId, excluding]);
  return row?.next ?? 0;
}
function localDate(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The caller supplies one transaction and handles authority plus durable receipts.
// A draft is a separate recovery object; a command never deletes or overwrites it.
export async function mutateMemo(tx: DomainTransaction, value: MemoCommand, deps: Deps): Promise<MemoMutation> {
  const parsed = memoCommandSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
  const command = parsed.data;
  const now = deps.now(), updated = new Date(now).toISOString();
  const result = (id: string, revision: number, unchanged = false): MemoMutation => ({
    disposition: unchanged ? 'unchanged' : 'committed', entity: { kind: 'memo', id, revision },
  });
  if (command.type === 'memo.create') {
    await checkGroup(tx, command.groupId);
    const id = deps.id(), order = await nextOrder(tx, command.groupId);
    await tx.execute("INSERT INTO documents(id,kind,title,body,date,group_id,sort_order,created_at,edited_at,deleted_at,revision,deleted,updated_at) VALUES(?,'memo',?,?,?,?,?,?,?,NULL,1,0,?)",
      [id, command.title, command.body, localDate(now), command.groupId, order, now, now, updated]);
    return result(id, 1);
  }
  const row = await tx.getOptional<MemoRow>("SELECT * FROM documents WHERE id=? AND kind='memo'", [command.id]);
  if (!row || (command.type === 'memo.update' && row.deleted)) throw new DomainError('NOT_FOUND');
  if (row.revision !== command.expectedRevision) throw new DomainError('VERSION_CONFLICT');
  const requireNextRevision = () => { if (row.revision >= Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_ARGUMENT'); };
  if (command.type === 'memo.update') {
    await checkGroup(tx, command.groupId);
    if (row.title === command.title && row.body === command.body && row.group_id === command.groupId)
      return result(row.id, row.revision, true);
    requireNextRevision();
    const order = row.group_id === command.groupId ? row.sort_order : await nextOrder(tx, command.groupId, row.id);
    await tx.execute('UPDATE documents SET title=?,body=?,group_id=?,sort_order=?,edited_at=?,revision=revision+1,updated_at=? WHERE id=?',
      [command.title, command.body, command.groupId, order, now, updated, row.id]);
  } else if (command.type === 'memo.trash') {
    if (row.deleted) return result(row.id, row.revision, true);
    requireNextRevision();
    await tx.execute('UPDATE documents SET deleted=1,deleted_at=?,revision=revision+1,updated_at=? WHERE id=?', [now, updated, row.id]);
  } else {
    if (!row.deleted) return result(row.id, row.revision, true);
    requireNextRevision();
    const group = row.group_id && await tx.getOptional("SELECT id FROM document_groups WHERE id=? AND kind='memo' AND deleted=0", [row.group_id]);
    const groupId = group ? row.group_id : null;
    const order = await nextOrder(tx, groupId, row.id);
    await tx.execute('UPDATE documents SET deleted=0,deleted_at=NULL,group_id=?,sort_order=?,edited_at=?,revision=revision+1,updated_at=? WHERE id=?',
      [groupId, order, now, updated, row.id]);
  }
  return result(row.id, row.revision + 1);
}

const metadataOptions = z.strictObject({
  query: z.string().max(120).optional(), groupId: z.string().min(1).max(160).nullable().optional(),
  trashed: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional(),
});
// Search metadata only. Unselected memo bodies never enter query responses.
export async function listMemoMetadata(tx: DomainTransaction, value: z.infer<typeof metadataOptions> = {}): Promise<MemoMetadata[]> {
  const parsed = metadataOptions.safeParse(value);
  if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
  const options = parsed.data, args: (string | number | null)[] = [options.trashed ? 1 : 0];
  let filters = '';
  if (options.groupId !== undefined) { filters += ' AND d.group_id IS ?'; args.push(options.groupId); }
  const query = options.query?.trim();
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    filters += " AND (d.title LIKE ? ESCAPE '\\' OR g.name LIKE ? ESCAPE '\\')";
    args.push(pattern, pattern);
  }
  args.push(options.limit ?? 40);
  return tx.getAll<MemoMetadata>(`SELECT d.id,'memo' AS kind,SUBSTR(d.title,1,300) AS title,g.id AS groupId,g.name AS groupName,d.revision,d.edited_at AS updatedAt,d.deleted_at AS deletedAt
    FROM documents d LEFT JOIN document_groups g ON g.id=d.group_id AND g.kind='memo' AND g.deleted=0
    WHERE d.kind='memo' AND d.deleted=?${filters} ORDER BY d.edited_at DESC,d.id LIMIT ?`, args);
}
export async function listMemoGroups(tx: DomainTransaction, limit = 100): Promise<MemoGroupMetadata[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('INVALID_ARGUMENT');
  return tx.getAll<MemoGroupMetadata>("SELECT id,SUBSTR(name,1,300) AS name,revision FROM document_groups WHERE kind='memo' AND deleted=0 ORDER BY sort_order,id LIMIT ?", [limit]);
}
