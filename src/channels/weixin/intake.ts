import type { DomainDatabase, DomainTransaction } from '../../domain/types';
import type { Material, MaterialStore } from '../../materials/store';
import type { InboxMessage } from './inbox';
import { WeixinError, type MediaDescriptor } from './protocol';

export type IntakeItem = { id: string; message_id: string; account_key: string; fingerprint: string; position: number; kind: 'text' | 'media' | 'unsupported'; filename: string; body: string; capability_id: string | null; material_id: string | null; status: 'pending' | 'saved' | 'error' | 'restored'; note: string; state: string; created_at: number; revision: number };
export async function projectWeixinMessage(tx: DomainTransaction, message: InboxMessage) {
  // Earlier versions remain readable, with a clear marker; never delete a saved material.
  await tx.execute('UPDATE local_weixin_items SET state=?,revision=revision+1 WHERE message_id=?', [message.state === 'deleted' ? 'deleted' : 'superseded', message.id]);
  const parts: { kind: string; text?: string; name?: string; capabilityId?: string }[] = JSON.parse(message.parts);
  if (!parts.length) parts.push({ kind: 'unsupported' });
  for (let n = 0; n < parts.length; n++) {
    const part = parts[n], id = `${message.id}:${message.fingerprint}:${n}`;
    await tx.execute('INSERT OR IGNORE INTO local_weixin_items(id,message_id,account_key,fingerprint,position,kind,filename,body,capability_id,material_id,status,note,state,created_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, message.id, message.account_id, message.fingerprint, n, part.kind, part.kind === 'text' ? '微信文本.txt' : part.name ?? '不支持的微信内容', part.text ?? '', part.capabilityId ?? null, null, 'pending', '', message.state, message.created_at, 1]);
  }
}
export function createWeixinIntake(db: DomainDatabase, materials: Pick<MaterialStore, 'get' | 'save'>, deps: {
  media(id: string): Promise<MediaDescriptor | null>;
  releaseMedia(id: string): Promise<void>;
  saveText(body: string): Promise<Material>;
  saveMedia(descriptor: MediaDescriptor, signal: AbortSignal): Promise<Material>;
}) {
  const get = (id: string): Promise<IntakeItem | null> => db.readTransaction(tx => tx.getOptional('SELECT * FROM local_weixin_items WHERE id=?', [id]));
  let busy = false;
  return { get,
    async list(): Promise<IntakeItem[]> { return db.readTransaction(tx => tx.getAll('SELECT * FROM local_weixin_items ORDER BY created_at DESC,id LIMIT 200')); },
    async save(id: string, signal: AbortSignal): Promise<Material> {
      if (busy) throw new WeixinError('BUSY');
      busy = true;
      try {
        const item = await get(id);
        if (!item) throw new WeixinError('PROTOCOL');
        if (item.material_id) {
          const material = await materials.get(item.material_id);
          if (!material || material.deleted) throw new WeixinError('PROTOCOL');
          return material;
        }
        if (item.state !== 'complete' || item.status === 'restored' || item.kind === 'unsupported') throw new WeixinError('PROTOCOL');
        if (signal.aborted) throw new WeixinError('CANCELLED');
        let material: Material;
        try {
          if (item.kind === 'text') material = await deps.saveText(item.body);
          else {
            const descriptor = item.capability_id ? await deps.media(item.capability_id) : null;
            if (!descriptor) throw new WeixinError('SESSION');
            material = await deps.saveMedia(descriptor, signal);
          }
          if (signal.aborted) throw new WeixinError('CANCELLED');
        } catch (error) {
          if (signal.aborted || error instanceof WeixinError && error.code === 'CANCELLED') throw new WeixinError('CANCELLED');
          await db.writeTransaction(tx => tx.execute('UPDATE local_weixin_items SET status=?,note=? WHERE id=? AND revision=?',
            ['error', error instanceof WeixinError && error.code === 'SESSION' ? '附件凭据已失效，请重新转发。' : '保存未完成，可重试；链接过期时请重新转发。', item.id, item.revision]));
          throw new WeixinError(error instanceof WeixinError ? error.code : 'NETWORK');
        }
        // A stale download can leave a deduplicated original, but never replace a newer receipt.
        await db.writeTransaction(async tx => {
          const current = await tx.getOptional<IntakeItem>('SELECT * FROM local_weixin_items WHERE id=?', [id]);
          if (!current || current.revision !== item.revision || current.state !== 'complete') throw new WeixinError('BUSY');
          await tx.execute('UPDATE local_weixin_items SET material_id=?,status=?,note=?,revision=revision+1 WHERE id=?', [material.id, 'saved', material.note, id]);
        });
        if (item.capability_id) await deps.releaseMedia(item.capability_id).catch(() => {});
        return material;
      } finally { busy = false; }
    },
  };
}
