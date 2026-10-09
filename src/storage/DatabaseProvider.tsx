import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { PowerSyncContext } from '@powersync/react-native';
import { database, initializeDatabase } from './database';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    initializeDatabase().then(() => { if (active) setReady(true); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14 }}>
    {failed ? <><Text style={{ fontSize: 14, lineHeight: 22 }}>本地记录未能打开。原有数据仍保留，请勿清除应用数据。</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="重试打开本地记录" onPress={() => setAttempt(value => value + 1)} style={{ padding: 12 }}><Text style={{ fontSize: 14 }}>重试</Text></Pressable></> : <ActivityIndicator />}
  </View>;
  return <PowerSyncContext.Provider value={database}>{children}</PowerSyncContext.Provider>;
}
