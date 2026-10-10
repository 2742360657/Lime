import { z } from 'zod';
import type { WeixinFetch } from '../weixin/client';
import { bindingSchema, gatewayUrl, MAX_PACKET, QqError, type QqBinding } from './protocol';

export function createQqClient(fetch: WeixinFetch, deps: { randomKey(): Promise<string>; decrypt(ciphertext: string, key: string): Promise<string> }) {
  async function request(url: string, body: unknown | undefined, token?: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new QqError('CANCELLED');
    const controller = new AbortController(), abort = () => controller.abort(); let timedOut = false;
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'QQBot ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.redirected) throw new QqError('HOST'); if (!response.ok) throw new QqError('HTTP');
      const length = response.headers.get('content-length'); if (length && Number(length) > MAX_PACKET) throw new QqError('TOO_LARGE');
      const reader = response.body?.getReader(); if (!reader) throw new QqError('PROTOCOL');
      let bytes = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break; if (!chunk.value) continue; bytes += chunk.value.length; if (bytes > MAX_PACKET) throw new QqError('TOO_LARGE'); text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (controller.signal.aborted) throw new QqError(timedOut ? 'TIMEOUT' : 'CANCELLED');
      try { return JSON.parse(text); } catch { throw new QqError('PROTOCOL'); }
    } catch (e) { if (controller.signal.aborted) throw new QqError(timedOut ? 'TIMEOUT' : 'CANCELLED'); if (e instanceof QqError) throw e; throw new QqError('NETWORK'); }
    finally { controller.abort(); clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  function parse<T>(schema: z.ZodType<T>, value: unknown): T { try { return schema.parse(value); } catch { throw new QqError('PROTOCOL'); } }
  const envelope = (data: unknown) => parse(z.object({ retcode: z.literal(0), data: z.unknown() }), data).data;
  return {
    async qr(signal?: AbortSignal) {
      const key = await deps.randomKey(); if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new QqError('PROTOCOL');
      const task = parse(z.object({ task_id: z.string().min(1).max(512) }), envelope(await request('https://q.qq.com/lite/create_bind_task', { key }, undefined, signal)));
      return { taskId: task.task_id, key, display: 'https://q.qq.com/qqbot/openclaw/connect.html?task_id=' + encodeURIComponent(task.task_id) + '&source=Lime&_wv=2' };
    },
    async status(taskId: string, key: string, signal?: AbortSignal) {
      if (!taskId || taskId.length > 512 || !/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new QqError('PROTOCOL');
      const result = parse(z.object({ status: z.number().int().min(0).max(3), bot_appid: z.union([z.string(),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).optional(), bot_encrypt_secret: z.string().max(4096).optional(), user_openid: z.string().max(256).optional() }), envelope(await request('https://q.qq.com/lite/poll_bind_result', { task_id: taskId }, undefined, signal)));
      if (result.status !== 2) return { status: result.status };
      if (!result.bot_encrypt_secret || !result.user_openid || !result.bot_appid) throw new QqError('SESSION');
      const appSecret = await deps.decrypt(result.bot_encrypt_secret, key); if (signal?.aborted) throw new QqError('CANCELLED');
      return { status: 2, binding: parse(bindingSchema, { appId: String(result.bot_appid), appSecret, userOpenid: result.user_openid }) };
    },
    async access(binding: QqBinding, signal?: AbortSignal) {
      parse(bindingSchema,binding);
      const value = parse(z.object({ access_token: z.string().min(1).max(2048), expires_in: z.union([z.number(),z.string()]) }), await request('https://api.bot.qq.com/app/getAppAccessToken', { appId: binding.appId, clientSecret: binding.appSecret }, undefined, signal));
      return value.access_token;
    },
    async gateway(token: string, signal?: AbortSignal) {
      if (!token || token.length > 2048) throw new QqError('PROTOCOL');
      return gatewayUrl(parse(z.object({ url: z.string() }), await request('https://api.bot.qq.com/gateway', undefined, token, signal)).url);
    },
  };
}
