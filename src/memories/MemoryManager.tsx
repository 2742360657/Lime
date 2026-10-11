import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { domain, DomainError, type Command } from '../domain';
import { database } from '../storage/database';
import { createUiRetry } from '../domain/uiRetry';
import { useHabits } from '../state/HabitStore';
import { useAgent } from '../agent/AgentProvider';
import type { MemoryPage } from './queries';

type Memory = MemoryPage['records'][number];
const blank = () => ({ kind: 'fact' as 'fact' | 'preference', key: '', content: '' });
export function MemoryManager({ visible, onBusyChange }: { visible: boolean; onBusyChange?(busy: boolean): void }) {
  const { theme } = useHabits(), c = theme.colors, { runtime, state } = useAgent();
  const [queryDraft, setQueryDraft] = useState(''), [query, setQuery] = useState('');
  const [kind, setKind] = useState<'fact' | 'preference' | undefined>();
  const [page, setPage] = useState<MemoryPage | null>(null), [records, setRecords] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [form, setForm] = useState(false), [editing, setEditing] = useState<Memory | null>(null), [draft, setDraft] = useState(blank);
  const running = useRef(false), alive = useRef(false), generation = useRef(0), sequence = useRef(0);
  const retry = useRef(createUiRetry(Crypto.randomUUID));
  const loadRef = useRef<(cursor?: MemoryPage['nextCursor']) => Promise<void>>(async () => {});
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    alive.current = visible;
    const current = ++generation.current;
    if (!visible) return;
    setBusy(running.current); setPage(null); setRecords([]);
    async function load(cursor: MemoryPage['nextCursor'] = null) {
      const request = ++sequence.current; setLoading(true); setError('');
      try {
        const result = await domain.queryMemories({ query, kind, cursor, limit: 40 });
        if (!alive.current || current !== generation.current || request !== sequence.current) return;
        setPage(result);
        setRecords(old => cursor ? [...old.filter(row => !result.records.some(next => next.id === row.id)), ...result.records] : result.records);
      } catch {
        if (alive.current && current === generation.current && request === sequence.current) setError('个人记忆暂时无法读取，请重试。');
      } finally { if (alive.current && current === generation.current && request === sequence.current) setLoading(false); }
    }
    loadRef.current = load;
    void load();
    const dispose = database.onChange({ onChange: () => void load() }, { tables: ['local_memories'] });
    return () => { alive.current = false; generation.current++; sequence.current++; dispose(); };
  }, [visible, query, kind]);
  async function save(command: Command, done?: () => void) {
    if (running.current || !alive.current) return;
    if (runtime.getSnapshot().busy) { setError('请先停止生成，再修改个人记忆。'); return; }
    running.current = true; setBusy(true); setError(''); setNotice('');
    const current = generation.current;
    try {
      const receipt = await domain.execute(command, { actor: 'ui', operationId: retry.current.operation(command) });
      retry.current.committed();
      done?.();
      if (alive.current && current === generation.current) {
        setNotice(receipt.disposition === 'unchanged' ? '内容未变化。' : command.type === 'memory.forget' ? '已忘记，旧聊天保留但不再自动参与后续上下文。' : '个人记忆已保存。');
        await loadRef.current();
      }
    } catch (e) { if (alive.current && current === generation.current) setError(e instanceof DomainError ? e.message : '未确认保存，请保留输入后重试。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function discard() {
    const close = () => { setForm(false); setEditing(null); setDraft(blank()); };
    if (draft.key.trim() || draft.content.trim()) Alert.alert('放弃记忆草稿', '尚未保存的输入将被放弃。', [{ text: '继续编辑', style: 'cancel' }, { text: '放弃草稿', onPress: close }]);
    else close();
  }
  const disabled = busy || state.busy;
  const button = (label: string, action: () => void, blocked = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || blocked} onPress={action} style={{ padding: 9, opacity: busy || blocked ? 0.4 : 1 }}><Text style={{ color: c.primary, fontSize: 13 }}>{label}</Text></Pressable>;
  const muted = { color: c.textSecondary, fontSize: 12, lineHeight: 19 };
  const input = { color: c.textPrimary, backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 };
  return <View style={{ gap: 8 }}>
    <Text style={muted}>可离线保存明确的个人事实与偏好，也可在聊天里说“记住我的……”。忘记后旧聊天仍保留，但不再自动参与后续上下文。修改前请先停止生成。</Text>
    <TextInput accessibilityLabel="搜索个人记忆" placeholder="搜索名称或内容" placeholderTextColor={c.textMuted} maxLength={120} value={queryDraft} onChangeText={setQueryDraft} editable={!busy} style={input} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {button('搜索记忆', () => query === queryDraft.trim() ? void loadRef.current() : setQuery(queryDraft.trim()), loading)}
      {button('全部记忆' + (!kind ? ' ✓' : ''), () => setKind(undefined))}
      {button('事实' + (kind === 'fact' ? ' ✓' : ''), () => setKind('fact'))}
      {button('偏好' + (kind === 'preference' ? ' ✓' : ''), () => setKind('preference'))}
      {!form ? button('新增个人记忆', () => { setEditing(null); setDraft(blank()); setForm(true); setNotice(''); }, state.busy) : null}
    </View>
    {form ? <View style={{ gap: 7, padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
      <Text style={{ color: c.textPrimary, fontSize: 14 }}>{editing ? '更正个人记忆' : '新增个人记忆'}</Text>
      {!editing ? <><View style={{ flexDirection: 'row' }}>{button('保存为事实' + (draft.kind === 'fact' ? ' ✓' : ''), () => setDraft(value => ({ ...value, kind: 'fact' })), state.busy)}{button('保存为偏好' + (draft.kind === 'preference' ? ' ✓' : ''), () => setDraft(value => ({ ...value, kind: 'preference' })), state.busy)}</View>
        <TextInput accessibilityLabel="个人记忆名称" maxLength={100} value={draft.key} onChangeText={key => setDraft(value => ({ ...value, key }))} editable={!disabled} placeholder="名称，例如饮食偏好" placeholderTextColor={c.textMuted} style={input} /></> : <Text style={muted}>{editing.key} · {editing.kind === 'fact' ? '事实' : '偏好'}</Text>}
      <TextInput accessibilityLabel="个人记忆内容" multiline maxLength={2000} value={draft.content} onChangeText={content => setDraft(value => ({ ...value, content }))} editable={!disabled} style={input} />
      <View style={{ flexDirection: 'row' }}>{button('保存个人记忆', () => void save(editing ? { type: 'memory.correct', id: editing.id, expectedRevision: editing.revision, content: draft.content } : { type: 'memory.remember', ...draft }, () => { setForm(false); setEditing(null); setDraft(blank()); }), state.busy || !draft.content.trim() || (!editing && !draft.key.trim()))}{button('取消记忆编辑', discard)}</View>
    </View> : null}
    {page ? <Text style={muted}>{query ? `关键词“${query}” · ` : ''}当前匹配 {page.matched} 条，已显示 {records.length} 条{page.nextCursor ? '，可继续加载' : '。列表变化后可刷新重新核对。'}</Text> : null}
    {loading ? <Text style={muted}>正在读取个人记忆…</Text> : page && !records.length ? <Text style={muted}>{query || kind ? '当前筛选没有匹配记忆。' : '还没有显式记忆。'}</Text> : null}
    {records.map(memory => <View key={memory.id} style={{ padding: 10, borderRadius: 8, backgroundColor: c.surface, gap: 6 }}>
      <Text style={{ fontSize: 13, color: c.textPrimary }}>{memory.key} · {memory.kind === 'preference' ? '偏好' : '事实'}</Text>
      <Text selectable style={muted}>{memory.content}</Text>
      <View style={{ flexDirection: 'row' }}>
        {button('更正 ' + memory.key, () => { setEditing(memory); setDraft({ kind: memory.kind, key: memory.key, content: memory.content }); setForm(true); setNotice(''); }, state.busy || form)}
        {button('忘记 ' + memory.key, () => {
          const current = generation.current;
          Alert.alert('忘记这项记忆', `清除“${memory.key}”的长期记忆内容，并阻止旧聊天自动参与后续上下文。`, [{ text: '取消', style: 'cancel' }, { text: '忘记', onPress: () => { if (alive.current && current === generation.current) void save({ type: 'memory.forget', id: memory.id, expectedRevision: memory.revision }); } }]);
        }, state.busy || form)}
      </View>
    </View>)}
    {page?.nextCursor ? button('更多个人记忆', () => void loadRef.current(page.nextCursor), loading) : null}
    {error ? <View><Text style={muted}>{error}</Text>{button('重新读取个人记忆', () => void loadRef.current(), loading)}</View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={muted}>{notice}</Text> : null}
  </View>;
}
