import { z } from 'zod';

const id = z.string().trim().min(1).max(160);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// Decimal strings preserve what the user entered and avoid binary floating point rounding.
export function decimalUnits(value: string, maximum: number): number {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value)) return -1;
  const [whole, fraction = ''] = value.split('.');
  const units = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return units <= maximum ? units : -1;
}
const score = z.string().trim().refine(v => decimalUnits(v, 10000) >= 0, '请输入0到100的成绩，最多两位小数。');
const creditValue = z.string().trim().refine(v => decimalUnits(v, 10000) > 0, '学分须大于0且不超过100，最多两位小数。').nullable();
const fields = {
  course: z.string().trim().min(1).max(100).transform(v => v.normalize('NFC')),
  term: z.string().trim().min(1).max(80).transform(v => v.normalize('NFC')),
  score, credits: creditValue.default(null), note: z.string().trim().max(600).default(''),
};
export const gradeCommandSchemas = [
  z.strictObject({ type: z.literal('grade.create'), ...fields }),
  z.strictObject({ type: z.literal('grade.update'), id, expectedRevision: version, ...fields, credits: creditValue, note: z.string().trim().max(600) }),
  z.strictObject({ type: z.literal('grade.trash'), id, expectedRevision: version }),
  z.strictObject({ type: z.literal('grade.restore'), id, expectedRevision: version }),
] as const;
export const gradeCommandSchema = z.discriminatedUnion('type', gradeCommandSchemas);
export type GradeCommand = z.infer<typeof gradeCommandSchema>;
export function formatUnits(value: number): string { return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`; }
