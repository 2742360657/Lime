import { z } from 'zod';
import { DomainError, type DocumentRef, type DomainDatabase } from '../domain/types';

export type Material = { id: string; filename: string; uri: string; hash: string; size: number; mime: string; kind: string; body: string; images: string; pages: number; status: string; note: string; revision: number; deleted: number; created_at: number };
export type Analysis = { kind: string; body: string; images: { uri: string; label: string }[]; pages: number; status: 'ready' | 'unsupported'; note: string };
export type Copy = { name: string; uri: string; hash: string; size: number; mime: string };
export type ImportOutcome = { refs: DocumentRef[]; errors: string[] };
const copySchema = z.object({ name: z.string().min(1).max(180), uri: z.string().startsWith('file://'), hash: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().min(0).max(10 * 1024 * 1024), mime: z.string().max(200) });
const analysisSchema = z.object({ kind: z.enum(['text', 'image', 'pdf', 'unsupported']), body: z.string().max(32000), images: z.array(z.object({ uri: z.string().startsWith('file://'), label: z.string().max(100) })).max(6), pages: z.number().int().min(0).max(100000), status: z.enum(['ready', 'unsupported']), note: z.string().max(400) });
export const errorText = (code: string) => ({ TOO_LARGE: '文件超过10MiB，未导入。', TOO_MANY: '一次最多接收6件文件。', INVALID_URI: '该文件地址不受支持，请用系统文件选择器。', INBOX_FULL: '待接收内容过多，请先打开酸橙处理。', EMPTY: '没有可接收内容。' }[code] ?? '文件无法读取，请从原应用重新分享或选择。');

export function createMaterialStore(db: DomainDatabase, deps: { id: () => string; now: () => number }) {
  async function get(id: string): Promise<Material | null> { return db.readTransaction(tx => tx.getOptional('SELECT * FROM local_materials WHERE id=?', [id])); }
  async function save(copy: Copy, analysis: Analysis): Promise<Material> {
    copySchema.parse(copy); analysisSchema.parse(analysis);
    return db.writeTransaction(async tx => {
      const existing = await tx.getOptional<Material>('SELECT * FROM local_materials WHERE hash=? ORDER BY created_at,id LIMIT 1', [copy.hash]);
      if (existing) {
        if (existing.deleted) {
          await tx.execute('UPDATE local_materials SET deleted=0,revision=revision+1 WHERE id=?', [existing.id]);
          return { ...existing, deleted: 0, revision: existing.revision + 1 };
        }
        return existing;
      }
      const material: Material = { id: deps.id(), filename: copy.name, uri: copy.uri, hash: copy.hash, size: copy.size, mime: copy.mime, ...analysis, images: JSON.stringify(analysis.images), revision: 1, deleted: 0, created_at: deps.now() };
      await tx.execute('INSERT INTO local_materials(id,filename,uri,hash,size,mime,kind,body,images,pages,status,note,revision,deleted,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [material.id, material.filename, material.uri, material.hash, material.size, material.mime, material.kind, material.body, material.images, material.pages, material.status, material.note, 1, 0, material.created_at]);
      return material;
    });
  }
  return { db, get, save,
    async list(): Promise<Material[]> { return db.readTransaction(tx => tx.getAll('SELECT * FROM local_materials WHERE deleted=0 ORDER BY created_at DESC,id LIMIT 100')); },
    async revise(id: string, expectedRevision: number, analysis: Analysis) {
      analysisSchema.parse(analysis);
      return db.writeTransaction(async tx => {
        const material = await tx.getOptional<Material>('SELECT * FROM local_materials WHERE id=?', [id]);
        if (!material || material.deleted || material.revision !== expectedRevision) throw new DomainError('SOURCE_CHANGED');
        await tx.execute('UPDATE local_materials SET body=?,images=?,kind=?,pages=?,status=?,note=?,revision=revision+1 WHERE id=?', [analysis.body, JSON.stringify(analysis.images), analysis.kind, analysis.pages, analysis.status, analysis.note, id]);
      });
    },
    async archive(id: string, expectedRevision: number) {
      return db.writeTransaction(async tx => {
        const material = await tx.getOptional<Material>('SELECT * FROM local_materials WHERE id=?', [id]);
        if (!material || material.deleted || material.revision !== expectedRevision) throw new DomainError('SOURCE_CHANGED');
        await tx.execute('UPDATE local_materials SET deleted=1,revision=revision+1 WHERE id=?', [id]);
      });
    },
    async receipt(id: string) {
      const row = await db.readTransaction(tx => tx.getOptional<{ outcome: string }>('SELECT outcome FROM local_material_imports WHERE id=?', [id]));
      return row ? JSON.parse(row.outcome) as ImportOutcome : null;
    },
    async stage(id: string, outcome: ImportOutcome) {
      await db.writeTransaction(async tx => {
        if (await tx.getOptional('SELECT id FROM local_material_imports WHERE id=?', [id])) return;
        const pending = (await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='material-inbox'"))?.value;
        const outcomes = pending ? JSON.parse(pending) : [];
        await tx.execute('INSERT INTO local_material_imports(id,outcome,created_at) VALUES(?,?,?)', [id, JSON.stringify(outcome), deps.now()]);
        await tx.execute("INSERT OR REPLACE INTO local_meta(id,value) VALUES('material-inbox',?)", [JSON.stringify([...outcomes, { id, ...outcome }])]);
      });
    },
    async inbox(): Promise<(ImportOutcome & { id: string })[]> {
      const row = await db.readTransaction(tx => tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='material-inbox'"));
      return row ? JSON.parse(row.value) : [];
    },
    async dismissInbox(ids: string[]) {
      await db.writeTransaction(async tx => {
        const row = await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='material-inbox'"), outcomes: { id: string }[] = row ? JSON.parse(row.value) : [];
        await tx.execute("INSERT OR REPLACE INTO local_meta(id,value) VALUES('material-inbox',?)", [JSON.stringify(outcomes.filter(o => !ids.includes(o.id)))]);
      });
    },
    async draft(session: string): Promise<DocumentRef[]> {
      const row = await db.readTransaction(tx => tx.getOptional<{ value: string }>('SELECT value FROM local_meta WHERE id=?', ['material-draft-' + session]));
      return row ? JSON.parse(row.value) : [];
    },
    async saveDraft(session: string, refs: DocumentRef[]) {
      await db.writeTransaction(tx => tx.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)', ['material-draft-' + session, JSON.stringify(refs)]));
    },
  };
}
export type MaterialStore = ReturnType<typeof createMaterialStore>;
