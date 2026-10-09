import type { createWeixinClient } from './client';
import type { WeixinInbox } from './inbox';
import { WeixinError, type Binding } from './protocol';
export function createWeixinReceiver(client: ReturnType<typeof createWeixinClient>, inbox: WeixinInbox) {
  let busy = false;
  return { async read(binding: Binding, signal?: AbortSignal) {
    if (busy) throw new WeixinError('BUSY');
    busy = true;
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 70000);
    let saved = 0, duplicates = 0, ignored = 0;
    try {
      if (signal?.aborted) throw new WeixinError('CANCELLED');
      for (let n = 0; n < 2; n++) {
        const cursor = await inbox.cursor(binding);
        const packet = await client.updates(binding, cursor, controller.signal);
        if (controller.signal.aborted) throw new WeixinError('CANCELLED');
        const result = await inbox.commit(binding, cursor, packet);
        saved += result.saved; duplicates += result.duplicates; ignored += result.ignored;
        if (!packet.msgs.length || !packet.get_updates_buf || packet.get_updates_buf === cursor) break;
      }
      return { saved, duplicates, ignored };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); busy = false; }
  } };
}
