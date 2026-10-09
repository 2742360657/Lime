import {useState} from 'react';
import {Alert,FlatList,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useQuery} from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useBackHandler} from '../navigation/back';
import {database,localDate,type DocumentRow} from '../assistant/database';
import {RecordSyncStatus} from '../assistant/RecordSyncStatus';
import {RecordRecovery} from '../assistant/RecordRecovery';
import {ConnectionCard} from '../assistant/ConnectionCard';
import {useHabits} from '../state/HabitStore';
import {DiaryEditor} from '../diary/DiaryEditor';
type Draft={base_content:string|null;base_revision:number|null;id:string;document_id:string;title:string;body:string;date:string};
type Conflict={id:string;error:string;snapshots:string};
const failed=()=>Alert.alert('操作未完成','内容仍保留，请稍后重试。');

export function DiaryScreen() {
 const {theme}=useHabits(),c=theme.colors,navigation=useNavigation<any>(),focused=useIsFocused();
 const {data:docs}=useQuery<DocumentRow>("SELECT * FROM documents WHERE kind='diary' ORDER BY date DESC,updated_at DESC");
 const {data:drafts}=useQuery<Draft>("SELECT * FROM local_drafts WHERE coalesce(kind,'diary')='diary'");
 const {data:conflicts}=useQuery<Conflict>('SELECT * FROM local_conflicts ORDER BY created_at DESC');
 const [query,setQuery]=useState(''),[mode,setMode]=useState<'stream'|'connection'|'recovery'|'trash'>('stream'),[editing,setEditing]=useState<DocumentRow|null>(null),[reading,setReading]=useState<string|null>(null);
 useBackHandler(()=>{if(editing||reading)return false;if(mode!=='stream'){setMode('stream');return true;}return false;},focused);
 const doc=docs.find(d=>d.id===reading&&!d.deleted);
 function edit(row:DocumentRow){const draft=drafts.find(d=>d.document_id===row.id);setEditing(draft?{...row,title:draft.title,body:draft.body,date:draft.date,revision:draft.base_revision??row.revision,base_content:draft.base_content?JSON.parse(draft.base_content):{title:row.title,body:row.body,date:row.date}}:row);}
 async function setDeleted(row:DocumentRow,deleted:number){try{await database.execute('UPDATE documents SET deleted=?,revision=revision+1,updated_at=? WHERE id=?',[deleted,new Date().toISOString(),row.id]);setReading(null);}catch{failed();}}
 function quote(row:DocumentRow){setReading(null);navigation.navigate('assistant',{documentId:row.id,documentRevision:row.revision,quoteNonce:Crypto.randomUUID()});}
 function more(row:DocumentRow){Alert.alert('日记操作','',[{text:'引用到聊天',onPress:()=>quote(row)},{text:'移入回收站',onPress:()=>remove(row)},{text:'取消'}]);}
 function remove(row:DocumentRow){Alert.alert('移入回收站','可以在日记菜单中恢复。',[{text:'取消'},{text:'移入',onPress:()=>void setDeleted(row,1)}]);}
 const filtered=docs.filter(d=>d.deleted===(mode==='trash'?1:0)&&`${d.title}\n${d.body}\n${d.date}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const link=(label:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{paddingVertical:10}}><Text style={{fontSize:13,color:c.primary}}>{label}</Text></Pressable>;
 return <ScreenScaffold panelTitle="日记" panelItems={[
  {id:'stream',label:'日记流',selected:mode==='stream',onPress:()=>{setMode('stream');setQuery('');}},
  {id:'connection',label:'连接自己的服务器',onPress:()=>setMode('connection')},
  {id:'recovery',label:`恢复副本 · ${conflicts.length}`,onPress:()=>setMode('recovery')},
  {id:'trash',label:'已删除日记',onPress:()=>{setMode('trash');setQuery('');}},
  {id:'memos',label:'备忘录',onPress:()=>navigation.navigate('memos')}
 ]} fab={mode==='stream'?{label:'写日记',onPress:()=>setEditing({id:Crypto.randomUUID(),kind:'diary',title:'',body:'',date:localDate(),revision:0,deleted:0,updated_at:''})}:null}>
  {mode==='stream'||mode==='trash'?<FlatList data={filtered} keyExtractor={d=>d.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:18,paddingBottom:90}}
   ListHeaderComponent={<View style={{paddingTop:12,paddingBottom:8,gap:10}}>
    <Text style={{fontSize:19,fontWeight:'600',color:c.textPrimary}}>{mode==='trash'?'已删除日记':'我的日记'}</Text>
    <RecordSyncStatus/>
    <TextInput accessibilityLabel="搜索日记" value={query} onChangeText={setQuery} placeholder="搜索日记" placeholderTextColor={c.textMuted} style={{fontSize:13,paddingHorizontal:12,paddingVertical:7,borderRadius:8,backgroundColor:c.surface,color:c.textPrimary}}/>
    {mode==='stream'?drafts.filter(d=>!docs.some(row=>row.id===d.document_id)).map(d=><Pressable key={d.id} accessibilityLabel="继续草稿" onPress={()=>edit({...d,base_content:undefined,id:d.document_id,kind:'diary',revision:0,deleted:0,updated_at:''})} style={{paddingVertical:8}}><Text style={{fontSize:13,color:c.primary}}>草稿 · {d.title||d.body.slice(0,40)||d.date}</Text></Pressable>):null}
   </View>}
   ListEmptyComponent={<Text style={{fontSize:14,color:c.textMuted,paddingVertical:35}}>{query?'没有找到这篇日记':mode==='trash'?'回收站是空的':'从今天的一件小事开始。'}</Text>}
   renderItem={({item,index})=><View>
    {index===0||filtered[index-1].date.slice(0,7)!==item.date.slice(0,7)?<Text style={{fontSize:12,color:c.textMuted,paddingTop:14,paddingBottom:4}}>{item.date.slice(0,7).replace('-',' 年 ')} 月</Text>:null}
    <Pressable accessibilityRole="button" accessibilityLabel={`阅读日记：${item.title||item.date}`} onPress={()=>mode==='trash'?Alert.alert('恢复日记',item.title||item.date,[{text:'取消'},{text:'恢复',onPress:()=>void setDeleted(item,0)}]):setReading(item.id)} style={{flexDirection:'row',paddingVertical:16,borderBottomWidth:0.5,borderColor:c.border,gap:16}}>
     <View style={{width:34,alignItems:'center'}}><Text style={{fontSize:23,color:c.textSecondary}}>{item.date.slice(8)}</Text><Text style={{fontSize:11,color:c.textMuted,marginTop:2}}>{new Intl.DateTimeFormat('zh-CN',{weekday:'short'}).format(new Date(item.date+'T12:00:00'))}</Text></View>
     <View style={{flex:1,gap:5}}>{item.title?<Text numberOfLines={1} style={{fontSize:15,fontWeight:'500',color:c.textPrimary}}>{item.title}</Text>:null}<Text numberOfLines={2} style={{fontSize:14,lineHeight:22,color:item.title?c.textSecondary:c.textPrimary}}>{item.body||'还没有正文'}</Text>{drafts.some(d=>d.document_id===item.id)?<Text style={{fontSize:11,color:c.primary}}>有未完成草稿</Text>:null}</View>
    </Pressable>
   </View>}/>:<ScrollView contentContainerStyle={{padding:18,gap:12}}><Text style={{fontSize:19,color:c.textPrimary}}>{mode==='connection'?'服务器连接':'恢复副本'}</Text>{mode==='connection'?<ConnectionCard/>:<RecordRecovery/>}</ScrollView>}
  {reading?<Modal visible animationType="slide" onRequestClose={()=>setReading(null)}><SafeAreaView style={{flex:1,backgroundColor:c.surface}}>
   <View style={{paddingHorizontal:20,paddingVertical:4,flexDirection:'row',justifyContent:'space-between',borderBottomWidth:0.5,borderColor:c.border}}>{link('返回',()=>setReading(null))}{doc?<View style={{flexDirection:'row',gap:20}}>{link('编辑日记',()=>edit(doc))}{link('日记操作',()=>more(doc))}</View>:null}</View>
   {doc?<ScrollView contentContainerStyle={{padding:22,paddingBottom:40,gap:18}}><Text style={{fontSize:12,color:c.textMuted}}>{doc.date}</Text>{doc.title?<Text selectable style={{fontSize:20,lineHeight:29,color:c.textPrimary}}>{doc.title}</Text>:null}<Text selectable style={{fontSize:15,lineHeight:27,color:c.textPrimary}}>{doc.body}</Text></ScrollView>:<Text style={{padding:20,fontSize:14,color:c.textMuted}}>原文已移入回收站。</Text>}
  </SafeAreaView></Modal>:null}
  {editing?<DiaryEditor key={editing.id} doc={editing} onClose={()=>setEditing(null)}/>:null}
 </ScreenScaffold>;
}
