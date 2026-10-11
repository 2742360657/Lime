import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { database } from '../../storage/database';
import { materialStore } from '../../materials/service';
import { materialNative } from '../../materials/native';
import { createQqClient } from './client';
import { createQqVault } from './vault';
import { createQqReceiver } from './receiver';
import { createQqProductInbox } from './productInbox';
import { createQqIntake } from './intake';
import { createQqForegroundOperation } from './foreground';
import { decryptQqSecret, downloadQqMedia, discardQqMedia, qqSocket } from './native';
import { QqError } from './protocol';

const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
const vault = createQqVault(SecureStore, 'lime-qq-product-v1');
const client = createQqClient(fetch, { randomKey: async () => btoa(String.fromCharCode(...await Crypto.getRandomBytesAsync(32))), decrypt: decryptQqSecret });
const inbox = createQqProductInbox(database, { digest, now: Date.now, stage: vault.stage, release: vault.release });
const receiver = createQqReceiver(client, inbox, qqSocket);
const foreground = createQqForegroundOperation({ active: () => AppState.currentState === 'active', subscribe: fn => { const sub = AppState.addEventListener('change', fn); return () => sub.remove(); } });
const check = (signal: AbortSignal) => { if (signal.aborted) throw new QqError('CANCELLED'); };
const intake = createQqIntake(database, materialStore, {
  media: vault.media, releaseMedia: vault.release,
  async saveText(body, signal) {
    const file = new File(Paths.cache, 'lime-qq-text-' + Crypto.randomUUID() + '.txt');
    try {
      check(signal); file.write(body);
      const copy = await materialNative.copy(file.uri, 'QQ文本.txt', 'text/plain'); check(signal);
      const parsed = await materialNative.parse(copy.uri, copy.name); check(signal);
      return await materialStore.save(copy, parsed);
    } finally { if (file.exists) file.delete(); }
  },
  async saveMedia(descriptor, signal) {
    const download = await downloadQqMedia(descriptor, signal);
    try {
      const copy = await materialNative.copy(download.uri, descriptor.name, descriptor.mime); check(signal);
      const parsed = await materialNative.parse(copy.uri, copy.name); check(signal);
      return await materialStore.save(copy, parsed);
    } finally { await discardQqMedia(download.uri); }
  },
});
let qr: { taskId: string; key: string; display: string; at: number } | null = null;
export const qqService = {
  list: intake.list,
  async bound() { return !!await vault.load(); },
  cancel: foreground.cancel,
  close() { foreground.cancel(); qr = null; },
  requestQr() {
    qr = null;
    return foreground.run(async signal => { const result = await client.qr(signal); check(signal); qr = { ...result, at: Date.now() }; return qr.display; });
  },
  confirmQr() {
    return foreground.run(async signal => {
      const pending = qr;
      if (!pending || Date.now() - pending.at > 300000) { qr = null; return 3; }
      const result = await client.status(pending.taskId, pending.key, signal); check(signal);
      if (result.binding) { await vault.save(result.binding); qr = null; }
      if (result.status === 3) qr = null;
      return result.status;
    });
  },
  unbind() {
    return foreground.run(async () => {
      qr = null;
      // Retain history and originals, revoke only this product namespace's capabilities.
      await vault.remove();
      await database.writeTransaction(async tx => {
        await tx.execute('DELETE FROM qq_product_sessions');
        await tx.execute('UPDATE local_qq_items SET capability_id=NULL,status=?,note=?,revision=revision+1 WHERE kind=? AND material_id IS NULL AND status<>?', ['error', '已解除绑定，未保存的附件请重新绑定后转发。', 'media', 'restored']);
      });
    });
  },
  read() {
    return foreground.run(async signal => {
      const binding = await vault.load(); if (!binding) throw new QqError('SESSION');
      const retained = await database.readTransaction(tx => tx.getAll<{ capability_id: string }>('SELECT capability_id FROM local_qq_items WHERE capability_id IS NOT NULL AND material_id IS NULL AND state=?', ['complete']));
      await vault.prune(retained.map(row => row.capability_id)); check(signal);
      return receiver.read(binding, signal);
    });
  },
  save(id: string) { return foreground.run(signal => intake.save(id, signal)); },
};
export function qqErrorText(error: unknown) {
  const code = error instanceof QqError ? error.code : 'PROTOCOL';
  return ({ SESSION: '绑定或附件凭据已失效，请重新扫码；附件请重新转发。', CANCELLED: '已停止；已提交的收件和材料保留，可再次读取或重试。', BUSY: '正在处理另一项操作，请稍后重试。', TOO_LARGE: '本次内容超出接收范围；请分批发送10MiB以内的文件。', TIMEOUT: '本次读取未完成，请重试；漏收内容请重新转发。', HOST: 'QQ服务地址不受支持，已保存内容保留；漏收附件请重新转发或直接导入。', NETWORK: '连接或文件操作未完成；已登记内容保留，漏收内容请重新转发。', HTTP: 'QQ服务暂时无法访问，请稍后重试。', PROTOCOL: '内容格式暂不能处理；已登记记录保留，请重新转发或直接导入。' })[code];
}
