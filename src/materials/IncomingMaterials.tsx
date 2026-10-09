import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { database } from '../storage/database';
import { useHabits } from '../state/HabitStore';
import { listenIncoming, materialStore } from './service';
export function IncomingMaterials({ onOpen }: { onOpen: () => void }) {
  const { theme } = useHabits(), insets = useSafeAreaInsets();
  const [count, setCount] = useState(0), [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void materialStore.inbox().then(batches => { if (active) setCount(batches.length); }).catch(() => {}); };
    const dispose = listenIncoming(() => { if (active) setError(true); });
    const subscription = database.onChange({ onChange: refresh }, { tables: ['local_meta'] }); refresh();
    return () => { active = false; dispose(); subscription(); };
  }, []);
  if (!count && !error) return null;
  return <View style={{ position: 'absolute', bottom: insets.bottom + 78, zIndex: 20, elevation: 8, left: 16, right: 16, borderRadius: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}><Pressable accessibilityLabel="查看收到的材料" onPress={() => { setError(false); onOpen(); }} style={{ padding: 12 }}><Text style={{ color: theme.colors.primary, fontSize: 13 }}>{error ? '材料尚未全部导入，点此查看／重试' : '收到材料，点此在助手中选择处理'}</Text></Pressable></View>;
}
