import { z } from 'zod';
import { documentRefsSchema } from '../domain/commands';
import { DomainError, type DomainDatabase, type DocumentRef, type ReadContext } from '../domain/types';
import { tablePayloadSchema, type RecordRow } from './model';
export const calculationSchema = z.strictObject({ column: z.string().min(1).max(80), operation: z.enum(['sum', 'average', 'min', 'max', 'weightedAverage']), weightColumn: z.string().min(1).max(80).optional(), precision: z.number().int().min(0).max(12).default(2) }).refine(v => v.operation !== 'weightedAverage' || Boolean(v.weightColumn));
const SCALE = 1000000000000n;
function units(value: string) { const negative = value.startsWith('-'), [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.'); return (BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0'))) * (negative ? -1n : 1n); }
function decimal(numerator: bigint, denominator: bigint, precision: number) {
    const negative = numerator < 0n, n = negative ? -numerator : numerator, factor = 10n ** BigInt(precision);
    const rounded = (n * factor * 2n + denominator) / (denominator * 2n), whole = rounded / factor, fraction = rounded % factor;
    return `${negative && rounded !== 0n ? '-' : ''}${whole}${precision ? '.' + String(fraction).padStart(precision, '0') : ''}`;
}
export async function calculateRecords(db: DomainDatabase, refs: DocumentRef[], input: z.input<typeof calculationSchema>, context: ReadContext) {
    const parsed = calculationSchema.safeParse(input);
    if (!parsed.success || !documentRefsSchema.safeParse(refs).success || !refs.length || new Set(refs.map(r => r.id)).size !== refs.length)
        throw new DomainError('INVALID_ARGUMENT');
    const { column, operation, weightColumn, precision } = parsed.data;
    return db.readTransaction(async (tx) => {
        const values: bigint[] = [], weights: bigint[] = [];
        let rows = 0, missing = 0, missingWeights = 0, unit: string | undefined, weightUnit: string | undefined;
        for (const ref of refs) {
            if (ref.kind !== 'record')
                throw new DomainError('INVALID_ARGUMENT');
            if (context.actor !== 'ui' && (context.actor !== 'agent' || !context.documentRefs?.some(r => r.kind === 'record' && r.id === ref.id && r.revision === ref.revision)))
                throw new DomainError('PERMISSION_DENIED');
            const row = await tx.getOptional<RecordRow>('SELECT * FROM local_records WHERE id=? AND deleted=0', [ref.id]);
            if (!row || row.revision !== ref.revision)
                throw new DomainError('SOURCE_CHANGED');
            if (row.schema_key !== 'table')
                throw new DomainError('INVALID_ARGUMENT');
            const table = tablePayloadSchema.parse(JSON.parse(row.payload));
            if (table.columns.find(c => c.key === column)?.kind !== 'decimal' || operation === 'weightedAverage' && table.columns.find(c => c.key === weightColumn)?.kind !== 'decimal')
                throw new DomainError('INVALID_ARGUMENT');
            const valueUnit = table.columns.find(c => c.key === column)!.unit;
            const currentWeightUnit = operation === 'weightedAverage' ? table.columns.find(c => c.key === weightColumn)!.unit : '';
            if (unit !== undefined && (unit !== valueUnit || weightUnit !== currentWeightUnit))
                throw new DomainError('INVALID_ARGUMENT');
            unit = valueUnit;
            weightUnit = currentWeightUnit;
            for (const record of table.rows) {
                if (++rows > 800)
                    throw new DomainError('INVALID_ARGUMENT');
                const value = record[column];
                if (value === null || value === undefined) {
                    missing++;
                    continue;
                }
                values.push(units(String(value)));
                if (operation === 'weightedAverage') {
                    const weight = record[weightColumn!];
                    if (weight === null || weight === undefined || units(String(weight)) <= 0n)
                        missingWeights++;
                    else
                        weights.push(units(String(weight)));
                }
            }
        }
        if (!rows || missing || missingWeights)
            return { value: null, operation, rows, missing, missingWeights, complete: false, unit, reason: !rows ? '所选范围没有数据行。' : '存在缺失值或无效权重，不计算不完整范围。' };
        let n: bigint, d: bigint = SCALE;
        if (operation === 'weightedAverage') {
            n = values.reduce((sum, value, i) => sum + value * weights[i], 0n);
            d = SCALE * weights.reduce((sum, value) => sum + value, 0n);
        }
        else if (operation === 'min' || operation === 'max')
            n = values.reduce((best, value) => operation === 'min' ? (value < best ? value : best) : (value > best ? value : best));
        else {
            n = values.reduce((sum, value) => sum + value, 0n);
            if (operation === 'average')
                d *= BigInt(values.length);
        }
        return { value: decimal(n, d, precision), operation, rows, missing: 0, missingWeights: 0, complete: true, unit, scope: '仅当前明确选择的全部数据行，不代表未选记录；没有采用业务特定分制或公式。' };
    });
}
