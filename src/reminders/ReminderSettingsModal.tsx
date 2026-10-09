import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { database } from '../storage/database';
import { domain } from '../domain';
import { dateKeyAt } from '../domain/commands';
import { useHabits } from '../state/HabitStore';
import { requestReminderPermission, reminderService } from './native';
import { DAY, shanghaiDate, type ReminderRow } from './planner';

export function ReminderSettingsModal({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { theme } = useHabits(), c = theme.colors;
  const status = useSyncExternalStore(reminderService.subscribe, reminderService.getSnapshot, reminderService.getSnapshot);
  const [rules, setRules] = useState<ReminderRow[]>([]), [settings, setSettings] = useState({ enabled: false, taskEnabled: false });
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [editor, setEditor] = useState<ReminderRow | 'new' | null>(null);
  const [title, setTitle] = useState(''), [note, setNote] = useState(''), [mode, setMode] = useState<'once' | 'annual'>('once');
  const [date, setDate] = useState(''), [monthDay, setMonthDay] = useState(''), [time, setTime] = useState('09:00');
  const [advance, setAdvance] = useState('7'), [dayOf, setDayOf] = useState(true), [enabled, setEnabled] = useState(true);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoaded(false); setEditor(null);
    const refresh = () => { void Promise.all([reminderService.settings(), domain.listReminders({ limit: 100 })]).then(([s, r]) => { if (active) { setSettings(s); setRules(r); setLoaded(true); } }).catch(() => { if (active) Alert.alert('读取未完成', '提醒规则仍保留，请关闭后重试。'); }); };
    refresh(); void reminderService.refresh();
    const dispose = database.onChange({ onChange: refresh }, { tables: ['local_reminder_rules', 'local_meta'] });
    return () => { active = false; dispose(); };
  }, [visible]);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { Alert.alert('未完成', e instanceof Error ? e.message : '内容仍保留，请重试。'); }
    finally { setBusy(false); }
  }
  function edit(row: ReminderRow | 'new') {
    const r = row === 'new' ? null : row;
    setTitle(r?.title ?? ''); setNote(r?.note ?? ''); setMode(r?.mode ?? 'once');
    setDate(r?.date_key ?? shanghaiDate(Date.now() + DAY)); setMonthDay(r?.month_day ?? shanghaiDate(Date.now()).slice(5));
    setTime(r?.time ?? '09:00'); setAdvance(String(r?.advance_days ?? 7)); setDayOf(r ? Boolean(r.day_of) : true); setEnabled(r ? Boolean(r.enabled) : true); setEditor(row);
  }
  async function save() {
    const numericAdvance = Number(advance);
    if (mode === 'annual' && (!/^\d{1,2}$/.test(advance) || numericAdvance > 30)) throw new Error('提前天数填写0到30；0表示不提前提醒。');
    await domain.execute({ type: editor === 'new' ? 'reminder.create' : 'reminder.update',
      ...(editor && editor !== 'new' ? { id: editor.id, expectedRevision: editor.revision } : {}),
      title, note, mode, dateKey: mode === 'once' ? date : null, monthDay: mode === 'annual' ? monthDay : null,
      time, advanceDays: mode === 'annual' ? numericAdvance : 0, dayOf: mode === 'once' || dayOf, enabled,
    }, { actor: 'ui', operationId: Crypto.randomUUID() });
    setEditor(null); await reminderService.refresh();
  }
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || (!loaded && label !== '关闭提醒')} onPress={action} style={{ paddingHorizontal: 8, paddingVertical: 10, opacity: busy || (!loaded && label !== '关闭提醒') ? 0.4 : 1 }}><Text style={{ fontSize: 13, color: c.primary }}>{label}</Text></Pressable>;
  const label = { fontSize: 12, lineHeight: 19, color: c.textSecondary };
  const input = { fontSize: 14, padding: 9, borderWidth: 1, borderColor: c.border, borderRadius: 7, color: c.textPrimary, backgroundColor: c.surface };
  function pickDate() {
    const value = new Date(`${mode === 'annual' ? `2000-${monthDay}` : date}T12:00:00`);
    DateTimePickerAndroid.open({ value: Number.isFinite(value.getTime()) ? value : new Date(), mode: 'date',
      onChange: (event, selected) => { if (event.type === 'set' && selected) mode === 'annual' ? setMonthDay(dateKeyAt(selected.getTime()).slice(5)) : setDate(dateKeyAt(selected.getTime())); } });
  }
  function pickTime() {
    const value = new Date(`2000-01-01T${time}:00`);
    DateTimePickerAndroid.open({ value: Number.isFinite(value.getTime()) ? value : new Date(), mode: 'time', is24Hour: true,
      onChange: (event, selected) => { if (event.type === 'set' && selected) setTime(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`); } });
  }
  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) editor ? setEditor(null) : onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderBottomColor: c.border, borderBottomWidth: 1 }}>
        {button(editor ? '返回提醒' : '关闭提醒', () => editor ? setEditor(null) : onClose())}
        <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>{editor ? '编辑提醒' : '本地提醒'}</Text>
        {button(editor ? '保存提醒' : '新建提醒', () => editor ? void perform(save) : edit('new'))}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
        {editor ? <>
          <Text style={label}>名称</Text><TextInput accessibilityLabel="提醒名称" value={title} onChangeText={setTitle} maxLength={100} style={input} />
          <View style={{ flexDirection: 'row' }}>{button(mode === 'once' ? '单次 ✓' : '单次', () => setMode('once'))}{button(mode === 'annual' ? '每年公历 ✓' : '每年公历', () => setMode('annual'))}</View>
          <Text style={label}>{mode === 'once' ? '日期 YYYY-MM-DD' : '公历月日 MM-DD（不支持农历）'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><TextInput accessibilityLabel="提醒日期" value={mode === 'once' ? date : monthDay} onChangeText={mode === 'once' ? setDate : setMonthDay} maxLength={10} style={[input, { flex: 1 }]} />{button('选日期', pickDate)}</View>
          <Text style={label}>时间 HH:mm · 上海时间</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><TextInput accessibilityLabel="提醒时间" value={time} onChangeText={setTime} maxLength={5} style={[input, { flex: 1 }]} />{button('选时间', pickTime)}</View>
          {mode === 'annual' ? <><Text style={label}>提前几天（0到30）</Text><TextInput accessibilityLabel="提前天数" keyboardType="number-pad" value={advance} onChangeText={setAdvance} maxLength={2} style={input} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={label}>当天也提醒</Text><Switch accessibilityLabel="当天提醒" value={dayOf} onValueChange={setDayOf} disabled={busy} /></View>
          </> : null}
          <Text style={label}>备注</Text><TextInput accessibilityLabel="提醒备注" value={note} onChangeText={setNote} maxLength={300} multiline style={input} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={label}>启用此规则</Text><Switch accessibilityLabel="启用此规则" value={enabled} onValueChange={setEnabled} disabled={busy} /></View>
          {editor !== 'new' && editor.enabled ? button('停用这条提醒', () => void perform(async () => { await domain.execute({ type: 'reminder.cancel', id: editor.id, expectedRevision: editor.revision }, { actor: 'ui', operationId: Crypto.randomUUID() }); setEditor(null); await reminderService.refresh(); })) : null}
        </> : <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={label}>开启系统提醒</Text><Switch accessibilityLabel="开启系统提醒" value={settings.enabled} disabled={busy || !loaded} onValueChange={value => void perform(async () => { if (value) await requestReminderPermission(); await reminderService.setSetting('enabled', value); })} /></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={label}>待办到期提醒</Text><Switch accessibilityLabel="待办到期提醒" value={settings.taskEnabled} disabled={busy || !loaded} onValueChange={value => void perform(() => reminderService.setSetting('tasks', value))} /></View>
          <Text style={label}>{status.error || (status.busy ? '正在核对系统排程…' : !settings.enabled ? '系统提醒已关闭，规则仍保留。' : !status.allowed ? '通知权限或提醒渠道未开启；规则已保存，但尚不能显示系统提醒。' : `当前已预排 ${status.scheduled} 条系统提醒。`)}</Text>
          <Text style={label}>日期均按上海时间。无具体时间的待办默认09:00；仅排未来400天、最多128条，偶尔打开应用续排。系统省电可能延迟。{status.deferred > 0 ? `当前有${status.deferred}条超过容量，等待续排。` : ''}</Text>
          <View style={{ flexDirection: 'row' }}>{button('重新核对', () => void perform(() => reminderService.refresh()))}{settings.enabled && !status.allowed ? button('通知设置', () => void Linking.openSettings().catch(() => Alert.alert('请手动打开系统设置', '找到酸橙的通知权限。'))) : null}</View>
          {rules.length ? rules.map(rule => <Pressable key={rule.id} accessibilityRole="button" accessibilityLabel={`编辑提醒 ${rule.title}`} onPress={() => edit(rule)} disabled={busy} style={{ paddingVertical: 10, gap: 4, borderBottomColor: c.border, borderBottomWidth: 1 }}>
            <Text style={{ fontSize: 14, color: c.textPrimary }}>{rule.title}{rule.enabled ? '' : ' · 已停用'}</Text>
            <Text style={label}>{rule.mode === 'once' ? rule.date_key : `每年${rule.month_day}`} {rule.time}{rule.advance_days ? ` · 提前${rule.advance_days}天` : ''}{rule.mode === 'annual' && rule.day_of ? ' · 当天' : ''}</Text>
          </Pressable>) : <Text style={label}>还没有独立提醒，可以新建，或在聊天中让助手提出提醒建议。</Text>}
          {rules.length >= 100 ? <Text style={label}>当前展示最近100条规则，助手查询也有数量上限。</Text> : null}
          <Text style={label}>2月29日仅闰年提醒。当前基础记录导出不包含提醒规则，完整导出将在后续补齐。</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
