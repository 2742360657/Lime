import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHabits } from '../state/HabitStore';
import { MemoryManager } from '../memories/MemoryManager';
import { useAgent } from './AgentProvider';
import { pickPersona, readApiKey, removeApiKey, saveApiKey } from './config';
import { DEFAULT_MODEL, type Persona } from './store';

export function AssistantSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useHabits(), c = theme.colors;
  const { store, runtime } = useAgent();
  const [model, setModel] = useState(DEFAULT_MODEL), [key, setKey] = useState(''), [hasKey, setHasKey] = useState(false);
  const [persona, setPersona] = useState<Pick<Persona, 'filename' | 'body' | 'enabled'> | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setKey(''); setExpanded(false); setLoaded(false);
    Promise.all([store.settings(), readApiKey()]).then(([settings, apiKey]) => {
      if (active) { setModel(settings.model); setPersona(settings.persona); setHasKey(Boolean(apiKey)); setLoaded(true); }
    }).catch(() => { if (active) Alert.alert('读取失败', '助手设置暂时无法读取，原内容仍保留。'); });
    return () => { active = false; };
  }, [visible, store]);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { Alert.alert('未完成', e instanceof Error ? e.message : '请重试。'); }
    finally { setBusy(false); }
  }
  const button = (label: string, fn: () => void, disabled = busy) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={fn} style={{ paddingVertical: 10, paddingHorizontal: 8, opacity: disabled ? 0.4 : 1 }}><Text style={{ fontSize: 13, color: c.primary }}>{label}</Text></Pressable>;
  const input = { color: c.textPrimary, backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 };
  const heading = { color: c.textPrimary, fontSize: 14, fontWeight: '600' as const };
  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy && !memoryBusy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderBottomColor: c.border, borderBottomWidth: 1 }}>
        {button('关闭', onClose, busy || memoryBusy)}<Text style={heading}>助手配置</Text>
        {button('保存设置', () => void perform(async () => { await store.saveSettings(model.trim(), persona); Alert.alert('已保存', '模型与人格设置从下一次对话请求生效。'); }), busy || !loaded)}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={heading}>DeepSeek</Text>
        <Text style={{ fontSize: 12, color: c.textSecondary }}>直接访问官方 API。Key 只保存在本机安全存储，不随记录导出。</Text>
        <TextInput accessibilityLabel="模型名称" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} maxLength={80} style={input} />
        <Text style={{ fontSize: 12, color: c.textMuted }}>{hasKey ? 'Key 已保存；留空保留现有 Key。' : '尚未配置 API Key。'}</Text>
        <TextInput accessibilityLabel="DeepSeek API Key" placeholder="输入新的 API Key" placeholderTextColor={c.textMuted} secureTextEntry value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} maxLength={512} style={input} />
        <View style={{ flexDirection: 'row' }}>
          {button('保存 Key', () => void perform(async () => { await saveApiKey(key); setKey(''); setHasKey(true); Alert.alert('已保存', 'Key 已保存到本机安全存储。'); }), busy || !key.trim())}
          {hasKey ? button('移除 Key', () => Alert.alert('移除 Key', '之后需重新配置才能聊天，普通记录仍可使用。', [{ text: '取消' }, { text: '移除', onPress: () => void perform(async () => { runtime.stop(); await removeApiKey(); setHasKey(false); setKey(''); }) }])) : null}
        </View>
        <View style={{ height: 1, backgroundColor: c.border }} />
        <Text style={heading}>可选人格</Text>
        <Text style={{ fontSize: 12, lineHeight: 20, color: c.textSecondary }}>选择 UTF-8 的 Markdown 或文本文件，预览后保存。停用时保留文件，使用中性助手。人格仅用于聊天，不会变成关于你的记忆。</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {button(persona ? '选择替换文件' : '选择人格文件', () => void perform(async () => { const picked = await pickPersona(); if (picked) { setPersona(picked); setExpanded(false); } }))}
          {persona ? <Switch accessibilityLabel="启用人格" value={Boolean(persona.enabled)} onValueChange={enabled => setPersona({ ...persona, enabled: enabled ? 1 : 0 })} disabled={busy} /> : null}
        </View>
        {persona ? <View style={{ gap: 6, padding: 10, borderRadius: 8, backgroundColor: c.surface }}>
          <Text style={{ fontSize: 13, color: c.textPrimary }}>{persona.filename} · {persona.body.length} 字符 · {persona.enabled ? '启用' : '停用'}</Text>
          <Text selectable numberOfLines={expanded ? undefined : 6} style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{persona.body}</Text>
          <View style={{ flexDirection: 'row' }}>{button(expanded ? '收起预览' : '展开预览', () => setExpanded(!expanded))}{button('移除人格', () => setPersona(null))}</View>
        </View> : <Text style={{ fontSize: 12, color: c.textMuted }}>未选择人格 · 中性助手</Text>}
        <View style={{ height: 1, backgroundColor: c.border }} />
        <Text style={heading}>个人事实与偏好</Text>
        <MemoryManager visible={visible} onBusyChange={setMemoryBusy} />
        <Text style={{ fontSize: 12, lineHeight: 20, color: c.textMuted }}>设置中的完整数据包包含人格、聊天、活动、个人记忆和材料原件；API Key与微信/QQ绑定凭据不导出。</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
