import {useEffect,useState} from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {database} from './database';
import {useHabits} from '../state/HabitStore';

type Sources={proposals:{id:string;summary:string}[];sources:{id:string;filename:string;status:string;parser:string|null;source_kind?:string;revision?:number;text:string;truncated:boolean}[]};

// On-demand details keep the ordinary task editor small. Cached sources can be
// read offline; no parse/model call is made by viewing the original evidence.
export function TaskSources({taskId}:{taskId:string}) {
 const {theme}=useHabits();
 const [data,setData]=useState<Sources|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(false);
 useEffect(()=>{setData(null);setMessage('');setExpanded(false);setBusy(false);},[taskId]);
 async function load() {
  setExpanded(true);setBusy(true);setMessage('');
  try {
   const task=await database.getOptional<{owner_id:string|null}>('SELECT owner_id FROM tasks WHERE id=?',[taskId]);
   const key='task-sources-'+(task?.owner_id??'undefined')+'-'+taskId;
   const row=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',[key]);
   if(row){setData(JSON.parse(row.value) as Sources);setMessage('本机保留的历史来源摘录。');}
   else {
    const proposals=await database.getAll<{id:string;request_id:string;receipt:string}>("SELECT id,request_id,receipt FROM local_proposals WHERE status='accepted' AND receipt IS NOT NULL ORDER BY created_at DESC");
    const matching=proposals.filter(p=>{const receipt=JSON.parse(p.receipt);return receipt.entity?.kind==='task'&&receipt.entity.id===taskId;});
    const sources:Sources['sources']=[];
    for(const p of matching) {
     const snapshots=await database.getAll<{id:string;title:string;body:string;revision:number;date:string}>('SELECT * FROM local_agent_sources WHERE request_id=?',[p.request_id]);
     for(const s of snapshots)if(!sources.some(old=>old.id===s.id))sources.push({id:s.id,filename:s.title||s.date||'引用记录',status:'saved',parser:null,source_kind:'document',revision:s.revision,text:s.body,truncated:false});
    }
    if(sources.length){setData({proposals:[],sources});setMessage('本机保存的引用原文快照。');}
    else setMessage('本机没有保存这条待办的历史来源。');
   }
  } catch {setMessage('暂时无法读取本机来源，原始缓存仍保留。');}
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
