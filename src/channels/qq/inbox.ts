import type { DomainDatabase } from '../../domain/types';
import { incoming, QqError, type Frame, type QqBinding, type QqMedia } from './protocol';
export type QqSession = { session_id: string; seq: number };
export type QqMessage = { id: string; account_id: string; message_key: string; body: string; parts: string; created_at: number };
export function createQqInbox(db: DomainDatabase, deps: { digest(value: string): Promise<string>; stage(id: string, media: QqMedia): Promise<void> }) {
  const account = (binding: QqBinding) => deps.digest(binding.appId+'\0'+binding.userOpenid);
  return {
    async session(binding: QqBinding): Promise<QqSession | null> { const key=await account(binding); return db.readTransaction(tx => tx.getOptional<QqSession>('SELECT session_id,seq FROM qq_sessions WHERE id=?',[key])); },
    async reset(binding: QqBinding) { const key=await account(binding); await db.writeTransaction(tx => tx.execute('DELETE FROM qq_sessions WHERE id=?',[key])); },
    async ready(binding: QqBinding, sessionId: string, seq: number, signal?: AbortSignal) {
      if (!sessionId || sessionId.length > 512 || !Number.isSafeInteger(seq) || seq < 0) throw new QqError('PROTOCOL');
      const key=await account(binding); await db.writeTransaction(async tx => { if (signal?.aborted) throw new QqError('CANCELLED'); await tx.execute('INSERT OR REPLACE INTO qq_sessions(id,session_id,seq) VALUES(?,?,?)',[key,sessionId,seq]); });
    },
    async commit(binding: QqBinding, session: QqSession, f: Frame, signal?: AbortSignal) {
      if (f.s === undefined || !Number.isSafeInteger(f.s) || f.s < 0) throw new QqError('PROTOCOL');
      const key=await account(binding), msg=incoming(f,binding), messageId=msg ? await deps.digest(key+'\0'+msg.key) : '';
      const existing = msg ? await db.readTransaction(tx => tx.getOptional('SELECT id FROM qq_messages WHERE id=?',[messageId])) : null;
      const parts: { kind: string; capabilityId: string; name: string }[] = [];
      if (msg && !existing) for (let n=0;n<msg.media.length;n++) { const id=await deps.digest(messageId+'\0'+n); if (signal?.aborted) throw new QqError('CANCELLED'); await deps.stage(id,msg.media[n]); parts.push({kind:'media',capabilityId:id,name:msg.media[n].name}); }
      return db.writeTransaction(async tx => {
        const current=await tx.getOptional<QqSession>('SELECT session_id,seq FROM qq_sessions WHERE id=?',[key]);
        if (!current || current.session_id !== session.session_id || current.seq !== session.seq) throw new QqError('BUSY');
        if (signal?.aborted) throw new QqError('CANCELLED');
        if (f.s! <= current.seq) return { saved:0,duplicates:msg?1:0,ignored:msg?0:1,seq:current.seq };
        const duplicate = msg ? await tx.getOptional('SELECT id FROM qq_messages WHERE id=?',[messageId]) : null;
        if (msg && !duplicate && existing) throw new QqError('BUSY');
        if (msg && !duplicate) await tx.execute('INSERT INTO qq_messages(id,account_id,message_key,body,parts,created_at) VALUES(?,?,?,?,?,?)',[messageId,key,msg.key,msg.body,JSON.stringify(parts),msg.at]);
        await tx.execute('UPDATE qq_sessions SET seq=? WHERE id=?',[f.s!,key]);
        return { saved:msg&&!duplicate?1:0,duplicates:msg&&duplicate?1:0,ignored:msg?0:1,seq:f.s! };
      });
    },
    async list(binding: QqBinding): Promise<QqMessage[]> { const key=await account(binding); return db.readTransaction(tx => tx.getAll('SELECT * FROM qq_messages WHERE account_id=? ORDER BY created_at,id',[key])); },
  };
}
