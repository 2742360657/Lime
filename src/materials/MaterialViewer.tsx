import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { useHabits } from '../state/HabitStore';
import { materialStore } from './service';
import { materialNative } from './native';
import type { Material } from './store';
export function MaterialViewer({ id, snapshot, onClose }: { id: string | null; snapshot?: { body: string; revision: number }; onClose: () => void }) {
  const { theme } = useHabits(), c = theme.colors;
  const [material, setMaterial] = useState<Material | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false), [body, setBody] = useState('');
  const generation = useRef(0), currentId = useRef(id), running = useRef(false), alive = useRef(false);
  currentId.current = id;
  useEffect(() => {
    alive.current = true; const current = ++generation.current;
    const active = () => alive.current && current === generation.current && currentId.current === id;
    setMaterial(null); setError(''); setEditing(false); setBody(''); setBusy(running.current);
    if (id) void materialStore.get(id).then(value => { if (active()) setMaterial(value); }).catch(() => { if (active()) setError('材料暂时无法读取。'); });
    return () => { alive.current = false; generation.current++; };
  }, [id]);
  const button = (text: string, fn: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={text} disabled={busy} onPress={fn} style={{ padding: 9 }}><Text style={{ color: c.primary, fontSize: 12 }}>{text}</Text></Pressable>;
  async function run(fn: (m: Material, active: () => boolean) => Promise<void>) {
    if (!material || material.id !== id || running.current) return;
    const current = generation.current, target = material;
    const active = () => alive.current && generation.current === current && currentId.current === target.id;
    running.current = true; setBusy(true); setError('');
    try { await fn(target, active); const latest = await materialStore.get(target.id); if (active()) setMaterial(latest); }
    catch { if (active()) setError('操作未完成，原件仍保留。'); } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <Modal visible={Boolean(id)} animationType="slide" onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>{button('关闭材料', onClose)}<Text style={{ fontSize: 14, color: c.textPrimary }}>材料原件</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 10 }}>
      {material && material.id === id ? <>
        <Text selectable style={{ color: c.textPrimary, fontSize: 14, fontWeight: '600' }}>{material.filename}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{Math.ceil(material.size / 1024)}KiB · v{material.revision}{material.deleted ? ' · 已归档' : ''}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 19 }}>{material.note}</Text>
        {snapshot && snapshot.revision !== material.revision ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>正文显示发送时v{snapshot.revision}快照，原件未改写；当前解析版本已变化。</Text> : null}
        {(JSON.parse(material.images) as { uri: string; label: string }[]).map(image => <View key={image.uri}><Text style={{ color: c.textMuted, fontSize: 11 }}>{image.label}</Text><Image source={{ uri: image.uri }} resizeMode="contain" style={{ width: '100%', height: 260 }} /></View>)}
        {editing ? <TextInput accessibilityLabel="更正材料正文" multiline maxLength={32000} value={body} onChangeText={setBody} style={{ minHeight: 160, fontSize: 14, lineHeight: 22, color: c.textPrimary, textAlignVertical: 'top', borderWidth: 1, borderColor: c.border, padding: 8 }} /> : <Text selectable style={{ color: c.textPrimary, fontSize: 14, lineHeight: 22 }}>{snapshot?.body ?? material.body}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {button('导出／用其他应用打开', () => void run(m => Sharing.shareAsync(m.uri, { mimeType: m.mime, dialogTitle: m.filename })))}
          {!snapshot && !material.deleted ? <>
            {button('重新解析', () => void run(async m => { await materialStore.revise(m.id, m.revision, await materialNative.parse(m.uri, m.filename)); }))}
            {material.kind === 'text' || material.kind === 'pdf' ? editing ? <>
              {button('保存更正', () => void run(async (m, active) => { await materialStore.revise(m.id, m.revision, { kind: m.kind, body, images: JSON.parse(m.images), pages: m.pages, status: 'ready', note: '正文经手动更正；原件保留。' }); if (active()) setEditing(false); }))}
              {button('取消更正', () => setEditing(false))}
            </> : button('更正正文', () => { setBody(material.body); setEditing(true); }) : null}
            {button('归档材料', () => void run(async (m, active) => { await materialStore.archive(m.id, m.revision); if (active()) onClose(); }))}
          </> : null}
        </View>
      </> : <><Text style={{ color: c.textSecondary, fontSize: 13 }}>材料暂未读取；以下为发送时的正文快照。</Text>{snapshot ? <Text selectable style={{ color: c.textPrimary, fontSize: 14, lineHeight: 22 }}>{snapshot.body}</Text> : null}</>}
      {busy ? <Text style={{ color: c.textMuted, fontSize: 12 }}>处理中…</Text> : null}
      {error ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView></Modal>;
}
