import type { DomainDatabase } from '../../domain/types';
import { WeixinError, incoming, type Binding, type MediaDescriptor, type Updates } from './protocol';
export type InboxMessage = { id: string; account_id: string; message_key: string; fingerprint: string; state: string; body: string; parts: string; created_at: number; revision: number };
export function createWeixinInbox(db: DomainDatabase, deps: { now(): number; digest(value: string): Promise<string>; stageMedia(id: string, descriptor: MediaDescriptor): Promise<void> }) {
  const accountId = (binding: Binding) => deps.digest(JSON.stringify([binding.botId, binding.userId]));
  return {
    async cursor(binding: Binding) {
      const row = await db.readTransaction(async tx => tx.getOptional<{ cursor: string }>('SELECT cursor FROM weixin_accounts WHERE id=?', [await accountId(binding)]));
      return row?.cursor ?? '';
    },
    async commit(binding: Binding, expectedCursor: string, packet: Updates) {
      const account = await accountId(binding), messages = [];
      let ignored = 0;
      for (const raw of packet.msgs) {
        const msg = incoming(raw, binding); if (!msg) { ignored++; continue; }
        const id = await deps.digest(JSON.stringify([account, msg.key]));
        const fingerprint = await deps.digest(JSON.stringify(msg)), parts = [];
        for (let n = 0; n < msg.parts.length; n++) {
          const part = msg.parts[n];
          if (part.kind !== 'media') { parts.push(part); continue; }
          const capabilityId = await deps.digest(JSON.stringify([id, fingerprint, n]));
          // Stage capabilities before committing references; a failure cannot advance the cursor.
          await deps.stageMedia(capabilityId, part.descriptor);
          parts.push({ kind: 'media', name: part.descriptor.name, size: part.descriptor.size, capabilityId });
        }
        messages.push({ id, key: msg.key, state: msg.state, fingerprint, createdAt: msg.createdAt,
          body: msg.parts.filter(p => p.kind === 'text').map(p => p.kind === 'text' ? p.text : '').join('\n'), parts: JSON.stringify(parts) });
      }
      return db.writeTransaction(async tx => {
        const current = await tx.getOptional<{ cursor: string }>('SELECT cursor FROM weixin_accounts WHERE id=?', [account]);
        if ((current?.cursor ?? '') !== expectedCursor) throw new WeixinError('BUSY');
        let saved = 0, duplicates = 0;
        for (const msg of messages) {
          const old = await tx.getOptional<InboxMessage>('SELECT * FROM weixin_messages WHERE id=?', [msg.id]);
          if (old && (old.fingerprint === msg.fingerprint || old.state === 'deleted' || (old.state === 'complete' && msg.state === 'pending'))) { duplicates++; continue; }
          await tx.execute('INSERT OR REPLACE INTO weixin_messages(id,account_id,message_key,fingerprint,state,body,parts,created_at,revision) VALUES(?,?,?,?,?,?,?,?,?)',
            [msg.id, account, msg.key, msg.fingerprint, msg.state, msg.body, msg.parts, msg.createdAt, (old?.revision ?? 0) + 1]);
          saved++;
        }
        const cursor = packet.get_updates_buf || expectedCursor;
        await tx.execute('INSERT OR REPLACE INTO weixin_accounts(id,bot_id,user_id,cursor,updated_at) VALUES(?,?,?,?,?)', [account, binding.botId, binding.userId, cursor, deps.now()]);
        return { saved, duplicates, ignored, cursor };
      });
    },
    async list(binding: Binding): Promise<InboxMessage[]> {
      const account = await accountId(binding);
      return db.readTransaction(tx => tx.getAll('SELECT * FROM weixin_messages WHERE account_id=? ORDER BY created_at DESC,id LIMIT 200', [account]));
    },
  };
}
export type WeixinInbox = ReturnType<typeof createWeixinInbox>;
