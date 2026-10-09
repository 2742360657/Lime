import { NativeModules } from 'react-native';
import * as Crypto from 'expo-crypto';
import { WeixinError, mediaUrl, type MediaDescriptor } from './protocol';
function module() { const native = NativeModules.LimeWeixin; if (!native) throw new WeixinError('PROTOCOL'); return native; }
export async function downloadWeixinMedia(descriptor: MediaDescriptor, signal?: AbortSignal): Promise<{ uri: string; size: number; hash: string }> {
  if (signal?.aborted) throw new WeixinError('CANCELLED');
  mediaUrl(descriptor.url);
  const native = module(), id = Crypto.randomUUID();
  const cancel = () => { void native.cancel(id).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let result: { uri: string; size: number; hash: string } | null = null;
  try {
    result = JSON.parse(await native.download(id, descriptor.url, descriptor.key, descriptor.encoding, descriptor.size, descriptor.md5));
    if (!result) throw new WeixinError('PROTOCOL');
    if (signal?.aborted) { await native.discard(result.uri); throw new WeixinError('CANCELLED'); }
    return result;
  } catch (e) { if (signal?.aborted) throw new WeixinError('CANCELLED'); if (e instanceof WeixinError) throw e; throw new WeixinError('NETWORK'); }
  finally { signal?.removeEventListener('abort', cancel); }
}
export async function discardWeixinDownload(uri: string) { await module().discard(uri); }
export async function validateWeixinCipher(ciphertext: string, key: string, encoding: string): Promise<{ size: number; hash: string }> {
  if (!__DEV__) throw new WeixinError('PROTOCOL');
  return JSON.parse(await module().fixture(ciphertext, key, encoding));
}
