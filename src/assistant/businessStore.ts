import type { Transaction } from '@powersync/react-native';
import type { AppData, Habit, TodoItem } from '../types/habit';

type Row = Record<string, string | number | null> & { id: string; revision: number };
const tables = ['document_groups','habit_groups', 'habits', 'checkins', 'tasks','documents'] as const;
type TableName = typeof tables[number];
type Records = Record<TableName, Row[]>;
const num = (value: unknown, fallback = 0) => value == null ? fallback : Number(value);

export function records(data: AppData): Records {
 return {
  document_groups:data.memoGroups.map(g=>({id:g.id,kind:'memo',name:g.name,sort_order:g.order,created_at:g.createdAt,revision:0})),
  documents:data.memos.map(m=>{const d=new Date(m.createdAt),date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {id:m.id,kind:'memo',title:m.title,body:m.body,date:m.date??date,group_id:m.groupId,sort_order:m.order,created_at:m.createdAt,edited_at:m.updatedAt,deleted_at:m.deletedAt,deleted:m.deletedAt===null?0:1,revision:0};}),
  habit_groups: data.groups.map(g => ({id:g.id,name:g.name,sort_order:g.order,created_at:g.createdAt,revision:0})),
  habits: data.habits.map(h => ({id:h.id,name:h.name,group_id:h.groupId,cadence:h.cadence,target_count:h.targetCount,sort_order:h.order,created_at:h.createdAt,archived_at:h.archivedAt,revision:0})),
  checkins: data.habits.flatMap(h => h.checkins.map(c => ({id:c.id,habit_id:h.id,date_key:c.dateKey,timestamp:c.timestamp,note:c.note,created_at:c.createdAt,revision:0}))),
  tasks: data.todos.map(t => ({id:t.id,title:t.title,note:t.note,due_date_key:t.dueDateKey,due_time:t.dueTime,sort_order:t.order,created_at:t.createdAt,completed_at:t.completedAt,status:t.completedAt===null?'open':'done',revision:0})),
 };
}

export async function readBusiness(tx: Pick<Transaction,'getAll'>, base: AppData): Promise<AppData> {
 const groups = await tx.getAll<Row>('SELECT * FROM habit_groups WHERE deleted=0 ORDER BY sort_order,id');
 const habits = await tx.getAll<Row>('SELECT * FROM habits WHERE deleted=0 ORDER BY sort_order,id');
 const checkins = await tx.getAll<Row>('SELECT * FROM checkins WHERE deleted=0 ORDER BY timestamp,id');
 const tasks = await tx.getAll<Row>('SELECT * FROM tasks WHERE deleted=0 ORDER BY sort_order,id');
 const memoGroups=await tx.getAll<Row>("SELECT * FROM document_groups WHERE kind='memo' AND deleted=0 ORDER BY sort_order,id");
 const memos=await tx.getAll<Row>("SELECT * FROM documents WHERE kind='memo' ORDER BY sort_order,id");
 return {...base,
  memoGroups:memoGroups.map(g=>({id:g.id,name:String(g.name),order:num(g.sort_order),createdAt:num(g.created_at)})),
  memos:memos.map(m=>({id:m.id,title:String(m.title),body:String(m.body),groupId:memoGroups.some(g=>g.id===m.group_id)?m.group_id as string:null,order:num(m.sort_order),createdAt:num(m.created_at,Date.parse(String(m.updated_at))),updatedAt:num(m.edited_at,Date.parse(String(m.updated_at))),deletedAt:m.deleted===1?num(m.deleted_at,Date.parse(String(m.updated_at))):null,revision:num(m.revision),date:String(m.date)})),
  groups:groups.map(g => ({id:g.id,name:String(g.name),order:num(g.sort_order),createdAt:num(g.created_at)})),
  habits:habits.map(h => ({id:h.id,revision:num(h.revision),name:String(h.name),groupId:h.group_id as string|null,cadence:h.cadence as Habit['cadence'],targetCount:num(h.target_count,1),order:num(h.sort_order),createdAt:num(h.created_at),archivedAt:h.archived_at===null?null:num(h.archived_at),checkins:checkins.filter(c => c.habit_id===h.id).map(c => ({id:c.id,dateKey:String(c.date_key),timestamp:num(c.timestamp),note:String(c.note??''),createdAt:num(c.created_at)}))})),
  todos:tasks.map(t => ({id:t.id,revision:num(t.revision),title:String(t.title),note:String(t.note??''),dueDateKey:t.due_date_key as string|null,dueTime:t.due_time as string|null,order:num(t.sort_order),createdAt:num(t.created_at),completedAt:t.status==='done'?num(t.completed_at,Date.parse(String(t.updated_at))):null} satisfies TodoItem)),
 };
}

// One transaction per user action. Revisions are read from SQLite, never from a stale render.
export async function writeBusiness(tx: Transaction, before: AppData, after: AppData) {
 const old = records(before), next = records(after), now = new Date().toISOString();
 for (const table of tables) {
  const oldById = new Map(old[table].map(r => [r.id,r]));
  const nextById = new Map(next[table].map(r => [r.id,r]));
  for (const row of next[table]) {
   if(JSON.stringify(oldById.get(row.id))===JSON.stringify(row))continue;
   const stored = await tx.getOptional<Row>(`SELECT * FROM ${table} WHERE id=?`,[row.id]);
   const fields = Object.keys(row).filter(k => !['id','revision','deleted'].includes(k));
   if(stored) await tx.execute(`UPDATE ${table} SET ${fields.map(k => `${k}=?`).join(',')},revision=revision+1,deleted=?,updated_at=? WHERE id=?`,[...fields.map(k => row[k]),row.deleted??0,now,row.id]);
   else await tx.execute(`INSERT INTO ${table}(id,${fields.join(',')},revision,deleted,updated_at) VALUES(${Array(fields.length+4).fill('?').join(',')})`,[row.id,...fields.map(k => row[k]),1,row.deleted??0,now]);
  }
 }
 // Detach children before deleting their parent classification.
 for(const table of [...tables].reverse())for(const row of old[table])if(!next[table].some(r=>r.id===row.id))await tx.execute(`UPDATE ${table} SET deleted=1,revision=revision+1,updated_at=? WHERE id=? AND deleted=0`,[now,row.id]);
}
