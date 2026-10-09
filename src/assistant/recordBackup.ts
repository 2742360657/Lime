import type {Transaction} from '@powersync/react-native';

// Only business columns are portable. Credentials, owner IDs and history stay on the server.
export const recordFields={
 document_groups:['kind','name','sort_order','created_at'],
 habit_groups:['name','sort_order','created_at'],
 documents:['kind','title','body','date','group_id','sort_order','created_at','edited_at','deleted_at'],
 habits:['name','group_id','cadence','target_count','sort_order','created_at','archived_at'],
 checkins:['habit_id','date_key','timestamp','note','created_at'],
 tasks:['title','status','document_id','due_at','note','due_date_key','due_time','sort_order','created_at','completed_at'],
} as const;
export type RecordTable=keyof typeof recordFields;
export type PortableRow=Record<string,string|number|null> & {id:string;deleted:number};
export type Rows=Record<RecordTable,PortableRow[]>;
export type PortableDraft={id:string;kind:string;title:string;body:string;date:string;group_id:string|null;document_id:string;base_revision:number|null;base_content:string|null};
export type Snapshot={table:string;row:PortableRow|null};
export type RecordBackup={format:'angelime-records';version:1;exported_at:string;rows:Rows;drafts:PortableDraft[];recovery:Snapshot[]};
export const emptyRows=():Rows=>({document_groups:[],habit_groups:[],documents:[],habits:[],checkins:[],tasks:[]});
const bad=()=>{throw new Error('备份记录格式无效或超出支持范围，尚未修改本机内容。');};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return bad();return v as Record<string,unknown>;};
const text=(v:unknown,max:number,allowEmpty=true):v is string=>typeof v==='string'&&v.length<=max&&(allowEmpty||!!v.trim());
const integer=(v:unknown,nullable=false)=>v===null?nullable:Number.isSafeInteger(v)&&Number(v)>=0;
const id=(v:unknown,nullable=false)=>v===null?nullable:text(v,100,false);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function portableRow(table:RecordTable,value:unknown):PortableRow {
 const r=obj(value);if(!id(r.id)||![0,1].includes(r.deleted as number)||!integer(r.created_at))return bad();
 if(['document_groups','habit_groups','habits'].includes(table)&&!text(r.name,200,false))return bad();
 if(table!=='checkins'&&!Number.isSafeInteger(r.sort_order))return bad();
 if(table==='documents'&&(!['memo','diary'].includes(String(r.kind))||!text(r.title,300)||!text(r.body,100000)||!date(r.date)||!id(r.group_id,true)||!integer(r.edited_at)||!integer(r.deleted_at,true)))return bad();
 if(table==='document_groups'&&!['memo','diary'].includes(String(r.kind)))return bad();
 if(table==='habits'&&(!['daily','weekly','monthly'].includes(String(r.cadence))||!integer(r.target_count)||Number(r.target_count)<1||Number(r.target_count)>10000||!id(r.group_id,true)||!integer(r.archived_at,true)))return bad();
 if(table==='checkins'&&(!id(r.habit_id)||!date(r.date_key)||!integer(r.timestamp)||!text(r.note,10000)))return bad();
 if(table==='tasks'&&(!text(r.title,300,false)||!text(r.note,10000)||!['open','done'].includes(String(r.status))||!id(r.document_id,true)||!integer(r.completed_at,true)||(r.due_date_key!==null&&!date(r.due_date_key))||(r.due_time!==null&&(!r.due_date_key||typeof r.due_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.due_time)))||(r.due_at!==null&&(!text(r.due_at,40)||!Number.isFinite(Date.parse(r.due_at as string))))))return bad();
 const result:PortableRow={id:r.id as string,deleted:r.deleted as number};
 for(const field of recordFields[table]) {const v=r[field];if(v!==null&&typeof v!=='number'&&typeof v!=='string')return bad();result[field]=v;}
 return result;
}
function portableDraft(value:unknown):PortableDraft {
 const r=obj(value);if(!id(r.id)||!id(r.document_id)||!['diary','memo'].includes(String(r.kind??'diary'))||!text(r.title,300)||!text(r.body,100000)||!date(r.date)||!id(r.group_id??null,true)||!integer(r.base_revision??null,true))return bad();
 if(r.base_content!=null){const base=obj(JSON.parse(String(r.base_content)));if(!text(base.title,300)||!text(base.body,100000)||!date(base.date)||!id(base.group_id??null,true))return bad();}
 return {base_content:r.base_content==null?null:String(r.base_content),id:r.id as string,document_id:r.document_id as string,kind:String(r.kind??'diary'),title:r.title as string,body:r.body as string,date:r.date as string,group_id:(r.group_id??null) as string|null,base_revision:(r.base_revision??null) as number|null};
}
export function validateBackup(value:unknown):RecordBackup {
 const raw=obj(value);if(raw.format!=='angelime-records'||raw.version!==1)throw new Error('不支持的备份格式或版本。');
 const source=obj(raw.rows),rows=emptyRows();let count=0;
 for(const table of Object.keys(recordFields) as RecordTable[]) {
  if(!Array.isArray(source[table]))return bad();const list=source[table] as unknown[];
  count+=list.length;if(count>50000)return bad();rows[table]=list.map(row=>portableRow(table,row));
  if(new Set(rows[table].map(r=>r.id)).size!==list.length)return bad();
 }
 if(Object.keys(source).some(t=>!Object.hasOwn(recordFields,t))||!Array.isArray(raw.drafts)||!Array.isArray(raw.recovery)||raw.drafts.length+raw.recovery.length>10000)return bad();
 const drafts=raw.drafts.map(portableDraft),recovery=raw.recovery.map(value=>{const r=obj(value);if(typeof r.table!=='string'||!Object.hasOwn(recordFields,r.table))return bad();return {table:r.table,row:r.row===null?null:portableRow(r.table as RecordTable,r.row)};});
 if(new Set(drafts.map(d=>d.id)).size!==drafts.length)return bad();
 return {format:'angelime-records',version:1,exported_at:String(raw.exported_at??''),rows,drafts,recovery};
}
export async function captureRecords(tx:Pick<Transaction,'getAll'>):Promise<RecordBackup> {
 const rows=emptyRows();for(const table of Object.keys(rows) as RecordTable[])rows[table]=(await tx.getAll(`SELECT * FROM ${table} ORDER BY id`)).map(r=>portableRow(table,r));
 const drafts=(await tx.getAll('SELECT * FROM local_drafts ORDER BY id')).map(portableDraft),recovery:Snapshot[]=[];
 for(const conflict of await tx.getAll<{snapshots:string}>('SELECT snapshots FROM local_conflicts ORDER BY id')) {
  for(const snapshot of JSON.parse(conflict.snapshots??'[]') as Snapshot[])if(Object.hasOwn(recordFields,snapshot.table))recovery.push({table:snapshot.table,row:snapshot.row?portableRow(snapshot.table as RecordTable,snapshot.row):null});
 }
 return {format:'angelime-records',version:1,exported_at:new Date().toISOString(),rows,drafts,recovery};
}
// Caller supplies the transaction: failure rolls back rows, receipt and pre-import snapshot together.
export async function mergeRecords(tx:Transaction,backup:RecordBackup,newId:()=>string,forceCopies=false) {
 const maps=new Map<RecordTable,Map<string,string>>(),result={added:0,copies:0,skipped:0,detached:0};
 for(const table of Object.keys(recordFields) as RecordTable[]) {
  const mapping=new Map<string,string>();maps.set(table,mapping);
  for(const source of backup.rows[table]) {
   const row={...source};
   const refs:([string,RecordTable])[]=table==='documents'?[['group_id','document_groups']]:table==='habits'?[['group_id','habit_groups']]:table==='checkins'?[['habit_id','habits']]:[];
   for(const [field,parent] of refs)if(row[field]) {
    row[field]=maps.get(parent)?.get(String(row[field]))??row[field];
    const target=await tx.getOptional<PortableRow>(`SELECT * FROM ${parent} WHERE id=?`,[row[field]]);
    if(!target||(!row.deleted&&target.deleted)||(table==='documents'&&target.kind!==row.kind)) {
     if(field==='habit_id')throw new Error('打卡记录缺少可恢复的习惯。原有内容未改变。');
     row[field]=null;result.detached++;
    }
   }
   const existing=await tx.getOptional(`SELECT * FROM ${table} WHERE id=?`,[row.id]);
   if(!forceCopies&&existing&&JSON.stringify(portableRow(table,existing))===JSON.stringify(row)){mapping.set(source.id,row.id);result.skipped++;continue;}
   if(table==='tasks'&&row.document_id){row.document_id=null;result.detached++;} // A current document is not a historical source snapshot.
   if(existing||forceCopies){row.id=newId();result.copies++;}mapping.set(source.id,row.id);
   const fields=Object.keys(row);await tx.execute(`INSERT INTO ${table}(${fields.join(',')},revision,updated_at) VALUES(${Array(fields.length+2).fill('?').join(',')})`,[...fields.map(f=>row[f]),1,new Date().toISOString()]);result.added++;
  }
 }
 for(const draft of backup.drafts) {
  const draftId=newId(),group=maps.get('document_groups')?.get(draft.group_id??'')??draft.group_id;
  const existingGroup=group?await tx.getOptional('SELECT id FROM document_groups WHERE id=? AND deleted=0 AND kind=?',[group,draft.kind]):null;
  await tx.execute('INSERT INTO local_drafts(id,kind,title,body,date,group_id,document_id,base_revision) VALUES(?,?,?,?,?,?,?,0)',[draftId,draft.kind,draft.title,draft.body,draft.date,existingGroup?group:null,draftId]);
 }
 if(backup.recovery.length)await tx.execute('INSERT INTO local_conflicts(id,snapshots,payload,error,created_at) VALUES(?,?,?,?,?)',[newId(),JSON.stringify(backup.recovery),'[]','导入的恢复副本',new Date().toISOString()]);
 return result;
}
export async function importRecords(tx:Transaction,backup:RecordBackup,digest:string,newId:()=>string) {
 const receipt='record-import-'+digest,previous=await tx.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',[receipt]);
 if(previous)return {...JSON.parse(previous.value),repeated:true};
 const before=await captureRecords(tx);
 await tx.execute('INSERT INTO local_meta(id,value) VALUES(?,?)',['record-before-import-'+digest,JSON.stringify(before)]);
 const result={...await mergeRecords(tx,backup,newId),drafts:backup.drafts.length,recovery:backup.recovery.length,repeated:false};
 await tx.execute('INSERT INTO local_meta(id,value) VALUES(?,?)',[receipt,JSON.stringify(result)]);return result;
}
