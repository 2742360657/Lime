import {RecordSourceView} from '../records/TableView';
import { MaterialViewer } from '../materials/MaterialViewer';
import {useEffect,useRef,useState} from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {database} from './database';
import {useHabits} from '../state/HabitStore';

type Sources={proposals:{id:string;summary:string}[];sources:{id:string;filename:string;status:string;parser:string|null;source_kind?:string;revision?:number;text:string;truncated:boolean;material_id?:string}[]};

// On-demand details keep the ordinary task editor small. Source snapshots are
// read offline; no parse/model call is made by viewing the original evidence.
export function TaskSources({taskId}:{taskId:string}) { return <RecordSources id={taskId} kind="task"/>; }
export function RecordSources({id:recordId,kind}:{id:string;kind:'task'|'memo'|'record'}) {
 const {theme}=useHabits();
 const [preview,setPreview]=useState<{id:string;body:string;revision:number}|null>(null);
 const [data,setData]=useState<Sources|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setData(null);setPreview(null);setMessage('');setExpanded(false);setBusy(false);return()=>{generation.current++;};},[recordId,kind]);
 async function load() {
  setExpanded(true);setBusy(true);setMessage('');
  const current=generation.current;
  try {
    const matching=await database.getAll<{id:string;request_id:string;receipt:string}>("SELECT id,request_id,receipt FROM local_proposals p WHERE status='accepted' AND receipt IS NOT NULL AND json_extract(receipt,'$.entity.kind')=? AND json_extract(receipt,'$.entity.id')=? AND EXISTS(SELECT 1 FROM local_agent_sources s WHERE s.request_id=p.request_id) ORDER BY created_at DESC LIMIT 10",[kind,recordId]);
    const sources:Sources['sources']=[];
    for(const p of matching) {
     const snapshots=await database.getAll<{id:string;title:string;body:string;revision:number;date:string;kind:string;document_id:string}>('SELECT * FROM local_agent_sources WHERE request_id=?',[p.request_id]);
     for(const s of snapshots)if(!sources.some(old=>old.id===s.id))sources.push({id:s.id,filename:s.title||s.date||'引用记录',status:'saved',parser:null,source_kind:s.kind==='attachment'?'attachment':s.kind==='record'?'record':'document',revision:s.revision,text:s.body,truncated:false,material_id:s.kind==='attachment'?s.document_id:undefined});
    }
    if(current!==generation.current)return;
    if(sources.length){setData({proposals:[],sources});setMessage('本机保存的最近10次引用原文快照。');}
    else setMessage('本机没有保存这条记录的历史来源。');
  } catch {if(current===generation.current)setMessage('暂时无法读取本机来源，原始记录仍保留。');}
  finally {if(current===generation.current)setBusy(false);}
 }
 return <View style={{gap:8}}>
  <MaterialViewer id={preview?.id??null} snapshot={preview??undefined} onClose={()=>setPreview(null)}/>
  <TouchableOpacity accessibilityLabel={kind==='task'?'查看待办来源':kind==='memo'?'查看备忘录来源':kind==='record'?'查看资料来源':'查看资料来源'} disabled={busy} onPress={()=>expanded?setExpanded(false):void load()}>
   <Text style={{fontSize:13,color:theme.colors.primary}}>{busy?'正在读取来源…':expanded?'收起来源':'查看来源'}</Text>
  </TouchableOpacity>
  {expanded?<View style={{gap:8}}>
   {data?.proposals.map(p=><Text key={p.id} style={{fontSize:13,color:theme.colors.textSecondary}}>{p.summary}</Text>)}
   {data?.sources.map(s=><View key={s.id} style={{gap:4}}>
    <Text style={{fontSize:13,color:theme.colors.textPrimary}}>{s.filename}</Text>
    <Text style={{fontSize:12,color:theme.colors.textMuted}}>{s.source_kind==='document'||s.source_kind==='record'?`引用原文 · 版本 ${s.revision}`:s.parser?.includes('vision')?'图片识别结果，请核对':s.text?'已保存的正文摘录':'尚无正文摘录'}{s.truncated?' · 摘录已截断':''}</Text>
    {s.material_id?<TouchableOpacity accessibilityLabel="查看来源原件" onPress={()=>setPreview({id:s.material_id!,body:s.text,revision:s.revision!})}><Text style={{fontSize:12,color:theme.colors.primary}}>查看原件</Text></TouchableOpacity>:null}
    {s.text&&s.source_kind==='record'?<RecordSourceView body={s.text}/>:s.text?<Text selectable style={{fontSize:13,lineHeight:20,color:theme.colors.textSecondary}}>{s.text}</Text>:null}
   </View>)}
   {data&&!data.sources.length?<Text style={{fontSize:13,color:theme.colors.textMuted}}>这条记录没有资料来源。</Text>:null}
   {message?<Text style={{fontSize:12,color:theme.colors.textMuted}}>{message}</Text>:null}
  </View>:null}
 </View>;
}
