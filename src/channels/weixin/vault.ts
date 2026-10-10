import { bindingSchema, WeixinError, type Binding, type MediaDescriptor } from './protocol';
export type SecretStorage = { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<void>; deleteItemAsync(key: string): Promise<void> };
export function createWeixinVault(storage: SecretStorage, prefix: string) {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(prefix)) throw new WeixinError('PROTOCOL');
  const account = prefix + '-account', index = prefix + '-media-index';
  async function keys(): Promise<string[]> {
    const value = await storage.getItemAsync(index); if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 1000 || !parsed.every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) throw new WeixinError('PROTOCOL');
    return parsed;
  }
  return {
    async save(binding: Binding) { const parsed = bindingSchema.parse(binding); await storage.setItemAsync(account, JSON.stringify(parsed)); },
    async load(): Promise<Binding | null> {
      const value = await storage.getItemAsync(account); if (!value) return null;
      try { return bindingSchema.parse(JSON.parse(value)); } catch { throw new WeixinError('PROTOCOL'); }
    },
    async stageMedia(id: string, descriptor: MediaDescriptor) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new WeixinError('PROTOCOL');
      const ids = await keys();
      if (!ids.includes(id)) {
        if (ids.length >= 1000) throw new WeixinError('TOO_LARGE');
        // Manifest first: rollback leftovers remain enumerable for explicit prototype cleanup.
        await storage.setItemAsync(index, JSON.stringify([...ids, id]));
      }
      await storage.setItemAsync(prefix + '-media-' + id, JSON.stringify(descriptor));
    },
    async media(id: string): Promise<MediaDescriptor | null> {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new WeixinError('PROTOCOL');
      const value = await storage.getItemAsync(prefix + '-media-' + id);
      return value ? JSON.parse(value) : null;
    },
    async releaseMedia(id: string) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new WeixinError('PROTOCOL');
      await storage.deleteItemAsync(prefix + '-media-' + id);
      await storage.setItemAsync(index, JSON.stringify((await keys()).filter(key => key !== id)));
    },
    async remove() {
      for (const id of await keys()) await storage.deleteItemAsync(prefix + '-media-' + id);
      await storage.deleteItemAsync(index); await storage.deleteItemAsync(account);
    },
  };
}
