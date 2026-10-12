import { database } from '../storage/database';
export { database } from '../storage/database';
export type DocumentContent={title:string;body:string;date:string;group_id?:string|null};
export type DocumentRow={base_content?:DocumentContent;id:string;kind:string;title:string;body:string;date:string;revision:number;deleted:number;updated_at:string;group_id?:string|null;sort_order?:number;created_at?:number;edited_at?:number;deleted_at?:number|null};
export function localDate() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export async function saveDocument(doc:{id:string;title:string;body:string;date:string;kind?:string},expectedRevision?:number,expectedContent?:DocumentContent):Promise<number> {
 return database.writeTransaction(async tx=>{
  const current=await tx.getOptional<DocumentRow>('SELECT * FROM documents WHERE id=?',[doc.id]);
  if(current&&expectedContent&&(current.title!==expectedContent.title||current.body!==expectedContent.body||current.date!==expectedContent.date))throw new Error('SOURCE_CHANGED');
  if(current?.deleted||(expectedRevision!==undefined&&(current?.revision??0)!==expectedRevision))throw new Error('SOURCE_CHANGED');
  if(current&&current.title===doc.title&&current.body===doc.body&&current.date===doc.date)return current.revision;
  if(current) await tx.execute('UPDATE documents SET title=?,body=?,date=?,revision=revision+1,edited_at=?,updated_at=? WHERE id=?',[doc.title,doc.body,doc.date,Date.now(),new Date().toISOString(),doc.id]);
  else await tx.execute('INSERT INTO documents(id,kind,title,body,date,group_id,sort_order,created_at,edited_at,deleted_at,revision,deleted,updated_at) VALUES(?,?,?,?,?,NULL,0,?,?,NULL,1,0,?)',[doc.id,doc.kind??'diary',doc.title,doc.body,doc.date,Date.now(),Date.now(),new Date().toISOString()]);
  return (current?.revision??0)+1;
 });
}
