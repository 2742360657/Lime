import { z } from 'zod';
import { DomainError, type DocumentRef, type DomainDatabase, type DomainTransaction } from '../domain/types';
import { decimalUnits, formatUnits, gradeCommandSchema, type GradeCommand } from './commands';

export type GradeRow = {
  id: string; course: string; term: string; score_units: number; credit_units: number | null;
  note: string; source_refs: string; deleted: number; revision: number; created_at: number; updated_at: string;
};
type Deps = { id: () => string; now: () => number };
export const gradeIdentity = (row: Pick<GradeRow, 'course' | 'term'>) => JSON.stringify([row.course.trim().normalize('NFC'), row.term.trim().normalize('NFC')]);
const filterSchema = z.strictObject({ term: z.string().trim().min(1).max(80).transform(v => v.normalize('NFC')).optional(), course: z.string().trim().min(1).max(100).transform(v => v.normalize('NFC')).optional(), deleted: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(50) });
export type GradeFilter = z.input<typeof filterSchema>;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => '\\' + c);

export async function mutateGrade(tx: DomainTransaction, command: GradeCommand, deps: Deps, refs: DocumentRef[] = []) {
  const parsed = gradeCommandSchema.safeParse(command);
  if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
  const cmd = parsed.data, now = deps.now(), updated = new Date(now).toISOString();
  const existing = cmd.type === 'grade.create' ? null : await tx.getOptional<GradeRow>('SELECT * FROM local_grades WHERE id=?', [cmd.id]);
  if (cmd.type !== 'grade.create') {
    if (!existing || (!!existing.deleted && cmd.type !== 'grade.restore')) throw new DomainError('NOT_FOUND');
    if (existing.revision !== cmd.expectedRevision) throw new DomainError('VERSION_CONFLICT');
  }
  const identity = cmd.type === 'grade.create' || cmd.type === 'grade.update' ? { course: cmd.course, term: cmd.term } : existing!;
  if (cmd.type !== 'grade.trash') {
    const duplicate = await tx.getOptional<{ id: string }>('SELECT id FROM local_grades WHERE course=? AND term=? AND deleted=0 AND id<>?', [identity.course, identity.term, existing?.id ?? '']);
    if (duplicate) throw new DomainError('ALREADY_EXISTS');
  }
  const id = existing?.id ?? deps.id();
  let unchanged = false;
  if (cmd.type === 'grade.create' || cmd.type === 'grade.update') {
    const score = decimalUnits(cmd.score, 10000), credit = cmd.credits === null ? null : decimalUnits(cmd.credits, 10000);
    const sourceRefs = refs.length ? JSON.stringify(refs) : existing?.source_refs ?? '[]';
    unchanged = !!existing && existing.course === cmd.course && existing.term === cmd.term && existing.score_units === score && existing.credit_units === credit && existing.note === cmd.note && existing.source_refs === sourceRefs;
    if (existing && !unchanged) await tx.execute('UPDATE local_grades SET course=?,term=?,score_units=?,credit_units=?,note=?,source_refs=?,revision=revision+1,updated_at=? WHERE id=?', [cmd.course, cmd.term, score, credit, cmd.note, sourceRefs, updated, id]);
    if (!existing) await tx.execute('INSERT INTO local_grades(id,course,term,score_units,credit_units,note,source_refs,deleted,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,1,?,?)', [id, cmd.course, cmd.term, score, credit, cmd.note, sourceRefs, now, updated]);
  } else {
    const deleted = cmd.type === 'grade.trash' ? 1 : 0;
    unchanged = existing!.deleted === deleted;
    if (!unchanged) await tx.execute('UPDATE local_grades SET deleted=?,revision=revision+1,updated_at=? WHERE id=?', [deleted, updated, id]);
  }
  return { disposition: unchanged ? 'unchanged' as const : 'committed' as const, entity: { kind: 'grade' as const, id, revision: (existing?.revision ?? 0) + (unchanged ? 0 : 1) } };
}

