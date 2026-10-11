import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { domain, DomainError, type Command, type Receipt } from '../domain';
import { database } from '../storage/database';
import { createUiRetry } from '../domain/uiRetry';
import { useHabits } from '../state/HabitStore';
import { shanghaiDate } from '../reminders/planner';
import type { ActivityPage, ActivityRecord } from './activities';

type Draft = { title: string; kind: string; note: string; habitId: string | null };
const blank = (): Draft => ({ title: '', kind: '训练', note: '', habitId: null });
const statuses = { active: '计划中', completed: '已完成', cancelled: '已取消', all: '全部状态' };
export function ActivityManager({ visible, onBusyChange }: { visible: boolean; onBusyChange?(busy: boolean): void }) {
  const { theme } = useHabits(), c = theme.colors;
  const [status, setStatus] = useState<'active' | 'completed' | 'cancelled' | 'all'>('active');
  const [queryDraft, setQueryDraft] = useState(''), [query, setQuery] = useState('');
  const [page, setPage] = useState<ActivityPage | null>(null), [records, setRecords] = useState<ActivityRecord[]>([]);
  const [habits, setHabits] = useState<{ id: string; name: string }[]>([]), [habitMore, setHabitMore] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [form, setForm] = useState(false), [draft, setDraft] = useState(blank);
  const [completing, setCompleting] = useState<ActivityRecord | null>(null), [completionNote, setCompletionNote] = useState('');
  const running = useRef(false), alive = useRef(false), generation = useRef(0), sequence = useRef(0);
  const retry = useRef(createUiRetry(Crypto.randomUUID));
  const loadRef = useRef<(cursor?: ActivityPage['nextCursor']) => Promise<void>>(async () => {});
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    alive.current = visible; const current = ++generation.current;
    if (!visible) return;
    setBusy(running.current); setPage(null); setRecords([]);
    async function load(cursor: ActivityPage['nextCursor'] = null) {
      const request = ++sequence.current; setLoading(true); setError('');
      try {
        const result = await domain.queryActivities({ status, query, cursor, limit: 40 });
        if (!alive.current || current !== generation.current || request !== sequence.current) return;
        setPage(result); setRecords(old => cursor ? [...old.filter(row => !result.records.some(next => next.id === row.id)), ...result.records] : result.records);
      } catch { if (alive.current && current === generation.current && request === sequence.current) setError('活动暂时无法读取，请重试。'); }
      finally { if (alive.current && current === generation.current && request === sequence.current) setLoading(false); }
    }
    async function loadHabits() {
      try {
        const rows = await domain.listHabits({ limit: 100 });
        if (alive.current && current === generation.current) { setHabits(rows); setHabitMore(rows.length === 100); }
      } catch { if (alive.current && current === generation.current) setError('关联习惯暂时无法读取，请重试；原选择保留。'); }
    }
    loadRef.current = load;
    void load(); void loadHabits();
    const dispose = database.onChange({ onChange: () => { void load(); void loadHabits(); } }, { tables: ['local_activities', 'habits', 'checkins'] });
    return () => { alive.current = false; generation.current++; sequence.current++; dispose(); };
  }, [visible, status, query]);
  async function save(command: Command, done?: () => void) {
    if (running.current || !alive.current) return;
    running.current = true; setBusy(true); setError(''); setNotice(''); const current = generation.current;
    try {
      const receipt: Receipt = await domain.execute(command, { actor: 'ui', operationId: retry.current.operation(command) });
      retry.current.committed();
      done?.();
      if (alive.current && current === generation.current) {
        setNotice(command.type === 'activity.complete' ? receipt.related ? '活动已完成，关联习惯已打卡一次。' : '活动已完成，未关联习惯，没有新增打卡。' : command.type === 'activity.cancel' ? '活动已取消，没有新增打卡。' : '活动计划已保存。');
        await loadRef.current();
      }
    } catch (e) { if (alive.current && current === generation.current) setError(e instanceof DomainError ? e.message : '未确认保存，请保留输入后重试。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function discardForm() {
    const close = () => { setForm(false); setDraft(blank()); };
    if (draft.title.trim() || draft.note.trim() || draft.habitId) Alert.alert('放弃活动草稿', '尚未保存的活动输入将被放弃。', [{ text: '继续编辑', style: 'cancel' }, { text: '放弃草稿', onPress: close }]);
    else close();
  }
  const button = (label: string, action: () => void, blocked = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || blocked} onPress={action} style={{ padding: 9, opacity: busy || blocked ? 0.4 : 1 }}><Text style={{ fontSize: 13, color: c.primary }}>{label}</Text></Pressable>;
  const muted = { color: c.textSecondary, fontSize: 12, lineHeight: 19 };
  const input = { color: c.textPrimary, backgroundColor: c.surface, padding: 9, borderWidth: 1, borderColor: c.border, borderRadius: 6, fontSize: 14 };
  return <View style={{ gap: 10 }}>
    <Text style={muted}>离线记录计划和完成情况。关联习惯后，完成活动会自动打卡一次；取消活动不会打卡。</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(Object.keys(statuses) as (keyof typeof statuses)[]).map(key => <View key={key}>{button(statuses[key] + (status === key ? ' ✓' : ''), () => setStatus(key))}</View>)}</View>
    <TextInput accessibilityLabel="搜索活动计划" maxLength={120} value={queryDraft} onChangeText={setQueryDraft} editable={!busy} placeholder="搜索标题或活动类型" placeholderTextColor={c.textMuted} style={input} />
    <View style={{ flexDirection: 'row' }}>{button('查询活动计划', () => query === queryDraft.trim() ? void loadRef.current() : setQuery(queryDraft.trim()), loading)}{!form && !completing ? button('新增活动计划', () => { setForm(true); setNotice(''); }) : null}</View>
    {form ? <View style={{ gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10 }}>
      <Text style={{ fontSize: 14, color: c.textPrimary }}>新增活动计划</Text>
      <TextInput accessibilityLabel="活动计划标题" value={draft.title} onChangeText={title => setDraft(value => ({ ...value, title }))} maxLength={100} editable={!busy} placeholder="计划做什么" placeholderTextColor={c.textMuted} style={input} />
      <TextInput accessibilityLabel="活动计划类型" value={draft.kind} onChangeText={kind => setDraft(value => ({ ...value, kind }))} maxLength={60} editable={!busy} placeholder="类型，例如训练或阅读" placeholderTextColor={c.textMuted} style={input} />
      <TextInput accessibilityLabel="活动计划备注" value={draft.note} onChangeText={note => setDraft(value => ({ ...value, note }))} multiline maxLength={2000} editable={!busy} style={input} />
      <Text style={muted}>关联习惯：{draft.habitId ? habits.find(row => row.id === draft.habitId)?.name ?? '原习惯暂不可用，请重新选择' : '不关联'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{button('不关联习惯' + (draft.habitId === null ? ' ✓' : ''), () => setDraft(value => ({ ...value, habitId: null })))}{habits.map(habit => <View key={habit.id}>{button('关联 ' + habit.name + (draft.habitId === habit.id ? ' ✓' : ''), () => setDraft(value => ({ ...value, habitId: habit.id })))}</View>)}</View>
      {habitMore ? <Text style={muted}>这里只显示前100个有效习惯；可在习惯页面核对已有习惯。</Text> : null}
      <View style={{ flexDirection: 'row' }}>{button('保存活动计划', () => void save({ type: 'activity.start', ...draft }, () => { setForm(false); setDraft(blank()); }), !draft.title.trim() || !draft.kind.trim())}{button('取消活动编辑', discardForm)}</View>
    </View> : null}
    {completing ? <View style={{ gap: 8, padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
      <Text style={{ color: c.textPrimary, fontSize: 14 }}>完成“{completing.title}”</Text>
      <Text style={muted}>{completing.habit_id ? `将为“${completing.habit_name ?? '原习惯'}”打卡一次。` : '此活动不关联习惯，不会新增打卡。'}</Text>
      <TextInput accessibilityLabel="活动完成感受" value={completionNote} onChangeText={setCompletionNote} editable={!busy} multiline maxLength={300} style={input} />
      <View style={{ flexDirection: 'row' }}>{button('确认完成活动', () => void save({ type: 'activity.complete', id: completing.id, expectedRevision: completing.revision, note: completionNote }, () => { setCompleting(null); setCompletionNote(''); }))}{button('暂不完成', () => { setCompleting(null); setCompletionNote(''); })}</View>
    </View> : null}
    {page ? <Text style={muted}>{statuses[status]}{query ? ` · 关键词“${query}”` : ''} · 当前匹配 {page.matched} 条，已显示 {records.length} 条{page.nextCursor ? '，可继续加载。' : '。列表变化后可刷新。'}</Text> : null}
    {loading ? <Text style={muted}>正在读取活动…</Text> : page && !records.length ? <Text style={muted}>当前范围没有活动记录。</Text> : null}
    {records.map(row => <View key={row.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border, gap: 5 }}>
      <Text style={{ color: c.textPrimary, fontSize: 14 }}>{row.title} · {statuses[row.status]}</Text>
      <Text style={muted}>{row.kind} · 开始于{shanghaiDate(row.created_at)}{row.completed_at !== null ? ` · 结束于${shanghaiDate(row.completed_at)}` : ''}</Text>
      {row.note ? <Text selectable style={muted}>{row.note}</Text> : null}{row.completion_note ? <Text selectable style={muted}>完成记录：{row.completion_note}</Text> : null}
      <Text style={muted}>{row.habit_id ? `关联习惯：${row.habit_name ?? '原习惯'}${row.habit_available ? '' : '（已归档或不可用）'} · ` : ''}{row.checkin_state === 'linked' ? '已有对应打卡' : row.checkin_state === 'missing' ? '对应打卡已不存在，不自动补打卡' : '未关联打卡'}</Text>
      {row.status === 'active' ? <View style={{ flexDirection: 'row' }}>{button('完成 ' + row.title, () => { setCompleting(row); setCompletionNote(''); setNotice(''); }, Boolean(form || completing || (row.habit_id && !row.habit_available)))}{button('取消 ' + row.title, () => {
        const current = generation.current;
        Alert.alert('取消这项活动', `取消“${row.title}”，保留计划记录，不增加打卡。`, [{ text: '保留计划', style: 'cancel' }, { text: '取消活动', onPress: () => { if (alive.current && current === generation.current) void save({ type: 'activity.cancel', id: row.id, expectedRevision: row.revision }); } }]);
      }, Boolean(form || completing))}</View> : null}
    </View>)}
    {page?.nextCursor ? button('更多活动计划', () => void loadRef.current(page.nextCursor), loading) : null}
    {error ? <View><Text style={muted}>{error}</Text>{button('重新读取活动', () => void loadRef.current(), loading)}</View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={muted}>{notice}</Text> : null}
  </View>;
}
