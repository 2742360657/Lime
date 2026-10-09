import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, NativeModules } from 'react-native';
import { createWeixinClient } from '../channels/weixin/client';
import { createWeixinInbox } from '../channels/weixin/inbox';
import { createWeixinSchema } from '../channels/weixin/schema';
import { createWeixinVault } from '../channels/weixin/vault';
import { createWeixinReceiver } from '../channels/weixin/receiver';
import { discardWeixinDownload, downloadWeixinMedia, validateWeixinCipher } from '../channels/weixin/native';
import { WeixinError } from '../channels/weixin/protocol';
import { materialNative } from '../materials/native';
const VECTOR = {"ciphertext":"UimlH+6foVOGlLBzKhGwNcHKXmLQsRXbdfLgR/JJglQ3jDojrB9HZ2xMiqzPQ9Q2","size":34,"hash":"13569892edf1bbc375383a10c52587e88ff9187e2292d987653fcca577013397"};
const digest = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
export async function randomUin() { const b = await Crypto.getRandomBytesAsync(4); return btoa(String(b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3])); }
const live = () => createWeixinClient(fetch, randomUin);
let controller: AbortController | null = null;
export function cancelWeixinValidation() { controller?.abort(); }
async function foreground<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (controller) throw new WeixinError('BUSY');
  controller = new AbortController(); const local = controller;
  const listener = AppState.addEventListener('change', state => { if (state !== 'active') local.abort(); });
  try { return await fn(local.signal); } finally { listener.remove(); controller = null; }
}
export async function runWeixinProbe() {
  if (!__DEV__) throw new WeixinError('PROTOCOL');
  const filename = `lime-dev-weixin-${Crypto.randomUUID()}.sqlite`, prefix = 'lime-wx-fixture-' + Crypto.randomUUID();
  let db = new PowerSyncDatabase({ schema: createWeixinSchema(), database: { dbFilename: filename } });
  const vault = createWeixinVault(SecureStore, prefix), files: File[] = [];
  const ensure = (value: unknown) => { if (!value) throw new Error('Synthetic Weixin check failed'); };
  try {
    await db.init();
    const fixtureFetch = (url: string, init: RequestInit) => fetch('http://127.0.0.1:8093' + new URL(url).pathname + new URL(url).search, init);
    const client = createWeixinClient(fixtureFetch, randomUin);
    const qr = await client.qr(), status = await client.status(qr.qrcode); ensure(status.status === 'confirmed');
    if (status.status !== 'confirmed') throw new WeixinError('PROTOCOL');
    await vault.save(status.binding); const binding = await vault.load(); ensure(binding);
    if (!binding) throw new WeixinError('PROTOCOL');
    let inbox = createWeixinInbox(db, { digest, now: Date.now, stageMedia: vault.stageMedia });
    const received = await createWeixinReceiver(client, inbox).read(binding);
    ensure(received.saved === 3 && received.duplicates === 3 && received.ignored === 2);
    ensure(await inbox.cursor(binding) === 'synthetic-cursor');
    const rows = await inbox.list(binding); ensure(rows.length === 3 && rows.some(row => row.message_key === '18446744073709551615'));
    ensure(!JSON.stringify(rows).includes(binding.token) && !JSON.stringify(rows).includes('aes_key'));
    const cancelled = new AbortController(); setTimeout(() => cancelled.abort(), 100);
    const slow = createWeixinClient((_url, init) => fetch('http://127.0.0.1:8093/slow', init), randomUin);
    let aborted = false; try { await slow.qr(cancelled.signal); } catch (e) { aborted = e instanceof WeixinError && e.code === 'CANCELLED'; } ensure(aborted);
    for (const [key, encoding] of [['30'.repeat(16), 'hex'], [btoa('0'.repeat(16)), 'base64'], [btoa('30'.repeat(16)), 'base64']]) {
      const decoded = await validateWeixinCipher(VECTOR.ciphertext, key, encoding); ensure(decoded.size === VECTOR.size && decoded.hash === VECTOR.hash);
    }
    let badPadding = false; try { await validateWeixinCipher(btoa('0'.repeat(16)), '30'.repeat(16), 'hex'); } catch { badPadding = true; } ensure(badPadding);
    const native = NativeModules.LimeWeixin;
    const downloaded = JSON.parse(await native.fixtureDownload(Crypto.randomUUID(), 'good', '30'.repeat(16), VECTOR.size));
    try {
      ensure(downloaded.hash === VECTOR.hash && downloaded.size === VECTOR.size);
      const target = new File(Paths.document, 'lime-materials', `${VECTOR.hash}.txt`), existed = target.exists;
      const copy = await materialNative.copy(downloaded.uri, '合成微信附件.txt', 'text/plain');
      if (!existed) files.push(new File(copy.uri));
      const parsed = await materialNative.parse(copy.uri, copy.name); ensure(parsed.status === 'ready' && parsed.body.includes('合成微信附件'));
    } finally { await discardWeixinDownload(downloaded.uri); }
    for (const kind of ['padding', 'large', 'redirect']) {
      let rejected = false; try { await native.fixtureDownload(Crypto.randomUUID(), kind, '30'.repeat(16), VECTOR.size); } catch { rejected = true; } ensure(rejected);
    }
    const slowId = Crypto.randomUUID(); const waiting = native.fixtureDownload(slowId, 'slow', '30'.repeat(16), VECTOR.size); setTimeout(() => { void native.cancel(slowId); }, 100);
    let mediaCancelled = false; try { await waiting; } catch { mediaCancelled = true; } ensure(mediaCancelled);
    await db.close(); db = new PowerSyncDatabase({ schema: createWeixinSchema(), database: { dbFilename: filename } }); await db.init();
    inbox = createWeixinInbox(db, { digest, now: Date.now, stageMedia: vault.stageMedia });
    ensure((await inbox.list(binding)).length === 3 && await inbox.cursor(binding) === 'synthetic-cursor');
    const queue = await db.getUploadQueueStats(); ensure(queue.count === 0);
    new File(Paths.document, 'lime-p4-weixin-probe.json').write(JSON.stringify({ status: 'passed', syntheticOnly: true, losslessIds: true, cursorOnce: true, reopened: true, ownerFilter: true, secureStore: true, cancellation: true, nativeCipher: true, nativeDownload: true, mediaRejection: true, p3Parse: true, localQueue: queue.count, modelCalls: 0, accountTested: false }));
  } finally {
    await vault.remove(); try { await db.close(); } catch {}
    for (const file of files) if (file.exists) file.delete();
    for (const suffix of ['', '-wal', '-shm']) { try { const file = new File(`file://${ANDROID_DATABASE_PATH}/${filename}${suffix}`); if (file.exists) file.delete(); } catch {} }
  }
}
const accountVault = () => createWeixinVault(SecureStore, 'lime-wx-validation');
export async function requestWeixinValidationQr() {
  if (!__DEV__) throw new WeixinError('PROTOCOL');
  return foreground(async signal => {
    const qr = await live().qr(signal);
    await SecureStore.setItemAsync('lime-wx-validation-qr', JSON.stringify({ qrcode: qr.qrcode, base: 'https://ilinkai.weixin.qq.com', at: Date.now() }));
    // Only ephemeral QR display data, not bot credentials. Copied locally for the owner to scan.
    new File(Paths.document, 'lime-weixin-validation-qr.json').write(JSON.stringify({ display: qr.qrcode_img_content }));
  });
}
export async function confirmWeixinValidationQr() {
  if (!__DEV__) throw new WeixinError('PROTOCOL');
  return foreground(async signal => {
    const stored = await SecureStore.getItemAsync('lime-wx-validation-qr'); if (!stored) throw new WeixinError('PROTOCOL');
    const qr = JSON.parse(stored); if (Date.now() - qr.at > 5 * 60000) return 'expired';
    const codeFile = new File(Paths.document, 'lime-weixin-validation-code.txt');
    const code = codeFile.exists ? (await codeFile.text()).trim() : undefined; if (codeFile.exists) codeFile.delete();
    const status = await live().status(qr.qrcode, qr.base, code, signal);
    if (status.status === 'confirmed') { await accountVault().save(status.binding); await SecureStore.deleteItemAsync('lime-wx-validation-qr'); }
    if (status.status === 'scaned_but_redirect') await SecureStore.setItemAsync('lime-wx-validation-qr', JSON.stringify({ ...qr, base: status.baseUrl }));
    new File(Paths.document, 'lime-weixin-validation-status.json').write(JSON.stringify({ status: status.status, accountTested: status.status === 'confirmed' }));
    return status.status;
  });
}
export async function readWeixinValidationInbox() {
  if (!__DEV__) throw new WeixinError('PROTOCOL');
  return foreground(async signal => {
    const binding = await accountVault().load(); if (!binding) throw new WeixinError('PROTOCOL');
    const db = new PowerSyncDatabase({ schema: createWeixinSchema(), database: { dbFilename: 'lime-weixin-validation.sqlite' } });
    try {
      await db.init(); const inbox = createWeixinInbox(db, { digest, now: Date.now, stageMedia: accountVault().stageMedia });
      const result = await createWeixinReceiver(live(), inbox).read(binding, signal);
      new File(Paths.document, 'lime-weixin-validation-receive.json').write(JSON.stringify({ ...result, modelCalls: 0 }));
      return result;
    } finally { await db.close(); }
  });
}

