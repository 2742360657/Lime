import { parse } from 'lossless-json';
import { z } from 'zod';

export const WEIXIN_VERSION = '2.4.9';
export const API_BASE = 'https://ilinkai.weixin.qq.com';
export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_RESPONSE = 1024 * 1024;
export type WeixinCode = 'HOST' | 'PROTOCOL' | 'NETWORK' | 'HTTP' | 'SESSION' | 'BUSINESS' | 'CANCELLED' | 'TIMEOUT' | 'TOO_LARGE' | 'BUSY';
export class WeixinError extends Error {
  constructor(readonly code: WeixinCode) { super(`微信验证未完成：${code}`); this.name = 'WeixinError'; }
}
export function apiBase(value: string): string {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || !['', '/'].includes(u.pathname)
      || !(u.hostname === 'ilinkai.weixin.qq.com' || u.hostname.endsWith('.ilinkai.weixin.qq.com'))) throw new Error();
    return u.origin;
  } catch { throw new WeixinError('HOST'); }
}
export function mediaUrl(value: string): string {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname !== 'novac2c.cdn.weixin.qq.com' || u.port || u.username || u.password || u.hash || u.pathname !== '/c2c/download') throw new Error();
    return u.href;
  } catch { throw new WeixinError('HOST'); }
}
export function decodePacket(raw: string): unknown {
  try {
    // Mature parser retains unsafe integers before any JS Number conversion can lose digits.
    return parse(raw, undefined, { parseNumber: value => {
      const n = Number(value);
      return Number.isFinite(n) && (!Number.isInteger(n) || Number.isSafeInteger(n)) ? n : value;
    } });
  } catch { throw new WeixinError('PROTOCOL'); }
}
const id = z.string().min(1).max(256);
export const bindingSchema = z.object({ token: z.string().min(1).max(8192), botId: id, userId: id, baseUrl: z.string().transform(apiBase) });
export type Binding = z.infer<typeof bindingSchema>;
export const updatesSchema = z.object({ ret: z.number().int().optional(), errcode: z.number().int().optional(), msgs: z.array(z.unknown()).max(200).default([]), get_updates_buf: z.string().max(131072).optional() });
export type Updates = z.infer<typeof updatesSchema>;
export function checkBusiness(value: { ret?: number; errcode?: number }) {
  if (value.ret === -14 || value.errcode === -14) throw new WeixinError('SESSION');
  if ((value.ret !== undefined && value.ret !== 0) || (value.errcode !== undefined && value.errcode !== 0)) throw new WeixinError('BUSINESS');
}
export type MediaDescriptor = { url: string; key: string; encoding: 'hex' | 'base64' | 'plain'; size: number; md5: string; name: string; mime: string };
export type MessagePart = { kind: 'text'; text: string } | { kind: 'media'; descriptor: MediaDescriptor } | { kind: 'unsupported'; type: number };
export type Incoming = { key: string; state: 'complete' | 'pending' | 'deleted' | 'unsupported'; createdAt: number; parts: MessagePart[] };
function stableId(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{1,20}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function descriptor(item: Record<string, unknown>, image: boolean): MediaDescriptor {
  const media = object(item.media);
  const url = mediaUrl(typeof media.full_url === 'string' ? media.full_url : `https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=${encodeURIComponent(String(media.encrypt_query_param ?? ''))}`);
  if (!media.full_url && (typeof media.encrypt_query_param !== 'string' || !media.encrypt_query_param || media.encrypt_query_param.length > 16384)) throw new WeixinError('PROTOCOL');
  let key = '', encoding: MediaDescriptor['encoding'] = 'plain';
  if (image && typeof item.aeskey === 'string') { key = item.aeskey; encoding = 'hex'; if (!/^[a-fA-F0-9]{32}$/.test(key)) throw new WeixinError('PROTOCOL'); }
  else if (typeof media.aes_key === 'string') { key = media.aes_key; encoding = 'base64'; if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(key) || key.length > 128) throw new WeixinError('PROTOCOL'); }
  else if (!image) throw new WeixinError('PROTOCOL');
  const size = typeof item.len === 'string' && /^\d{1,10}$/.test(item.len) ? Number(item.len) : -1;
  if (size > MAX_FILE) throw new WeixinError('TOO_LARGE');
  const name = image ? '微信图片.jpg' : typeof item.file_name === 'string' ? item.file_name.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180) || '微信文件' : '微信文件';
  const md5 = typeof item.md5 === 'string' && /^[a-fA-F0-9]{32}$/.test(item.md5) ? item.md5.toLowerCase() : '';
  return { url, key, encoding, size, md5, name, mime: image ? 'image/jpeg' : 'application/octet-stream' };
}
export function incoming(value: unknown, binding: Binding): Incoming | null {
  const msg = object(value);
  if (msg.from_user_id !== binding.userId || msg.message_type !== 1 || msg.group_id) return null;
  const key = stableId(msg.message_id) ?? (typeof msg.client_id === 'string' && msg.client_id.length <= 256 ? msg.client_id : null);
  if (!key) throw new WeixinError('PROTOCOL'); // Do not consume an unidentifiable own message silently.
  const createdAt = typeof msg.create_time_ms === 'number' && Number.isSafeInteger(msg.create_time_ms) ? msg.create_time_ms : 0;
  if (typeof msg.delete_time_ms === 'number' && msg.delete_time_ms > 0) return { key, state: 'deleted', createdAt, parts: [] };
  if (!Array.isArray(msg.item_list) || msg.item_list.length > 100) return { key, state: 'unsupported', createdAt, parts: [] };
  const parts: MessagePart[] = msg.item_list.map(raw => {
    const item = object(raw), type = typeof item.type === 'number' ? item.type : -1;
    if (type === 1) {
      const text = object(item.text_item).text;
      return typeof text === 'string' && text.length <= 32000 ? { kind: 'text', text } : { kind: 'unsupported', type };
    }
    if (type === 2 || type === 4) {
      try { return { kind: 'media', descriptor: descriptor(object(type === 2 ? item.image_item : item.file_item), type === 2) }; }
      catch { return { kind: 'unsupported', type }; }
    }
    return { kind: 'unsupported', type };
  });
  return { key, createdAt, state: msg.message_state === 2 ? 'complete' : 'pending', parts };
}
