import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { database } from '../../storage/database';
import { materialStore } from '../../materials/service';
import { materialNative } from '../../materials/native';
import { createWeixinClient } from './client';
import { createWeixinInbox } from './inbox';
import { createWeixinVault } from './vault';
import { createWeixinReceiver } from './receiver';
import { createWeixinIntake, projectWeixinMessage } from './intake';
import { createForegroundOperation } from './foreground';
import { downloadWeixinMedia, discardWeixinDownload } from './native';
import { API_BASE, WeixinError } from './protocol';

const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
const vault = createWeixinVault(SecureStore, 'lime-wx-product-v1');
const client = createWeixinClient(fetch, async () => {
  const bytes = await Crypto.getRandomBytesAsync(4);
  return btoa(String(bytes[0] * 16777216 + bytes[1] * 65536 + bytes[2] * 256 + bytes[3]));
});
const inbox = createWeixinInbox(database, { digest, now: Date.now, stageMedia: vault.stageMedia, project: projectWeixinMessage });
const receiver = createWeixinReceiver(client, inbox);
const foreground = createForegroundOperation({ active: () => AppState.currentState === 'active', subscribe: fn => { const sub = AppState.addEventListener('change', fn); return () => sub.remove(); } });
const intake = createWeixinIntake(database, materialStore, {
  media: vault.media, releaseMedia: vault.releaseMedia,
  async saveText(body) {
    const file = new File(Paths.cache, 'lime-wx-text-' + Crypto.randomUUID() + '.txt');
    try {
      file.write(body);
      const copy = await materialNative.copy(file.uri, '微信文本.txt', 'text/plain');
      return await materialStore.save(copy, await materialNative.parse(copy.uri, copy.name));
    } finally { if (file.exists) file.delete(); }
  },
  async saveMedia(descriptor, signal) {
    const download = await downloadWeixinMedia(descriptor, signal);
    try {
      const copy = await materialNative.copy(download.uri, descriptor.name, descriptor.mime);
      if (signal.aborted) throw new WeixinError('CANCELLED');
      const parsed = await materialNative.parse(copy.uri, copy.name);
      if (signal.aborted) throw new WeixinError('CANCELLED');
      return await materialStore.save(copy, parsed);
    } finally { await discardWeixinDownload(download.uri); }
  },
});
let qr: { qrcode: string; display: string; base: string; at: number } | null = null;
export const weixinService = {
  list: intake.list,
  async bound() { return !!await vault.load(); },
  cancel: foreground.cancel,
  close() { foreground.cancel(); qr = null; },
  async requestQr() {
    qr = null;
    return foreground.run(async signal => {
      const result = await client.qr(signal);
      if (signal.aborted) throw new WeixinError('CANCELLED');
      qr = { qrcode: result.qrcode, display: result.qrcode_img_content, base: API_BASE, at: Date.now() };
      return qr.display;
    });
  },
  async confirmQr(code?: string) {
    return foreground.run(async signal => {
      const pending = qr;
      if (!pending || Date.now() - pending.at > 5 * 60000) { qr = null; return 'expired'; }
      const result = await client.status(pending.qrcode, pending.base, code || undefined, signal);
      if (signal.aborted) throw new WeixinError('CANCELLED');
      if (result.status === 'confirmed') { await vault.save(result.binding); qr = null; }
      if (result.status === 'scaned_but_redirect' && qr === pending) qr = { ...pending, base: result.baseUrl };
      if (['expired','verify_code_blocked','binded_redirect'].includes(result.status)) qr = null;
      return result.status;
    });
  },
  async unbind() { return foreground.run(async () => { qr = null; await vault.remove(); }); },
  async read() {
    return foreground.run(async signal => {
      const binding = await vault.load(); if (!binding) throw new WeixinError('SESSION');
      return receiver.read(binding, signal);
    });
  },
  save(id: string) { return foreground.run(signal => intake.save(id, signal)); },
};
export function weixinErrorText(error: unknown) {
  const code = error instanceof WeixinError ? error.code : 'PROTOCOL';
  return ({ SESSION: '绑定或附件凭据已失效，请重新扫码，附件请重新转发。', CANCELLED: '已停止；已保存的内容保留，可再次读取或重试。', BUSY: '正在处理另一项操作，请稍后重试。', TOO_LARGE: '内容超出当前接收范围，请分批发送较小文件。', TIMEOUT: '读取超时，请稍后重试。', HOST: '微信服务地址不受支持，请重新扫码。', NETWORK: '网络或文件操作未完成，请重试。', HTTP: '微信服务暂时无法访问，请稍后重试。', BUSINESS: '微信服务未接受本次读取，请稍后重试。', PROTOCOL: '该操作未完成；不完整或恢复的附件请重新转发。' })[code];
}
