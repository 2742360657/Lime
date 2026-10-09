import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { PowerSyncContext, type PowerSyncBackendConnector } from '@powersync/react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { database } from './database';
export type Connection={apiUrl:string;syncUrl:string;token:string;owner_id:string};
const STORE='angelime-assistant-connection';
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
const context=createContext<{connection:Connection|null;pair:(apiUrl:string,syncUrl:string,code:string)=>Promise<void>;request:<T>(path:string,body?:unknown)=>Promise<T>;notice:string}>({connection:null,pair:async()=>{},request:async()=>{throw new Error('尚未配对服务器');},notice:''});
export function useAssistant(){return useContext(context);}
async function call<T>(connection:Pick<Connection,'apiUrl'|'token'>,path:string,body?:unknown):Promise<T> {
 let response;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),path.endsWith('/sources')||/^\/v1\/notifications(?:\/|$)/.test(path)?10000:260000);
 try { response=await fetch(connection.apiUrl+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(connection.token?{Authorization:`Bearer ${connection.token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal}); }
 catch {throw new Error('暂时无法连接服务器，内容仍保存在本机。');}
 finally {clearTimeout(timer);}
 const data=await response.json();
 if(!response.ok) throw new ApiError(response.status,data.error||'操作未完成');
 return data as T;
}
function cleanUrl(url:string) {
 const value=url.trim().replace(/\/$/,'');
 const parsed=new URL(value);
 const local=['127.0.0.1','localhost','10.0.2.2'].includes(parsed.hostname);
 if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||!['https:','http:'].includes(parsed.protocol)||(!__DEV__&&parsed.protocol==='http:'&&!local)) throw new Error('请输入 HTTPS 服务器地址；开发版可使用 ADB 本机转发。');
 return value;
}
export function AssistantProvider({children}:{children:ReactNode}) {
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[connection,setConnection]=useState<Connection|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{(async()=>{
  await database.init();
  const instance=await database.getOptional('SELECT value FROM local_meta WHERE id=\'instance\'');
  if(!instance) await database.execute('INSERT INTO local_meta(id,value) VALUES(\'instance\',?)',[Crypto.randomUUID()]);
  const saved=await SecureStore.getItemAsync(STORE);
  if(saved) setConnection(JSON.parse(saved));
  setReady(true);
 })().catch(()=>setError('日记数据库未能打开。请保留应用数据，稍后重试。'));},[]);
 useEffect(()=>{
  if(!ready||!connection)return;
  const connector:PowerSyncBackendConnector={
   fetchCredentials:async()=>{
    const result=await call<{token:string;expires_at:string}>(connection,'/v1/sync/credentials');
    return {endpoint:connection.syncUrl,token:result.token,expiresAt:new Date(result.expires_at)};
   },
   uploadData:async db=>{
    const tx=await db.getNextCrudTransaction();
    if(!tx)return;
    const instance=await db.get<{value:string}>('SELECT value FROM local_meta WHERE id=\'instance\'');
    const changes=tx.crud.map(entry=>({table:entry.table,id:entry.id,op:entry.op,data:entry.opData??{}}));
    const operation_id=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${instance.value}:${tx.crud.map(e=>e.clientId).join(',')}`);
    let accepted=0;
    const batches:typeof changes[]=[];
    try {
     // Bound uploads without dropping large imports. Completed batches replay with the same IDs.
     let batch:typeof changes=[],size=0;
     for(const change of changes) {
      const bytes=JSON.stringify(change).length*3;
      if(batch.length&&(batch.length>=100||size+bytes>500000)){batches.push(batch);batch=[];size=0;}
      batch.push(change);size+=bytes;
     }
     if(batch.length)batches.push(batch);
     for(let index=0;index<batches.length;index++){await call(connection,'/v1/sync/upload',{operation_id:operation_id+':'+index,changes:batches[index]});accepted=index+1;}
     await tx.complete();setNotice('');
    } catch(error) {
     if(error instanceof ApiError&&[400,404,409].includes(error.status)) {
      const snapshots=[];
      const pending=batches.slice(accepted).flat();
      for(const change of pending) {
       if(['document_groups','documents','tasks','habit_groups','habits','checkins'].includes(change.table)) snapshots.push({table:change.table,row:await db.getOptional(`SELECT * FROM ${change.table} WHERE id=?`,[change.id])});
      }
      await db.execute('INSERT OR REPLACE INTO local_conflicts(id,payload,snapshots,error,created_at) VALUES(?,?,?,?,?)',[operation_id,JSON.stringify(pending),JSON.stringify(snapshots),error.message,new Date().toISOString()]);
      await tx.complete();setNotice('有记录需要处理，原文已保存在恢复副本。');
     } else {setNotice(error instanceof ApiError&&error.status===401?'设备授权已失效，请重新配对。':'等待连接，内容保存在本机。');throw error;}
    }
   }
  };
  database.connect(connector).catch(()=>setNotice('等待连接，内容保存在本机。'));
  return ()=>{void database.disconnect();};
 },[ready,connection]);
 async function pair(apiUrl:string,syncUrl:string,code:string) {
  const base=cleanUrl(apiUrl),sync=cleanUrl(syncUrl);
  const result=await call<{token:string;owner_id:string}>({apiUrl:base,token:''},'/v1/pair',{code:code.trim(),name:'Angelime Android'});
  if(connection&&connection.owner_id!==result.owner_id)throw new Error('此数据库已绑定其他用户，请使用独立应用数据。');
  const next={apiUrl:base,syncUrl:sync,token:result.token,owner_id:result.owner_id};
  await SecureStore.setItemAsync(STORE,JSON.stringify(next));setConnection(next);
 }
 if(!ready)return <View style={{flex:1,justifyContent:'center',alignItems:'center',padding:24}}>{error?<Text>{error}</Text>:<ActivityIndicator/>}</View>;
 return <PowerSyncContext.Provider value={database}><context.Provider value={{connection,pair,request:<T,>(path:string,body?:unknown)=>{if(!connection)throw new Error('请先在日记页连接自己的服务器。');return call<T>(connection,path,body);},notice}}>{children}</context.Provider></PowerSyncContext.Provider>;
}
