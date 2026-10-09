import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import {database} from '../assistant/database';
import {captureRecords,emptyRows,importRecords,portableRow,validateBackup,type RecordBackup,type RecordTable} from '../assistant/recordBackup';
import {records} from '../assistant/businessStore';
import {coerceAppData} from './habitStorage';
const MAX_BYTES=25*1024*1024;
export async function exportRecordBackup() {
 const backup=await database.readTransaction(captureRecords),text=JSON.stringify(backup,null,2);
 if(text.length*2>MAX_BYTES)throw new Error('备份较大，请先使用服务器独立备份。');
 const access=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Documents'));
 if(!access.granted)return false;
 const uri=await FileSystem.StorageAccessFramework.createFileAsync(access.directoryUri,`angelime-records-${Date.now()}.json`,'application/json');
 await FileSystem.writeAsStringAsync(uri,text);
 return true;
}
export async function readRecordBackup(uri:string) {
 const info=await FileSystem.getInfoAsync(uri);if(!info.exists||('size' in info&&info.size>MAX_BYTES))throw new Error('备份不存在或超过25MB。');
 const content=await FileSystem.readAsStringAsync(uri);if(content.length*2>MAX_BYTES)throw new Error('备份超过支持大小。');
 const parsed=JSON.parse(content);let backup:RecordBackup;
 if(parsed.format)backup=validateBackup(parsed);
 else {
  const legacy=coerceAppData(parsed);
  // Legacy normalizers are tolerant for everyday load. A restore must not silently drop originals.
  for(const [key,list] of Object.entries({memos:legacy.memos,memoGroups:legacy.memoGroups,todos:legacy.todos,habits:legacy.habits,groups:legacy.groups}))if(Array.isArray(parsed[key])&&(key==='memoGroups'?parsed[key].some((g:{id:string})=>!legacy.memoGroups.some(x=>x.id===g.id)):parsed[key].length!==list.length))throw new Error('旧备份含无法迁移的记录，请保留原文件并检查后再导入。');
  for(const habit of parsed.habits??[])if(Array.isArray(habit.checkins)&&legacy.habits.find(h=>h.id===habit.id)?.checkins.length!==habit.checkins.length)throw new Error('旧备份包含无法迁移的打卡，原文件仍保留，请先检查。');
  const source=records(legacy),rows=emptyRows();for(const table of Object.keys(rows) as RecordTable[])rows[table]=source[table].map(r=>portableRow(table,{...r,deleted:r.deleted??0,...(table==='tasks'?{document_id:null,due_at:null}:{})}));
  backup=validateBackup({format:'angelime-records',version:1,exported_at:'',rows,drafts:[],recovery:[]});
 }
 const digest=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,content);
 return {backup,digest,count:Object.values(backup.rows).reduce((n,rows)=>n+rows.length,0)};
}
export async function restoreRecordBackup(input:Awaited<ReturnType<typeof readRecordBackup>>) {
 return database.writeTransaction(tx=>importRecords(tx,input.backup,input.digest,Crypto.randomUUID));
}
