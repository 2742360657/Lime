import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, NativeModules } from 'react-native';
import { createQqClient } from '../channels/qq/client';
import { createQqInbox } from '../channels/qq/inbox';
import { createQqReceiver, type QqReceivePhase } from '../channels/qq/receiver';
import { createQqVault } from '../channels/qq/vault';
import { createQqSchema } from '../channels/qq/schema';
import { decryptQqSecret, downloadQqMedia, discardQqMedia, qqSocket } from '../channels/qq/native';
import { QqError } from '../channels/qq/protocol';
import { materialNative } from '../materials/native';
const digest=(value:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value);
const randomKey=async()=>btoa(String.fromCharCode(...await Crypto.getRandomBytesAsync(32)));
const client=()=>createQqClient(fetch,{randomKey,decrypt:decryptQqSecret});
const vault=()=>createQqVault(SecureStore,'lime-qq-validation');
let controller:AbortController|null=null, qr:{taskId:string;key:string;display:string;at:number}|null=null;
export function cancelQqValidation(){controller?.abort();}
export function closeQqValidation(){cancelQqValidation();qr=null;}
async function foreground<T>(fn:(signal:AbortSignal)=>Promise<T>){
  if(controller)throw new QqError('BUSY');if(AppState.currentState!=='active')throw new QqError('CANCELLED');const local=new AbortController();controller=local;
  const listener=AppState.addEventListener('change',state=>{if(state!=='active')local.abort();});
  try{return await fn(local.signal);}finally{local.abort();listener.remove();controller=null;}
}
export async function requestQqValidationQr(){if(!__DEV__)throw new QqError('PROTOCOL');qr=null;return foreground(async signal=>{const value=await client().qr(signal);if(signal.aborted)throw new QqError('CANCELLED');qr={...value,at:Date.now()};return value.display;});}
export async function confirmQqValidationQr(){
  if(!__DEV__)throw new QqError('PROTOCOL');return foreground(async signal=>{if(!qr || Date.now()-qr.at>300000){qr=null;return 3;}const pending=qr,result=await client().status(pending.taskId,pending.key,signal);if(result.binding){if(signal.aborted)throw new QqError('CANCELLED');await vault().save(result.binding);qr=null;}if(result.status===3)qr=null;return result.status;});
}
export async function qqValidationBound(){return __DEV__ && !!await vault().load();}
export async function readQqValidation(){
  if(!__DEV__)throw new QqError('PROTOCOL');return foreground(async signal=>{const binding=await vault().load();if(!binding)throw new QqError('SESSION');const db=new PowerSyncDatabase({schema:createQqSchema(),database:{dbFilename:'lime-qq-validation.sqlite'}});
    const phases:QqReceivePhase[]=[],trace=new File(Paths.document,'lime-qq-validation-trace.json');
    try{await db.init();const inbox=createQqInbox(db,{digest,stage:vault().stage}),result=await createQqReceiver(client(),inbox,qqSocket,60000,phase=>{if(!phases.includes(phase)){phases.push(phase);trace.write(JSON.stringify({status:'reading',phases}));}}).read(binding,signal);new File(Paths.document,'lime-qq-validation-read.json').write(JSON.stringify({...result,modelCalls:0}));trace.write(JSON.stringify({status:'passed',phases}));return result;}catch(error){trace.write(JSON.stringify({status:'failed',phases,code:error instanceof QqError?error.code:'CHECK'}));throw error;}finally{await db.close();}
  });
}
export async function downloadQqValidation(){
  if(!__DEV__)throw new QqError('PROTOCOL');return foreground(async signal=>{const storage=vault(),binding=await storage.load();if(!binding)throw new QqError('SESSION');const db=new PowerSyncDatabase({schema:createQqSchema(),database:{dbFilename:'lime-qq-validation.sqlite'}});let saved=0,failed=0,skipped=0;
    try{await db.init();const inbox=createQqInbox(db,{digest,stage:storage.stage});for(const row of await inbox.list(binding))for(const part of JSON.parse(row.parts)){
      if(signal.aborted)throw new QqError('CANCELLED');if(saved+failed>=6)break;if(await db.getOptional('SELECT id FROM qq_downloads WHERE id=?',[part.capabilityId])){skipped++;continue;}
      let output:{uri:string;hash:string;size:number}|null=null,receipt:{uri:string;hash:string;kind:string}|null=null;
      try{const descriptor=await storage.media(part.capabilityId);if(!descriptor)throw new QqError('SESSION');output=await downloadQqMedia(descriptor,signal);const copy=await materialNative.copy(output.uri,descriptor.name,descriptor.mime),parsed=await materialNative.parse(copy.uri,copy.name);if(signal.aborted)throw new QqError('CANCELLED');receipt={uri:copy.uri,hash:copy.hash,kind:parsed.kind};}catch(error){if(signal.aborted)throw new QqError('CANCELLED');}finally{if(output)await discardQqMedia(output.uri);}
      if(receipt){await db.writeTransaction(tx=>{if(signal.aborted)throw new QqError('CANCELLED');return tx.execute('INSERT INTO qq_downloads(id,uri,hash,kind) VALUES(?,?,?,?)',[part.capabilityId,receipt!.uri,receipt!.hash,receipt!.kind]);});saved++;}else failed++;
    }if(signal.aborted)throw new QqError('CANCELLED');const result={saved,failed,skipped,modelCalls:0};new File(Paths.document,'lime-qq-validation-downloads.json').write(JSON.stringify(result));return result;}finally{await db.close();}
  });
}
export async function runQqProbe(){
  if(!__DEV__)throw new QqError('PROTOCOL');const filename='lime-dev-qq-'+Crypto.randomUUID()+'.sqlite',prefix='lime-qq-fixture-'+Crypto.randomUUID(),storage=createQqVault(SecureStore,prefix),files:File[]=[];
  let db=new PowerSyncDatabase({schema:createQqSchema(),database:{dbFilename:filename}}),stage='database';const ensure=(value:unknown)=>{if(!value)throw new QqError('PROTOCOL');};
  try{await db.init();stage='native-hash';const nativeHashDistinct=await digest(JSON.stringify(['synthetic','one']))!==await digest(JSON.stringify(['synthetic','two']));ensure(nativeHashDistinct);stage='http-gcm';const fixtureClient=createQqClient((url,init)=>fetch('http://127.0.0.1:8094'+new URL(url).pathname,init),{randomKey:async()=>btoa('0'.repeat(32)),decrypt:decryptQqSecret});const pending=await fixtureClient.qr(),confirmed=await fixtureClient.status(pending.taskId,pending.key);if(!confirmed.binding)throw new QqError('SESSION');ensure(confirmed.binding.appSecret==='SYNTHETIC_QQ_SECRET');
    let badTag=false;try{await decryptQqSecret('MTExMTExMTExMTExNsQzCA2jvSxNqwCwIiD6j8EPcAiapKgdBkIvEl8ttRckxPA=',pending.key);}catch{badTag=true;}ensure(badTag);stage='vault';await storage.save(confirmed.binding);const binding=await storage.load();if(!binding)throw new QqError('SESSION');
    let inbox=createQqInbox(db,{digest,stage:storage.stage});const receive=(mode:string)=>createQqReceiver(fixtureClient,inbox,url=>qqSocket(url,mode),2200).read(binding);
    stage='ws-new';const first=await receive('new');stage='ws-new-counts';ensure(first.saved===3 && first.ignored===2 && first.mode==='new');stage='ws-resume';const repeated=await receive('resume');ensure(repeated.duplicates===1 && repeated.saved===0 && repeated.mode==='resumed');stage='ws-invalid';const fresh=await receive('invalid');ensure(fresh.invalidSession && fresh.mode==='new' && fresh.saved===0);
    stage='ws-redirect';let wsRedirect=false;try{await receive('redirect');}catch(error){wsRedirect=error instanceof QqError && error.code==='NETWORK';}ensure(wsRedirect);
    stage='ws-cancel';const abort=new AbortController();const waiting=createQqReceiver(fixtureClient,inbox,url=>qqSocket(url,'silent'),2000).read(binding,abort.signal);setTimeout(()=>abort.abort(),100);let wsCancelled=false;try{await waiting;}catch(error){wsCancelled=error instanceof QqError && error.code==='CANCELLED';}ensure(wsCancelled);
    const rows=await inbox.list(binding);ensure(rows.length===3 && rows.some(r=>r.message_key==='18446744073709551615'));ensure(!JSON.stringify(rows).includes(binding.appSecret) && !JSON.stringify(rows).includes('https://'));
    stage='media';const native=NativeModules.LimeQq;for(const kind of ['text','image']){stage='media-'+kind;const output=JSON.parse(await native.fixtureDownload(Crypto.randomUUID(),kind,-1));try{const name='合成QQ'+(kind==='text'?'.txt':'.png'),target=new File(Paths.document,'lime-materials',output.hash+(kind==='text'?'.txt':'.png')),existed=target.exists,copy=await materialNative.copy(output.uri,name,kind==='text'?'text/plain':'image/png');if(!existed)files.push(new File(copy.uri));const parsed=await materialNative.parse(copy.uri,copy.name);if(!existed)for(const image of parsed.images)files.push(new File(image.uri));ensure(parsed.status==='ready' && parsed.kind===(kind==='text'?'text':'image'));}finally{await discardQqMedia(output.uri);}}
    stage='media-reject';for(const kind of ['large','redirect']){let rejected=false;try{await native.fixtureDownload(Crypto.randomUUID(),kind,-1);}catch{rejected=true;}ensure(rejected);}const id=Crypto.randomUUID(),wait=native.fixtureDownload(id,'slow',-1);setTimeout(()=>{void native.cancel(id);},100);let cancelled=false;try{await wait;}catch{cancelled=true;}ensure(cancelled);
    stage='reopen';await db.close();db=new PowerSyncDatabase({schema:createQqSchema(),database:{dbFilename:filename}});await db.init();inbox=createQqInbox(db,{digest,stage:storage.stage});ensure((await inbox.list(binding)).length===3 && (await inbox.session(binding))?.seq===2);const queue=await db.getUploadQueueStats();ensure(queue.count===0);
    new File(Paths.document,'lime-p4-qq-probe.json').write(JSON.stringify({status:'passed',syntheticOnly:true,accountTested:false,modelCalls:0,localQueue:queue.count,nativeHashDistinct,nativeGcm:true,badTag:true,secureStore:true,ownerFilter:true,wsNew:true,wsResume:true,invalidSession:true,wsRedirect:true,wsCancellation:true,dedup:true,reopen:true,nativeMedia:true,p3Parse:true,mediaRejection:true,mediaCancellation:true}));
  }catch(error){new File(Paths.document,'lime-p4-qq-probe.json').write(JSON.stringify({status:'failed',stage,code:error instanceof QqError?error.code:'CHECK',syntheticOnly:true,accountTested:false,modelCalls:0}));throw error;}
  finally{await storage.remove();try{await db.close();}catch{}for(const file of files)if(file.exists)file.delete();for(const suffix of ['','-wal','-shm']){try{const file=new File('file://'+ANDROID_DATABASE_PATH+'/'+filename+suffix);if(file.exists)file.delete();}catch{}}}
}
