const { sqliteHarness } = require('./sqliteHarness.cjs');
const { captureBackup, restoreBackup } = require('../../src/backup/store');
const { projectRow, exportTables, emptyBackupRows, validateManifest } = require('../../src/backup/model');
const { createAgentStore } = require('../../src/agent/store');
const { createDomain } = require('../../src/domain/service');
const { createReminderService } = require('../../src/reminders/service');
const { createHash } = require('node:crypto');
const hash = 'a'.repeat(64), packageHash = 'b'.repeat(64);
const digest = async s => createHash('sha256').update(s).digest('hex');
const args = { digest: packageHash, archiveUri: 'file:///isolated/package.zip', archiveSize: 100, now: 100, fileUri: h => 'file:///isolated/'+h+'.bin' };
const task = (id='task') => projectRow('tasks',{id,title:'合成待办',note:'',status:'open',document_id:null,due_at:null,due_date_key:'2026-10-11',due_time:'10:00',sort_order:0,created_at:100,completed_at:null,revision:1,deleted:0,updated_at:'2026-10-10T00:00:00Z'});
let source,target;
beforeEach(()=>{source=sqliteHarness();target=sqliteHarness();});
afterEach(()=>{source.close();target.close();});
async function seed(db,table,row) {const r=projectRow(table,row),keys=Object.keys(r);await db.execute(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,keys.map(k=>r[k]));return r;}
async function packet() { return validateManifest(await captureBackup(source)); }

