import { z } from 'zod';
import { identifier } from '../domain/commands';
import { DomainError, type DomainDatabase, type SqlValue } from '../domain/types';
import type { MemoryRow } from '../domain/service';

export const memoryCursorSchema = z.strictObject({ updatedAt: z.iso.datetime(), id: identifier });
export const memoryQuerySchema = z.strictObject({
  query: z.string().trim().max(120).default(''),
  kind: z.enum(['fact', 'preference']).optional(),
  limit: z.number().int().min(1).max(100).default(40),
  cursor: memoryCursorSchema.nullable().optional(),
});
export type MemoryQuery = z.input<typeof memoryQuerySchema>;
export type MemoryCursor = z.infer<typeof memoryCursorSchema>;
export type MemoryPage = {
  records: (MemoryRow & { updated_at: string })[];
  matched: number; remaining: number; nextCursor: MemoryCursor | null;
  scope: string;
};

// LIKE metacharacters in user input are literal characters, never search syntax.
export function literalLike(query: string): string {
  return '%' + query.replace(/[\\%_]/g, c => '\\' + c) + '%';
}
export function createMemoryQueries(db: DomainDatabase) {
  return async (input: MemoryQuery = {}): Promise<MemoryPage> => {
    const parsed = memoryQuerySchema.safeParse(input);
    if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
    const { query, kind, limit, cursor } = parsed.data;
    const where = ['forgotten=0'], params: SqlValue[] = [];
    if (kind) { where.push('kind=?'); params.push(kind); }
    if (query) { where.push("(key LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')"); params.push(literalLike(query), literalLike(query)); }
    const predicate = where.join(' AND ');
    const after = cursor ? ' AND (updated_at<? OR (updated_at=? AND id>?))' : '';
    const pageParams = cursor ? [...params, cursor.updatedAt, cursor.updatedAt, cursor.id] : params;
    return db.readTransaction(async tx => {
      const matched = (await tx.getOptional<{ n: number }>(`SELECT COUNT(*) AS n FROM local_memories WHERE ${predicate}`, params))?.n ?? 0;
      const remaining = (await tx.getOptional<{ n: number }>(`SELECT COUNT(*) AS n FROM local_memories WHERE ${predicate}${after}`, pageParams))?.n ?? 0;
      const rows = await tx.getAll<MemoryRow & { updated_at: string }>(`SELECT id,kind,key,content,forgotten,revision,updated_at FROM local_memories WHERE ${predicate}${after} ORDER BY updated_at DESC,id ASC LIMIT ?`, [...pageParams, limit + 1]);
      const records = rows.slice(0, limit), last = records[records.length - 1];
      return {
        records, matched, remaining,
        nextCursor: rows.length > limit && last ? { updatedAt: last.updated_at, id: last.id } : null,
        scope: `仅显式保存且未忘记的个人记忆；当前匹配${matched}条，本页${records.length}条。${cursor ? '这是续页，不能视为全量结果。' : rows.length > limit ? '还有后续页，不能视为全量结果。' : '本次查询已完整返回。'}`,
      };
    });
  };
}
