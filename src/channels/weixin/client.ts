import { API_BASE, MAX_RESPONSE, WEIXIN_VERSION, WeixinError, apiBase, bindingSchema, checkBusiness, decodePacket, updatesSchema, type Binding } from './protocol';
import { z } from 'zod';

type Reader = { read(): Promise<{ done?: boolean; value?: Uint8Array }>; cancel(): Promise<unknown>; releaseLock(): void };
export type WeixinFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; redirected: boolean; headers: { get(name: string): string | null }; body: { getReader(): Reader } | null }>;
const qrSchema = z.object({ qrcode: z.string().min(1).max(8192), qrcode_img_content: z.string().min(1).max(16384) });
const statusSchema = z.object({ status: z.enum(['wait', 'scaned', 'confirmed', 'expired', 'need_verifycode', 'verify_code_blocked', 'scaned_but_redirect', 'binded_redirect']), bot_token: z.string().optional(), ilink_bot_id: z.string().optional(), ilink_user_id: z.string().optional(), baseurl: z.string().optional(), redirect_host: z.string().optional() });
export function createWeixinClient(fetch: WeixinFetch, uin: () => Promise<string>) {
  const common = { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 9) };
  async function request(base: string, path: string, body: unknown | undefined, token: string | undefined, signal?: AbortSignal, timeout = 35000) {
    if (signal?.aborted) throw new WeixinError('CANCELLED');
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      const headers: Record<string, string> = { ...common };
      if (body !== undefined) Object.assign(headers, { 'Content-Type': 'application/json', AuthorizationType: 'ilink_bot_token', 'X-WECHAT-UIN': await uin() });
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${apiBase(base)}/${path}`, { method: body === undefined ? 'GET' : 'POST', headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: controller.signal, redirect: 'error' });
      if (response.redirected) throw new WeixinError('HOST');
      if (!response.ok) throw new WeixinError('HTTP');
      const length = response.headers.get('content-length');
      if (length && Number(length) > MAX_RESPONSE) throw new WeixinError('TOO_LARGE');
      const reader = response.body?.getReader(); if (!reader) throw new WeixinError('PROTOCOL');
      let size = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          if (controller.signal.aborted) throw new WeixinError('CANCELLED');
          if (!chunk.value) continue;
          size += chunk.value.byteLength; if (size > MAX_RESPONSE) throw new WeixinError('TOO_LARGE');
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (controller.signal.aborted) throw new WeixinError(timedOut ? 'TIMEOUT' : 'CANCELLED');
      return decodePacket(text);
    } catch (e) {
      if (controller.signal.aborted) throw new WeixinError(timedOut ? 'TIMEOUT' : 'CANCELLED');
      if (e instanceof WeixinError) throw e;
      throw new WeixinError('NETWORK'); // No response, token, URL or exception cause reaches UI/logging.
    } finally { controller.abort(); clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const metadata = { channel_version: WEIXIN_VERSION, bot_agent: 'Lime/1.1.1' };
  return {
    async qr(signal?: AbortSignal) {
      const packet = await request(API_BASE, 'ilink/bot/get_bot_qrcode?bot_type=3', { local_token_list: [] }, undefined, signal, 15000);
      try { return qrSchema.parse(packet); } catch { throw new WeixinError('PROTOCOL'); }
    },
    async status(qrcode: string, base = API_BASE, verifyCode?: string, signal?: AbortSignal) {
      if (!qrcode || qrcode.length > 8192 || (verifyCode && !/^\d{4,12}$/.test(verifyCode))) throw new WeixinError('PROTOCOL');
      const packet = await request(base, `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}${verifyCode ? `&verify_code=${encodeURIComponent(verifyCode)}` : ''}`, undefined, undefined, signal);
      let status: z.infer<typeof statusSchema>;
      try { status = statusSchema.parse(packet); } catch { throw new WeixinError('PROTOCOL'); }
      if (status.status === 'confirmed') {
        try { return { status: 'confirmed' as const, binding: bindingSchema.parse({ token: status.bot_token, botId: status.ilink_bot_id, userId: status.ilink_user_id, baseUrl: status.baseurl }) }; }
        catch (e) { if (e instanceof WeixinError) throw e; throw new WeixinError('PROTOCOL'); }
      }
      if (status.status === 'scaned_but_redirect') {
        if (!status.redirect_host || /[/?#@:\s]/.test(status.redirect_host)) throw new WeixinError('HOST');
        return { status: status.status, baseUrl: apiBase(`https://${status.redirect_host}`) };
      }
      return { status: status.status };
    },
    async updates(binding: Binding, cursor: string, signal?: AbortSignal) {
      bindingSchema.parse(binding);
      if (cursor.length > 131072) throw new WeixinError('PROTOCOL');
      const packet = await request(binding.baseUrl, 'ilink/bot/getupdates', { get_updates_buf: cursor, base_info: metadata }, binding.token, signal);
      try { const updates = updatesSchema.parse(packet); checkBusiness(updates); return updates; }
      catch (e) { if (e instanceof WeixinError) throw e; throw new WeixinError('PROTOCOL'); }
    },
  };
}
