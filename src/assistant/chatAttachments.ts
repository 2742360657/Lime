import {Directory,File,Paths} from 'expo-file-system';
import {fetch as expoFetch} from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import {database} from './database';
import type {Connection} from './AssistantProvider';
import type {ChatAttachment,PendingFile} from './chatTypes';
const MAX=10*1024*1024;
export async function savePendingFiles(session:string,files:PendingFile[]) {
 await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-files-'+session,JSON.stringify(files)]);
}
export async function chooseChatFiles(remaining:number):Promise<PendingFile[]> {
 const result=await DocumentPicker.getDocumentAsync({multiple:true,copyToCacheDirectory:true});
 if(result.canceled)return [];
 if(result.assets.length>remaining)throw new Error('一次最多选择 6 个附件。');
 const directory=new Directory(Paths.document,'chat-attachments');directory.create({idempotent:true,intermediates:true});
 const files:PendingFile[]=[];
 for(const asset of result.assets) {
  const source=new File(asset.uri),size=source.size;
  if(!size||size>MAX)throw new Error('单个附件需要小于 10 MB 且不为空。');
  const ext=asset.name.match(/\.(txt|md|csv|pdf|docx?|xlsx?|pptx?|jpe?g|png|webp)$/i)?.[0];
  if(!ext)throw new Error('暂支持图片、PDF、Office 和文本文件。');
  const local_id=Crypto.randomUUID(),copy=new File(directory,local_id+ext);source.copy(copy);
  files.push({local_id,uri:copy.uri,name:asset.name,size});
 }
 return files;
}
export async function uploadChatFile(connection:Connection,file:PendingFile):Promise<ChatAttachment> {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try {
  const response=await expoFetch(connection.apiUrl+'/v1/attachments',{method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:await new File(file.uri).bytes(),signal:controller.signal});
  if(!response.ok)throw new Error(response.status===415?'暂不支持该文件内容。':'附件未上传成功，请稍后重试。');
  return await response.json();
 }finally{clearTimeout(timer);}
}
export function releasePendingCopies(files:PendingFile[]) {for(const f of files){try{new File(f.uri).delete();}catch{}}}