export function validateGradeRow(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.course === 'string' && row.course.trim().length > 0 && row.course === row.course.trim().normalize('NFC') && row.course.length <= 100 && typeof row.term === 'string' && row.term.trim().length > 0 && row.term === row.term.trim().normalize('NFC') && row.term.length <= 80 &&
    Number.isInteger(row.score_units) && Number(row.score_units) >= 0 && Number(row.score_units) <= 10000 &&
    (row.credit_units === null || Number.isInteger(row.credit_units) && Number(row.credit_units) > 0 && Number(row.credit_units) <= 10000) &&
    typeof row.note === 'string' && row.note.length <= 600 && typeof row.source_refs === 'string' && (row.deleted === 0 || row.deleted === 1) &&
    Number.isSafeInteger(row.revision) && Number(row.revision) > 0 && Number.isSafeInteger(row.created_at) && Number(row.created_at) >= 0 &&
    typeof row.updated_at === 'string' && row.updated_at.length <= 40 && Number.isFinite(Date.parse(row.updated_at));
}

export function createGradeQueries(db: DomainDatabase) {
  function filter(value: GradeFilter = {}) {
    const parsed = filterSchema.safeParse(value);
    if (!parsed.success) throw new DomainError('INVALID_ARGUMENT');
    const f = parsed.data, clauses = ['deleted=?'], params: (string | number)[] = [f.deleted ? 1 : 0];
    if (f.term) { clauses.push('term=?'); params.push(f.term); }
    if (f.course) { clauses.push("course LIKE ? ESCAPE '\\'"); params.push('%' + escapeLike(f.course) + '%'); }
    return { f, where: clauses.join(' AND '), params };
  }
  return {
    async list(options: GradeFilter = {}) {
      const { f, where, params } = filter(options);
      return db.readTransaction(async tx => {
        const matched = Number((await tx.getOptional<{ n: number }>('SELECT COUNT(*) AS n FROM local_grades WHERE ' + where, params))?.n ?? 0);
        const rows = await tx.getAll<GradeRow>('SELECT * FROM local_grades WHERE ' + where + ' ORDER BY term DESC,course,id LIMIT ?', [...params, f.limit]);
        return { rows, matched, returned: rows.length, complete: matched === rows.length };
      });
    },
    async summary(options: { term?: string; course?: string } = {}) {
      const { f, where, params } = filter({ ...options, limit: 100 });
      return db.readTransaction(async tx => {
        const matched = Number((await tx.getOptional<{ n: number }>('SELECT COUNT(*) AS n FROM local_grades WHERE ' + where, params))?.n ?? 0);
        if (matched > 1000) return { term: f.term ?? null, course: f.course ?? null, matched, complete: false, average: null, weightedAverage: null, reason: '范围超过1000门，请按学期或课程缩小范围。' };
        const rows = await tx.getAll<GradeRow>('SELECT * FROM local_grades WHERE ' + where + ' ORDER BY id', params);
        let sum = 0n, weighted = 0n, credits = 0n, missingCredits = 0;
        const identities = new Set<string>();
        for (const row of rows) {
          if (!validateGradeRow(row)) throw new DomainError('INVALID_ARGUMENT');
          const identity = gradeIdentity(row);
          if (identities.has(identity)) return { term: f.term ?? null, course: f.course ?? null, matched, complete: false, average: null, weightedAverage: null, reason: '当前范围有重复课程和学期，请先核对记录。' };
          identities.add(identity);
          sum += BigInt(row.score_units);
          if (row.credit_units === null) missingCredits++;
          else { credits += BigInt(row.credit_units); weighted += BigInt(row.score_units) * BigInt(row.credit_units); }
        }
        const rounded = (numerator: bigint, denominator: bigint) => denominator === 0n ? null : formatUnits(Number((numerator * 2n + denominator) / (denominator * 2n)));
        return {
          term: f.term ?? null, course: f.course ?? null, matched, complete: true, scale: 100,
          average: rounded(sum, BigInt(rows.length)), weightedAverage: missingCredits ? null : rounded(weighted, credits),
          totalCredits: missingCredits ? null : formatUnits(Number(credits)), missingCredits,
          reason: rows.length === 0 ? '当前范围没有成绩。' : missingCredits ? '部分课程缺少学分，未计算加权平均。' : '',
          rounding: '两位小数，四舍五入；100分制，不推算GPA。',
        };
      });
    },
  };
}