test('explicit table/meta projection excludes grants, keys, notification state and internal migrations',async()=>{
  await seed(source,'local_meta',{id:'agent-model',value:'deepseek-flash'});
  for(const id of ['secret-setting','reminders-enabled','material-draft-test','lime-local-migration-v1'])await seed(source,'local_meta',{id,value:'SYNTHETIC_PRIVATE_VALUE'});
  await seed(source,'local_agent_grants',{id:'grant',request_id:'request',command_type:'task.create'});
  const m=await packet();expect(m.rows.local_meta).toHaveLength(1);expect(exportTables).not.toContain('local_agent_grants');expect(JSON.stringify(m)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
});
test('empty-target restore preserves IDs/revisions/text/relationships and repeats once without grants',async()=>{
  await seed(source,'tasks',task());
  await seed(source,'local_agent_sessions',{id:'session',title:'合成聊天',created_at:100,updated_at:100});
  await seed(source,'local_agent_requests',{id:'request',session_id:'session',text:'合成请求',source_refs:'[]',status:'running',created_at:100,updated_at:100});
  await seed(source,'local_agent_messages',{id:'request:u',session_id:'session',request_id:'request',role:'user',body:'原文',created_at:100});
  await seed(source,'local_personas',{id:'current',filename:'synthetic.md',body:'合成人格',enabled:1,revision:7,updated_at:100});
  const m=await packet();expect((await restoreBackup(target,m,args)).added).toBe(5);
  expect(await target.getOptional('SELECT * FROM local_personas')).toMatchObject({enabled:0,revision:7,body:'合成人格'});
  expect(await target.getOptional('SELECT * FROM local_agent_requests')).toMatchObject({status:'restored'});
  const agent=createAgentStore(target,{id:()=> 'unused',now:()=>100});await expect(agent.restart('request')).rejects.toThrow('不能重试');
  expect(await agent.grants('request')).toEqual([]);
  expect(await restoreBackup(target,m,args)).toMatchObject({repeated:true,added:5});expect((await target.getAll('SELECT * FROM tasks'))).toHaveLength(1);
});
test('different archive of the same contents skips normalized history and persona without overwriting existing enablement',async()=>{
  await seed(source,'local_personas',{id:'current',filename:'synthetic.md',body:'人格',enabled:1,revision:1,updated_at:100});
  const m=await packet();await restoreBackup(target,m,args);await target.execute('UPDATE local_personas SET enabled=1');
  expect(await restoreBackup(target,m,{...args,digest:'c'.repeat(64)})).toMatchObject({added:0,skipped:1,conflicts:0});
  expect((await target.getOptional('SELECT enabled FROM local_personas')).enabled).toBe(1);
});
test('same ID with changed parent blocks dependent children, preserves the complete input archive, adds independent records',async()=>{
  const h={id:'habit',name:'合成习惯',group_id:null,cadence:'daily',target_count:1,sort_order:0,created_at:100,archived_at:null,revision:1,deleted:0,updated_at:'2026-10-10T00:00:00Z'};
  await seed(source,'habits',h);await seed(target,'habits',{...h,name:'现有名称'});
  await seed(source,'checkins',{id:'checkin',habit_id:'habit',date_key:'2026-10-10',timestamp:100,note:'',created_at:100,revision:1,deleted:0,updated_at:h.updated_at});await seed(source,'tasks',task());
  expect(await restoreBackup(target,await packet(),args)).toMatchObject({added:1,conflicts:2});
  expect((await target.getOptional('SELECT name FROM habits')).name).toBe('现有名称');expect(await target.getAll('SELECT * FROM checkins')).toHaveLength(0);
  expect(await target.getOptional('SELECT * FROM local_backup_archives')).toMatchObject({uri:args.archiveUri,hash:packageHash});
  const next=await captureBackup(target);expect(next.rows.local_backup_archives).toHaveLength(1);
});
test('transactions roll back records, suppression markers and receipt together after a late failure',async()=>{
  await seed(source,'tasks',task());target.failOn('INSERT INTO local_backup_imports');
  await expect(restoreBackup(target,await packet(),args)).rejects.toThrow('Synthetic');
  for(const table of ['tasks','local_backup_imports','local_meta'])expect(await target.getAll('SELECT * FROM '+table)).toHaveLength(0);
  target.failOn(null);expect(await restoreBackup(target,await packet(),args)).toMatchObject({added:1});
});
test('restored tasks do not schedule notifications with pre-existing global settings; an explicit edit enables normal planning',async()=>{
  await seed(source,'tasks',task());await restoreBackup(target,await packet(),args);
  await seed(target,'local_meta',{id:'reminders-enabled',value:'1'});await seed(target,'local_meta',{id:'reminders-tasks',value:'1'});
  const driver={allowed:async()=>true,pending:async()=>[],cancel:jest.fn(),schedule:jest.fn()};
  const svc=createReminderService(target,driver,{now:()=>Date.parse('2026-10-10T10:00:00+08:00'),digest});await svc.refresh();expect(driver.schedule).not.toHaveBeenCalled();
  await target.execute('UPDATE tasks SET revision=2');await svc.refresh();expect(driver.schedule).toHaveBeenCalledTimes(1);
});
test('portable material paths are relocated, same content skips, corrupt blobs/extra fields/version and unknown metadata are rejected',async()=>{
  const m=await captureBackup(source);m.blobs=[{hash,size:3,role:'material'}];m.rows.local_materials=[projectRow('local_materials',{id:'material',filename:'synthetic.txt',uri:'blob:'+hash,hash,size:3,mime:'text/plain',kind:'text',body:'原文',images:'[]',pages:0,status:'ready',note:'',revision:4,deleted:0,created_at:100})];
  validateManifest(m);await restoreBackup(target,m,args);expect((await target.getOptional('SELECT uri FROM local_materials')).uri).toBe(args.fileUri(hash));
  expect(await restoreBackup(target,m,{...args,digest:'c'.repeat(64)})).toMatchObject({added:0,skipped:1});
  const variants=[{...m,version:2},{...m,rows:{...m.rows,unexpected:[]}},{...m,blobs:[{hash,size:4,role:'material'}]},{...m,rows:{...m.rows,local_meta:[{id:'secret',value:'x'}]}},{...m,rows:{...m.rows,tasks:[{...task(),evil:'x'}]}}];
  for(const bad of variants)expect(()=>validateManifest(bad)).toThrow();
});
test('missing references and malformed requests are rejected before SQL mutation',async()=>{
  const m=await captureBackup(source);m.rows.local_agent_messages=[projectRow('local_agent_messages',{id:'message',session_id:'missing',request_id:'missing',role:'user',body:'x',created_at:100})];
  await expect(restoreBackup(target,m,args)).rejects.toMatchObject({code:'REFERENCE'});expect(await target.getAll('SELECT * FROM local_agent_messages')).toHaveLength(0);
});
test('pending proposals become inert restored history; accepted results preserve actual operation/source links',async()=>{
  await seed(source,'local_agent_sessions',{id:'session',title:'合成',created_at:100,updated_at:100});
  await seed(source,'local_agent_requests',{id:'request',session_id:'session',text:'建议',source_refs:'[]',status:'complete',created_at:100,updated_at:100});
  await seed(source,'local_proposals',{id:'proposal',request_id:'request',command:JSON.stringify({type:'task.create',title:'合成待办'}),source_refs:'[]',fingerprint:'synthetic',status:'pending',revision:1,created_at:100,updated_at:'2026-10-10T00:00:00Z'});
  await restoreBackup(target,await packet(),args);
  const domain=createDomain(target,{id:()=> 'unused',now:()=>100,digest});await expect(domain.acceptProposal('proposal',1,{actor:'ui',operationId:'unused'})).rejects.toMatchObject({code:'PROPOSAL_CLOSED'});
});

test('a conflicting source prevents activation of its imported receipt/history and dependent task',async()=>{
  const doc=projectRow('documents',{id:'document',kind:'diary',title:'合成日记',body:'原文',date:'2026-10-10',group_id:null,sort_order:0,created_at:100,edited_at:100,deleted_at:null,revision:1,deleted:0,updated_at:'2026-10-10T00:00:00Z'});
  await seed(source,'documents',doc);await seed(target,'documents',{...doc,body:'现有原文'});await seed(source,'tasks',task());
  await seed(source,'local_agent_sessions',{id:'session',title:'测试',created_at:100,updated_at:100});
  const refs=JSON.stringify([{id:'document',revision:1}]);
  await seed(source,'local_agent_requests',{id:'request',session_id:'session',text:'总结',source_refs:refs,status:'complete',created_at:100,updated_at:100});
  const receipt={operationId:'op',disposition:'committed',entity:{kind:'task',id:'task',revision:1}};
  await seed(source,'local_proposals',{id:'proposal',request_id:'request',command:'',source_refs:refs,fingerprint:'synthetic',status:'accepted',receipt:JSON.stringify(receipt),revision:1,created_at:100,updated_at:'2026-10-10T00:00:00Z'});
  expect((await restoreBackup(target,await packet(),args)).conflicts).toBe(4);
  expect(await target.getAll('SELECT * FROM tasks')).toHaveLength(0);expect(await target.getAll('SELECT * FROM local_proposals')).toHaveLength(0);
});

test('restorable records reject nullable UI text and malformed drafts before activation',async()=>{
  const m=await captureBackup(source);
  m.rows.local_memories=[projectRow('local_memories',{id:'memory',kind:'fact',key:'合成',content:null,forgotten:0,revision:1,created_at:100,updated_at:'2026-10-10T00:00:00Z'})];
  expect(()=>validateManifest(m)).toThrow();
  m.rows.local_memories=[];m.rows.local_drafts=[projectRow('local_drafts',{id:'draft',document_id:'document',kind:'diary',title:'',body:null,date:'2026-10-10'})];
  expect(()=>validateManifest(m)).toThrow();
});
test('historical source excerpt projection retains content but strips transport credentials and URLs',async()=>{
  await seed(source,'local_meta',{id:'task-sources-owner-task',value:JSON.stringify({proposals:[],sources:[{id:'source',filename:'合成通知',status:'saved',text:'原文',truncated:false,transport_token:'SYNTHETIC_PRIVATE_MARKER',download_url:'https://example.invalid/private'}]})});
  const m=await captureBackup(source);expect(JSON.stringify(m)).toContain('原文');expect(JSON.stringify(m)).not.toContain('SYNTHETIC_PRIVATE_MARKER');expect(JSON.stringify(m)).not.toContain('download_url');validateManifest(m);
});
