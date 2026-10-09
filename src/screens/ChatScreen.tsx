import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { database } from '../storage/database';
import type { DocumentRef } from '../domain';
import { useHabits } from '../state/HabitStore';
import { useAgent } from '../agent/AgentProvider';
import { AssistantSettingsModal } from '../agent/AssistantSettingsModal';
import { ActionCard } from '../agent/ActionCard';
import type { ActionResult, AgentMessage, AgentRequest, AgentSession } from '../agent/store';
import { LegacyChatHistory } from './LegacyChatHistory';

type Source = DocumentRef & { title: string; kind: string; date: string; body?: string };
export function ChatScreen({ route }: { route?: { params?: { documentId?: string; documentRevision?: number; quoteNonce?: string } } }) {
  const { theme } = useHabits(), c = theme.colors;
  const { store, runtime, state } = useAgent();
  const [sessions, setSessions] = useState<AgentSession[]>([]), [session, setSession] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]), [requests, setRequests] = useState<AgentRequest[]>([]), [results, setResults] = useState<Record<string, ActionResult[]>>({});
  const [input, setInput] = useState(''), [quoted, setQuoted] = useState<Source[]>([]), [picker, setPicker] = useState(false), [documents, setDocuments] = useState<Source[]>([]);
  const [sourcePreview, setSourcePreview] = useState<Source | null>(null), [sources, setSources] = useState<Record<string, Source[]>>({});
  const [settingsVisible, setSettingsVisible] = useState(false), [legacy, setLegacy] = useState(false), [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null), initializing = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const list = await store.sessions();
      if (!active) return;
      setSessions(list);
      if (!list.length && !initializing.current) { initializing.current = true; try { const id = await store.newSession(); if (active) setSession(id); } finally { initializing.current = false; } }
      else setSession(current => current || list[0]?.id || '');
    };
    void refresh().catch(() => setError('对话暂时无法读取，请重试。'));
    const dispose = database.onChange({ onChange: () => void refresh().catch(() => {}) }, { tables: ['local_agent_sessions'] });
    return () => { active = false; dispose(); };
  }, [store]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = async () => {
      const [msgs, reqs, sourceRows] = await Promise.all([store.messages(session), store.requests(session), database.getAll<Source & { request_id: string; document_id: string }>('SELECT s.* FROM local_agent_sources s JOIN local_agent_requests r ON r.id=s.request_id WHERE r.session_id=?', [session])]);
      const actionResults: Record<string, ActionResult[]> = {}, material: Record<string, Source[]> = {};
      for (const req of reqs) actionResults[req.id] = await store.results(req.id);
      for (const row of sourceRows) (material[row.request_id] ??= []).push({ ...row, id: row.document_id });
      if (active) { setMessages(msgs); setRequests(reqs); setResults(actionResults); setSources(material); }
    };
    setMessages([]); setRequests([]); setResults({}); setSources({});
    void refresh().catch(() => { if (active) setError('对话暂时无法读取，原内容仍保留。'); });
    const dispose = database.onChange({ onChange: () => void refresh().catch(() => { if (active) setError('刷新失败，请重新打开对话。'); }) }, { tables: ['local_agent_messages', 'local_agent_requests', 'local_agent_results'] });
    return () => { active = false; dispose(); };
  }, [session, store]);
  useEffect(() => {
    let active = true;
    if (route?.params?.documentId) void database.getOptional<Source>('SELECT id,revision,title,kind,date FROM documents WHERE id=? AND revision=? AND deleted=0', [route.params.documentId, route.params.documentRevision ?? -1]).then(source => {
      if (active) { if (source) { setQuoted([source]); setLegacy(false); } else setError('引用已变化，请返回记录重新选择。'); }
    }).catch(() => { if (active) setError('引用暂时无法读取。'); });
    return () => { active = false; };
  }, [route?.params?.documentId, route?.params?.documentRevision, route?.params?.quoteNonce]);
  async function send(retryId?: string) {
    if (state.busy || !session) return;
    const text = input, refs = quoted;
    setError('');
    if (!retryId) { setInput(''); setQuoted([]); }
    try { await runtime.start(session, text, refs.map(({ id, revision }) => ({ id, revision })), retryId); }
    catch (e) { if (!retryId) { setInput(text); setQuoted(refs); } setError(e instanceof Error ? e.message : '请求未完成，请重试。'); }
  }
  async function pickRecords() {
    try { setDocuments(await database.getAll<Source>('SELECT id,revision,title,kind,date FROM documents WHERE deleted=0 ORDER BY edited_at DESC,id LIMIT 100')); setPicker(true); }
    catch { setError('记录暂时无法读取。'); }
  }
  const button = (label: string, fn: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={fn} style={{ paddingVertical: 8, paddingHorizontal: 8, opacity: disabled ? 0.4 : 1 }}><Text style={{ fontSize: 12, color: c.primary }}>{label}</Text></Pressable>;
  const panels = [
    { id: 'new', label: '新对话', onPress: () => { void store.newSession().then(id => { setSession(id); setLegacy(false); }).catch(() => setError('新建对话失败。')); } },
    { id: 'config', label: '助手配置', onPress: () => setSettingsVisible(true) },
    ...sessions.map(s => ({ id: s.id, label: s.title, selected: s.id === session && !legacy, onPress: () => { setSession(s.id); setLegacy(false); } })),
    { id: 'legacy', label: '旧版历史缓存', selected: legacy, onPress: () => setLegacy(true) },
  ];
  return <ScreenScaffold panelTitle="助手" panelItems={panels}>
    {legacy ? <LegacyChatHistory /> : <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomColor: c.border, borderBottomWidth: 1 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary }}>{sessions.find(s => s.id === session)?.title || '助手'}</Text>
        {button('配置', () => setSettingsVisible(true))}
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 12 }} onContentSizeChange={() => { if (state.busy && state.sessionId === session) scroll.current?.scrollToEnd({ animated: false }); }}>
        {!messages.length ? <Text style={{ fontSize: 13, lineHeight: 21, color: c.textSecondary }}>在这里聊天，查询或操作待办、习惯和显式记忆。日记需选中后才供本轮分析。</Text> : null}
        {messages.map(message => {
          const request = requests.find(r => r.id === message.request_id);
          const generating = state.busy && state.requestId === message.request_id && message.role === 'assistant';
          const text = generating ? state.text || message.body : message.body;
          return <View key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '96%', minWidth: 100, gap: 7, padding: 10, borderRadius: 10, backgroundColor: message.role === 'user' ? c.primarySoft : c.surface }}>
            <Text selectable style={{ fontSize: 14, lineHeight: 22, color: c.textPrimary }}>{text || (generating ? '正在处理…' : request?.status === 'complete' ? '本轮已结束。' : '未生成回答。')}</Text>
            {message.role === 'user' ? sources[message.request_id]?.map(source => <View key={source.id}>{button(`原文 · ${source.title || source.date || '记录'}`, () => setSourcePreview(source))}</View>) : null}
            {message.role === 'assistant' ? <>
              {results[message.request_id]?.map((result, i) => <ActionCard key={result.proposalId || result.receipt?.operationId || i} result={result} />)}
              {request?.error ? <Text style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{request.error}</Text> : null}
              {request && ['error', 'stopped', 'interrupted'].includes(request.status) ? button('重试本次请求', () => void send(request.id), state.busy) : null}
            </> : null}
          </View>;
        })}
      </ScrollView>
      {error ? <Text style={{ paddingHorizontal: 12, fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{error}</Text> : null}
      <View style={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8, gap: 5, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        {quoted.map(source => <View key={source.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: c.textSecondary }}>本轮引用 · {source.title || source.date || '记录'}</Text>{button('取消引用', () => setQuoted(quoted.filter(s => s.id !== source.id)))}</View>)}
        <TextInput accessibilityLabel="给助手发消息" placeholder="给助手发消息…" placeholderTextColor={c.textMuted} multiline maxLength={12000} value={input} onChangeText={setInput} style={{ fontSize: 14, lineHeight: 21, minHeight: 42, maxHeight: 120, padding: 9, borderWidth: 1, borderColor: c.border, borderRadius: 8, color: c.textPrimary }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>{button('引用记录', () => void pickRecords(), quoted.length >= 4)}
          {state.busy ? button(state.sessionId === session ? '停止生成' : '停止其他对话生成', runtime.stop) : button('发送', () => void send(), !input.trim() || !session)}
        </View>
      </View>
    </KeyboardAvoidingView>}
    <AssistantSettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    <Modal visible={picker || Boolean(sourcePreview)} animationType="slide" onRequestClose={() => { setPicker(false); setSourcePreview(null); }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>{button('关闭', () => { setPicker(false); setSourcePreview(null); })}<Text style={{ fontSize: 14, color: c.textPrimary }}>{sourcePreview ? '本轮原文快照' : '选择记录'}</Text></View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {sourcePreview ? <><Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>{sourcePreview.title || sourcePreview.date}</Text><Text selectable style={{ fontSize: 14, lineHeight: 23, color: c.textPrimary }}>{sourcePreview.body}</Text></> : documents.map(doc => <Pressable key={doc.id} disabled={quoted.some(s => s.id === doc.id)} onPress={() => { setQuoted(previous => [...previous, doc].slice(0, 4)); setPicker(false); }} style={{ padding: 10, borderRadius: 8, backgroundColor: c.surface }}><Text style={{ fontSize: 13, color: c.textPrimary }}>{doc.title || doc.date || '无标题'}{quoted.some(s => s.id === doc.id) ? ' · 已选' : ''}</Text><Text style={{ marginTop: 4, fontSize: 11, color: c.textMuted }}>{doc.kind === 'diary' ? '日记' : '备忘录'} · {doc.date} · v{doc.revision}</Text></Pressable>)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </ScreenScaffold>;
}
