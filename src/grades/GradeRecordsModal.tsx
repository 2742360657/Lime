import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { domain } from '../domain';
import { database } from '../storage/database';
import { useHabits } from '../state/HabitStore';
import { RecordSources } from '../assistant/TaskSources';
import { createGradeQueries, type GradeRow } from './store';
import { formatUnits } from './commands';

const queries = createGradeQueries(database);
const blank = () => ({ course: '', term: '', score: '', credits: '', note: '' });
export function GradeRecordsModal({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { theme } = useHabits(), c = theme.colors;
  const [rows, setRows] = useState<GradeRow[]>([]), [filter, setFilter] = useState(''), [trash, setTrash] = useState(false);
  const [draft, setDraft] = useState(blank), [editing, setEditing] = useState<GradeRow | null>(null), [form, setForm] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [summary, setSummary] = useState(''), [matched, setMatched] = useState(0);
  const running = useRef(false), generation = useRef(0), refreshSequence = useRef(0), alive = useRef(false);
  useEffect(() => {
    if (!visible) return;
    alive.current = true; setBusy(running.current); const current = ++generation.current;
    async function refresh() {
      const sequence = ++refreshSequence.current;
      try {
        const options = filter.trim() ? { term: filter.trim() } : {};
        const result = await queries.list({ ...options, deleted: trash, limit: 100 });
        const totals = trash ? null : await queries.summary(options);
        if (!alive.current || current !== generation.current || sequence !== refreshSequence.current) return;
        setRows(result.rows); setMatched(result.matched); setError('');
        setSummary(totals ? `${totals.complete ? '完整范围' : '未计算完整范围'} · ${totals.matched}门 · 平均 ${totals.average ?? '未计算'} · 加权 ${totals.weightedAverage ?? '未计算'}${totals.reason ? '\n' + totals.reason : ''}` : '删除的成绩可恢复；不计入平均。');
      } catch {
        if (alive.current && current === generation.current && sequence === refreshSequence.current) { setRows([]); setMatched(0); setSummary(''); setError('成绩暂时无法读取，请重开核对最新结果。'); }
      }
    }
    setRows([]); setMatched(0); setSummary('');
    void refresh();
    const unsubscribe = database.onChange({ onChange: () => void refresh() }, { tables: ['local_grades'] });
    return () => { alive.current = false; generation.current++; unsubscribe(); };
  }, [visible, filter, trash]);
  const button = (label: string, fn: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={fn} style={{ padding: 9, opacity: busy || disabled ? 0.4 : 1 }}><Text style={{ color: c.primary, fontSize: 13 }}>{label}</Text></Pressable>;
  async function act(fn: () => Promise<unknown>, after?: () => void) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); const current = generation.current;
    try { await fn(); if (alive.current && current === generation.current) after?.(); }
    catch (e) { if (alive.current && current === generation.current) setError(e instanceof Error ? e.message : '未保存，输入仍保留。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function close() { if (running.current) return; onClose(); }
  return <Modal visible={visible} onRequestClose={close} animationType="slide"><SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>{button('关闭成绩记录', close)}<Text style={{ color: c.textPrimary, fontSize: 15 }}>成绩记录</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 10 }}>
      <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 19 }}>按课程和学期保存100分制成绩。学分可留空；缺学分不算加权平均。最多两位小数，计算结果四舍五入到两位，不推算学校GPA。</Text>
      <TextInput accessibilityLabel="按学期筛选成绩" placeholder="学期精确筛选；留空显示全部" placeholderTextColor={c.textMuted} value={filter} maxLength={80} editable={!busy} onChangeText={setFilter} style={{ color: c.textPrimary, borderWidth: 1, borderColor: c.border, padding: 9 }} />
      <View style={{ flexDirection: 'row' }}>{button(trash ? '查看有效成绩' : '查看删除的成绩', () => setTrash(!trash))}{button('新增成绩', () => { setEditing(null); setDraft(blank()); setForm(true); })}</View>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 20 }}>{summary}</Text>
      {matched > rows.length ? <Text style={{ color: c.textMuted, fontSize: 12 }}>共{matched}门，列表仅显示前{rows.length}门；请按学期缩小范围。统计使用完整范围或明确拒绝，未将列表当总数。</Text> : null}
      {form ? <View style={{ borderWidth: 1, borderColor: c.border, padding: 10, gap: 7 }}>
        <Text style={{ color: c.textPrimary }}>{editing ? '修改成绩' : '新增成绩'}</Text>
        {(['course', 'term', 'score', 'credits', 'note'] as const).map(key => <TextInput key={key} accessibilityLabel={{ course: '课程名称', term: '成绩学期', score: '成绩分数', credits: '课程学分', note: '成绩备注' }[key]} placeholder={{ course: '课程名称', term: '学期，例如2026秋', score: '分数0到100', credits: '学分（可留空）', note: '备注' }[key]} placeholderTextColor={c.textMuted} editable={!busy} multiline={key === 'note'} keyboardType={key === 'score' || key === 'credits' ? 'decimal-pad' : 'default'} maxLength={key === 'note' ? 600 : key === 'course' ? 100 : key === 'term' ? 80 : 6} value={draft[key]} onChangeText={text => setDraft({ ...draft, [key]: text })} style={{ color: c.textPrimary, padding: 9, borderWidth: 1, borderColor: c.border }} />)}
        <View style={{ flexDirection: 'row' }}>{button('保存成绩', () => void act(() => domain.execute({ ...draft, credits: draft.credits.trim() || null, ...(editing ? { type: 'grade.update', id: editing.id, expectedRevision: editing.revision } : { type: 'grade.create' }) }, { actor: 'ui', operationId: Crypto.randomUUID() }), () => { setForm(false); setEditing(null); setDraft(blank()); }))}{button('取消编辑成绩', () => setForm(false))}</View>
      </View> : null}
      {rows.map(row => <View key={row.id} style={{ borderBottomWidth: 1, borderColor: c.border, paddingVertical: 9, gap: 5 }}>
        <Text style={{ color: c.textPrimary, fontSize: 14 }}>{row.course} · {formatUnits(row.score_units)}分</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{row.term} · 学分{row.credit_units === null ? '未填写' : formatUnits(row.credit_units)}</Text>
        {row.note ? <Text selectable style={{ color: c.textSecondary, fontSize: 12 }}>{row.note}</Text> : null}
        <View style={{ flexDirection: 'row' }}>{!trash ? button('修改 ' + row.course, () => { setEditing(row); setDraft({ course: row.course, term: row.term, score: formatUnits(row.score_units), credits: row.credit_units === null ? '' : formatUnits(row.credit_units), note: row.note }); setForm(true); }) : null}{button((trash ? '恢复 ' : '删除 ') + row.course, () => void act(() => domain.execute({ type: trash ? 'grade.restore' : 'grade.trash', id: row.id, expectedRevision: row.revision }, { actor: 'ui', operationId: Crypto.randomUUID() })))}</View>
        <RecordSources id={row.id} kind="grade" />
      </View>)}
      {!rows.length ? <Text style={{ color: c.textMuted }}>当前范围没有成绩。</Text> : null}
      {error ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView></Modal>;
}
