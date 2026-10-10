import { z } from 'zod';

export class QqError extends Error {
  constructor(readonly code: 'PROTOCOL' | 'HOST' | 'NETWORK' | 'HTTP' | 'TIMEOUT' | 'CANCELLED' | 'BUSY' | 'SESSION' | 'TOO_LARGE') { super('QQ operation failed: ' + code); this.name = 'QqError'; }
}
const id = z.string().min(1).max(256);
export const bindingSchema = z.object({ appId: z.string().regex(/^\d{1,32}$/), appSecret: z.string().min(1).max(512), userOpenid: id });
export type QqBinding = z.infer<typeof bindingSchema>;
export type QqMedia = { url: string; name: string; mime: string; size: number };
export const MAX_PACKET = 1024 * 1024;
export function mediaUrl(value: string) {
  let u: URL; try { u = new URL(value); } catch { throw new QqError('HOST'); }
  if (value.length > 16384 || u.protocol !== 'https:' || !['multimedia.nt.qq.com', 'gchat.qpic.cn', 'c2cpicdw.qpic.cn'].includes(u.hostname) || u.port && u.port !== '443' || u.username || u.password || u.hash) throw new QqError('HOST');
  return u.toString();
}
export function gatewayUrl(value: string) {
  let u: URL; try { u = new URL(value); } catch { throw new QqError('HOST'); }
  if (value.length > 2048 || u.protocol !== 'wss:' || !['api.sgroup.qq.com', 'api.bot.qq.com'].includes(u.hostname) || u.port && u.port !== '443' || u.username || u.password || u.hash || !u.pathname.startsWith('/websocket')) throw new QqError('HOST');
  return u.toString();
}
export type Frame = { op: number; s?: number; t?: string; d?: unknown };
export function frame(value: string): Frame {
  if (value.length > MAX_PACKET || new TextEncoder().encode(value).length > MAX_PACKET) throw new QqError('TOO_LARGE');
  try { return z.object({ op: z.number().int().min(0).max(13), s: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), t: z.string().max(128).optional(), d: z.unknown().optional() }).parse(JSON.parse(value)); }
  catch { throw new QqError('PROTOCOL'); }
}
export function incoming(f: Frame, binding: QqBinding): { key: string; body: string; at: number; media: QqMedia[] } | null {
  if (f.t !== 'C2C_MESSAGE_CREATE') return null;
  const object = f.d as Record<string, unknown> | null;
  if (!object || typeof object !== 'object' || (object.author as { user_openid?: unknown } | null)?.user_openid !== binding.userOpenid || object.group_openid) return null;
  try {
    const msg = z.object({ id, content: z.string().max(32000).default(''), timestamp: z.string().max(64), attachments: z.array(z.object({ url: z.string(), filename: z.string().max(512).default('QQ附件'), content_type: z.string().max(128), size: z.number().int().min(0).max(10 * 1024 * 1024).optional() })).max(8).default([]) }).parse(object);
    const at = Date.parse(msg.timestamp); if (!Number.isFinite(at)) throw new QqError('PROTOCOL');
    return { key: msg.id, body: msg.content, at, media: msg.attachments.map(v => ({ url: mediaUrl(v.url), name: v.filename.replace(/[\x00-\x1f/\\]/g, '_').slice(0,180) || 'QQ附件', mime: v.content_type, size: v.size ?? -1 })) };
  } catch (e) { if (e instanceof QqError) throw e; throw new QqError('PROTOCOL'); }
}
