import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { database, localDate, type DocumentContent } from '../assistant/database';
import { RecordSources } from '../assistant/TaskSources';
import { GroupPickerModal } from '../components/GroupPickerModal';
import { useHabits } from '../state/HabitStore';
import type { Memo } from '../types/habit';
import { createMemoDraftSession, decodeMemoDraft, type MemoDraft } from './draftSession';
import { MemoClassificationError } from './editGuard';
import { DomainError } from '../domain/types';

// The original compact editor, with one serialized draft/canonical save path.
export function MemoEditor({ registerClose, memo, initialGroupId, groupOptions, onClose, onChange, onQuote }: {
  registerClose: (fn: () => void) => void; memo: Memo; initialGroupId: string | null;
  groupOptions: { id: string | null; label: string }[]; onClose: () => void;
  onChange: (patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>, revision?: number, base?: DocumentContent) => Promise<number>;
  onQuote: () => Promise<void>;
}) {
  const { theme } = useHabits(), c = theme.colors;
  const callbacks = useRef({ onChange, onClose, onQuote });
  callbacks.current = { onChange, onClose, onQuote };
  const session = useMemo(() => {
    const initial: MemoDraft = {
      value: { title: memo.title, body: memo.body, groupId: initialGroupId }, revision: memo.revision ?? 1,
      base: { title: memo.title, body: memo.body, date: memo.date ?? localDate(), group_id: memo.groupId },
    };
    return createMemoDraftSession(initial, {
      async read() {
        const row = await database.getOptional<{ title: string; body: string; group_id: string | null; base_revision: number | null; base_content: string | null }>("SELECT * FROM local_drafts WHERE id=? AND kind='memo'", [memo.id]);
        return row ? decodeMemoDraft(row, initial) : null;
      },
      async write(draft) {
        await database.execute('INSERT OR REPLACE INTO local_drafts(id,document_id,kind,title,body,date,group_id,base_revision,base_content) VALUES(?,?,?,?,?,?,?,?,?)',
          [memo.id, memo.id, 'memo', draft.value.title, draft.value.body, draft.base.date, draft.value.groupId, draft.revision, JSON.stringify(draft.base)]);
      },
      save: (value, revision, base) => callbacks.current.onChange(value, revision, base),
      async updateBase(revision, base) { await database.execute('UPDATE local_drafts SET base_revision=?,base_content=? WHERE id=?', [revision, JSON.stringify(base), memo.id]); },
      async remove() { await database.execute('DELETE FROM local_drafts WHERE id=?', [memo.id]); },
    });
  }, [memo.id]);
  const [draft, setDraft] = useState(session.getSnapshot()), [busy, setBusy] = useState(false), [picker, setPicker] = useState(false);
  const mounted = useRef(true), closing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = session.subscribe(() => setDraft(session.getSnapshot()));
    void session.initialize();
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active' && session.getSnapshot().ready && !closing.current) void session.flush().catch(() => {});
    });
    return () => { mounted.current = false; lifecycle.remove(); unsubscribe(); session.dispose(); };
  }, [session]);
  async function close(quote = false) {
    if (closing.current) return;
    if (!session.getSnapshot().ready) { callbacks.current.onClose(); return; }
    closing.current = true; setBusy(true);
    try {
      await session.finish();
      if (quote) await callbacks.current.onQuote(); else callbacks.current.onClose();
    } catch (error) {
      let persisted = false;
      try { await session.keepDraft(); persisted = true; } catch {}
      if (!mounted.current) return;
      const reason = error instanceof MemoClassificationError ? '分类不存在或已删除，请选择有效分类或未分类。' : error instanceof DomainError && error.code === 'SOURCE_CHANGED' ? '原文或分类版本已经变化，当前输入不会覆盖现版本。' : '保存暂时未完成。';
      Alert.alert('保存未完成', persisted ? reason + '\n输入已保留为本机草稿。可继续编辑，或保留草稿后返回；设置中的“恢复副本与草稿”可另存为新记录，缺失分类会恢复为未分类。' : '本机草稿保存失败，请保留页面并重试。', [
        { text: '继续编辑' }, ...(persisted ? [{ text: '保留草稿并返回', onPress: callbacks.current.onClose }] : []),
      ]);
    } finally { closing.current = false; if (mounted.current) setBusy(false); }
  }
  registerClose(() => void close());
  const changed = (memo.revision ?? 1) !== draft.revision || memo.title !== draft.base.title || memo.body !== draft.base.body || memo.groupId !== draft.base.group_id;
  const editable = draft.ready && !busy;
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ paddingHorizontal: 18, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 0.5, borderColor: c.border }}>
      <Pressable accessibilityLabel="返回备忘录列表" disabled={busy} onPress={() => void close()} style={{ paddingVertical: 10 }}><Text style={{ fontSize: 14, color: c.primary }}>{busy ? '保存中…' : '完成'}</Text></Pressable>
      <Text style={{ flex: 1, fontSize: 16, textAlign: 'center', color: c.textPrimary }}>备忘录</Text>
      <Pressable accessibilityLabel="备忘录操作" disabled={!editable} onPress={() => Alert.alert('备忘录操作', '', [{ text: '引用到聊天', onPress: () => void close(true) }, { text: '取消' }])}><Text style={{ fontSize: 20, color: c.textSecondary }}>⋯</Text></Pressable>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, flexGrow: 1 }}>
      <TextInput accessibilityLabel="备忘录标题" editable={editable} maxLength={300} value={draft.value.title} onChangeText={value => session.change('title', value)} placeholder="标题（可选）" placeholderTextColor={c.textMuted} style={{ fontSize: 18, color: c.textPrimary, paddingVertical: 10 }} />
      <Pressable accessibilityLabel="选择分类" disabled={!editable} onPress={() => setPicker(true)} style={{ paddingVertical: 8 }}><Text style={{ fontSize: 12, color: c.textSecondary }}>{groupOptions.find(group => group.id === draft.value.groupId)?.label ?? '分类已删除，请重新选择'} ▾</Text></Pressable>
      <TextInput accessibilityLabel="备忘录正文" editable={editable} multiline maxLength={100000} value={draft.value.body} onChangeText={value => session.change('body', value)} placeholder="开始记录…" placeholderTextColor={c.textMuted} style={{ flex: 1, minHeight: 270, fontSize: 15, lineHeight: 25, textAlignVertical: 'top', paddingVertical: 12, color: c.textPrimary }} />
      <RecordSources id={memo.id} kind="memo" />
    </ScrollView>
    <Text accessibilityLiveRegion="polite" style={{ fontSize: 11, color: c.textMuted, paddingHorizontal: 20, paddingVertical: 8 }}>{draft.ready && changed ? '原文已更新，当前输入保留；保存前需要处理版本变化' : draft.status}</Text>
    {!draft.ready && !draft.loading ? <Pressable accessibilityLabel="重新读取备忘录草稿" onPress={() => void session.initialize()} style={{ paddingHorizontal: 20, paddingVertical: 12 }}><Text style={{ color: c.primary }}>重试读取草稿</Text></Pressable> : null}
    <GroupPickerModal visible={picker} title="选择分类" options={groupOptions} nullLabel="未分类" selectedGroupId={draft.value.groupId} onClose={() => setPicker(false)} onSubmit={id => { session.change('groupId', id); setPicker(false); }} />
  </KeyboardAvoidingView></SafeAreaView>;
}
