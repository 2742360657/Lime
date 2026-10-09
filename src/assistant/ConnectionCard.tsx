import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useStatus, useQuery } from '@powersync/react-native';
import { useAssistant } from './AssistantProvider';
import {RecordSyncStatus} from './RecordSyncStatus';
import { Action, useAssistantStyles } from './styles';
export function ConnectionCard() {
 const {connection,pair,notice}=useAssistant(),status=useStatus(),styles=useAssistantStyles();
 const [api,setApi]=useState('http://127.0.0.1:18700'),[sync,setSync]=useState('http://127.0.0.1:18080'),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false);
 const {data:conflicts}=useQuery('SELECT id FROM local_conflicts');
 return <View style={styles.card}>
  <Text style={styles.subtitle}>{connection?(status.connected?'已连接自己的服务器':'本机可用 · 等待同步'):'本机日记 · 尚未连接服务器'}</Text>
  <RecordSyncStatus/>
  <Text style={styles.muted}>{notice||'日记先保存到手机；联网后同步。整理建议需要服务器连接。'}</Text>
  {conflicts.length>0?<Text style={styles.warning}>{conflicts.length} 条恢复副本，请在“恢复副本”中查看。</Text>:null}
  {!connection||editing?<>
   <TextInput accessibilityLabel="服务器 API 地址" style={styles.input} value={api} onChangeText={setApi} autoCapitalize="none" placeholder="服务器 API 地址"/>
   <TextInput accessibilityLabel="同步服务地址" style={styles.input} value={sync} onChangeText={setSync} autoCapitalize="none" placeholder="同步服务地址"/>
   <TextInput accessibilityLabel="设备配对码" style={styles.input} value={code} onChangeText={setCode} autoCapitalize="none" secureTextEntry placeholder="一次性设备配对码"/>
   <Action label={busy?'正在连接…':'连接我的服务器'} disabled={busy} onPress={()=>{setBusy(true);pair(api,sync,code).then(()=>{setCode('');setEditing(false);}).catch(e=>Alert.alert('连接未完成',e.message)).finally(()=>setBusy(false));}}/>
  </>:<Action label="重新配对" onPress={()=>setEditing(true)}/>}
 </View>;
}
