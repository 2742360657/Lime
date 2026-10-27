import { useRef, useState } from 'react';
import { Alert } from '../components/ThemedAlert';
import { useAppActions } from '../state/AppProvider';
import { importBackupFile, pickBackupFile } from '../storage/habitStorage';

export function useBackupRestore() {
  const { replaceAppData } = useAppActions();
  const [restoring, setRestoring] = useState(false);
  const busy = useRef(false);
  const restore = async () => {
    if (busy.current) return;
    busy.current = true;
    setRestoring(true);
    try {
      const file = await pickBackupFile();
      if (!file) return;
      const data = await importBackupFile(file.uri);
      const confirmed = await new Promise<boolean>(resolve => Alert.alert('覆盖恢复确认',
        `将恢复 ${data.habits.length} 个习惯、${data.todos.length} 项待办、${data.memos.filter(m => m.deletedAt === null).length} 条备忘录，以及分组、个人资料和主题。确认后覆盖当前数据，请确保已另存备份。`,
        [{ text: '取消', style: 'cancel', onPress: () => resolve(false) },
          { text: '确认恢复', style: 'destructive', onPress: () => resolve(true) }]));
      if (!confirmed) return;
      await replaceAppData(data);
      Alert.alert('恢复成功', '备份内容已保存到本机。');
    } catch (error) {
      Alert.alert('恢复失败', error instanceof Error ? error.message : '恢复失败，请检查文件后重试。');
    } finally { busy.current = false; setRestoring(false); }
  };
  return { restore, restoring };
}
