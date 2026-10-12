import { z } from 'zod';
const id = z.string().trim().min(1).max(160);
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const safeKey = z.string().trim().min(1).max(80).refine(v => !['__proto__', 'prototype', 'constructor'].includes(v) && !/[\x00-\x1f]/.test(v));
export const cellKindSchema = z.enum(['text', 'decimal', 'date', 'boolean']);
export type CellKind = z.infer<typeof cellKindSchema>;
export type Cell = string | boolean | null;
export const decimalPattern = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/;
const day = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '1900-01-01' && v <= '9999-12-31' && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
export const columnSchema = z.strictObject({ key: safeKey, label: z.string().trim().min(1).max(80), kind: cellKindSchema, unit: z.string().trim().max(40).default('') });
export const tablePayloadSchema = z.strictObject({
    columns: z.array(columnSchema).min(1).max(24),
    rows: z.array(z.record(safeKey, z.union([z.string().max(2000), z.boolean(), z.null()]))).max(200),
}).superRefine((table, ctx) => {
    const keys = new Set(table.columns.map(c => c.key));
    if (keys.size !== table.columns.length)
        ctx.addIssue({ code: 'custom', message: '列标识不可重复。' });
    for (const [index, row] of table.rows.entries()) {
        if (Object.keys(row).some(key => !keys.has(key)))
            ctx.addIssue({ code: 'custom', message: '行中存在未定义的列。', path: ['rows', index] });
        for (const column of table.columns) {
            const value = row[column.key] ?? null;
            if (value === null)
                continue;
            const valid = column.kind === 'boolean' ? typeof value === 'boolean' : typeof value === 'string' && (column.kind === 'decimal' ? decimalPattern.test(value) : column.kind === 'date' ? day(value) : true);
            if (!valid)
                ctx.addIssue({ code: 'custom', message: '单元格与列类型不一致。', path: ['rows', index, column.key] });
        }
    }
    if (JSON.stringify(table).length > 32000)
        ctx.addIssue({ code: 'custom', message: '一条记录的表格内容最多32000字符，请拆分。' });
});
export type TablePayload = z.infer<typeof tablePayloadSchema>;
export const payloadSchema = z.union([z.strictObject({}), tablePayloadSchema]);
const fields = {
    typeKey: z.string().trim().min(1).max(80), schemaKey: z.enum(['text', 'table']),
    title: z.string().trim().min(1).max(200), body: z.string().max(20000), payload: payloadSchema,
    tags: z.array(z.string().trim().min(1).max(60)).max(16),
    occurredAt: z.number().int().min(0).max(253402214400000).nullable(),
};
export const recordCommandSchemas = [
    z.strictObject({ type: z.literal('record.create'), ...fields }),
    z.strictObject({ type: z.literal('record.update'), id, expectedRevision: version, ...fields }),
    z.strictObject({ type: z.literal('record.trash'), id, expectedRevision: version }),
    z.strictObject({ type: z.literal('record.restore'), id, expectedRevision: version }),
] as const;
export type RecordCommand = z.infer<typeof recordCommandSchemas[number]>;
export function validPayload(schemaKey: 'text' | 'table', value: unknown): {} | TablePayload {
    return schemaKey === 'text' ? z.strictObject({}).parse(value) : tablePayloadSchema.parse(value);
}
export type RecordRow = {
    id: string;
    type_key: string;
    schema_key: 'text' | 'table';
    schema_version: number;
    title: string;
    body: string;
    payload: string;
    tags: string;
    occurred_at: number | null;
    source_refs: string;
    revision: number;
    deleted: number;
    created_at: number;
    updated_at: string;
};
export function validateRecordRow(row: RecordRow) {
    const command = recordCommandSchemas[0].parse({ type: 'record.create', typeKey: row.type_key, schemaKey: row.schema_key, title: row.title, body: row.body, payload: JSON.parse(row.payload), tags: JSON.parse(row.tags), occurredAt: row.occurred_at });
    validPayload(command.schemaKey, command.payload);
    if (!id.safeParse(row.id).success || !version.safeParse(row.revision).success || row.schema_version !== 1 || ![0, 1].includes(row.deleted) || !Number.isSafeInteger(row.created_at) || row.created_at < 0 || !z.iso.datetime().safeParse(row.updated_at).success)
        throw new Error('Invalid generic record');
    return row;
}
export function recordSource(row: RecordRow) {
    validateRecordRow(row);
    return { id: row.id, revision: row.revision, title: row.title, kind: 'record' as const, date: row.occurred_at === null ? '' : new Date(row.occurred_at).toISOString(),
        body: JSON.stringify({ typeKey: row.type_key, schemaKey: row.schema_key, schemaVersion: row.schema_version, body: row.body, payload: JSON.parse(row.payload), tags: JSON.parse(row.tags), occurredAt: row.occurred_at }) };
}
