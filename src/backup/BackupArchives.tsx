import { useQuery } from '@powersync/react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useHabits } from '../state/HabitStore';
import { exportRecoveryArchive } from './service';
export function BackupArchives({disabled}:{disabled:boolean}) {
  const { theme } = useHabits(), [busy,setBusy] = useState(false);
  const { data } = useQuery<{ id: string; uri: string; summary: string; created_at: number }>('SELECT * FROM local_backup_archives ORDER BY created_at DESC,id');
  if (!data.length) return null;
  async function save(uri:string) {
    setBusy(true);
    try { if(await exportRecoveryArchive(uri))Alert.alert('恢复副本已导出','原始数据包已写入所选目录，现有内容未改变。'); }
    catch { Alert.alert('导出未完成','请检查空间和权限；本机恢复副本仍保留。'); }
    finally { setBusy(false); }
  }
  return <View style={{gap:6}}>
    <Text style={{fontSize:12,color:theme.colors.textSecondary}}>完整恢复时的冲突包保留在这里，可重新导出核对。</Text>
    {data.map(row => {
      let count=0;try { count=Number(JSON.parse(row.summary).conflicts)||0; } catch {}
      return <View key={row.id} style={{paddingVertical:8,gap:4}}>
        <Text style={{fontSize:13,color:theme.colors.textPrimary}}>{new Date(row.created_at).toLocaleDateString('zh-CN')} · {count} 条冲突及关联内容</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="导出完整恢复副本" disabled={busy||disabled} onPress={()=>void save(row.uri)} style={{paddingVertical:8}}><Text style={{fontSize:13,color:theme.colors.primary}}>导出恢复副本</Text></Pressable>
      </View>;
    })}
  </View>;
}
