import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHabits } from '../state/HabitStore';
import { database } from '../storage/database';
import { chooseMaterials, collectIncoming, materialStore } from './service';
import type { Material } from './store';
import { MaterialViewer } from './MaterialViewer';
export function MaterialPicker({ visible, remaining, onPick, onClose }: { visible: boolean; remaining: number; onPick: (m: Material) => void; onClose: () => void }) {
  const { theme } = useHabits(), c = theme.colors;
  const [items, setItems] = useState<Material[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState<string | null>(null);
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof materialStore.inbox>>>([]);
  useEffect(() => {
    if (!visible) return; let active = true;
    const refresh = async () => { const [list, pending] = await Promise.all([materialStore.list(), materialStore.inbox()]); if (active) { setItems(list); setInbox(pending); } };
    void collectIncoming().then(refresh).catch(() => setError('部分入站材料尚未导入，原件保留，请稍后重试。'));
    const dispose = database.onChange({ onChange: () => void refresh().catch(() => {}) }, { tables: ['local_materials', 'local_meta'] });
    return () => { active = false; dispose(); };
  }, [visible]);
  async function choose() { if (busy) return; setBusy(true); setError(''); try { const result = await chooseMaterials(); setError(result.errors.join('\n')); setItems(await materialStore.list()); } catch (e) { setError(e instanceof Error ? e.message : '选择未完成。'); } finally { setBusy(false); } }
  const button = (label: string, fn: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={fn} style={{ padding: 9, opacity: disabled ? 0.4 : 1 }}><Text style={{ color: c.primary, fontSize: 12 }}>{label}</Text></Pressable>;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>{button('关闭文件列表', onClose)}<Text style={{ color: c.textPrimary, fontSize: 14 }}>本机材料</Text>{button('选择文件／图片', () => void choose())}</View>
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
      <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 19 }}>原件保存在本机。选中后发送才分析；本轮最多4件来源。Office等格式仅保存，解析限制可查看原件。</Text>
      {inbox.length ? <View style={{ gap: 4 }}>{inbox.flatMap(batch => batch.errors.map((msg, index) => <Text key={batch.id + index} style={{ color: c.textSecondary, fontSize: 12 }}>{msg}</Text>))}<Text style={{ color: c.textSecondary, fontSize: 12 }}>收到{inbox.reduce((n, b) => n + b.refs.length, 0)}件材料，已保存在下面的列表。</Text>{button('知道了', () => void materialStore.dismissInbox(inbox.map(b => b.id)))}</View> : null}
      {error ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{error}</Text> : null}
      {busy ? <Text style={{ color: c.textMuted, fontSize: 12 }}>正在保存和解析…</Text> : null}
      {items.map(m => <View key={m.id} style={{ borderBottomWidth: 1, borderColor: c.border, paddingVertical: 6, gap: 3 }}>
        <Pressable accessibilityLabel={'查看材料 ' + m.filename} onPress={() => setPreview(m.id)}><Text style={{ color: c.textPrimary, fontSize: 13 }}>{m.filename}</Text><Text style={{ color: c.textMuted, fontSize: 11, lineHeight: 17 }}>{m.note}</Text></Pressable>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>{button('选中 ' + m.filename, () => { onPick(m); onClose(); }, remaining <= 0 || m.status !== 'ready')}</View>
      </View>)}
      {!items.length ? <Text style={{ color: c.textMuted, fontSize: 13 }}>从手机选择文件，或在其他应用分享给酸橙。</Text> : null}
    </ScrollView>
    <MaterialViewer id={preview} onClose={() => setPreview(null)} />
  </SafeAreaView></Modal>;
}
