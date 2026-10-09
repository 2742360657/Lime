import {useEffect,useState} from 'react';
import {Text} from 'react-native';
import {useQuery,useStatus} from '@powersync/react-native';
import {database} from './database';
import {useAssistant} from './AssistantProvider';
import {useHabits} from '../state/HabitStore';
export function RecordSyncStatus() {
 const {connection}=useAssistant(),{theme}=useHabits(),status=useStatus();
 const [pending,setPending]=useState<number|null>(null);
 const {data:conflicts}=useQuery('SELECT id FROM local_conflicts');
 useEffect(()=>{let alive=true;const refresh=()=>void database.getUploadQueueStats().then(s=>{if(alive)setPending(s.count);}).catch(()=>{if(alive)setPending(null);});refresh();const timer=setInterval(refresh,2000);return()=>{alive=false;clearInterval(timer);};},[]);
 let label='本机已保存 · 尚未连接服务器';
 if(connection) {
  if(conflicts.length)label=`本机已保存 · ${conflicts.length} 份恢复副本待处理`;
  else if(pending===null)label='本机已保存 · 同步状态读取中';
  else if(pending>0)label=`本机已保存 · ${pending} 项待上传${status.uploadError||!status.connected?'，等待连接':''}`;
  else if(status.uploadError||status.downloadError||!status.connected)label='本机已保存 · 等待同步连接';
  else if(status.uploading||status.downloading||!status.hasSynced)label='本机已保存 · 正在同步';
  else label='本机已保存 · 已与服务器同步';
 }
 return <Text accessibilityLabel={label} style={{fontSize:11,color:theme.colors.textMuted,lineHeight:18}}>{label}</Text>;
}
