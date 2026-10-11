const { createHash } = require('node:crypto');
const { mkdtempSync,rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createDailyService } = require('../../src/daily/service');
const { dailyTables } = require('../../src/daily/schema');
const { validateOrganizationBatch,organizationDependencies } = require('../../src/daily/model');

const ui = { actor:'ui' }, now = Date.parse('2026-10-11T12:00:00+08:00');
const deps = { id:()=>'unused',now:()=>now,digest:async text=>createHash('sha256').update(text).digest('hex') };
let db,daily;
function open(filename) {
  const store = sqliteHarness(filename);
  for (const [name,fields] of Object.entries(dailyTables)) store.sql.exec(`CREATE TABLE IF NOT EXISTS ${name}(id TEXT PRIMARY KEY,${Object.entries(fields).map(([field,column])=>`${field} ${column.type}`).join(',')})`);
  return store;
}
beforeEach(()=>{ db=open(); daily=createDailyService(db,deps); });
afterEach(()=>db.close());
const code = (promise,value)=>expect(promise).rejects.toMatchObject({ code:value });
async function memo(id='m1',groupId='old') {
  await db.execute("INSERT OR IGNORE INTO document_groups(id,kind,name,sort_order,revision,deleted) VALUES('old','memo','旧分类',0,1,0)");
  await db.execute("INSERT OR IGNORE INTO document_groups(id,kind,name,sort_order,revision,deleted) VALUES('new','memo','新分类',1,1,0)");
  await db.execute("INSERT INTO documents(id,kind,title,body,date,group_id,sort_order,revision,deleted,created_at,edited_at,updated_at) VALUES(?,'memo','合成备忘录','这是正文，不成为批次快照','2026-10-11',?,0,1,0,?,?,?)",[id,groupId,now,now,new Date(now).toISOString()]);
}
async function task(id='t1') {
  await db.execute("INSERT INTO tasks(id,title,note,status,sort_order,revision,deleted,created_at,updated_at) VALUES(?,'合成待办','保留原备注','open',0,1,0,?,?)",[id,now,new Date(now).toISOString()]);
}
const move = (targets=[{id:'m1',expectedRevision:1}])=>({type:'memo.move',targets,groupId:'new'});
const preview = (plan,id='batch')=>daily.previewOrganization(plan,{...ui,batchId:id});
async function rawBatch(id='batch') { return db.getOptional('SELECT * FROM local_organization_batches WHERE id=?',[id]); }

test('explicit bounded training basis separates plans/completions/cancellations and linked checkins',async()=>{
  await db.execute("INSERT INTO habits(id,name,revision,deleted) VALUES('h','合成训练',1,0)");
  await db.execute("INSERT INTO checkins(id,habit_id,date_key,timestamp,note,revision,deleted) VALUES('c','h','2026-10-11',?,'完成记录',1,0)",[now]);
  for (const [id,status,checkin] of [['a','active',null],['b','completed','c'],['d','cancelled',null]]) {
    await db.execute("INSERT INTO local_activities(id,kind,title,note,status,habit_id,checkin_id,revision,created_at,completed_at) VALUES(?,'训练','合成活动','记录而非训练量',?,'h',?,1,?,?)",[id,status,checkin,now,status==='active'?null:now]);
  }
  const result=await daily.readTrainingHistory({from:'2026-10-11',through:'2026-10-11',habitId:'h',kind:'训练'});
  expect(result.statusCounts).toEqual({active:1,completed:1,cancelled:1});
  expect(result.activities.find(a=>a.id==='b')).toMatchObject({checkin_state:'linked',checkin_note:'完成记录',habit_name:'合成训练'});
  expect(result.checkins).toHaveLength(1); expect(result.checkins[0].linked_activities).toBe(1);
  expect(result.activityCoverage).toEqual({matched:3,returned:3,complete:true,truncated:false});
  expect(result.basis).toContain('关联打卡不重复');
});

