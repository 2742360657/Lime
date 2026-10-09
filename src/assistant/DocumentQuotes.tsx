import {useState} from 'react';
import {FlatList,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@powersync/react-native';
import {useHabits} from '../state/HabitStore';
import {database,type DocumentRow} from './database';
import type {ChatDocument} from './chatTypes';
export const documentQuote=(d:DocumentRow):ChatDocument=>({id:d.id,kind:d.kind,title:d.title,date:d.date,revision:d.revision});
export function DocumentPicker({onSelect,onClose}:{onSelect:(d:ChatDocument)=>void;onClose:()=>void}) {
 const {theme}=useHabits(),c=theme.colors,[query,setQuery]=useState('');
 const {data}=useQuery<DocumentRow>('SELECT * FROM documents WHERE deleted=0 ORDER BY date DESC,updated_at DESC');
 return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:c.surface}}>
  <View style={{padding:16,flexDirection:'row',alignItems:'center',gap:12}}><Pressable onPress={onClose} accessibilityLabel="取消引用"><Text style={{fontSize:14,color:c.primary}}>取消</Text></Pressable><Text style={{fontSize:16,color:c.textPrimary}}>引用日记或备忘录</Text></View>
  <TextInput accessibilityLabel="搜索引用记录" placeholder="搜索记录" value={query} onChangeText={setQuery} style={{fontSize:14,color:c.textPrimary,marginHorizontal:16,padding:10,backgroundColor:c.background,borderRadius:8}}/>
  <FlatList data={data.filter(d=>`${d.title}\n${d.body}\n${d.date}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))} keyExtractor={d=>d.id} contentContainerStyle={{padding:16}} ListEmptyComponent={<Text style={{fontSize:13,color:c.textMuted}}>没有可引用的记录</Text>} renderItem={({item})=><Pressable accessibilityLabel={'引用记录：'+(item.title||item.date)} onPress={()=>onSelect(documentQuote(item))} style={{paddingVertical:14,borderBottomWidth:0.5,borderColor:c.border,gap:5}}><Text style={{fontSize:12,color:c.textMuted}}>{item.kind==='diary'?'日记':'备忘录'} · {item.date}</Text><Text numberOfLines={2} style={{fontSize:14,lineHeight:21,color:c.textPrimary}}>{item.title||item.body||'空白记录'}</Text></Pressable>}/>
 </SafeAreaView></Modal>;
}
// Reading a reference is a user action, not an agent call. Match the pinned
// revision, so an edited local diary never masquerades as old quoted evidence.
export function DocumentQuote({doc,conversation}:{doc:ChatDocument;conversation:string}) {
 const {theme}=useHabits(),c=theme.colors;
 const [visible,setVisible]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
 async function open(){setVisible(true);setText('');setError('');
  try {const current=await database.getOptional<DocumentRow & {owner_id:string|null}>('SELECT * FROM documents WHERE id=?',[doc.id]);
   const key=`doc-source-${current?.owner_id??'undefined'}-${conversation}-${doc.id}-${doc.revision}`;
   const cached=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',[key]);if(cached){setText(cached.value);return;}
   if(current?.revision===doc.revision)setText(current.body);else setError('本机没有保存这个版本的原文，当前记录可能已修改。');
  }catch{setError('暂时无法读取本机原文，原有记录仍保留。');}
 }
 return <><Pressable accessibilityLabel={'查看引用：'+(doc.title||doc.date)} onPress={()=>void open()}><Text style={{fontSize:12,color:c.primary,marginTop:5}}>▤ {doc.title||doc.date} · 版本 {doc.revision}</Text></Pressable>{visible?<Modal visible animationType="slide" onRequestClose={()=>setVisible(false)}><SafeAreaView style={{flex:1,backgroundColor:c.surface}}><Pressable onPress={()=>setVisible(false)} accessibilityLabel="返回聊天" style={{padding:18}}><Text style={{fontSize:14,color:c.primary}}>返回聊天</Text></Pressable><ScrollView contentContainerStyle={{padding:20,gap:15}}><Text style={{fontSize:12,color:c.textMuted}}>{doc.date} · 引用版本 {doc.revision}</Text>{doc.title?<Text style={{fontSize:19,color:c.textPrimary}}>{doc.title}</Text>:null}<Text selectable style={{fontSize:15,lineHeight:27,color:c.textPrimary}}>{text}</Text>{error?<Text style={{fontSize:12,color:c.textMuted}}>{error}</Text>:null}</ScrollView></SafeAreaView></Modal>:null}</>;
}
