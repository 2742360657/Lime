import type { DomainDatabase } from '../../domain/types';
import type { Material, MaterialStore } from '../../materials/store';
import { QqError, type QqMedia } from './protocol';

export type QqIntakeItem = { id: string; message_id: string; account_key: string; fingerprint: string; position: number; kind: 'text' | 'media' | 'unsupported'; filename: string; body: string; capability_id: string | null; material_id: string | null; status: 'pending' | 'saved' | 'error' | 'restored'; note: string; state: 'complete' | 'unsupported' | 'superseded'; created_at: number; revision: number };
export function createQqIntake(db: DomainDatabase, materials: Pick<MaterialStore, 'get' | 'save'>, deps: {
  media(id: string): Promise<QqMedia | null>;
  releaseMedia(id: string): Promise<void>;
  saveText(body: string, signal: AbortSignal): Promise<Material>;
  saveMedia(descriptor: QqMedia, signal: AbortSignal): Promise<Material>;
}) {
  const get = (id: string): Promise<QqIntakeItem | null> => db.readTransaction(tx => tx.getOptional('SELECT * FROM local_qq_items WHERE id=?', [id]));
  const check = (signal: AbortSignal) => { if (signal.aborted) throw new QqError('CANCELLED'); };
  async function releaseSaved(item: QqIntakeItem) {
    if (!item.capability_id) return;
    try { await deps.releaseMedia(item.capability_id); }
    catch { return; } // A later explicit save/read reconciles the remaining index entry.
    await db.writeTransaction(tx => tx.execute('UPDATE local_qq_items SET capability_id=NULL,revision=revision+1 WHERE id=? AND capability_id=? AND material_id IS NOT NULL', [item.id, item.capability_id]));
  }
  let busy = false;
  return { get,
    list(): Promise<QqIntakeItem[]> { return db.readTransaction(tx => tx.getAll('SELECT * FROM local_qq_items ORDER BY created_at DESC,id LIMIT 200')); },
    async save(id: string, signal: AbortSignal): Promise<Material> {
      if (busy) throw new QqError('BUSY'); busy = true;
      try {
        check(signal);
        const item = await get(id);
        if (!item) throw new QqError('PROTOCOL');
        if (item.material_id) {
          const material = await materials.get(item.material_id);
          if (!material || material.deleted) throw new QqError('PROTOCOL');
          await releaseSaved(item);
          return material;
        }
        if (item.state !== 'complete' || item.status === 'restored' || item.kind === 'unsupported') throw new QqError('PROTOCOL');
        check(signal);
        let material: Material;
        try {
          if (item.kind === 'text') material = await deps.saveText(item.body, signal);
          else {
            const descriptor = item.capability_id ? await deps.media(item.capability_id) : null;
            if (!descriptor) throw new QqError('SESSION');
            material = await deps.saveMedia(descriptor, signal);
          }
          check(signal);
        } catch (error) {
          if (signal.aborted || error instanceof QqError && error.code === 'CANCELLED') throw new QqError('CANCELLED');
          await db.writeTransaction(async tx => {
            check(signal);
            await tx.execute('UPDATE local_qq_items SET status=?,note=? WHERE id=? AND revision=?', ['error', error instanceof QqError && error.code === 'SESSION' ? '附件凭据已失效，请重新转发这一件。' : '保存未完成，可单独重试；链接过期时请重新转发。', item.id, item.revision]);
            check(signal);
          });
          throw new QqError(error instanceof QqError ? error.code : 'NETWORK');
        }
        await db.writeTransaction(async tx => {
          const current = await tx.getOptional<QqIntakeItem>('SELECT * FROM local_qq_items WHERE id=?', [id]);
          check(signal);
          if (!current || current.revision !== item.revision || current.state !== 'complete') throw new QqError('BUSY');
          await tx.execute('UPDATE local_qq_items SET material_id=?,status=?,note=?,revision=revision+1 WHERE id=?', [material.id, 'saved', material.note, id]);
          check(signal);
        });
        await releaseSaved(item);
        return material;
      } finally { busy = false; }
    },
  };
}
