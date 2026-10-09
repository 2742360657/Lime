import {useEffect,useState} from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {useAssistant} from './AssistantProvider';
import {database} from './database';
import {useHabits} from '../state/HabitStore';

type Sources={proposals:{id:string;summary:string}[];sources:{id:string;filename:string;status:string;parser:string|null;source_kind?:string;revision?:number;text:string;truncated:boolean}[]};

// On-demand details keep the ordinary task editor small. Cached sources can be
// read offline; no parse/model call is made by viewing the original evidence.
export function TaskSources({taskId}:{taskId:string}) {
 const {request,connection}=useAssistant(),{theme}=useHabits();
 const [data,setData]=useState<Sources|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(false);
 useEffect(()=>{setData(null);setMessage('');setExpanded(false);setBusy(false);},[taskId]);
 async function load() {
  setExpanded(true);setBusy(true);setMessage('');
  const key='task-sources-'+connection?.owner_id+'-'+taskId;
  let cached:Sources|null=null;
  try {
   const row=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',[key]);
   if(row){cached=JSON.parse(row.value) as Sources;setData(cached);}
   const fresh=await request<Sources>('/v1/tasks/'+encodeURIComponent(taskId)+'/sources');
   setData(fresh);
   await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',[key,JSON.stringify(fresh)]);
  } catch {setMessage(cached?'当前显示本机缓存，连接恢复后可刷新。':'暂时无法读取来源，连接服务器后重试。');}
  finally {setBusy(false);}
 }
 return <View style={{gap:8}}>
  <TouchableOpacity accessibilityLabel="查看待办来源" disabled={busy} onPress={()=>expanded?setExpanded(false):void load()}>
   <Text style={{fontSize:13,color:theme.colors.primary}}>{busy?'正在读取来源…':expanded?'收起来源':'查看来源'}</Text>
  </TouchableOpacity>
  {expanded?<View style={{gap:8}}>
   {data?.proposals.map(p=><Text key={p.id} style={{fontSize:13,color:theme.colors.textSecondary}}>{p.summary}</Text>)}
   {data?.sources.map(s=><View key={s.id} style={{gap:4}}>
    <Text style={{fontSize:13,color:theme.colors.textPrimary}}>{s.filename}</Text>
    <Text style={{fontSize:12,color:theme.colors.textMuted}}>{s.source_kind==='document'?`引用原文 · 版本 ${s.revision}`:s.parser?.includes('vision')?'图片识别结果，请核对':s.text?'已保存的正文摘录':'尚无正文摘录'}{s.truncated?' · 摘录已截断':''}</Text>
    {s.text?<Text selectable style={{fontSize:13,lineHeight:20,color:theme.colors.textSecondary}}>{s.text}</Text>:null}
   </View>)}
   {data&&!data.sources.length?<Text style={{fontSize:13,color:theme.colors.textMuted}}>这条待办没有资料来源。</Text>:null}
   {message?<Text style={{fontSize:12,color:theme.colors.textMuted}}>{message}</Text>:null}
  </View>:null}
 </View>;
}
