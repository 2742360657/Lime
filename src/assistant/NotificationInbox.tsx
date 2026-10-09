import {useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Platform,SafeAreaView,ScrollView,StatusBar,Text,TouchableOpacity,View} from 'react-native';
import {useAssistant} from './AssistantProvider';
import {database} from './database';
import {useHabits} from '../state/HabitStore';
type Notice={id:string;title:string;body:string;due_at:string;created_at:string;read_at:string|null};
export function NotificationInbox({visible,onClose}:{visible:boolean;onClose:()=>void}) {
 const {request,connection}=useAssistant(),{theme}=useHabits();
 const [items,setItems]=useState<Notice[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const cache='notifications-'+connection?.owner_id;
 async function refresh() {
  setBusy(true);setMessage('');
  try {
   const cached=await database.getOptional<{value:string}>('SELECT value FROM local_meta WHERE id=?',[cache]);
   if(cached){setItems(JSON.parse(cached.value));setMessage('当前显示本机缓存。');}
   const result=await request<{notifications:Notice[]}>('/v1/notifications');
   setItems(result.notifications);setMessage('');
   await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',[cache,JSON.stringify(result.notifications)]);
  }catch{setMessage('暂时无法刷新，已有提醒保留在本机。');}finally{setBusy(false);}
 }
 useEffect(()=>{if(visible){setItems([]);void refresh();}},[visible,connection?.owner_id]);
 async function markRead(id:string) {
  setBusy(true);setMessage('');
  try {
   const saved=await request<{id:string;read_at:string}>('/v1/notifications/'+encodeURIComponent(id)+'/read',{});
   const next=items.map(n=>n.id===saved.id?{...n,read_at:saved.read_at}:n);
   setItems(next);await database.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',[cache,JSON.stringify(next)]);
  }catch{setMessage('尚未确认已读，连接恢复后可重试。');}finally{setBusy(false);}
 }
 const color=theme.colors;
 return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
  <SafeAreaView style={{flex:1,paddingTop:Platform.OS==='android'?StatusBar.currentHeight??0:0,backgroundColor:color.background}}>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:10,borderBottomWidth:1,borderColor:color.border}}>
    <TouchableOpacity accessibilityLabel="关闭提醒列表" onPress={onClose} style={{paddingVertical:8}}><Text style={{fontSize:14,color:color.primary}}>返回</Text></TouchableOpacity>
    <Text style={{fontSize:15,fontWeight:'600',color:color.textPrimary}}>提醒</Text>
    <TouchableOpacity accessibilityLabel="刷新提醒列表" disabled={busy} onPress={()=>void refresh()} style={{paddingVertical:8}}><Text style={{fontSize:14,color:color.primary}}>刷新</Text></TouchableOpacity>
   </View>
   <ScrollView contentContainerStyle={{padding:16,gap:14}}>
    <Text style={{fontSize:12,lineHeight:18,color:color.textMuted}}>到期提醒保存在这里。系统推送尚未开启。</Text>
    {message?<Text style={{fontSize:12,color:color.textMuted}}>{message}</Text>:null}
    {busy?<ActivityIndicator color={color.primary}/>:null}
    {!busy&&!items.length?<Text style={{fontSize:14,color:color.textSecondary}}>还没有到期提醒。</Text>:null}
    {items.map(n=><View key={n.id} style={{gap:6,paddingBottom:14,borderBottomWidth:1,borderColor:color.border}}>
     <Text style={{fontSize:14,fontWeight:n.read_at?'400':'600',color:color.textPrimary}}>{n.title}</Text>
     {n.body?<Text selectable style={{fontSize:13,lineHeight:20,color:color.textSecondary}}>{n.body}</Text>:null}
     <Text style={{fontSize:12,color:color.textMuted}}>{new Date(n.due_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}{n.read_at?' · 已读':''}</Text>
     {!n.read_at?<TouchableOpacity accessibilityLabel={'标记提醒已读：'+n.title} disabled={busy} onPress={()=>void markRead(n.id)} style={{alignSelf:'flex-start',paddingVertical:7}}><Text style={{fontSize:13,color:color.primary}}>标记已读</Text></TouchableOpacity>:null}
    </View>)}
   </ScrollView>
  </SafeAreaView>
 </Modal>;
}
