import { z } from 'zod';
import type { DomainDatabase, DomainTransaction } from '../../domain/types';
import { mediaUrl, QqError, type Frame, type QqBinding, type QqMedia } from './protocol';
import type { QqSession } from './inbox';

export type QqProductPart = { kind: 'text' | 'media' | 'unsupported'; filename: string; body: string; capabilityId: string | null; status: 'pending' | 'error'; note: string; state: 'complete' | 'unsupported' };
export type QqProductMessage = { id: string; account_id: string; message_key: string; fingerprint: string; body: string; parts: string; created_at: number; revision: number };
const attachmentSchema = z.object({ url: z.string().max(16384), filename: z.string().max(512).default('QQ附件'), content_type: z.string().min(1).max(128), size: z.number().int().min(0).max(10 * 1024 * 1024).optional() });
const failure = (filename: string, note: string): QqProductPart => ({ kind: 'unsupported', filename, body: '', capabilityId: null, status: 'error', note, state: 'unsupported' });
const name = (value: unknown) => typeof value === 'string' ? value.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180) || 'QQ附件' : 'QQ附件';
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new QqError('CANCELLED'); };

export async function projectQqMessage(tx: DomainTransaction, message: QqProductMessage) {
  await tx.execute('UPDATE local_qq_items SET state=?,capability_id=NULL,revision=revision+1 WHERE message_id=? AND fingerprint<>?', ['superseded', message.id, message.fingerprint]);
  const parts: QqProductPart[] = JSON.parse(message.parts);
  for (let n = 0; n < parts.length; n++) {
    const part = parts[n], id = `${message.id}:${message.fingerprint}:${n}`;
    await tx.execute('INSERT OR IGNORE INTO local_qq_items(id,message_id,account_key,fingerprint,position,kind,filename,body,capability_id,material_id,status,note,state,created_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, message.id, message.account_id, message.fingerprint, n, part.kind, part.filename, part.body, part.capabilityId, null, part.status, part.note, part.state, message.created_at, 1]);
    // A fresh authenticated delivery can revive an unsaved restored history item.
    await tx.execute('UPDATE local_qq_items SET message_id=?,account_key=?,fingerprint=?,position=?,kind=?,filename=?,body=?,capability_id=?,status=?,note=?,state=?,created_at=?,revision=revision+1 WHERE id=? AND status=? AND material_id IS NULL',
      [message.id, message.account_id, message.fingerprint, n, part.kind, part.filename, part.body, part.capabilityId, part.status, part.note, part.state, message.created_at, id, 'restored']);
  }
}

export function createQqProductInbox(db: DomainDatabase, deps: { digest(value: string): Promise<string>; now(): number; stage(id: string, media: QqMedia): Promise<void>; release(id: string): Promise<void> }) {
  const account = (binding: QqBinding) => deps.digest(JSON.stringify([binding.appId, binding.userOpenid]));
  async function cleanup(ids: string[]) {
    for (const id of ids) {
      try { if (!await db.readTransaction(tx => tx.getOptional('SELECT id FROM local_qq_items WHERE capability_id=?', [id]))) await deps.release(id); } catch { /* Reconciled before the next foreground read. */ }
    }
  }
  return {
    account,
    session(binding: QqBinding): Promise<QqSession | null> { return db.readTransaction(async tx => tx.getOptional<QqSession>('SELECT session_id,seq FROM qq_product_sessions WHERE id=?', [await account(binding)])); },
    async reset(binding: QqBinding) { const key = await account(binding); await db.writeTransaction(tx => tx.execute('DELETE FROM qq_product_sessions WHERE id=?', [key])); },
    async ready(binding: QqBinding, sessionId: string, seq: number, signal?: AbortSignal) {
      if (!sessionId || sessionId.length > 512 || !Number.isSafeInteger(seq) || seq < 0) throw new QqError('PROTOCOL');
      const key = await account(binding);
      await db.writeTransaction(async tx => { cancelled(signal); await tx.execute('INSERT OR REPLACE INTO qq_product_sessions(id,session_id,seq) VALUES(?,?,?)', [key, sessionId, seq]); cancelled(signal); });
    },
    async commit(binding: QqBinding, session: QqSession, f: Frame, signal?: AbortSignal) {
      if (f.s === undefined || !Number.isSafeInteger(f.s) || f.s < 0) throw new QqError('PROTOCOL');
      cancelled(signal);
      const key = await account(binding), raw = f.d as Record<string, unknown> | null;
      const own = f.t === 'C2C_MESSAGE_CREATE' && raw && typeof raw === 'object' && (raw.author as { user_openid?: unknown } | null)?.user_openid === binding.userOpenid && !raw.group_openid;
      const staged: string[] = [], retired: string[] = [];
      let prepared: Omit<QqProductMessage, 'revision'> | null = null, existing: QqProductMessage | null = null;
      try {
        if (own) {
          const validId = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 256;
          const messageKey = validId ? raw.id as string : await deps.digest(JSON.stringify(['delivery', session.session_id, f.s]));
          const messageId = await deps.digest(JSON.stringify([key, messageKey]));
          const body = typeof raw.content === 'string' ? raw.content.slice(0, 32000) : '';
          const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
          const timestamp = typeof raw.timestamp === 'string' && raw.timestamp.length <= 64 ? raw.timestamp : '';
          const at = Date.parse(timestamp);
          // Normalize field order; URLs are only hashed and never persisted in SQL.
          const fingerprint = await deps.digest(JSON.stringify([body, typeof raw.content, typeof raw.content === 'string' && raw.content.length > 32000, timestamp, validId, Array.isArray(raw.attachments), attachments.length,
            attachments.slice(0, 8).map(part => { const p = part as Record<string, unknown> | null; return [typeof p?.url === 'string' ? p.url.slice(0, 16385) : null, name(p?.filename), typeof p?.content_type === 'string' ? p.content_type.slice(0, 129) : null, typeof p?.size === 'number' ? p.size : null]; })]));
          existing = await db.readTransaction(tx => tx.getOptional<QqProductMessage>('SELECT * FROM qq_product_messages WHERE id=?', [messageId]));
          const parts: QqProductPart[] = [];
          if (!existing || existing.fingerprint !== fingerprint) {
            if (body) parts.push({ kind: 'text', filename: 'QQ文本.txt', body, capabilityId: null, status: 'pending', note: typeof raw.content === 'string' && raw.content.length > 32000 ? '文本超过32000字，当前仅保留前32000字；完整内容请直接分享文件。' : '', state: 'complete' });
            if (!validId) parts.push(failure('QQ消息标识不完整', '平台未提供有效消息标识，已保留本次收件回执；需要的内容请重新转发。'));
            if (!Number.isFinite(at)) parts.push(failure('QQ消息时间不完整', '平台时间无法识别，显示本机收件时间供参考。'));
            if (raw.content !== undefined && typeof raw.content !== 'string') parts.push(failure('QQ文本暂不支持', '文本格式无法读取，请直接分享文件或重新发送文字。'));
            if (raw.attachments !== undefined && !Array.isArray(raw.attachments)) parts.push(failure('QQ附件描述不完整', '附件描述无法读取，请重新转发或用文件选择器导入。'));
            for (let n = 0; n < Math.min(attachments.length, 8); n++) {
              const value = attachments[n], filename = name((value as { filename?: unknown } | null)?.filename);
              const parsed = attachmentSchema.safeParse(value);
              if (!parsed.success) { parts.push(failure(filename, '附件格式或大小超出当前范围，请发送10MiB以内文件或直接导入。')); continue; }
              let media: QqMedia;
              try { media = { url: mediaUrl(parsed.data.url), name: name(parsed.data.filename), mime: parsed.data.content_type, size: parsed.data.size ?? -1 }; }
              catch { parts.push(failure(filename, '附件地址不在已支持范围，已登记失败；请直接导入或重新转发。')); continue; }
              const id = await deps.digest(JSON.stringify([messageId, fingerprint, n]));
              cancelled(signal); staged.push(id);
              try { await deps.stage(id, media); cancelled(signal); parts.push({ kind: 'media', filename: media.name, body: '', capabilityId: id, status: 'pending', note: '', state: 'complete' }); }
              catch (error) { cancelled(signal); if (error instanceof QqError && error.code === 'CANCELLED') throw error; parts.push({ kind: 'media', filename: media.name, body: '', capabilityId: null, status: 'error', note: '附件凭据未能保留；请先保存其他附件，再重新转发这一件。', state: 'complete' }); }
            }
            if (attachments.length > 8) parts.push(failure('其余QQ附件', '一条消息最多处理8个附件，其余附件请分批重新发送。'));
            if (!parts.length) parts.push(failure('QQ内容暂不支持', '消息没有可读取的文字或附件，请改发文字或直接导入文件。'));
          }
          prepared = { id: messageId, account_id: key, message_key: messageKey, fingerprint, body, parts: JSON.stringify(parts), created_at: Number.isFinite(at) ? at : deps.now() };
        }
        const result = await db.writeTransaction(async tx => {
          const current = await tx.getOptional<QqSession>('SELECT session_id,seq FROM qq_product_sessions WHERE id=?', [key]);
          if (!current || current.session_id !== session.session_id || current.seq !== session.seq) throw new QqError('BUSY');
          cancelled(signal);
          if (f.s! <= current.seq) return { saved: 0, duplicates: prepared ? 1 : 0, ignored: prepared ? 0 : 1, seq: current.seq };
          let saved = 0, duplicates = 0;
          if (prepared) {
            const old = await tx.getOptional<QqProductMessage>('SELECT * FROM qq_product_messages WHERE id=?', [prepared.id]);
            if (old && old.fingerprint === prepared.fingerprint) duplicates++;
            else {
              if ((old?.revision ?? 0) !== (existing?.revision ?? 0)) throw new QqError('BUSY');
              if (old) for (const part of JSON.parse(old.parts) as QqProductPart[]) if (part.capabilityId) retired.push(part.capabilityId);
              const message = { ...prepared, revision: (old?.revision ?? 0) + 1 };
              await tx.execute('INSERT OR REPLACE INTO qq_product_messages(id,account_id,message_key,fingerprint,body,parts,created_at,revision) VALUES(?,?,?,?,?,?,?,?)', [message.id, key, message.message_key, message.fingerprint, message.body, message.parts, message.created_at, message.revision]);
              await projectQqMessage(tx, message); saved++;
            }
          }
          cancelled(signal);
          await tx.execute('UPDATE qq_product_sessions SET seq=? WHERE id=?', [f.s!, key]);
          cancelled(signal);
          return { saved, duplicates, ignored: prepared ? 0 : 1, seq: f.s! };
        });
        await cleanup([...staged, ...retired]);
        return result;
      } catch (error) { await cleanup(staged); throw error; }
    },
  };
}
