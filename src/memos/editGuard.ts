import { z } from 'zod';
import type { DocumentContent } from '../assistant/database';
import { DomainError, type DomainTransaction } from '../domain/types';
import type { Memo } from '../types/habit';

const patchSchema = z.strictObject({
  title: z.string().max(300).optional(), body: z.string().max(100000).optional(),
  groupId: z.string().min(1).max(160).nullable().optional(),
});
export class MemoClassificationError extends Error {
  constructor() { super('分类不存在或已删除，请选择有效分类或未分类。当前输入仍保留。'); this.name = 'MemoClassificationError'; }
}

// Apply the same target/classification boundary to the mature manual editor.
// A changed classification is still a version conflict; never silently rebase a draft.
export async function assertMemoUpdate(tx: DomainTransaction, id: string,
  patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>, expectedRevision?: number, expectedContent?: DocumentContent,
) {
  if (!patchSchema.safeParse(patch).success) throw new DomainError('INVALID_ARGUMENT');
  const doc = await tx.getOptional<{ kind: string; revision: number; deleted: number; title: string; body: string; date: string; group_id: string | null }>('SELECT * FROM documents WHERE id=?', [id]);
  if (!doc || doc.kind !== 'memo' || doc.deleted) throw new DomainError('SOURCE_CHANGED');
  if (!Number.isSafeInteger(doc.revision) || doc.revision < 1 || doc.revision >= Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_ARGUMENT');
  const groupId = patch.groupId === undefined ? doc.group_id : patch.groupId;
  if (groupId !== null && !await tx.getOptional("SELECT id FROM document_groups WHERE id=? AND kind='memo' AND deleted=0", [groupId]))
    throw new MemoClassificationError();
  if (expectedContent && (doc.title !== expectedContent.title || doc.body !== expectedContent.body || doc.date !== expectedContent.date || doc.group_id !== (expectedContent.group_id ?? null)))
    throw new DomainError('SOURCE_CHANGED');
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || doc.revision !== expectedRevision))
    throw new DomainError('SOURCE_CHANGED');
}
