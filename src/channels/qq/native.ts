import { NativeModules, NativeEventEmitter } from 'react-native';
import * as Crypto from 'expo-crypto';
import { mediaUrl, QqError, type QqMedia } from './protocol';
import type { QqSocket } from './receiver';
const native=()=>{ const module=NativeModules.LimeQq; if (!module) throw new QqError('PROTOCOL'); return module; };
export async function decryptQqSecret(ciphertext:string,key:string):Promise<string> { try { return await native().decrypt(ciphertext,key); } catch { throw new QqError('SESSION'); } }
export async function downloadQqMedia(media:QqMedia,signal?:AbortSignal):Promise<{uri:string;hash:string;size:number}> {
  if (signal?.aborted) throw new QqError('CANCELLED'); mediaUrl(media.url);
  const module=native(),id=Crypto.randomUUID(),cancel=()=>{void module.cancel(id).catch(()=>{});}; signal?.addEventListener('abort',cancel,{once:true});
  try { const value=JSON.parse(await module.download(id,media.url,media.size)); if (signal?.aborted) {await module.discard(value.uri);throw new QqError('CANCELLED');} return value; }
  catch(e){if(signal?.aborted)throw new QqError('CANCELLED');if(e instanceof QqError)throw e;throw new QqError('NETWORK');}
  finally {signal?.removeEventListener('abort',cancel);}
}
export async function discardQqMedia(uri:string) {await native().discard(uri);}
export function qqSocket(url:string,fixture?:string):QqSocket {
  if(fixture && !__DEV__)throw new QqError('PROTOCOL');
  const module=native(),id=Crypto.randomUUID();let closed=false;
  const ws:QqSocket={onopen:null,onmessage:null,onerror:null,onclose:null,send(data){void module.sendWs(id,data).catch(()=>{if(!closed)ws.onerror?.();});},close(){if(closed)return;closed=true;sub.remove();void module.closeWs(id).catch(()=>{});}};
  const sub=new NativeEventEmitter(module).addListener('lime-qq-ws',(event:{id:string;type:string;data:string;code:number})=>{if(closed || event.id!==id)return;if(event.type==='open')ws.onopen?.();else if(event.type==='message')ws.onmessage?.({data:event.data});else if(event.type==='error')ws.onerror?.();else if(event.type==='close')ws.onclose?.({code:event.code});});
  void (fixture?module.fixtureWs(id,fixture):module.connectWs(id,url)).catch(()=>{if(!closed)ws.onerror?.();});return ws;
}
