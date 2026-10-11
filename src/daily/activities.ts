import { z } from 'zod';
import { identifier } from '../domain/commands';
import { DomainError, type DomainDatabase, type SqlValue } from '../domain/types';
import { literalLike } from '../memories/queries';
import type { ActivityRow } from '../domain/service';

const activityQuerySchema = z.strictObject({
  status: z.enum(['active', 'completed', 'cancelled', 'all']).default('active'),
  query: z.string().trim().max(120).default(''),
  limit: z.number().int().min(1).max(100).default(40),
  cursor: z.strictObject({ createdAt: z.number().int().min(0).max(253402214400000), id: identifier }).nullable().optional(),
});
export type ActivityQuery = z.input<typeof activityQuerySchema>;
export type ActivityRecord = ActivityRow & {
  status: 'active' | 'completed' | 'cancelled'; created_at: number; completed_at: number | null;
  habit_name: string | null; habit_available: number;
  checkin_state: 'none' | 'linked' | 'missing';
};
export type ActivityPage = { records: ActivityRecord[]; matched: number; remaining: number; nextCursor: { createdAt: number; id: string } | null };
export function createActivityQueries(db: DomainDatabase) {
  return async (input: ActivityQuery = {}): Promise<ActivityPage> => {
    const parsed = activityQuerySchema.safeParse(input);
    if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
    const { status, query, limit, cursor } = parsed.data;
    const where = ['1=1'], params: SqlValue[] = [];
    if (status !== 'all') { where.push('a.status=?'); params.push(status); }
    if (query) { where.push("(a.title LIKE ? ESCAPE '\\' OR a.kind LIKE ? ESCAPE '\\')"); params.push(literalLike(query), literalLike(query)); }
    const predicate = where.join(' AND '), after = cursor ? ' AND (a.created_at<? OR (a.created_at=? AND a.id>?))' : '';
    const pageParams = cursor ? [...params,cursor.createdAt,cursor.createdAt,cursor.id] : params;
    return db.readTransaction(async tx => {
      const matched = (await tx.getOptional<{ n:number }>(`SELECT COUNT(*) AS n FROM local_activities a WHERE ${predicate}`, params))?.n ?? 0;
      const remaining = (await tx.getOptional<{ n:number }>(`SELECT COUNT(*) AS n FROM local_activities a WHERE ${predicate}${after}`, pageParams))?.n ?? 0;
      const rows = await tx.getAll<ActivityRecord>(`SELECT a.*, h.name AS habit_name,
        CASE WHEN h.id IS NOT NULL AND h.deleted=0 AND h.archived_at IS NULL THEN 1 ELSE 0 END AS habit_available,
        CASE WHEN a.checkin_id IS NULL THEN 'none' WHEN c.id IS NOT NULL AND c.deleted=0 AND c.habit_id=a.habit_id THEN 'linked' ELSE 'missing' END AS checkin_state
        FROM local_activities a LEFT JOIN habits h ON h.id=a.habit_id LEFT JOIN checkins c ON c.id=a.checkin_id
        WHERE ${predicate}${after} ORDER BY a.created_at DESC,a.id ASC LIMIT ?`, [...pageParams,limit+1]);
      const records = rows.slice(0,limit), last = records[records.length-1];
      return { records,matched,remaining,nextCursor:rows.length>limit && last ? { createdAt:last.created_at,id:last.id } : null };
    });
  };
}
