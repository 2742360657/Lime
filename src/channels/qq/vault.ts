import type { SecretStorage } from '../weixin/vault';
import { bindingSchema, QqError, type QqBinding, type QqMedia } from './protocol';
export function createQqVault(storage: SecretStorage, prefix: string) {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(prefix)) throw new QqError('PROTOCOL');
  const index = prefix + '-media-index';
  let tail: Promise<unknown> = Promise.resolve();
  function mutate<T>(fn: () => Promise<T>): Promise<T> { const result = tail.then(fn); tail = result.catch(() => {}); return result; }
  const validateId = (id: string) => { if (!/^[a-f0-9]{64}$/.test(id)) throw new QqError('PROTOCOL'); };
  async function ids(): Promise<string[]> {
    const value = await storage.getItemAsync(index); if (!value) return [];
    const parsed = JSON.parse(value); if (!Array.isArray(parsed) || parsed.length > 512 || !parsed.every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) throw new QqError('PROTOCOL'); return parsed;
  }
  return {
    async save(binding: QqBinding) { await storage.setItemAsync(prefix+'-binding', JSON.stringify(bindingSchema.parse(binding))); },
    async load(): Promise<QqBinding | null> { const v=await storage.getItemAsync(prefix+'-binding'); if (!v) return null; try { return bindingSchema.parse(JSON.parse(v)); } catch { throw new QqError('PROTOCOL'); } },
    stage(id: string, media: QqMedia) { return mutate(async () => { validateId(id); const values = await ids(); if (!values.includes(id)) { if (values.length >= 512) throw new QqError('TOO_LARGE'); await storage.setItemAsync(index,JSON.stringify([...values,id])); } await storage.setItemAsync(prefix+'-media-'+id,JSON.stringify(media)); }); },
    async media(id: string): Promise<QqMedia | null> { if (!/^[a-f0-9]{64}$/.test(id)) throw new QqError('PROTOCOL'); const v=await storage.getItemAsync(prefix+'-media-'+id); return v ? JSON.parse(v) : null; },
    release(id: string) { return mutate(async () => { validateId(id); await storage.deleteItemAsync(prefix+'-media-'+id); await storage.setItemAsync(index,JSON.stringify((await ids()).filter(value => value !== id))); }); },
    prune(keep: string[]) { return mutate(async () => { keep.forEach(validateId); const values = await ids(), retained = new Set(keep); for (const id of values) if (!retained.has(id)) await storage.deleteItemAsync(prefix+'-media-'+id); await storage.setItemAsync(index,JSON.stringify(values.filter(id => retained.has(id)))); }); },
    remove() { return mutate(async () => { for (const id of await ids()) await storage.deleteItemAsync(prefix+'-media-'+id); await storage.deleteItemAsync(index); await storage.deleteItemAsync(prefix+'-binding'); }); },
  };
}
