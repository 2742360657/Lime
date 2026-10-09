import {useNavigation,useRoute,useIsFocused} from '@react-navigation/native';
import {DocumentPicker,DocumentQuote,documentQuote} from '../assistant/DocumentQuotes';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useAssistant,ApiError} from '../assistant/AssistantProvider';
import {database,type DocumentRow} from '../assistant/database';
import {useHabits} from '../state/HabitStore';

import {ProposalCard} from '../assistant/ProposalCard';
import {NotificationInbox} from '../assistant/NotificationInbox';
import {chooseChatFiles,uploadChatFile,savePendingFiles,releasePendingCopies} from '../assistant/chatAttachments';
import type {ChatMessage as Message,PendingFile,ChatDocument} from '../assistant/chatTypes';
export function ChatScreen() {
 const route=useRoute<any>(),navigation=useNavigation<any>(),focused=useIsFocused();
 const {request,connection}=useAssistant(),{theme}=useHabits();
 const [session,setSession]=useState(''),[messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [name,setName]=useState('助手'),[conversations,setConversations]=useState<{id:string;title:string}[]>([]);
 const [files,setFiles]=useState<PendingFile[]>([]);
 const [documents,setDocuments]=useState<ChatDocument[]>([]),[picker,setPicker]=useState(false);
 const [inboxVisible,setInboxVisible]=useState(false);
 useEffect(()=>{let active=true;setFiles([]);if(session)database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-files-'+session]).then(c=>{if(active&&c)setFiles(JSON.parse(c.value));});return()=>{active=false;};},[session]);
 async function storeDocuments(next:ChatDocument[]){await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-documents-'+session,JSON.stringify(next)]);setDocuments(next);}
 useEffect(()=>{let active=true;setDocuments([]);if(session)database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-documents-'+session]).then(row=>{if(active&&row)setDocuments(JSON.parse(row.value));});return()=>{active=false;};},[session]);
 useEffect(()=>{if(!focused||!session||!route.params?.documentId||busy)return;let active=true;
  (async()=>{const doc=await database.getOptional<DocumentRow>('SELECT * FROM documents WHERE id=? AND deleted=0',[route.params.documentId]);if(!doc||!active)return;
   const row=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-documents-'+session]);const existing:ChatDocument[]=row?JSON.parse(row.value):[];
   if(existing.length>=6&&!existing.some(d=>d.id===doc.id)){setError('一次最多引用六条记录，请先移除一条。');navigation.setParams({documentId:undefined,quoteNonce:undefined});return;}
   await storeDocuments([...existing.filter(d=>d.id!==doc.id),documentQuote(doc)]);navigation.setParams({documentId:undefined,quoteNonce:undefined});
  })().catch(()=>setError('暂时无法引用，请重试。'));return()=>{active=false;};
 },[focused,session,route.params?.quoteNonce,busy]);
 const scroll=useRef<ScrollView>(null);
 async function refresh(id=session) {
  if(!id)return;
  const result=await request<{messages:Message[]}>(`/v1/chat/conversations/${id}`);
  setMessages(result.messages);
  await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-cache-'+id,JSON.stringify(result.messages)]);
 }
 useEffect(()=>{let mounted=true;(async()=>{
  const cached=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-active']);
  const profileCache=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-profile-name']);
  if(profileCache&&mounted)setName(profileCache.value);
  if(cached&&mounted){setSession(cached.value);const history=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-cache-'+cached.value]);if(history)setMessages(JSON.parse(history.value));}
  if(!connection)return;
  const [profile,result]=await Promise.all([request<{name:string}>('/v1/chat/profile'),request<{conversations:{id:string;title:string}[]}>('/v1/chat/conversations')]);
  if(mounted){setName(profile.name);setConversations(result.conversations);}
  await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-profile-name',profile.name]);
  const id=result.conversations.find(c=>c.id===cached?.value)?.id||result.conversations[0]?.id||(await request<{id:string}>('/v1/chat/conversations',{})).id;
  if(!mounted)return;
  setSession(id);await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-active',id]);await refresh(id);
 })().catch(()=>{if(mounted)setError('暂时无法连接，已有对话仍保存在本机。');});return()=>{mounted=false;};},[connection]);
 async function openConversation(id?:string) {
  if(busy||!connection)return;
  setBusy(true);setError('');
  try {
   const selected=id||(await request<{id:string}>('/v1/chat/conversations',{})).id;
   const history=await request<{messages:Message[]}>(`/v1/chat/conversations/${selected}`);
   await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-active',selected]);
   await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-cache-'+selected,JSON.stringify(history.messages)]);
   setSession(selected);setMessages(history.messages);setInput('');
   setConversations((await request<{conversations:{id:string;title:string}[]}>('/v1/chat/conversations')).conversations);
  }catch{setError('暂时无法打开对话，请稍后重试。');}finally{setBusy(false);}
 }
 async function chooseFiles() {
  if(busy||!session)return;setBusy(true);setError('');
  try {const next=[...files,...await chooseChatFiles(6-files.length)];await savePendingFiles(session,next);setFiles(next);}
  catch(e){setError(e instanceof Error?e.message:'暂时无法选择附件。');}finally{setBusy(false);}
 }
 async function removeFile(id:string) {
  if(busy)return;const next=files.filter(f=>f.local_id!==id);await savePendingFiles(session,next);releasePendingCopies(files.filter(f=>f.local_id===id));setFiles(next);
 }
 async function send() {
  if(busy||(!input.trim()&&!files.length&&!documents.length)||!session||!connection)return;
  setBusy(true);setError('');
  let stage:'upload'|'chat'='upload';
  const message=input.trim()||(documents.length?'请阅读我引用的记录，和我聊聊；如有需要做的事项，请给出可编辑建议。':'请查看这些附件，提取和我相关的信息；需要做的事项请给出可编辑建议。');
  try {
   let readyFiles=[...files];
   for(let i=0;i<readyFiles.length;i++)if(!readyFiles[i].uploaded){readyFiles[i]={...readyFiles[i],uploaded:await uploadChatFile(connection,readyFiles[i])};await savePendingFiles(session,readyFiles);setFiles([...readyFiles]);}
   stage='chat';
   const references=documents.map(d=>({id:d.id,revision:d.revision}));
   const attachments=readyFiles.map(f=>f.uploaded!.id);
   const pending=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',['chat-pending-'+session]);
   const old=pending?JSON.parse(pending.value):null;
   const body=old?.message===message&&JSON.stringify(old.attachments||[])===JSON.stringify(attachments)&&JSON.stringify(old.documents||[])===JSON.stringify(references)?old:{message,attachments,documents:references,request_id:Crypto.randomUUID()};
   await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-pending-'+session,JSON.stringify(body)]);
   const result=await request<{status:string;text:string}>(`/v1/chat/conversations/${session}/messages`,body);
   if(result.status!=='completed')throw new Error('unconfirmed');
   const confirmed:Message[]=[...messages.filter(m=>m.id!==body.request_id+'-user'&&m.id!==body.request_id+'-assistant'),{id:body.request_id+'-user',role:'user',text:message,documents,attachments:readyFiles.map(f=>f.uploaded!)},{id:body.request_id+'-assistant',role:'assistant',text:result.text}];
   await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['chat-cache-'+session,JSON.stringify(confirmed)]);setMessages(confirmed);
   setInput('');await database.execute('DELETE FROM local_meta WHERE id=?',['chat-pending-'+session]);await savePendingFiles(session,[]);setFiles([]);await storeDocuments([]);releasePendingCopies(readyFiles);
   try{await refresh();}catch{setError('消息已发送，暂时无法刷新最新建议。请稍后刷新对话。');}
  } catch(e) {setError(e instanceof ApiError&&e.message==='SOURCE_CHANGED'?'引用原文已修改，请移除引用并重新选择最新版本。':e instanceof ApiError&&e.message==='DOCUMENT_NOT_SYNCED'?'记录尚未同步，请稍后发送；引用保留在本机。':stage==='upload'?'附件尚未上传完成，副本保存在本机，请稍后重试。':'发送结果尚未确认。请刷新查看对话，避免重复发送。');}
  finally {setBusy(false);}
 }
 return <ScreenScaffold panelTitle="助手" panelItems={[{id:'inbox',label:'提醒',onPress:()=>setInboxVisible(true)},{id:'refresh',label:'刷新对话',onPress:()=>{refresh().then(()=>setError('')).catch(()=>setError('暂时无法刷新，请稍后重试。'));}},{id:'new',label:'新的对话',onPress:()=>{openConversation();}},...conversations.slice(0,10).map(c=>({id:c.id,label:c.title.length>22?c.title.slice(0,22)+'…':c.title,onPress:()=>{openConversation(c.id);}}))]}>
  {picker?<DocumentPicker onClose={()=>setPicker(false)} onSelect={d=>{storeDocuments([...documents.filter(x=>x.id!==d.id),d]).catch(()=>setError('引用尚未保存，请重试。'));setPicker(false);}}/>:null}
  <NotificationInbox visible={inboxVisible} onClose={()=>setInboxVisible(false)}/>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <View style={{paddingHorizontal:16,paddingVertical:8,borderBottomWidth:1,borderColor:theme.colors.border}}><Text style={{fontSize:15,fontWeight:'600',color:theme.colors.textPrimary}}>{name}</Text></View>
   <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={{padding:12,gap:10}} onLayout={()=>requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:false}))} onContentSizeChange={()=>requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:true}))} keyboardShouldPersistTaps="handled">
    {!messages.length?<Text style={{fontSize:13,lineHeight:20,color:theme.colors.textMuted}}>聊聊今天，或者告诉我你现在的想法。</Text>:null}
    {messages.map(m=><View key={m.id} style={{alignSelf:m.role==='user'?'flex-end':'flex-start',maxWidth:'90%',paddingHorizontal:12,paddingVertical:9,borderRadius:12,backgroundColor:m.role==='user'?theme.colors.primarySoft:theme.colors.surface}}><Text selectable style={{fontSize:14,lineHeight:22,color:theme.colors.textPrimary}}>{m.text}</Text>{m.attachments?.map(a=><Text key={a.id} style={{fontSize:12,color:theme.colors.textSecondary,marginTop:5}}>📎 {a.filename}</Text>)}{m.documents?.map(d=><DocumentQuote key={d.id} doc={d} conversation={session}/>)}{m.proposals?.map(p=><ProposalCard key={p.id} proposal={p} onSaved={()=>refresh()}/>)}</View>)}
    {busy?<ActivityIndicator color={theme.colors.primary}/>:null}
   </ScrollView>
   {error?<Text style={{fontSize:12,color:theme.colors.textSecondary,paddingHorizontal:14,paddingBottom:6}}>{error}</Text>:null}
   {!connection?<Text style={{fontSize:12,color:theme.colors.textSecondary,padding:12}}>先在服务器连接设置中配对，即可开始聊天。</Text>:null}
   {documents.length?<View style={{paddingHorizontal:12,paddingVertical:5,gap:4}}><Text style={{fontSize:11,color:theme.colors.textMuted}}>发送后，助手可读取这些记录的当前版本</Text>{documents.map(d=><Pressable key={d.id} accessibilityLabel={'移除引用：'+(d.title||d.date)} disabled={busy} onPress={()=>{storeDocuments(documents.filter(x=>x.id!==d.id)).catch(()=>setError('暂时无法移除引用。'));}}><Text numberOfLines={1} style={{fontSize:12,color:theme.colors.textSecondary}}>▤ {d.title||d.date}  ×</Text></Pressable>)}</View>:null}
   {files.length?<View style={{paddingHorizontal:12,paddingVertical:5,gap:4}}>{files.map(f=><Pressable key={f.local_id} accessibilityLabel={'移除附件：'+f.name} disabled={busy} onPress={()=>{removeFile(f.local_id);}}><Text numberOfLines={1} style={{fontSize:12,color:theme.colors.textSecondary}}>📎 {f.name}  ×</Text></Pressable>)}</View>:null}
   <View style={{flexDirection:'row',alignItems:'flex-end',gap:8,padding:10,borderTopWidth:1,borderColor:theme.colors.border}}>
    <Pressable accessibilityLabel="选择聊天附件" disabled={busy||!session||files.length>=6} onPress={chooseFiles} style={{paddingVertical:11,paddingHorizontal:4}}><Text style={{fontSize:17,color:theme.colors.primary}}>＋</Text></Pressable>
    <Pressable accessibilityLabel="引用日记或备忘录" disabled={busy||!session||documents.length>=6} onPress={()=>setPicker(true)} style={{paddingVertical:11}}><Text style={{fontSize:13,color:theme.colors.primary}}>引用</Text></Pressable>
    <TextInput accessibilityLabel="聊天消息" placeholder="说点什么…" value={input} onChangeText={setInput} multiline maxLength={10000} style={{flex:1,maxHeight:120,minHeight:40,fontSize:14,lineHeight:21,paddingHorizontal:12,paddingVertical:8,borderRadius:12,backgroundColor:theme.colors.surface,color:theme.colors.textPrimary}}/>
    <Pressable accessibilityLabel="发送消息" disabled={busy||(!input.trim()&&!files.length&&!documents.length)||!session} onPress={send} style={{paddingHorizontal:12,paddingVertical:11,opacity:busy||(!input.trim()&&!files.length&&!documents.length)||!session?0.4:1}}><Text style={{fontSize:14,color:theme.colors.primary}}>发送</Text></Pressable>
   </View>
  </KeyboardAvoidingView>
 </ScreenScaffold>;
}
