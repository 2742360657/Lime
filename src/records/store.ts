import { z } from 'zod';
import { canonicalJson } from '../domain/commands';
import { DomainError, type DomainDatabase, type DomainTransaction, type DocumentRef, type ReadContext, type Receipt, type SqlValue } from '../domain/types';
import { literalLike } from '../memories/queries';
import { validPayload, type RecordCommand, type RecordRow } from './model';
type Deps = {
    id(): string;
    now(): number;
};
export async function mutateRecord(tx: DomainTransaction, command: RecordCommand, deps: Deps, refs: DocumentRef[]): Promise<Omit<Receipt, 'operationId'>> {
    const now = deps.now(), updated = new Date(now).toISOString();
    const row = command.type === 'record.create' ? null : await tx.getOptional<RecordRow>('SELECT * FROM local_records WHERE id=?', [command.id]);
    if (command.type !== 'record.create') {
        if (!row || (command.type === 'record.restore' ? row.deleted !== 1 : row.deleted !== 0))
            throw new DomainError('NOT_FOUND');
        if (row.revision !== command.expectedRevision)
            throw new DomainError('VERSION_CONFLICT');
        if (row.revision >= Number.MAX_SAFE_INTEGER)
            throw new DomainError('INVALID_ARGUMENT');
    }
    const id = row?.id ?? deps.id();
    if (command.type === 'record.create' || command.type === 'record.update') {
        let payload: unknown;
        try {
            payload = validPayload(command.schemaKey, command.payload);
        }
        catch {
            throw new DomainError('INVALID_ARGUMENT');
        }
        const values = [command.typeKey, command.schemaKey, command.title, command.body, canonicalJson(payload), JSON.stringify([...new Set(command.tags)]), command.occurredAt, refs.length ? JSON.stringify(refs) : row?.source_refs ?? '[]'] as SqlValue[];
        if (row) {
            if (row.type_key === values[0] && row.schema_key === values[1] && row.title === values[2] && row.body === values[3] && row.payload === values[4] && row.tags === values[5] && row.occurred_at === values[6] && row.source_refs === values[7])
                return { disposition: 'unchanged', entity: { kind: 'record', id, revision: row.revision } };
            await tx.execute('UPDATE local_records SET type_key=?,schema_key=?,title=?,body=?,payload=?,tags=?,occurred_at=?,source_refs=?,revision=revision+1,updated_at=? WHERE id=?', [...values, updated, id]);
        }
        else
            await tx.execute('INSERT INTO local_records(id,type_key,schema_key,schema_version,title,body,payload,tags,occurred_at,source_refs,revision,deleted,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?,?,?,1,0,?,?)', [id, ...values, now, updated]);
    }
    else
        await tx.execute('UPDATE local_records SET deleted=?,revision=revision+1,updated_at=? WHERE id=?', [command.type === 'record.trash' ? 1 : 0, updated, id]);
    return { disposition: 'committed', entity: { kind: 'record', id, revision: (row?.revision ?? 0) + 1 } };
}
export const recordQuerySchema = z.strictObject({ typeKey: z.string().trim().min(1).max(80).optional(), query: z.string().trim().max(120).default(''), tag: z.string().trim().min(1).max(60).optional(), from: z.number().int().min(0).max(253402214400000).optional(), through: z.number().int().min(0).max(253402214400000).optional(), deleted: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(40), cursor: z.strictObject({ at: z.number().int().min(0), id: z.string().min(1).max(160) }).nullable().optional() });
export type RecordQuery = z.input<typeof recordQuerySchema>;
export type RecordMeta = Pick<RecordRow, 'id' | 'type_key' | 'schema_key' | 'schema_version' | 'title' | 'tags' | 'occurred_at' | 'revision' | 'deleted' | 'created_at'>;
export function createRecordQueries(db: DomainDatabase) {
    return {
        async list(input: RecordQuery = {}) {
            const parsed = recordQuerySchema.safeParse(input);
            if (!parsed.success || (parsed.data.from !== undefined && parsed.data.through !== undefined && parsed.data.from > parsed.data.through))
                throw new DomainError('INVALID_ARGUMENT');
            const { typeKey, query, tag, from, through, deleted, limit, cursor } = parsed.data;
            const where = ['deleted=?'], params: SqlValue[] = [deleted ? 1 : 0];
            if (typeKey) {
                where.push('type_key=?');
                params.push(typeKey);
            }
            if (query) {
                where.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')");
                params.push(literalLike(query), literalLike(query));
            }
            if (tag) {
                where.push('EXISTS (SELECT 1 FROM json_each(local_records.tags) WHERE value=?)');
                params.push(tag);
            }
            if (from !== undefined) {
                where.push('occurred_at>=?');
                params.push(from);
            }
            if (through !== undefined) {
                where.push('occurred_at<=?');
                params.push(through);
            }
            const predicate = where.join(' AND '), after = cursor ? ' AND (created_at<? OR (created_at=? AND id>?))' : '';
            const args = cursor ? [...params, cursor.at, cursor.at, cursor.id] : params;
            return db.readTransaction(async (tx) => {
                const matched = (await tx.getOptional<{
                    n: number;
                }>(`SELECT COUNT(*) AS n FROM local_records WHERE ${predicate}`, params))?.n ?? 0;
                const rows = await tx.getAll<RecordMeta>(`SELECT id,type_key,schema_key,schema_version,title,tags,occurred_at,revision,deleted,created_at FROM local_records WHERE ${predicate}${after} ORDER BY created_at DESC,id ASC LIMIT ?`, [...args, limit + 1]);
                const records = rows.slice(0, limit), last = records[records.length - 1];
                return { records, matched, nextCursor: rows.length > limit && last ? { at: last.created_at, id: last.id } : null, scope: '仅类型/标题/标签/时间和版本元信息；正文与表格可按准确版本读取；有限页不代表全部。' };
            });
        },
        async get(id: string, context: ReadContext) {
            if (typeof id !== 'string' || !id.trim() || id.length > 160)
                throw new DomainError('INVALID_ARGUMENT');
            if (!context || context.actor !== 'ui')
                throw new DomainError('PERMISSION_DENIED');
            return db.readTransaction(tx => tx.getOptional<RecordRow>('SELECT * FROM local_records WHERE id=?', [id]));
        },
    };
}
