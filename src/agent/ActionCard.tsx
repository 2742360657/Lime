import {RecordTableEditor} from '../records/TableEditor';
import {RecordTableView} from '../records/TableView';
import {tablePayloadSchema} from '../records/model';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { database } from '../storage/database';
import { domain } from '../domain';
import type { Command, Receipt } from '../domain';
import type { ProposalRow } from '../domain/service';
import { useHabits } from '../state/HabitStore';
import type { ActionResult } from './store';

const labels: Record<string, string> = { typeKey:'资料类型', schemaKey:'资料格式',payload:'资料表格',tags:'资料标签',occurredAt:'发生时间', name: '习惯名称', cadence: '频次 daily / weekly / monthly', targetCount: '目标次数', title: '标题', body: '正文', groupId: '备忘录分类', note: '备注 / 感受', content: '记忆内容', key: '记忆名称', kind: '类型', dueDateKey: '日期 YYYY-MM-DD', dueTime: '时间 HH:mm', mode: '模式 once / annual', dateKey: '单次日期 YYYY-MM-DD', monthDay: '年度公历月日 MM-DD', time: '上海时间 HH:mm', advanceDays: '提前天数 0到30', dayOf: '当天提醒', enabled: '启用规则' };
const names: Record<Command['type'], string> = { 'memo.create': '新增备忘录', 'memo.update': '修改备忘录', 'memo.trash': '备忘录移入回收站', 'memo.restore': '恢复备忘录', 'record.create':'保存资料', 'record.update':'修改资料', 'record.trash':'资料移入回收站', 'record.restore':'恢复资料', 'task.create': '新增待办', 'task.update': '修改待办', 'task.complete': '待办完成状态', 'task.trash': '移入回收站', 'habit.create': '新增习惯', 'habit.update': '调整习惯', 'habit.checkin': '习惯打卡', 'memory.remember': '记住事实 / 偏好', 'memory.correct': '更正记忆', 'memory.forget': '忘记记忆', 'activity.start': '记录活动计划', 'activity.complete': '完成活动', 'activity.cancel': '取消活动', 'reminder.create': '新增提醒规则', 'reminder.update': '修改提醒规则', 'reminder.cancel': '停用提醒规则' };
export function ActionCard({ result }: { result: ActionResult }) {
  const { theme } = useHabits(), c = theme.colors;
  const navigation = useNavigation<any>();
  const [proposal, setProposal] = useState<ProposalRow | null>(null), [editing, setEditing] = useState(false), [draft, setDraft] = useState<Record<string, unknown>>({ ...result.command });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Receipt | undefined>(result.receipt);
  useEffect(() => {
    if (!result.proposalId) return;
    let active = true;
    const refresh = () => { void database.getOptional<ProposalRow>('SELECT * FROM local_proposals WHERE id=?', [result.proposalId!]).then(p => { if (active) { setProposal(p); if (p?.receipt) setReceipt(JSON.parse(p.receipt)); } }).catch(() => { if (active) setError('建议暂时无法读取，请重试。'); }); };
    refresh(); const dispose = database.onChange({ onChange: refresh }, { tables: ['local_proposals'] });
    return () => { active = false; dispose(); };
  }, [result.proposalId]);
  const command: Command = proposal?.command ? JSON.parse(proposal.command) : result.command;
  const pending = proposal?.status === 'pending';
  async function act(fn: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '未保存，请重试。'); } finally { setBusy(false); } }
  const button = (label: string, fn: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={fn} style={{ paddingVertical: 8, paddingHorizontal: 8, opacity: busy ? 0.4 : 1 }}><Text style={{ fontSize: 12, color: c.primary }}>{label}</Text></Pressable>;
  return <View style={{ padding: 10, gap: 5, backgroundColor: c.surfaceMuted, borderColor: c.border, borderWidth: 1, borderRadius: 8 }}>
    <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary }}>{names[command.type]} · {receipt ? '已保存' : pending ? '待确认' : proposal?.status === 'restored' ? '已恢复历史' : proposal?.status === 'rejected' ? '已拒绝' : result.status === 'error' ? '未保存' : '读取中'}</Text>
    {receipt && result.status === 'saved' ? <Text selectable style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{savedSummary(result.command)}</Text> : null}
    {!receipt ? Object.entries(command).filter(([key]) => labels[key]).map(([key, value]) => <View key={key} style={{ gap: 3 }}>
      {key === 'payload' ? <RecordPayloadField editing={editing} value={editing?draft[key]:value} onChange={payload=>setDraft({...draft,payload})}/> : key === 'schemaKey' ? <Text style={{fontSize:12,color:c.textSecondary}}>资料格式：{value==='table'?'表格':'文字'}</Text> : key === 'occurredAt' ? <Text style={{fontSize:12,color:c.textSecondary}}>发生时间：{value===null?'未填写':new Date(Number(value)).toLocaleString()}</Text> : key === 'groupId' ? <MemoGroupField editing={editing} value={(editing ? draft[key] : value) as string | null} onChange={groupId => setDraft({ ...draft, groupId })} /> : editing ? <><Text style={{ fontSize: 11, color: c.textMuted }}>{labels[key]}</Text>{typeof value === 'boolean' ? <Switch accessibilityLabel={labels[key]} value={Boolean(draft[key])} onValueChange={checked => setDraft({ ...draft, [key]: checked })} /> : <TextInput accessibilityLabel={labels[key]} multiline={key === 'body' || key === 'content' || key === 'note'} value={Array.isArray(draft[key])?(draft[key] as string[]).join('、'):String(draft[key]??'')} onChangeText={text => setDraft({ ...draft, [key]: key === 'tags' ? text.split('、').map(v=>v.trim()).filter(Boolean) : ['advanceDays', 'targetCount'].includes(key) ? (/^\d{1,2}$/.test(text) ? Number(text) : text) : text || (['dueDateKey', 'dueTime', 'dateKey', 'monthDay'].includes(key) ? null : '') })} style={{ fontSize: 13, color: c.textPrimary, padding: 7, backgroundColor: c.surface, borderRadius: 6 }} />}</> : value !== null && value !== '' ? <Text selectable style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{labels[key]}：{typeof value === 'boolean' ? value ? '是' : '否' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text> : null}
    </View>) : null}
    {receipt && receipt.entity.kind !== 'checkin' ? <TargetLabel id={receipt.entity.id} type={`${receipt.entity.kind}.read`} /> : 'id' in command ? <TargetLabel id={command.id} type={command.type} /> : null}
    {command.type === 'task.complete' ? <Text style={{ fontSize: 12, color: c.textSecondary }}>{command.completed ? '标记完成' : '恢复未完成'}</Text> : null}
    {command.type === 'activity.start' && command.habitId ? <TargetLabel id={command.habitId} type="habit.checkin" /> : null}
    {proposal?.source_refs && proposal.source_refs !== '[]' ? <Text style={{ fontSize: 11, color: c.textMuted }}>依据本轮读取的原文版本；接受时重新核对版本。</Text> : null}
    {pending && !receipt ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {editing ? button('保存修改', () => void act(async () => { await domain.editProposal(proposal.id, proposal.revision, draft, { actor: 'ui' }); setEditing(false); })) : button('修改', () => { setDraft({ ...command }); setEditing(true); })}
      {!editing ? button('确认保存', () => void act(async () => { setReceipt(await domain.acceptProposal(proposal.id, proposal.revision, { actor: 'ui', operationId: Crypto.randomUUID() })); })) : button('取消修改', () => setEditing(false))}
      {!editing ? button('拒绝', () => void act(async () => { await domain.rejectProposal(proposal.id, proposal.revision, { actor: 'ui' }); })) : null}
    </View> : null}
    {receipt?.entity.kind === 'reminder' ? <Text style={{ fontSize: 11, lineHeight: 18, color: c.textMuted }}>规则已保存，系统排程和权限请在本地提醒中查看。</Text> : null}
    {receipt ? button(receipt.entity.kind === 'memory' ? '在助手配置查看记忆' : receipt.entity.kind === 'activity' ? '查看活动计划' : '查看记录', () => receipt.entity.kind === 'reminder' ? navigation.navigate('settings', { reminderNonce: String(Date.now()) }) : receipt.entity.kind === 'memory' ? navigation.navigate('settings', { assistantNonce: String(Date.now()) }) : receipt.entity.kind === 'activity' ? navigation.navigate('settings', { dailyNonce: String(Date.now()) }) : receipt.entity.kind === 'record' ? navigation.navigate('memos', { recordNonce:String(Date.now()), recordId:receipt.entity.id }) : navigation.navigate(receipt.entity.kind === 'memo' ? 'memos' : receipt.entity.kind === 'task' ? 'tasks' : 'habits')) : null}
    {error || result.message ? <Text style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{error || result.message}</Text> : null}
  </View>;
}
function savedSummary(command: Command): string {
  if (command.type === 'habit.create' || command.type === 'habit.update') return `${command.name} · ${{daily:'每天', weekly:'每周', monthly:'每月'}[command.cadence]}${command.targetCount}次`;
  if (command.type === 'habit.checkin' || command.type === 'activity.complete') return command.note || '已记录本次完成。';
  if ('title' in command) return [command.title, 'body' in command ? command.body.slice(0, 160) : 'note' in command ? command.note : ''].filter(Boolean).join('\n');
  if ('content' in command) return command.content.slice(0, 160);
  return '';
}
function TargetLabel({ id, type }: { id: string; type: string }) {
  const { theme } = useHabits(); const [name, setName] = useState('正在读取目标…');
  useEffect(() => {
    let active = true;
    const table = type.startsWith('memo.') ? 'documents' : type.startsWith('record.') ? 'local_records' : type.startsWith('task.') ? 'tasks' : type.startsWith('memory.') ? 'local_memories' : type.startsWith('activity.') ? 'local_activities' : type.startsWith('reminder.') ? 'local_reminder_rules' : 'habits';
    void database.getOptional<Record<string, string>>(`SELECT * FROM ${table} WHERE id=?`, [id]).then(row => { if (active) setName(row ? row.title || row.name || row.key || '记录' : '目标已不存在'); }).catch(() => { if (active) setName('目标暂时无法读取'); });
    return () => { active = false; };
  }, [id, type]);
  return <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>目标：{name}</Text>;
}
function MemoGroupField({ editing, value, onChange }: { editing: boolean; value: string | null; onChange(id: string | null): void }) {
  const { theme } = useHabits(); const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { let active = true; void domain.listMemoGroups().then(rows => { if (active) setGroups(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  return <View style={{ gap: 5 }}><Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>分类：{value === null ? '未分类' : groups.find(g => g.id === value)?.name ?? '分类暂时无法读取'}</Text>{editing ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{[{ id: null, name: '未分类' }, ...groups].map(group => <Pressable key={group.id ?? 'none'} accessibilityLabel={'选择分类 ' + group.name} onPress={() => onChange(group.id)} style={{ padding: 7 }}><Text style={{ fontSize: 12, color: theme.colors.primary }}>{group.id === value ? '✓ ' : ''}{group.name}</Text></Pressable>)}</View> : null}</View>;
}

function RecordPayloadField({editing,value,onChange}:{editing:boolean;value:unknown;onChange(value:unknown):void}){const parsed=tablePayloadSchema.safeParse(value);if(!parsed.success)return null;return editing?<RecordTableEditor value={parsed.data} onChange={onChange}/>:<RecordTableView table={parsed.data}/>;}
