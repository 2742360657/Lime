import {useEffect,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {useQuery} from '@powersync/react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {database,saveDocument,type DocumentRow} from '../assistant/database';
import {useHabits} from '../state/HabitStore';

export function DiaryEditor({doc,onClose}:{doc:DocumentRow;onClose:()=>void}) {
 const {theme}=useHabits(),c=theme.colors;
 const [value,setValue]=useState({title:doc.title,body:doc.body,date:doc.date}),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const {data:stored}=useQuery<DocumentRow>('SELECT * FROM documents WHERE id=?',[doc.id]);
 const base=useRef(doc.base_content??{title:doc.title,body:doc.body,date:doc.date});
 const current=useRef(value),revision=useRef(doc.revision),timer=useRef<ReturnType<typeof setTimeout>|null>(null),queue=useRef<Promise<void>>(Promise.resolve()),mounted=useRef(true),sequence=useRef(0);
 useEffect(()=>()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);},[]);
 function enqueue(action:()=>Promise<void>){queue.current=queue.current.catch(()=>{}).then(action);return queue.current;}
 async function save(snapshot:typeof value){revision.current=await saveDocument({id:doc.id,...snapshot},revision.current,base.current);base.current=snapshot;await database.execute('UPDATE local_drafts SET base_revision=?,base_content=? WHERE id=?',[revision.current,JSON.stringify(base.current),doc.id]);}
 function changed(field:keyof typeof value,text:string) {
  const snapshot={...current.current,[field]:text},version=++sequence.current;current.current=snapshot;setValue(snapshot);setStatus('正在保存…');
  enqueue(async()=>{await database.execute('INSERT OR REPLACE INTO local_drafts(id,document_id,title,body,date,kind,base_revision,base_content) VALUES(?,?,?,?,?,?,?,?)',[doc.id,doc.id,snapshot.title,snapshot.body,snapshot.date,'diary',revision.current,JSON.stringify(base.current)]);}).catch(()=>{if(mounted.current)setStatus('草稿保存失败，请保留页面并重试');});
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{enqueue(async()=>{await save(snapshot);if(mounted.current&&version===sequence.current)setStatus('已保存到本机');}).catch(()=>{if(mounted.current)setStatus('未能保存，草稿仍保留在本机');});},800);
 }
 async function close() {
  if(busy)return;setBusy(true);if(timer.current)clearTimeout(timer.current);
  try {await enqueue(async()=>{if(revision.current>0||current.current.title.trim()||current.current.body.trim())await save(current.current);await database.execute('DELETE FROM local_drafts WHERE id=?',[doc.id]);});onClose();}
  catch {let persisted=false;try{const v=current.current;await database.execute('INSERT OR REPLACE INTO local_drafts(id,document_id,title,body,date,kind,base_revision,base_content) VALUES(?,?,?,?,?,?,?,?)',[doc.id,doc.id,v.title,v.body,v.date,'diary',revision.current,JSON.stringify(base.current)]);persisted=true;}catch{}
   setStatus(persisted?'保存未完成，草稿已保留':'草稿也未能保存，请保留页面');Alert.alert('暂时无法保存',persisted?'输入已保留为草稿。若其他地方已修改原文，可另存后比较。':'本机草稿保存失败，请保留页面并重试。',[{text:'继续编辑'},...(persisted?[{text:'保留草稿并返回',onPress:onClose}]:[])]);
  }
  finally {setBusy(false);}
 }
 function chooseDate() {
  const [year,month,day]=current.current.date.split('-').map(Number);
  DateTimePickerAndroid.open({value:new Date(year,month-1,day,12),mode:'date',onChange:(_event,date)=>{if(!date)return;changed('date',`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);}});
 }
 return <Modal visible animationType="slide" onRequestClose={()=>void close()}><SafeAreaView style={{flex:1,backgroundColor:c.surface}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:6,borderBottomWidth:1,borderColor:c.border}}>
   <Pressable accessibilityLabel="保存并返回" disabled={busy} onPress={()=>void close()} style={{paddingVertical:10,paddingRight:16}}><Text style={{fontSize:14,color:c.primary}}>{busy?'保存中…':'完成'}</Text></Pressable>
   <Text style={{flex:1,fontSize:16,color:c.textPrimary,textAlign:'center'}}>写日记</Text>
   <Pressable accessibilityLabel="选择日记日期" disabled={busy} onPress={chooseDate} style={{paddingVertical:10,paddingLeft:10}}><Text style={{fontSize:12,color:c.textSecondary}}>{value.date}</Text></Pressable>
  </View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,flexGrow:1}}>
   <TextInput accessibilityLabel="日记标题" editable={!busy} value={value.title} onChangeText={v=>changed('title',v)} maxLength={300} placeholder="标题（可选）" placeholderTextColor={c.textMuted} style={{fontSize:18,lineHeight:26,color:c.textPrimary,paddingVertical:8}}/>
   <TextInput accessibilityLabel="日记正文" editable={!busy} value={value.body} onChangeText={v=>changed('body',v)} multiline maxLength={100000} placeholder="记下今天…" placeholderTextColor={c.textMuted} style={{flex:1,minHeight:280,fontSize:15,lineHeight:25,textAlignVertical:'top',paddingVertical:12,color:c.textPrimary}}/>
  </ScrollView>
  <Text accessibilityLiveRegion="polite" style={{fontSize:11,color:c.textMuted,paddingHorizontal:20,paddingVertical:8}}>{stored[0]&&(stored[0].revision!==revision.current||stored[0].title!==base.current.title||stored[0].body!==base.current.body||stored[0].date!==base.current.date)?'原文已更新，保存前需要处理版本变化':status||'输入后自动保存'}</Text>
 </KeyboardAvoidingView></SafeAreaView></Modal>;
}