test('training counts remain exact when rows truncate and the date range includes a closed earlier plan',async()=>{
  for(let i=0;i<3;i++) await db.execute("INSERT INTO local_activities(id,kind,title,status,revision,created_at,completed_at) VALUES(?,'training','合成','completed',1,?,?)",[`a${i}`,now-10*86400000,now]);
  const result=await daily.readTrainingHistory({from:'2026-10-11',through:'2026-10-11',limit:2});
  expect(result.activityCoverage).toEqual({matched:3,returned:2,complete:false,truncated:true});
  expect(result.statusCounts.completed).toBe(3);
  await code(daily.readTrainingHistory({from:'2025-10-10',through:'2026-10-11'}),'INVALID_ARGUMENT');
  await code(daily.readTrainingHistory({from:'2026-02-29',through:'2026-10-11'}),'INVALID_ARGUMENT');
  await code(daily.readTrainingHistory({from:'2026-10-11',through:'2026-10-10'}),'INVALID_ARGUMENT');
  await code(daily.readTrainingHistory({from:'2026-10-11',through:'2026-10-11',limit:101}),'INVALID_ARGUMENT');
});

test('memo preview changes no record and keeps only whitelist snapshots; confirmation and undo preserve prose',async()=>{
  await memo(); const result=await preview(move());
  expect((await db.getOptional('SELECT group_id,revision FROM documents WHERE id=?',['m1']))).toEqual({group_id:'old',revision:1});
  const saved=await rawBatch(); validateOrganizationBatch(saved);
  expect(saved.before_snapshots).not.toContain('这是正文'); expect(saved.after_snapshots).not.toContain('body');
  expect(organizationDependencies(saved)).toEqual(expect.arrayContaining([{table:'documents',id:'m1',historical:true},{table:'document_groups',id:'old',historical:true},{table:'document_groups',id:'new',historical:true}]));
  const committed=await daily.confirmOrganization(result.id,1,ui);
  expect(committed).toMatchObject({status:'applied',revision:2,changed:1});
  expect((await db.getOptional('SELECT group_id,body,revision FROM documents WHERE id=?',['m1']))).toEqual({group_id:'new',body:'这是正文，不成为批次快照',revision:2});
  await daily.undoOrganization(result.id,2,ui);
  expect((await db.getOptional('SELECT group_id,body,revision FROM documents WHERE id=?',['m1']))).toEqual({group_id:'old',body:'这是正文，不成为批次快照',revision:3});
  validateOrganizationBatch(await rawBatch());
});

test('same batch retries return durable receipts while new plans cannot reuse the ID',async()=>{
  await task(); const plan={type:'task.trash',targets:[{id:'t1',expectedRevision:1}]};
  const first=await preview(plan); expect((await preview(plan)).id).toBe(first.id);
  await code(preview({...plan,targets:[{id:'other',expectedRevision:1}]}),'BATCH_ID_REUSED');
  await daily.confirmOrganization('batch',1,ui);
  expect(await daily.confirmOrganization('batch',1,ui)).toMatchObject({status:'applied',replayed:true,revision:2});
  expect((await db.getOptional('SELECT deleted,revision FROM tasks WHERE id=?',['t1']))).toEqual({deleted:1,revision:2});
  await daily.undoOrganization('batch',2,ui);
  expect(await daily.undoOrganization('batch',2,ui)).toMatchObject({status:'undone',replayed:true,revision:3});
  expect((await db.getOptional('SELECT deleted,revision,note FROM tasks WHERE id=?',['t1']))).toEqual({deleted:0,revision:3,note:'保留原备注'});
  await code(daily.confirmOrganization('batch',1,ui),'BATCH_CLOSED');
});

test('changed content even without a version bump aborts the entire selected batch',async()=>{
  await memo('m1'); await memo('m2'); await preview(move([{id:'m1',expectedRevision:1},{id:'m2',expectedRevision:1}]));
  await db.execute("UPDATE documents SET body='后续修改' WHERE id='m2'");
  await code(daily.confirmOrganization('batch',1,ui),'VERSION_CONFLICT');
  expect(await db.getAll('SELECT id,group_id,revision FROM documents ORDER BY id')).toEqual([{id:'m1',group_id:'old',revision:1},{id:'m2',group_id:'old',revision:1}]);
  expect((await rawBatch()).status).toBe('preview');
});

test('later edits block undo without replacing any later content',async()=>{
  await memo(); await preview(move()); await daily.confirmOrganization('batch',1,ui);
  await db.execute("UPDATE documents SET title='后续标题',revision=3 WHERE id='m1'");
  await code(daily.undoOrganization('batch',2,ui),'VERSION_CONFLICT');
  expect((await db.getOptional("SELECT title,group_id FROM documents WHERE id='m1'"))).toEqual({title:'后续标题',group_id:'new'});
});

