import {Directory,File,Paths} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import {database} from './database';
import type {PendingFile} from './chatTypes';
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
export function releasePendingCopies(files:PendingFile[]) {for(const f of files){try{new File(f.uri).delete();}catch{}}}
