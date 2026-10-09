import {useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {useAssistant,ApiError} from './AssistantProvider';
import {useHabits} from '../state/HabitStore';
import type {TaskProposal} from './chatTypes';
export function ProposalCard({proposal,onSaved}:{proposal:TaskProposal;onSaved:()=>Promise<void>}) {
 const {theme}=useHabits(),{request}=useAssistant();
 const [items,setItems]=useState(proposal.items),[selected,setSelected]=useState(proposal.items.map(()=>true)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(proposal.status==='accepted');
 const c=theme.colors;
 async function accept() {
  if(busy||saved||proposal.status==='accepted')return;setBusy(true);setError('');
  try {await request(`/v1/proposals/${proposal.id}/accept`,{items:items.filter((_,i)=>selected[i])});setSaved(true);await onSaved().catch(()=>{});}
  catch(e){setError(e instanceof ApiError&&e.message==='SOURCE_CHANGED'?'原文已修改，请重新引用并整理后再确认。':'未能确认加入，请检查标题和日期后重试。');}finally{setBusy(false);}
 }
 return <View style={{marginTop:8,padding:10,gap:8,borderWidth:1,borderColor:c.border,borderRadius:10}}>
  <Text style={{fontSize:13,fontWeight:'600',color:c.textPrimary}}>待办建议</Text>
  {saved||proposal.status==='accepted'?<Text style={{fontSize:12,color:c.textSecondary}}>已加入待办</Text>:<>
   {items.map((item,i)=><View key={i} style={{gap:4}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
     <Pressable accessibilityLabel={`选择建议 ${i+1}`} accessibilityRole="checkbox" accessibilityState={{checked:selected[i]}} onPress={()=>setSelected(s=>s.map((v,j)=>j===i?!v:v))}><Text style={{fontSize:16,color:c.primary}}>{selected[i]?'☑':'☐'}</Text></Pressable>
     <TextInput accessibilityLabel={`待办建议标题 ${i+1}`} value={item.title} onChangeText={title=>setItems(a=>a.map((v,j)=>j===i?{...v,title}:v))} maxLength={300} style={{flex:1,fontSize:13,color:c.textPrimary,paddingVertical:4}}/>
    </View>
    <TextInput accessibilityLabel={`待办建议日期 ${i+1}`} placeholder="日期 YYYY-MM-DD（可留空）" value={item.due_date} onChangeText={due_date=>setItems(a=>a.map((v,j)=>j===i?{...v,due_date}:v))} maxLength={10} style={{fontSize:12,color:c.textSecondary,paddingVertical:3,marginLeft:22}}/>
    {item.note?<Text style={{fontSize:12,lineHeight:18,color:c.textSecondary,marginLeft:22}}>{item.note}</Text>:null}
    <Text style={{fontSize:11,color:c.textMuted,marginLeft:22}}>来源：{proposal.sources.find(s=>s.id===item.source_id)?.filename||'附件'}</Text>
   </View>)}
   <Pressable accessibilityLabel="确认附件建议加入待办" disabled={busy||!selected.some(Boolean)} onPress={accept}><Text style={{fontSize:13,color:c.primary,opacity:busy||!selected.some(Boolean)?0.4:1}}>{busy?'正在保存…':'加入待办'}</Text></Pressable>
  </>}
  {error?<Text style={{fontSize:12,color:c.textSecondary}}>{error}</Text>:null}
 </View>;
}
