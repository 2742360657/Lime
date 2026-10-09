// Exercise the actual TypeScript data adapter with real SQLite transactions.
// Adapted from the historical workspace synthetic checks; native local-only behavior is verified separately.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../package.json',import.meta.url));
const ts=require('typescript'),sql=new DatabaseSync(':memory:');
for(const [table,fields] of Object.entries({
 document_groups:'kind TEXT,name TEXT,sort_order INTEGER,created_at INTEGER',
 documents:'kind TEXT,title TEXT,body TEXT,date TEXT,group_id TEXT,sort_order INTEGER,created_at INTEGER,edited_at INTEGER,deleted_at INTEGER',
 habit_groups:'name TEXT,sort_order INTEGER,created_at INTEGER',
 habits:'name TEXT,group_id TEXT,cadence TEXT,target_count INTEGER,sort_order INTEGER,created_at INTEGER,archived_at INTEGER',
 checkins:'habit_id TEXT,date_key TEXT,timestamp INTEGER,note TEXT,created_at INTEGER',
 tasks:'title TEXT,note TEXT,due_date_key TEXT,due_time TEXT,sort_order INTEGER,created_at INTEGER,completed_at INTEGER,status TEXT,document_id TEXT,due_at TEXT',
}))sql.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,owner_id TEXT,${fields},revision INTEGER,deleted INTEGER,updated_at TEXT)`);
sql.exec('CREATE TABLE local_meta(id TEXT PRIMARY KEY,value TEXT); CREATE TABLE local_drafts(id TEXT PRIMARY KEY,kind TEXT,title TEXT,body TEXT,date TEXT,group_id TEXT,document_id TEXT,base_revision INTEGER,base_content TEXT); CREATE TABLE local_conflicts(id TEXT PRIMARY KEY,payload TEXT,snapshots TEXT,error TEXT,created_at TEXT)');
let failImport=false;
const tx={
 getAll:async (query,args=[])=>sql.prepare(query).all(...args),
 getOptional:async (query,args=[])=>sql.prepare(query).get(...args)||null,
 execute:async (query,args=[])=>{if(failImport&&query.startsWith('INSERT INTO checkins'))throw new Error('synthetic interrupted import');return sql.prepare(query).run(...args);},
};
globalThis.__businessTestDB={...tx,writeTransaction:async fn=>{sql.exec('BEGIN');try{const result=await fn(tx);sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
globalThis.__businessTestID=randomUUID;
const source=readFileSync(new URL('../src/assistant/businessStore.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/import\s*\{\s*database\s*\}\s*from\s*['"]\.\/database['"];?/,'const database=globalThis.__businessTestDB;');
const compiledStore=compiled.replace(/import\s*\{\s*createId\s*\}\s*from\s*['"]\.\.\/utils\/id['"];?/,'const createId=globalThis.__businessTestID;');
const store=await import('data:text/javascript;base64,'+Buffer.from(compiledStore).toString('base64'));
const data={version:7,settings:{profileName:'synthetic'},memos:[],memoGroups:[],groups:[{id:'old-group',name:'Training',order:4,createdAt:1}],habits:[{id:'old-habit',name:'Strength',groupId:'old-group',cadence:'weekly',targetCount:3,order:5,createdAt:2,archivedAt:null,checkins:[{id:'old-checkin',dateKey:'2026-10-08',timestamp:100,note:'fixture',createdAt:3}]}],todos:[{id:'old-task',title:'Prepare',note:'original-note',dueDateKey:'2026-10-09',dueTime:'18:30',order:7,createdAt:4,completedAt:null}]};
failImport=true;
await assert.rejects(store.migrateLegacyBusiness(data));
assert.equal((await tx.getAll('SELECT * FROM local_meta')).length,0);
assert.equal((await tx.getAll('SELECT * FROM habits')).length,0);
failImport=false;
const first=await store.migrateLegacyBusiness(data);
assert.deepEqual(first,data);
assert.equal(JSON.parse((await tx.getOptional("SELECT value FROM local_meta WHERE id='business-import-backup-v1'")).value).todos[0].note,'original-note');
const changed=structuredClone(first);changed.habits[0].checkins=[];changed.todos[0].title='Updated';changed.todos[0].completedAt=500;
await globalThis.__businessTestDB.writeTransaction(tx=>store.writeBusiness(tx,first,changed));
const reopened=await store.migrateLegacyBusiness(data);
assert.equal(reopened.habits[0].checkins.length,0);
assert.equal(reopened.todos[0].title,'Updated');
assert.equal(reopened.todos[0].completedAt,500);
assert.equal((await tx.getOptional("SELECT revision FROM tasks WHERE id='old-task'")).revision,2);
assert.equal((await tx.getOptional("SELECT deleted FROM checkins WHERE id='old-checkin'")).deleted,1);
console.log('PASS interrupted business import, no resurrection, original metadata and revision');
// Existing business marker predates memo support: the separate memo marker still imports it.
sql.exec("DELETE FROM local_meta WHERE id IN ('memo-import-v1','memo-import-backup-v1','memo-import-map-v1')");
const legacyMemo={...data,memoGroups:[{id:'old-memo-group',name:'Notes',order:2,createdAt:10}],memos:[{id:'old-memo',title:'Memo',body:'Original text',groupId:'old-memo-group',order:3,createdAt:100,updatedAt:200,deletedAt:null},{id:'old-trash',title:'Trash',body:'Retained original',groupId:'old-memo-group',order:4,createdAt:101,updatedAt:201,deletedAt:202}]};
const migrated=await store.migrateLegacyBusiness(legacyMemo);
assert.equal(migrated.memos.find(m=>m.id==='old-trash').deletedAt,202);assert.equal(migrated.memos.find(m=>m.id==='old-memo').groupId,'old-memo-group');
assert.equal(JSON.parse((await tx.getOptional("SELECT value FROM local_meta WHERE id='memo-import-backup-v1'")).value).memos.length,2);
await globalThis.__businessTestDB.writeTransaction(tx=>store.writeBusiness(tx,migrated,migrated));
assert.equal((await tx.getOptional("SELECT revision FROM documents WHERE id='old-memo'")).revision,1);
const withoutGroup=structuredClone(migrated);withoutGroup.memoGroups=[];withoutGroup.memos.forEach(m=>m.groupId=null);
await globalThis.__businessTestDB.writeTransaction(tx=>store.writeBusiness(tx,migrated,withoutGroup));
assert.equal((await tx.getOptional("SELECT deleted FROM document_groups WHERE id='old-memo-group'")).deleted,1);
assert.equal((await tx.getOptional("SELECT group_id FROM documents WHERE id='old-trash'")).group_id,null);
assert.equal((await store.migrateLegacyBusiness(legacyMemo)).memoGroups.length,0);
console.log('PASS separate memo migration preserves IDs, categories, trash and snapshot; no-op and category deletion retain original');
const backupSource=readFileSync(new URL('../src/assistant/recordBackup.ts',import.meta.url),'utf8');
const backupModule=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(backupSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
sql.prepare("UPDATE tasks SET document_id='old-memo' WHERE id='old-task'").run();
const backup=await backupModule.captureRecords(tx);
assert.equal(backup.rows.documents.length,2);assert.equal(backup.rows.document_groups[0].deleted,1);
assert.equal(backup.rows.documents[0].owner_id,undefined);
assert.throws(()=>backupModule.validateBackup({...backup,version:2}));
const broken=structuredClone(backup);broken.rows.documents[0].date='2026-02-30';assert.throws(()=>backupModule.validateBackup(broken));
const poisoned=structuredClone(backup);poisoned.rows['documents; DELETE FROM tasks']=[];assert.throws(()=>backupModule.validateBackup(poisoned));
const original=await globalThis.__businessTestDB.writeTransaction(tx=>backupModule.importRecords(tx,backup,'same-file',randomUUID));
assert.equal(original.added,0);assert.equal(original.skipped,Object.values(backup.rows).flat().length);
const modified=structuredClone(backup);modified.rows.documents.find(m=>m.id==='old-memo').body='Older backup content';modified.drafts=[{id:'draft-old',document_id:'old-memo',kind:'memo',title:'Draft',body:'Unsaved draft',date:'2026-10-09',group_id:null,base_revision:1}];
const imported=await globalThis.__businessTestDB.writeTransaction(tx=>backupModule.importRecords(tx,modified,'different-file',randomUUID));
assert.equal(imported.copies,1);assert.equal(imported.drafts,1);assert.equal((await tx.getOptional("SELECT body FROM documents WHERE id='old-memo'")).body,'Original text');
assert.equal((await tx.getAll("SELECT * FROM documents WHERE body='Older backup content'")).length,1);
const repeated=await globalThis.__businessTestDB.writeTransaction(tx=>backupModule.importRecords(tx,modified,'different-file',randomUUID));assert.equal(repeated.repeated,true);assert.equal((await tx.getAll('SELECT * FROM local_drafts')).length,1);
const orphan=structuredClone(backup);orphan.rows.habits=[];orphan.rows.checkins=[{id:'orphan',deleted:0,habit_id:'absent',date_key:'2026-10-09',timestamp:1,note:'',created_at:1}];orphan.rows.documents[0].body='rollback copy';
await assert.rejects(globalThis.__businessTestDB.writeTransaction(tx=>backupModule.importRecords(tx,orphan,'rollback-file',randomUUID)));
assert.equal(await tx.getOptional("SELECT value FROM local_meta WHERE id='record-before-import-rollback-file'"),null);
assert.equal((await tx.getAll("SELECT * FROM documents WHERE body='rollback copy'")).length,0);
console.log('PASS portable backup validation, exact skip, collision copies, repeat receipt, draft retention and atomic rollback');
const recovery=structuredClone(backup);recovery.rows=backupModule.emptyRows();recovery.drafts=[];recovery.recovery=[{table:'documents',row:backup.rows.documents[0]}];
await globalThis.__businessTestDB.writeTransaction(tx=>backupModule.importRecords(tx,recovery,'recovery-file',randomUUID));
assert.equal((await tx.getAll('SELECT * FROM local_conflicts')).length,1);
const exportedAgain=await backupModule.captureRecords(tx);assert.equal(exportedAgain.drafts.length,1);assert.equal(exportedAgain.recovery.length,1);
const draftBackup=backupModule.validateBackup(exportedAgain);assert.equal(draftBackup.drafts[0].body,'Unsaved draft');
sql.exec("DELETE FROM local_meta WHERE id IN ('memo-import-v1','memo-import-backup-v1','memo-import-map-v1')");
const docsBefore=(await tx.getAll("SELECT * FROM documents WHERE kind='memo'")).length;
await store.migrateLegacyBusiness(legacyMemo);
const mapping=JSON.parse((await tx.getOptional("SELECT value FROM local_meta WHERE id='memo-import-map-v1'")).value);
assert.notEqual(mapping.groups['old-memo-group'],'old-memo-group');assert.notEqual(mapping.documents['old-memo'],'old-memo');
assert.equal((await tx.getOptional("SELECT body FROM documents WHERE id='old-memo'")).body,'Original text');
assert.equal((await tx.getAll("SELECT * FROM documents WHERE kind='memo'")).length,docsBefore+2);
console.log('PASS drafts and failure snapshots round-trip; category/metadata ID collisions retain both originals');


// Same revision can occur when a rejected offline write meets a remote edit.
// The editor must compare its saved base content as well as the integer revision.
const databaseSource=readFileSync(new URL('../src/assistant/database.ts',import.meta.url),'utf8');
const databaseCode=ts.transpileModule(databaseSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/import[^;]+from ['"]\.\.\/storage\/database['"];?/, 'const database=globalThis.__businessTestDB;').replace(/export[^;]+from ['"]\.\.\/storage\/database['"];?/, '');
const documentModule=await import('data:text/javascript;base64,'+Buffer.from(databaseCode).toString('base64'));
const guarded={id:'guarded',title:'Old',body:'Original base',date:'2026-10-09'};
assert.equal(await documentModule.saveDocument(guarded,0),1);
const edited={...guarded,body:'Local change'};assert.equal(await documentModule.saveDocument(edited,1,guarded),2);
sql.prepare("UPDATE documents SET body='Remote different content' WHERE id='guarded'").run();
await assert.rejects(documentModule.saveDocument({...edited,body:'Would overwrite'},2,edited),/SOURCE_CHANGED/);
assert.equal((await tx.getOptional("SELECT body FROM documents WHERE id='guarded'")).body,'Remote different content');
console.log('PASS same revision with changed base content cannot silently overwrite a remote edit');
sql.close();delete globalThis.__businessTestDB;
