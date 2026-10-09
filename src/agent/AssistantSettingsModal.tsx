import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useHabits } from '../state/HabitStore';
import { domain } from '../domain';
import type { MemoryRow } from '../domain/service';
import { useAgent } from './AgentProvider';
import { pickPersona, readApiKey, removeApiKey, saveApiKey } from './config';
import { DEFAULT_MODEL, type Persona } from './store';

export function AssistantSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useHabits(), c = theme.colors;
  const { store, runtime, state } = useAgent();
  const [model, setModel] = useState(DEFAULT_MODEL), [key, setKey] = useState(''), [hasKey, setHasKey] = useState(false);
  const [persona, setPersona] = useState<Pick<Persona, 'filename' | 'body' | 'enabled'> | null>(null);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [expanded, setExpanded] = useState(false), [memories, setMemories] = useState<MemoryRow[]>([]);
  const [editing, setEditing] = useState<MemoryRow | null>(null), [content, setContent] = useState('');
  async function refreshMemories() { setMemories(await domain.listMemories({ limit: 100 })); }
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setKey(''); setExpanded(false); setEditing(null); setLoaded(false);
    Promise.all([store.settings(), readApiKey(), domain.listMemories({ limit: 100 })]).then(([settings, apiKey, facts]) => {
      if (active) { setModel(settings.model); setPersona(settings.persona); setHasKey(Boolean(apiKey)); setMemories(facts); setLoaded(true); }
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
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderBottomColor: c.border, borderBottomWidth: 1 }}>
        {button('关闭', onClose, busy)}<Text style={heading}>助手配置</Text>
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
        <Text style={{ fontSize: 12, lineHeight: 20, color: c.textSecondary }}>在聊天里说“记住我的……”可保存显式记忆。忘记后，旧聊天仍可查看，但不再自动参与后续模型上下文。本页修改时请先停止生成。</Text>
        {!memories.length ? <Text style={{ fontSize: 12, color: c.textMuted }}>还没有显式记忆。</Text> : null}
        {memories.map(memory => <View key={memory.id} style={{ padding: 10, borderRadius: 8, backgroundColor: c.surface, gap: 6 }}>
          <Text style={{ fontSize: 13, color: c.textPrimary }}>{memory.key} · {memory.kind === 'preference' ? '偏好' : '事实'}</Text>
          {editing?.id === memory.id ? <>
            <TextInput accessibilityLabel="更正记忆内容" multiline maxLength={2000} value={content} onChangeText={setContent} style={input} />
            <View style={{ flexDirection: 'row' }}>{button('保存更正', () => void perform(async () => { await domain.execute({ type: 'memory.correct', id: memory.id, expectedRevision: memory.revision, content }, { actor: 'ui', operationId: Crypto.randomUUID() }); setEditing(null); await refreshMemories(); }), busy || state.busy)}{button('取消更正', () => setEditing(null))}</View>
          </> : <><Text selectable style={{ fontSize: 13, lineHeight: 20, color: c.textSecondary }}>{memory.content}</Text>
            <View style={{ flexDirection: 'row' }}>{button('更正', () => { setEditing(memory); setContent(memory.content); }, busy || state.busy)}
              {button('忘记', () => Alert.alert('忘记这项记忆', '清除长期记忆内容，并阻止旧聊天作为后续上下文。聊天历史本身仍保留。', [{ text: '取消' }, { text: '忘记', onPress: () => void perform(async () => { await domain.execute({ type: 'memory.forget', id: memory.id, expectedRevision: memory.revision }, { actor: 'ui', operationId: Crypto.randomUUID() }); await refreshMemories(); }) }]), busy || state.busy)}</View></>}
        </View>)}
        <Text style={{ fontSize: 12, lineHeight: 20, color: c.textMuted }}>当前基础记录备份不包含人格、聊天、活动和个人记忆。完整导出会在后续阶段补齐。</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
