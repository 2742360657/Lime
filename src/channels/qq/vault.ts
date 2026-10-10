import type { SecretStorage } from '../weixin/vault';
import { bindingSchema, QqError, type QqBinding, type QqMedia } from './protocol';
export function createQqVault(storage: SecretStorage, prefix: string) {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(prefix)) throw new QqError('PROTOCOL');
  const index = prefix + '-media-index';
  async function ids(): Promise<string[]> {
    const value = await storage.getItemAsync(index); if (!value) return [];
    const parsed = JSON.parse(value); if (!Array.isArray(parsed) || parsed.length > 512 || !parsed.every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) throw new QqError('PROTOCOL'); return parsed;
  }
  return {
    async save(binding: QqBinding) { await storage.setItemAsync(prefix+'-binding', JSON.stringify(bindingSchema.parse(binding))); },
    async load(): Promise<QqBinding | null> { const v=await storage.getItemAsync(prefix+'-binding'); if (!v) return null; try { return bindingSchema.parse(JSON.parse(v)); } catch { throw new QqError('PROTOCOL'); } },
    async stage(id: string, media: QqMedia) { if (!/^[a-f0-9]{64}$/.test(id)) throw new QqError('PROTOCOL'); const values = await ids(); if (!values.includes(id)) { if (values.length >= 512) throw new QqError('TOO_LARGE'); await storage.setItemAsync(index,JSON.stringify([...values,id])); } await storage.setItemAsync(prefix+'-media-'+id,JSON.stringify(media)); },
    async media(id: string): Promise<QqMedia | null> { if (!/^[a-f0-9]{64}$/.test(id)) throw new QqError('PROTOCOL'); const v=await storage.getItemAsync(prefix+'-media-'+id); return v ? JSON.parse(v) : null; },
    async remove() { for (const id of await ids()) await storage.deleteItemAsync(prefix+'-media-'+id); await storage.deleteItemAsync(index); await storage.deleteItemAsync(prefix+'-binding'); },
  };
}
