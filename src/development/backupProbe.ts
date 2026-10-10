import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { NativeModules } from 'react-native';
import { createDatabaseSchema } from '../storage/databaseSchema';
import { createMaterialStore } from '../materials/store';
import { materialNative } from '../materials/native';
import { createAgentStore } from '../agent/store';
import { createDomain } from '../domain/service';
import { backupNative } from '../backup/native';
import { portableSnapshot } from '../backup/portable';
import { captureBackup, restoreBackup } from '../backup/store';
import { validateManifest } from '../backup/model';
import type { DomainDatabase, DomainTransaction } from '../domain/types';

export async function runBackupProbe() {
  if (!__DEV__) throw new Error('Development only');
  const nonce=Crypto.randomUUID(),names=[`lime-dev-backup-source-${nonce}.sqlite`,`lime-dev-backup-target-${nonce}.sqlite`];
  let source=new PowerSyncDatabase({schema:createDatabaseSchema(),database:{dbFilename:names[0]}}),target=new PowerSyncDatabase({schema:createDatabaseSchema(),database:{dbFilename:names[1]}});
  const stages: string[]=[],owned: File[]=[];
  const roots=[new Directory(Paths.document,'lime-materials'),new Directory(Paths.document,'lime-backups')];
  const existing=new Set(roots.flatMap(dir=>dir.exists?dir.list().map(file=>file.uri):[]));
  const deps={id:Crypto.randomUUID,now:Date.now,digest:(text:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text)};
  const track=(uri:string)=>{if(!existing.has(uri)&&!owned.some(file=>file.uri===uri))owned.push(new File(uri));};
  const ensure=(v:unknown)=>{if(!v)throw new Error('Synthetic backup check failed');};let phase='source';
  try {
    await source.init();await target.init();
    const store=createMaterialStore(source,deps),agent=createAgentStore(source,deps),domain=createDomain(source,deps);
    const diary=deps.id(),habit=deps.id(),now=Date.now(),stamp=new Date(now).toISOString();
    await source.execute('INSERT INTO documents(id,kind,title,body,date,group_id,sort_order,created_at,edited_at,deleted_at,revision,deleted,updated_at) VALUES(?,?,?,?,?,NULL,0,?,?,NULL,1,0,?)',[diary,'diary','合成日记','合成日记原文','2026-10-10',now,now,stamp]);
    await source.execute('INSERT INTO local_drafts(id,kind,title,body,date,group_id,document_id,base_revision,base_content) VALUES(?,?,?,?,?,NULL,?,1,?)',[deps.id(),'diary','合成草稿','尚未保存的草稿','2026-10-10',diary,JSON.stringify({title:'合成日记',body:'合成日记原文',date:'2026-10-10',group_id:null})]);
    await source.execute('INSERT INTO habits(id,name,group_id,cadence,target_count,sort_order,created_at,archived_at,revision,deleted,updated_at) VALUES(?,?,NULL,?,1,0,?,NULL,1,0,?)',[habit,'合成习惯','daily',now,stamp]);
    const activity=await domain.execute({type:'activity.start',kind:'training',title:'合成训练',habitId:habit},{actor:'ui',operationId:deps.id()});
    await domain.execute({type:'activity.complete',id:activity.entity.id,expectedRevision:1,note:'合成训练已结束'},{actor:'ui',operationId:deps.id()});
    const materials=[];
    for(const filename of ['synthetic-text.txt','synthetic-image.png','synthetic-scan.pdf']) {
      const copy=await materialNative.copy(`content://app.lime.personalassistant.dev.fixtures/${filename}`,filename);
      track(copy.uri);
      const analysis=await materialNative.parse(copy.uri,copy.name);for(const image of analysis.images)track(image.uri);ensure(analysis.status==='ready');
      materials.push(await store.save(copy,analysis));
    }
    const refs=materials.map(m=>({id:m.id,revision:m.revision,kind:'attachment' as const}));
    const session=await agent.newSession(),request=await agent.begin(session,'合成备份资料',refs,[]);
    const command={type:'task.create' as const,title:'合成恢复待办',note:'',dueDateKey:null,dueTime:null};
    const proposal=await domain.propose(command,{proposalId:deps.id(),requestId:request.id,documentRefs:refs});
    const receipt=await domain.acceptProposal(proposal.id,1,{actor:'ui',operationId:deps.id()});
    const pending=await domain.propose({type:'task.create',title:'不应自动执行'},{proposalId:deps.id(),requestId:request.id,documentRefs:refs});
    await agent.putResult(deps.id(),request.id,{command,status:'saved',receipt,proposalId:proposal.id});
    await agent.finish(request.id,'合成聊天历史','complete',null);
    await agent.saveSettings('deepseek-flash',{filename:'synthetic.md',body:'合成人格，不含私人设定。',enabled:1});
    await domain.execute({type:'memory.remember',kind:'preference',key:'合成偏好',content:'合成内容'},{actor:'ui',operationId:deps.id()});
    phase='reminder-fixture';
    const reminder=await domain.execute({type:'reminder.create',title:'合成公历提醒',mode:'annual',monthDay:'11-03',time:'09:00',advanceDays:7},{actor:'ui',operationId:deps.id()});
    await source.execute('INSERT INTO local_meta(id,value) VALUES(?,?)',['synthetic-private-setting','SYNTHETIC_PRIVATE_MARKER']);
    await source.execute('INSERT INTO local_agent_grants(id,request_id,command_type) VALUES(?,?,?)',[deps.id(),request.id,'task.create']);
    phase='snapshot';
    const portable=await portableSnapshot(await captureBackup(source),backupNative.inspect);
    ensure(!portable.text.includes('SYNTHETIC_PRIVATE_MARKER')&&!portable.text.includes('local_agent_grants')&&!portable.text.includes('file://'));
    const packed=await backupNative.pack(portable.text,portable.files);stages.push(packed.id);
    const input=await backupNative.unpack(packed.uri);stages.push(input.id);
    const manifest=validateManifest(JSON.parse(input.manifest));
    ensure(input.blobs.length===manifest.blobs.length&&input.blobs.every(b=>manifest.blobs.some(m=>m.hash===b.hash&&m.size===b.size)));
    phase='restore';
    const installed=await backupNative.install(input.id);track(installed.archiveUri);Object.values(installed.paths).forEach(track);
    const options={digest:input.digest,archiveUri:installed.archiveUri,archiveSize:input.size,now:Date.now(),fileUri:(hash:string)=>installed.paths[hash]};
    const restored=await restoreBackup(target,manifest,options);ensure(restored.added>0&&restored.conflicts===0);
    let targetAgent=createAgentStore(target,deps),targetDomain=createDomain(target,deps);
    ensure((await targetAgent.settings()).persona?.enabled===0);
    ensure((await target.getOptional<{body:string}>('SELECT body FROM documents WHERE id=?',[diary]))?.body==='合成日记原文'&&(await target.getAll('SELECT id FROM local_drafts')).length===1);
    ensure((await targetDomain.listActivities({status:'completed'})).length===1&&(await target.getAll('SELECT id FROM checkins')).length===1);
    ensure((await targetDomain.listReminders()).find(r=>r.id===reminder.entity.id)?.enabled===0);
    ensure((await targetAgent.requests(session))[0].status==='restored'&&(await targetAgent.grants(request.id)).length===0);
    let denied=false;try { await targetAgent.restart(request.id); } catch { denied=true; }ensure(denied);
    denied=false;try { await targetDomain.acceptProposal(pending.id,1,{actor:'ui',operationId:deps.id()}); } catch { denied=true; }ensure(denied);
    ensure((await restoreBackup(target,manifest,options)).repeated);
    const targetStore=createMaterialStore(target,deps);
    for(const m of materials) {
      const imported=await targetStore.get(m.id);ensure(imported&&imported.uri!==m.uri&&imported.body===m.body);
      const original=await backupNative.inspect(imported!.uri,'material');ensure(original.hash===m.hash);
      for(const image of JSON.parse(imported!.images))ensure(new File(image.uri).exists);
    }
    phase='conflict-rollback';
    await target.execute('UPDATE tasks SET title=?,revision=revision+1 WHERE id=?',['现有修改保留',receipt.entity.id]);
    const independent=await domain.execute({type:'task.create',title:'独立合成待办'},{actor:'ui',operationId:deps.id()});
    const next=await portableSnapshot(await captureBackup(source),backupNative.inspect);
    const nextPack=await backupNative.pack(next.text,next.files);stages.push(nextPack.id);
    const nextInput=await backupNative.unpack(nextPack.uri);stages.push(nextInput.id);
    const nextManifest=validateManifest(JSON.parse(nextInput.manifest)),nextInstalled=await backupNative.install(nextInput.id);track(nextInstalled.archiveUri);Object.values(nextInstalled.paths).forEach(track);
    const nextOptions={digest:nextInput.digest,archiveUri:nextInstalled.archiveUri,archiveSize:nextInput.size,now:Date.now(),fileUri:(hash:string)=>nextInstalled.paths[hash]};
    const failed:DomainDatabase={readTransaction:fn=>target.readTransaction(fn),writeTransaction:fn=>target.writeTransaction(tx=>{
      const wrapper:DomainTransaction={getAll:(sql,p)=>tx.getAll(sql,p),getOptional:(sql,p)=>tx.getOptional(sql,p),execute:(sql,p)=>{if(sql.includes('INSERT INTO local_backup_imports'))throw new Error('Synthetic late failure');return tx.execute(sql,p);}};
      return fn(wrapper);
    })};
    denied=false;try {await restoreBackup(failed,nextManifest,nextOptions);}catch {denied=true;}ensure(denied);
    ensure(!await target.getOptional('SELECT id FROM tasks WHERE id=?',[independent.entity.id])&&!await target.getOptional('SELECT id FROM local_backup_archives'));
    const merged=await restoreBackup(target,nextManifest,nextOptions);ensure(merged.conflicts>0&&merged.added>0);
    ensure((await target.getOptional<{title:string}>('SELECT title FROM tasks WHERE id=?',[receipt.entity.id]))?.title==='现有修改保留');
    phase='archive-roundtrip';
    const archived=await portableSnapshot(await captureBackup(target),backupNative.inspect);ensure(archived.manifest.blobs.some(b=>b.role==='archive'));
    const archivePack=await backupNative.pack(archived.text,archived.files);stages.push(archivePack.id);
    const archiveInput=await backupNative.unpack(archivePack.uri);stages.push(archiveInput.id);ensure(validateManifest(JSON.parse(archiveInput.manifest)).rows.local_backup_archives.length===1);
    phase='zip-boundaries';
    for(const kind of ['traversal','unknown','badHash','large']) {
      const fixture=JSON.parse(await NativeModules.LimeBackup.fixture(kind));stages.push(fixture.id);
      denied=false;try {const accepted=await backupNative.unpack(fixture.uri);stages.push(accepted.id);}catch {denied=true;}ensure(denied);
    }
    phase='reopen';await target.close();target=new PowerSyncDatabase({schema:createDatabaseSchema(),database:{dbFilename:names[1]}});await target.init();
    ensure((await target.getAll('SELECT id FROM tasks')).length===2&&(await target.getAll('SELECT id FROM local_backup_archives')).length===1);
    ensure((await target.getUploadQueueStats()).count===0);
    new File(Paths.document,'lime-p5-backup-probe.json').write(JSON.stringify({status:'passed',syntheticOnly:true,fullObjects:true,zipRoundtrip:true,relocatedFiles:true,integrity:true,repeated:true,conflictPreserved:true,lateRollback:true,archiveRoundtrip:true,zipBoundaries:true,inertHistory:true,reopen:true,localQueue:0,modelCalls:0}));
  } catch {new File(Paths.document,'lime-p5-backup-probe.json').write(JSON.stringify({status:'failed',phase,syntheticOnly:true,modelCalls:0}));throw new Error('Synthetic backup probe failed');}
  finally {
    try {await source.close();}catch{}try {await target.close();}catch{}
    for(const id of stages)await backupNative.discard(id);
    for(const file of owned)if(file.exists)file.delete();
    for(const name of names)for(const suffix of ['','-wal','-shm'])try {const file=new File(`file://${ANDROID_DATABASE_PATH}/${name}${suffix}`);if(file.exists)file.delete();}catch{}
  }
}
