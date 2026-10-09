import {Alert,Pressable,Text,View} from 'react-native';
import {useQuery} from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import {database} from './database';
import {emptyRows,mergeRecords,portableRow,recordFields,type RecordTable,type Snapshot,type PortableDraft} from './recordBackup';
import {useHabits} from '../state/HabitStore';

export function RecordRecovery() {
 const {theme}=useHabits(),c=theme.colors;
 const {data:conflicts}=useQuery<{id:string;snapshots:string}>('SELECT id,snapshots FROM local_conflicts ORDER BY created_at DESC');
 const {data:drafts}=useQuery<PortableDraft>('SELECT * FROM local_drafts');
 async function restoreConflict(id:string) {
  try {await database.writeTransaction(async tx=>{
   const current=await tx.getOptional<{snapshots:string}>('SELECT snapshots FROM local_conflicts WHERE id=?',[id]);if(!current)return;
   const snapshots=JSON.parse(current.snapshots) as Snapshot[],rows=emptyRows(),handled:Snapshot[]=[];
   for(const snapshot of snapshots)if(snapshot.row&&Object.hasOwn(recordFields,snapshot.table)){rows[snapshot.table as RecordTable].push(portableRow(snapshot.table as RecordTable,snapshot.row));handled.push(snapshot);}
   if(!handled.length)throw new Error('这份副本没有可恢复的完整记录，请保留它并导出备份。');
   // Repeated operations can snapshot the same row more than once.
   for(const table of Object.keys(rows) as RecordTable[])rows[table]=[...new Map(rows[table].map(r=>[r.id,r])).values()];
   await mergeRecords(tx,{format:'angelime-records',version:1,exported_at:'',rows,drafts:[],recovery:[]},Crypto.randomUUID,true);
   const remaining=snapshots.filter(s=>!handled.includes(s));
   if(remaining.length)await tx.execute('UPDATE local_conflicts SET snapshots=? WHERE id=?',[JSON.stringify(remaining),id]);else await tx.execute('DELETE FROM local_conflicts WHERE id=?',[id]);
  });Alert.alert('已保存恢复副本','已作为新记录保存在本机；联网后同步。原记录未覆盖。');}
  catch(e){Alert.alert('恢复未完成',e instanceof Error?e.message:'原文仍保留，请重试。');}
 }
 async function restoreDraft(id:string) {
  try {await database.writeTransaction(async tx=>{
   const d=await tx.getOptional<PortableDraft>('SELECT * FROM local_drafts WHERE id=?',[id]);if(!d)return;
   const now=Date.now(),rows=emptyRows();rows.documents=[portableRow('documents',{id:d.document_id,kind:d.kind??'diary',title:d.title,body:d.body,date:d.date,group_id:d.group_id??null,sort_order:0,created_at:now,edited_at:now,deleted_at:null,deleted:0})];
   await mergeRecords(tx,{format:'angelime-records',version:1,exported_at:'',rows,drafts:[],recovery:[]},Crypto.randomUUID,true);
   await tx.execute('DELETE FROM local_drafts WHERE id=?',[id]);
  });Alert.alert('草稿已保存为新记录','原有记录未覆盖，联网后同步。');}
  catch(e){Alert.alert('恢复未完成',e instanceof Error?e.message:'草稿仍保留。');}
 }
 const button=(text:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={text} onPress={onPress} style={{paddingVertical:9}}><Text style={{fontSize:13,color:c.primary}}>{text}</Text></Pressable>;
 return <View style={{gap:10}}>
  <Text style={{fontSize:12,lineHeight:20,color:c.textSecondary}}>同步失败或版本变化时，原文留在这里。恢复会新建记录，保留原记录。</Text>
  {drafts.map(d=><View key={d.id} style={{borderBottomWidth:0.5,borderColor:c.border,paddingVertical:8}}><Text numberOfLines={2} style={{fontSize:14,lineHeight:21,color:c.textPrimary}}>草稿 · {d.title||d.body.slice(0,60)||d.date}</Text>{button('草稿另存为新记录',()=>Alert.alert('另存草稿','草稿原文将成为一篇独立记录，不覆盖已有版本。',[{text:'取消'},{text:'另存',onPress:()=>void restoreDraft(d.id)}]))}</View>)}
  {conflicts.map(conflict=>{let description='同步恢复副本';try {const docs=(JSON.parse(conflict.snapshots) as Snapshot[]).filter(s=>s.table==='documents'&&s.row);description=docs.map(s=>String(s.row!.title||s.row!.body||s.row!.date).slice(0,60)).join(' · ')||description;}catch{}return <View key={conflict.id} style={{borderBottomWidth:0.5,borderColor:c.border,paddingVertical:8}}><Text numberOfLines={2} style={{fontSize:14,lineHeight:21,color:c.textPrimary}}>{description}</Text>{button('恢复副本为新记录',()=>Alert.alert('恢复为新记录','副本中的记录将另存，保留现有内容。缺失分类会恢复为未分类。',[{text:'取消'},{text:'恢复',onPress:()=>void restoreConflict(conflict.id)}]))}</View>;})}
  {!drafts.length&&!conflicts.length?<Text style={{fontSize:13,color:c.textMuted}}>没有需要恢复的记录。</Text>:null}
 </View>;
}
