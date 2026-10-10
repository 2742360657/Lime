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

const labels: Record<string, string> = { title: '标题', note: '备注 / 感受', content: '记忆内容', key: '记忆名称', kind: '类型', dueDateKey: '日期 YYYY-MM-DD', dueTime: '时间 HH:mm', mode: '模式 once / annual', dateKey: '单次日期 YYYY-MM-DD', monthDay: '年度公历月日 MM-DD', time: '上海时间 HH:mm', advanceDays: '提前天数 0到30', dayOf: '当天提醒', enabled: '启用规则' };
const names: Record<Command['type'], string> = { 'task.create': '新增待办', 'task.update': '修改待办', 'task.complete': '待办完成状态', 'task.trash': '移入回收站', 'habit.checkin': '习惯打卡', 'memory.remember': '记住事实 / 偏好', 'memory.correct': '更正记忆', 'memory.forget': '忘记记忆', 'activity.start': '记录活动计划', 'activity.complete': '完成活动', 'activity.cancel': '取消活动', 'reminder.create': '新增提醒规则', 'reminder.update': '修改提醒规则', 'reminder.cancel': '停用提醒规则' };
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
    {!receipt ? Object.entries(command).filter(([key]) => labels[key]).map(([key, value]) => <View key={key} style={{ gap: 3 }}>
      {editing ? <><Text style={{ fontSize: 11, color: c.textMuted }}>{labels[key]}</Text>{typeof value === 'boolean' ? <Switch accessibilityLabel={labels[key]} value={Boolean(draft[key])} onValueChange={checked => setDraft({ ...draft, [key]: checked })} /> : <TextInput accessibilityLabel={labels[key]} multiline={key === 'content' || key === 'note'} value={String(draft[key] ?? '')} onChangeText={text => setDraft({ ...draft, [key]: key === 'advanceDays' ? (/^\d{1,2}$/.test(text) ? Number(text) : text) : text || (['dueDateKey', 'dueTime', 'dateKey', 'monthDay'].includes(key) ? null : '') })} style={{ fontSize: 13, color: c.textPrimary, padding: 7, backgroundColor: c.surface, borderRadius: 6 }} />}</> : value !== null && value !== '' ? <Text selectable style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{labels[key]}：{typeof value === 'boolean' ? value ? '是' : '否' : String(value)}</Text> : null}
    </View>) : null}
    {receipt && receipt.entity.kind !== 'checkin' ? <TargetLabel id={receipt.entity.id} type={`${receipt.entity.kind}.read`} /> : 'id' in command ? <TargetLabel id={command.id} type={command.type} /> : null}
    {command.type === 'task.complete' ? <Text style={{ fontSize: 12, color: c.textSecondary }}>{command.completed ? '标记完成' : '恢复未完成'}</Text> : null}
    {command.type === 'activity.start' && command.habitId ? <TargetLabel id={command.habitId} type="habit.checkin" /> : null}
    {proposal?.source_refs && proposal.source_refs !== '[]' ? <Text style={{ fontSize: 11, color: c.textMuted }}>依据本轮选择的原文版本；接受时重新核对版本。</Text> : null}
    {pending && !receipt ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {editing ? button('保存修改', () => void act(async () => { await domain.editProposal(proposal.id, proposal.revision, draft, { actor: 'ui' }); setEditing(false); })) : button('修改', () => { setDraft({ ...command }); setEditing(true); })}
      {!editing ? button('确认保存', () => void act(async () => { setReceipt(await domain.acceptProposal(proposal.id, proposal.revision, { actor: 'ui', operationId: Crypto.randomUUID() })); })) : button('取消修改', () => setEditing(false))}
      {!editing ? button('拒绝', () => void act(async () => { await domain.rejectProposal(proposal.id, proposal.revision, { actor: 'ui' }); })) : null}
    </View> : null}
    {receipt?.entity.kind === 'reminder' ? <Text style={{ fontSize: 11, lineHeight: 18, color: c.textMuted }}>规则已保存，系统排程和权限请在本地提醒中查看。</Text> : null}
    {receipt ? button(receipt.entity.kind === 'memory' ? '在助手配置查看记忆' : '查看记录', () => receipt.entity.kind === 'reminder' ? navigation.navigate('settings', { reminderNonce: String(Date.now()) }) : navigation.navigate(receipt.entity.kind === 'task' ? 'tasks' : receipt.entity.kind === 'memory' ? 'settings' : 'habits')) : null}
    {error || result.message ? <Text style={{ fontSize: 12, lineHeight: 19, color: c.textSecondary }}>{error || result.message}</Text> : null}
  </View>;
}
function TargetLabel({ id, type }: { id: string; type: string }) {
  const { theme } = useHabits(); const [name, setName] = useState('正在读取目标…');
  useEffect(() => {
    let active = true;
    const table = type.startsWith('task.') ? 'tasks' : type.startsWith('memory.') ? 'local_memories' : type.startsWith('activity.') ? 'local_activities' : type.startsWith('reminder.') ? 'local_reminder_rules' : 'habits';
    void database.getOptional<Record<string, string>>(`SELECT * FROM ${table} WHERE id=?`, [id]).then(row => { if (active) setName(row ? row.title || row.name || row.key || '记录' : '目标已不存在'); }).catch(() => { if (active) setName('目标暂时无法读取'); });
    return () => { active = false; };
  }, [id, type]);
  return <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>目标：{name}</Text>;
}