test('a missing original memo group blocks the entire undo while keeping the applied receipt',async()=>{
  await memo(); await preview(move()); await daily.confirmOrganization('batch',1,ui);
  await db.execute("UPDATE document_groups SET deleted=1,revision=2 WHERE id='old'");
  await code(daily.undoOrganization('batch',2,ui),'NOT_FOUND');
  expect((await db.getOptional("SELECT group_id,revision FROM documents WHERE id='m1'"))).toEqual({group_id:'new',revision:2});
  expect((await rawBatch()).status).toBe('applied');
});

test('organization history pages use a stable cursor so older undo receipts remain reachable',async()=>{
  await task();
  const plan={type:'task.trash',targets:[{id:'t1',expectedRevision:1}]};
  for (const id of ['a','b','c']) await preview(plan,id);
  const first=await daily.listOrganizationBatches({limit:2}); expect(first.map(row=>row.id)).toEqual(['a','b']);
  const second=await daily.listOrganizationBatches({limit:2,before:{createdAt:first[1].created_at,id:first[1].id}});
  expect(second.map(row=>row.id)).toEqual(['c']);
});

test('receipt interruption rolls back all mutations and the preview remains retryable',async()=>{
  await task('t1'); await task('t2'); await preview({type:'task.trash',targets:[{id:'t1',expectedRevision:1},{id:'t2',expectedRevision:1}]});
  db.failOn('UPDATE local_organization_batches');
  await expect(daily.confirmOrganization('batch',1,ui)).rejects.toThrow('Synthetic');
  expect(await db.getAll('SELECT deleted,revision FROM tasks ORDER BY id')).toEqual([{deleted:0,revision:1},{deleted:0,revision:1}]);
  db.failOn(null); await daily.confirmOrganization('batch',1,ui);
  expect((await rawBatch()).status).toBe('applied');
});

test('bulk plans reject broad targets, diary mutations, unsupported verbs and untrusted actors',async()=>{
  await memo();
  await code(daily.previewOrganization(move(),{actor:'agent',batchId:'bad'}),'PERMISSION_DENIED');
  await code(preview({type:'sql',targets:[{id:'m1',expectedRevision:1}],sql:'DELETE FROM documents'}),'INVALID_ARGUMENT');
  await code(preview(move(Array.from({length:21},(_,i)=>({id:`m${i}`,expectedRevision:1})))),'INVALID_ARGUMENT');
  await code(preview(move([{id:'m1',expectedRevision:1},{id:'m1',expectedRevision:1}])),'INVALID_ARGUMENT');
  await db.execute("UPDATE documents SET kind='diary' WHERE id='m1'");
  await code(preview(move()),'NOT_FOUND');
  expect(await db.getAll('SELECT * FROM local_organization_batches')).toEqual([]);
});

test('restored organization receipts retain audit history without executable confirmation or undo',async()=>{
  await task(); await preview({type:'task.trash',targets:[{id:'t1',expectedRevision:1}]}); await daily.confirmOrganization('batch',1,ui);
  await db.execute("UPDATE local_organization_batches SET status='restored' WHERE id='batch'");
  expect((await daily.getOrganizationBatch('batch')).status).toBe('restored');
  await code(daily.confirmOrganization('batch',2,ui),'BATCH_CLOSED');
  await code(daily.undoOrganization('batch',2,ui),'BATCH_CLOSED');
  const saved=await rawBatch();
  const snapshots=JSON.parse(saved.before_snapshots); snapshots[0].body='forged';
  expect(()=>validateOrganizationBatch({...saved,before_snapshots:JSON.stringify(snapshots)})).toThrow();
});

test('applied batch reopens from disk and supports one guarded undo without in-memory state',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'lime-daily-')),filename=join(dir,'synthetic.sqlite');
  db.close(); db=open(filename); daily=createDailyService(db,deps);
  try {
    await task(); await preview({type:'task.trash',targets:[{id:'t1',expectedRevision:1}]}); await daily.confirmOrganization('batch',1,ui);
    db.close(); db=open(filename); daily=createDailyService(db,deps);
    expect((await daily.getOrganizationBatch('batch')).status).toBe('applied');
    await daily.undoOrganization('batch',2,ui);
    expect((await db.getOptional("SELECT deleted,revision FROM tasks WHERE id='t1'"))).toEqual({deleted:0,revision:3});
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
