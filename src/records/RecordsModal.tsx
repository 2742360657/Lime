import { RecordTableView } from './TableView';
import { RecordTableEditor } from './TableEditor';
import { isDateKey } from '../domain/commands';
import { shanghaiDate, shanghaiTimestamp } from '../reminders/planner';
import { commandSchema } from '../domain/commands';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { domain, DomainError, type DocumentRef } from '../domain';
import { database } from '../storage/database';
import { useHabits } from '../state/HabitStore';
import { createUiRetry } from '../domain/uiRetry';
import { RecordSources } from '../assistant/TaskSources';
import type { RecordRow, TablePayload } from './model';
type Page = Awaited<ReturnType<typeof domain.listRecords>>;
type Draft = {
    typeKey: string;
    schemaKey: 'text' | 'table';
    title: string;
    body: string;
    tags: string;
    occurredAt: number | null;
    date: string;
    table: TablePayload;
};
const blank = (): Draft => ({ typeKey: '资料', schemaKey: 'text', title: '', body: '', tags: '', occurredAt: null, date: '', table: { columns: [], rows: [] } });
export function RecordsModal({ visible, onClose, onPick, remaining = 4, focusId }: {
    visible: boolean;
    onClose(): void;
    onPick?(ref: DocumentRef & {
        title: string;
        date: string;
    }): void;
    remaining?: number;
    focusId?: string;
}) {
    const { theme } = useHabits(), c = theme.colors;
    const [page, setPage] = useState<Page | null>(null), [records, setRecords] = useState<Page['records']>([]), [query, setQuery] = useState(''), [typeKey, setTypeKey] = useState(''), [trash, setTrash] = useState(false);
    const [current, setCurrent] = useState<RecordRow | null>(null), [form, setForm] = useState(false), [draft, setDraft] = useState(blank), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const generation = useRef(0), sequence = useRef(0), alive = useRef(false), running = useRef(false), retry = useRef(createUiRetry(Crypto.randomUUID));
    const loadRef = useRef<(cursor?: Page['nextCursor']) => Promise<void>>(async () => { });
    useEffect(() => {
        alive.current = visible;
        const epoch = ++generation.current;
        if (!visible)
            return;
        setBusy(running.current);
        if (!form)
            setCurrent(null);
        setRecords([]);
        setPage(null);
        setNotice('');
        async function load(cursor: Page['nextCursor'] = null) {
            const request = ++sequence.current;
            try {
                const result = await domain.listRecords({ query, typeKey: typeKey.trim() || undefined, deleted: trash, limit: 40, cursor });
                if (alive.current && epoch === generation.current && request === sequence.current) {
                    setPage(result);
                    setRecords(old => cursor ? [...old.filter(row => !result.records.some(next => row.id === next.id)), ...result.records] : result.records);
                }
            }
            catch {
                if (alive.current && epoch === generation.current)
                    setError('资料暂时无法读取，请重新查询。');
            }
        }
        loadRef.current = load;
        void load();
        if (focusId)
            void domain.getRecord(focusId, { actor: 'ui' }).then(row => { if (alive.current && epoch === generation.current)
                setCurrent(row); }).catch(() => { });
        const dispose = database.onChange({ onChange: () => void load() }, { tables: ['local_records'] });
        return () => { alive.current = false; generation.current++; sequence.current++; dispose(); };
    }, [visible, query, typeKey, trash, focusId]);
    async function perform(fn: (isCurrent: () => boolean) => Promise<void>) { const epoch = generation.current; const isCurrent = () => alive.current && epoch === generation.current; if (running.current)
        return; running.current = true; setBusy(true); setError(''); try {
        await fn(isCurrent);
    }
    catch (e) {
        if (isCurrent())
            setError(e instanceof DomainError ? e.message : '操作未完成，输入和原有资料仍保留。');
    }
    finally {
        running.current = false;
        if (isCurrent())
            setBusy(false);
    } }
    function edit(row: RecordRow) { setCurrent(row); setDraft({ typeKey: row.type_key, schemaKey: row.schema_key, title: row.title, body: row.body, tags: (JSON.parse(row.tags) as string[]).join('、'), occurredAt: row.occurred_at, date: row.occurred_at === null ? '' : shanghaiDate(row.occurred_at), table: row.schema_key === 'table' ? JSON.parse(row.payload) : { columns: [], rows: [] } }); setForm(true); }
    function cancelForm() { const close = () => { setForm(false); setDraft(blank()); }; if (draft.title || draft.body || draft.table.columns.length)
        Alert.alert('放弃资料草稿', '尚未保存的输入将被放弃。', [{ text: '继续编辑', style: 'cancel' }, { text: '放弃草稿', onPress: close }]);
    else
        close(); }
    const button = (text: string, fn: () => void, blocked = false) => <Pressable accessibilityRole="button" accessibilityLabel={text} disabled={busy || blocked} onPress={fn} style={{ padding: 9, opacity: (busy || blocked) ? 0.4 : 1 }}><Text style={{ fontSize: 13, color: c.primary }}>{text}</Text></Pressable>;
    const input = { fontSize: 14, color: c.textPrimary, borderWidth: 1, borderColor: c.border, borderRadius: 6, padding: 9, backgroundColor: c.surface };
    const muted = { fontSize: 12, lineHeight: 19, color: c.textSecondary };
    return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy)
        onClose(); }}><SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>{button('关闭资料', onClose)}<Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>本机资料</Text>{button('返回列表', () => { if (form)
        cancelForm();
    else
        setCurrent(null); })}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 10 }}>
    {form ? <>
      <TextInput accessibilityLabel="资料标题" value={draft.title} editable={!busy} maxLength={200} onChangeText={title => setDraft(old => ({ ...old, title }))} placeholder="标题" placeholderTextColor={c.textMuted} style={input}/>
      <TextInput accessibilityLabel="资料标签" value={draft.tags} editable={!busy} maxLength={976} onChangeText={tags => setDraft(old => ({ ...old, tags }))} placeholder="标签，用顿号分隔" placeholderTextColor={c.textMuted} style={input}/>
      <TextInput accessibilityLabel="资料发生日期" value={draft.date} editable={!busy} maxLength={10} onChangeText={date => setDraft(old => ({ ...old, date }))} placeholder="发生日期 YYYY-MM-DD（可空，上海时间）" placeholderTextColor={c.textMuted} style={input}/>
      <TextInput accessibilityLabel="资料正文" value={draft.body} editable={!busy} multiline maxLength={20000} onChangeText={body => setDraft(old => ({ ...old, body }))} placeholder="原文或备注" placeholderTextColor={c.textMuted} style={input}/>
      {draft.schemaKey === 'table' ? <>
        <Text style={muted}>核对识别出的内容；留空表示缺失。列与单位来自原件，无需定义字段。</Text>
        <RecordTableEditor value={draft.table} disabled={busy} onChange={table => setDraft(old => ({ ...old, table }))}/>
      </> : null}
      <View style={{ flexDirection: 'row' }}>{button('保存资料', () => void perform(async (isCurrent) => { const command = commandSchema.parse({ type: current ? 'record.update' as const : 'record.create' as const, typeKey: draft.typeKey, schemaKey: draft.schemaKey, title: draft.title, body: draft.body, payload: draft.schemaKey === 'table' ? draft.table : {}, tags: draft.tags.split('、').map(s => s.trim()).filter(Boolean), occurredAt: !draft.date.trim() ? null : draft.occurredAt !== null && shanghaiDate(draft.occurredAt) === draft.date.trim() ? draft.occurredAt : shanghaiTimestamp(draft.date.trim(), '00:00'), ...(current ? { id: current.id, expectedRevision: current.revision } : {}) }); const receipt = await domain.execute(command, { actor: 'ui', operationId: retry.current.operation(command) }); retry.current.committed(); if (isCurrent()) {
            setForm(false);
            setDraft(blank());
            setCurrent(null);
            setNotice('资料已保存到本机。');
            try {
                const saved = await domain.getRecord(receipt.entity.id, { actor: 'ui' });
                if (isCurrent())
                    setCurrent(saved);
            }
            catch {
                if (isCurrent())
                    setNotice('资料已保存到本机，请刷新列表查看。');
            }
        } }), !draft.title.trim() || !draft.typeKey.trim() || Boolean(draft.date.trim() && !isDateKey(draft.date.trim())))}{button('取消资料编辑', cancelForm)}</View>
    </> : current ? <>
      <Text selectable style={{ fontSize: 16, color: c.textPrimary }}>{current.title}</Text><Text style={muted}>{current.type_key} · {current.schema_key === 'table' ? '表格' : '文字'}{current.occurred_at === null ? '' : ' · ' + shanghaiDate(current.occurred_at)} · v{current.revision}{current.deleted ? ' · 回收站' : ''}</Text>
      {JSON.parse(current.tags).length ? <Text style={muted}>{(JSON.parse(current.tags) as string[]).join(' · ')}</Text> : null}
      {current.body ? <Text selectable style={{ fontSize: 14, lineHeight: 22, color: c.textPrimary }}>{current.body}</Text> : null}
      {current.schema_key === 'table' ? <RecordTableView table={JSON.parse(current.payload)}/> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{!current.deleted ? button('编辑资料', () => edit(current)) : null}{button(current.deleted ? '恢复资料' : '移入资料回收站', () => void perform(async (isCurrent) => { const command = { type: current.deleted ? 'record.restore' as const : 'record.trash' as const, id: current.id, expectedRevision: current.revision }; await domain.execute(command, { actor: 'ui', operationId: retry.current.operation(command) }); retry.current.committed(); if (isCurrent()) {
            setCurrent(null);
            await loadRef.current();
        } }))}{onPick && !current.deleted ? button('选给助手', () => { onPick({ id: current.id, revision: current.revision, kind: 'record', title: current.title, date: '' }); onClose(); }, remaining <= 0) : null}</View>
      <RecordSources id={current.id} kind="record"/>
    </> : <>
      <Text style={muted}>查看助手整理的资料和原件来源，可更正内容。新的信息直接写备忘录或交给助手理解。</Text>
      <TextInput accessibilityLabel="资料标题关键词" value={query} onChangeText={setQuery} editable={!busy} maxLength={120} placeholder="标题关键词" placeholderTextColor={c.textMuted} style={input}/>
      <TextInput accessibilityLabel="资料类型筛选" value={typeKey} onChangeText={setTypeKey} editable={!busy} maxLength={80} placeholder="类型（留空查询全部）" placeholderTextColor={c.textMuted} style={input}/>
      <View style={{ flexDirection: 'row' }}>{button(trash ? '查看有效资料' : '查看资料回收站', () => setTrash(!trash))}{button('刷新资料', () => void loadRef.current())}</View>
      {page ? <Text style={muted}>当前匹配 {page.matched} 条，已显示 {records.length} 条{page.nextCursor ? '，还有后续页。' : '。'}</Text> : null}
      {records.map(row => <View key={row.id}>{button(row.title + ' · ' + row.type_key, () => void perform(async (isCurrent) => { const value = await domain.getRecord(row.id, { actor: 'ui' }); if (isCurrent())
            setCurrent(value); }))}</View>)}
      {page?.nextCursor ? button('更多资料', () => void loadRef.current(page.nextCursor)) : null}
    </>}
    {notice ? <Text style={muted}>{notice}</Text> : null}{error ? <Text style={muted}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView></Modal>;
}