export async function downloadWeixinValidationAttachments() {
  if (!__DEV__) throw new WeixinError('PROTOCOL');
  return foreground(async signal => {
    const vault = accountVault(), binding = await vault.load(); if (!binding) throw new WeixinError('PROTOCOL');
    const db = new PowerSyncDatabase({ schema: createWeixinSchema(), database: { dbFilename: 'lime-weixin-validation.sqlite' } });
    let saved = 0, failed = 0, skipped = 0;
    try {
      await db.init(); const inbox = createWeixinInbox(db, { digest, now: Date.now, stageMedia: vault.stageMedia });
      const rows = await inbox.list(binding);
      for (const row of rows.filter(row => row.state === 'complete')) for (const part of JSON.parse(row.parts)) {
        if (part.kind !== 'media') continue;
        if (saved + failed >= 6 || signal.aborted) break;
        const old = await db.getOptional<{ status: string }>('SELECT status FROM weixin_downloads WHERE id=?', [part.capabilityId]);
        if (old?.status === 'saved') { skipped++; continue; }
        const descriptor = await vault.media(part.capabilityId); if (!descriptor) { failed++; continue; }
        let output: { uri: string } | null = null, receipt: { uri: string; hash: string; kind: string } | null = null;
        try {
          output = await downloadWeixinMedia(descriptor, signal);
          const copy = await materialNative.copy(output.uri, descriptor.name, descriptor.mime);
          const parsed = await materialNative.parse(copy.uri, copy.name);
          receipt = { uri: copy.uri, hash: copy.hash, kind: parsed.kind };
        } catch { if (signal.aborted) throw new WeixinError('CANCELLED'); }
        finally { if (output) await discardWeixinDownload(output.uri); }
        // DB errors are global; original copying can be retried with P3's hash deduplication.
        await db.writeTransaction(tx => tx.execute('INSERT OR REPLACE INTO weixin_downloads(id,message_id,status,uri,hash,kind) VALUES(?,?,?,?,?,?)',
          [part.capabilityId, row.id, receipt ? 'saved' : 'error', receipt?.uri ?? '', receipt?.hash ?? '', receipt?.kind ?? '']));
        if (receipt) saved++; else failed++;
      }
      const result = { saved, failed, skipped, modelCalls: 0 };
      new File(Paths.document, 'lime-weixin-validation-downloads.json').write(JSON.stringify(result));
      return result;
    } finally { await db.close(); }
  });
}
