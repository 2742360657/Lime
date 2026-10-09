import { PowerSyncDatabase, Schema, Table, column } from '@powersync/react-native';
export const database = new PowerSyncDatabase({
 schema: new Schema({
  document_groups: new Table({owner_id:column.text,kind:column.text,name:column.text,sort_order:column.integer,created_at:column.integer,revision:column.integer,deleted:column.integer,updated_at:column.text}),
  documents: new Table({group_id:column.text,sort_order:column.integer,created_at:column.integer,edited_at:column.integer,deleted_at:column.integer, owner_id:column.text,kind:column.text,title:column.text,body:column.text,date:column.text,revision:column.integer,deleted:column.integer,updated_at:column.text }),
  tasks: new Table({ owner_id:column.text,title:column.text,status:column.text,document_id:column.text,due_at:column.text,note:column.text,due_date_key:column.text,due_time:column.text,sort_order:column.integer,created_at:column.integer,completed_at:column.integer,revision:column.integer,deleted:column.integer,updated_at:column.text }),
  habit_groups: new Table({owner_id:column.text,name:column.text,sort_order:column.integer,created_at:column.integer,revision:column.integer,deleted:column.integer,updated_at:column.text}),
  habits: new Table({owner_id:column.text,name:column.text,group_id:column.text,cadence:column.text,target_count:column.integer,sort_order:column.integer,created_at:column.integer,archived_at:column.integer,revision:column.integer,deleted:column.integer,updated_at:column.text}),
  checkins: new Table({owner_id:column.text,habit_id:column.text,date_key:column.text,timestamp:column.integer,note:column.text,created_at:column.integer,revision:column.integer,deleted:column.integer,updated_at:column.text}),
  suggestions: new Table({ owner_id:column.text,document_id:column.text,document_revision:column.integer,request_id:column.text,summary:column.text,tasks:column.text,model:column.text,status:column.text,updated_at:column.text }),
  local_meta: new Table({value:column.text},{localOnly:true}),
  local_conflicts: new Table({payload:column.text,snapshots:column.text,error:column.text,created_at:column.text},{localOnly:true}),
  local_drafts: new Table({base_content:column.text,kind:column.text,group_id:column.text,base_revision:column.integer,title:column.text,body:column.text,date:column.text,document_id:column.text},{localOnly:true}),
 }),database:{dbFilename:'angelime-assistant.sqlite'},
});
export type DocumentContent={title:string;body:string;date:string;group_id?:string|null};
export type DocumentRow={base_content?:DocumentContent;id:string;kind:string;title:string;body:string;date:string;revision:number;deleted:number;updated_at:string;group_id?:string|null;sort_order?:number;created_at?:number;edited_at?:number;deleted_at?:number|null};
export type SuggestionRow={id:string;document_id:string;document_revision:number;summary:string;tasks:string;status:string};
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
