import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useHabits } from '../state/HabitStore';
import { shanghaiDate, DAY } from '../reminders/planner';
import { ActivityManager } from './ActivityManager';
import { dailyService } from './index';
import { type TrainingHistory } from './service';

type Candidate = { id: string; title: string; revision: number; group_id: string | null };
type BatchView = Awaited<ReturnType<typeof dailyService.getOrganizationBatch>>;
export function DailyToolsModal({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { theme } = useHabits(), c = theme.colors;
  const [activityBusy,setActivityBusy] = useState(false);
  const [tab,setTab] = useState<'activities' | 'training' | 'organize'>('activities'), [busy,setBusy] = useState(false);
  const [from,setFrom] = useState(shanghaiDate(Date.now() - 29 * DAY)), [through,setThrough] = useState(shanghaiDate(Date.now()));
  const [kind,setKind] = useState(''), [history,setHistory] = useState<TrainingHistory | null>(null);
  const [entity,setEntity] = useState<'memo' | 'task'>('memo'), [candidates,setCandidates] = useState<Candidate[]>([]);
  const [selected,setSelected] = useState<Candidate[]>([]), [groups,setGroups] = useState<{ id:string; name:string }[]>([]), [groupId,setGroupId] = useState<string | null>(null);
  const [batches,setBatches] = useState<BatchView[]>([]), [moreHistory,setMoreHistory] = useState(false), [preview,setPreview] = useState<BatchView | null>(null), [loaded,setLoaded] = useState(false);
  const running = useRef(false), generation = useRef(0), alive = useRef(false);
  useEffect(() => {
    if (!visible) return;
    alive.current = true; const current = ++generation.current;
    let active = true;
    setSelected([]); setPreview(null); setHistory(null); setLoaded(false); setBusy(running.current);
    Promise.all([dailyService.listOrganizationCandidates(entity),dailyService.listMemoGroups(),dailyService.listOrganizationBatches()])
      .then(([rows,g,b]) => { if (active && current === generation.current) { setCandidates(rows); setGroups(g); setBatches(b); setMoreHistory(b.length === 50); setLoaded(true); } })
      .catch(() => { if (active) Alert.alert('读取未完成','记录仍保留，请关闭后重试。'); });
    return () => { active = false; alive.current = false; generation.current++; };
  },[visible,entity]);
  useEffect(() => { if (visible) setTab('activities'); }, [visible]);
  async function refresh() {
    const current = generation.current;
    const [rows,b] = await Promise.all([dailyService.listOrganizationCandidates(entity),dailyService.listOrganizationBatches()]);
    if (alive.current && current === generation.current) { setCandidates(rows); setBatches(b); setMoreHistory(b.length === 50); }
  }
  async function perform(fn: (current: () => boolean) => Promise<void>) {
    if (running.current) return; running.current = true; setBusy(true);
    const current = generation.current, active = () => alive.current && current === generation.current;
    try { await fn(active); } catch (error) { if (active()) Alert.alert('未完成',error instanceof Error ? error.message : '记录仍保留，请重试。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function choose(row: Candidate) {
    if (selected.some(item => item.id === row.id)) setSelected(items => items.filter(item => item.id !== row.id));
    else if (selected.length < 20) setSelected(items => [...items,row]);
    else Alert.alert('已选20条','请减少选择后继续。');
  }
  const button = (label:string,action:()=>void,disabled=false) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} disabled={busy || activityBusy || disabled} style={{ padding:10,opacity:busy || activityBusy || disabled ? 0.4 : 1 }}><Text style={{ fontSize:13,color:c.primary }}>{label}</Text></Pressable>;
  const muted = { color:c.textSecondary,fontSize:12,lineHeight:19 };
  const input = { borderColor:c.border,borderWidth:1,borderRadius:6,padding:9,color:c.textPrimary,fontSize:14,backgroundColor:c.surface };
  const statusLabel = { active:'计划中',completed:'已完成',cancelled:'已取消' };
  const groupName = (id:string | null) => id ? groups.find(row => row.id === id)?.name ?? '原分类' : '未分类';
  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy && !activityBusy) preview ? setPreview(null) : onClose(); }}>
    <SafeAreaView style={{ flex:1,backgroundColor:c.background }}>
      <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:c.border,paddingHorizontal:8 }}>
        {button(preview ? '返回整理' : '关闭日用记录',()=>preview ? setPreview(null) : onClose())}
        <Text style={{ fontSize:14,fontWeight:'600',color:c.textPrimary }}>日用记录与整理</Text><View style={{ width:30 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding:16,gap:12 }}>
        <View style={{ flexDirection:'row',flexWrap:'wrap' }}>{button(tab === 'activities' ? '活动计划 ✓' : '活动计划',()=>{ setTab('activities'); setPreview(null); setHistory(null); })}{button(tab === 'training' ? '训练依据 ✓' : '训练依据',()=>{ setTab('training'); setPreview(null); })}{button(tab === 'organize' ? '可恢复整理 ✓' : '可恢复整理',()=>setTab('organize'))}</View>
        <View style={{ display:tab === 'activities' ? 'flex' : 'none' }}><ActivityManager visible={visible && tab === 'activities'} onBusyChange={setActivityBusy} /></View>
        {tab === 'activities' ? null : tab === 'training' ? <>
          <Text style={muted}>查询活动及习惯打卡。留空类型时显示通用活动；填写保存活动时使用的类型，例如 training 或训练。</Text>
          <Text style={muted}>起止日期（上海时间，最多366天）</Text>
          <View style={{ flexDirection:'row',gap:8 }}><TextInput accessibilityLabel="训练起始日期" value={from} onChangeText={value=>{ setFrom(value); setHistory(null); }} editable={!busy} maxLength={10} style={[input,{ flex:1 }]} /><TextInput accessibilityLabel="训练结束日期" value={through} onChangeText={value=>{ setThrough(value); setHistory(null); }} editable={!busy} maxLength={10} style={[input,{ flex:1 }]} /></View>
          <TextInput accessibilityLabel="训练活动类型" value={kind} onChangeText={value=>{ setKind(value); setHistory(null); }} editable={!busy} maxLength={60} placeholder="全部活动类型" placeholderTextColor={c.textSecondary} style={input} />
          {button('查询记录依据',()=>void perform(async active=>{ const result=await dailyService.readTrainingHistory({ from,through,...(kind.trim() ? { kind:kind.trim() } : {}),limit:100 }); if (active()) setHistory(result); }))}
          {history ? <>
            <Text style={muted}>{history.from} 至 {history.through}{history.kind ? ` · 类型：${history.kind}` : ' · 全部活动类型'}</Text>
            <Text style={muted}>{history.basis}</Text>
            <Text style={muted}>范围内计划中 {history.statusCounts.active} · 已完成 {history.statusCounts.completed} · 已取消 {history.statusCounts.cancelled}</Text>
            <Text style={muted}>活动 {history.activityCoverage.returned}/{history.activityCoverage.matched}，{history.activityCoverage.complete ? '此范围完整' : '已截断'}；打卡 {history.checkinCoverage.returned}/{history.checkinCoverage.matched}，{history.checkinCoverage.complete ? '此范围完整' : '已截断'}。</Text>
            {history.activities.map(row=><View key={row.id} style={{ paddingVertical:8,borderBottomWidth:1,borderBottomColor:c.border,gap:3 }}>
              <Text style={{ fontSize:14,color:c.textPrimary }}>{row.title} · {statusLabel[row.status]}</Text>
              <Text style={muted}>{row.kind} · 开始于{shanghaiDate(row.created_at)}{row.completed_at ? ` · 结束于${shanghaiDate(row.completed_at)}` : ''}</Text>
              {row.note ? <Text style={muted}>{row.note}</Text> : null}{row.completion_note ? <Text style={muted}>完成记录：{row.completion_note}</Text> : null}
              <Text style={muted}>{row.habit_name ? `关联习惯：${row.habit_name} · ` : ''}{row.checkin_state === 'linked' ? '已有对应打卡' : row.checkin_state === 'missing' ? '对应打卡已不存在' : '未关联打卡'}</Text>
            </View>)}
            {history.checkins.map(row=><View key={row.id} style={{ paddingVertical:6,gap:3 }}><Text style={{ fontSize:13,color:c.textPrimary }}>{row.date_key} · {row.habit_name ?? '原习惯'}打卡{row.linked_activities ? ' · 活动关联记录' : ''}</Text>{row.note ? <Text style={muted}>{row.note}</Text> : null}</View>)}
            {!history.activities.length && !history.checkins.length ? <Text style={muted}>这个范围没有相应记录。</Text> : null}
          </> : null}
        </> : preview ? <>
          <Text style={{ fontSize:14,fontWeight:'600',color:c.textPrimary }}>{preview.status === 'preview' ? '核对本次整理' : preview.status === 'applied' ? '整理已保存' : preview.status === 'undone' ? '整理已撤销' : '恢复的整理历史'}</Text>
          <Text style={muted}>{preview.plan.type === 'memo.move' ? `将${preview.before.length}条备忘录移动到“${groupName(preview.plan.groupId)}”` : `将${preview.before.length}条待办移入可恢复整理记录`}</Text>
          {preview.before.map(row=><Text key={row.id} style={{ fontSize:13,lineHeight:21,color:c.textPrimary }}>• {row.title || '未命名'}{row.entity === 'memo' ? `（${groupName(row.groupId)}）` : ''}</Text>)}
          {preview.status === 'preview' ? button('确认这批整理',()=>void perform(async active=>{ await dailyService.confirmOrganization(preview.id,preview.revision,{ actor:'ui' }); if (!active()) return; setSelected([]); await refresh(); const result=await dailyService.getOrganizationBatch(preview.id); if (active()) setPreview(result); })) : null}
          {preview.status === 'applied' ? button('撤销这批整理',()=>void perform(async active=>{ await dailyService.undoOrganization(preview.id,preview.revision,{ actor:'ui' }); if (!active()) return; await refresh(); const result=await dailyService.getOrganizationBatch(preview.id); if (active()) setPreview(result); })) : null}
          <Text style={muted}>{preview.status === 'restored' ? '恢复保留审计内容；这条历史不能执行或撤销。' : '关闭后可以在整理历史中重开。撤销前会核对记录版本，后续修改会阻止覆盖。'}</Text>
        </> : <>
          <Text style={muted}>先选最多20条记录，预览后再确认。备忘录只移动分类，待办只移入可恢复记录；原文保留。</Text>
          <View style={{ flexDirection:'row' }}>{button(entity === 'memo' ? '备忘录 ✓' : '备忘录',()=>setEntity('memo'))}{button(entity === 'task' ? '待办 ✓' : '待办',()=>setEntity('task'))}</View>
          {entity === 'memo' ? <><Text style={muted}>目标分类</Text><View style={{ flexDirection:'row',flexWrap:'wrap' }}>{button(groupId === null ? '未分类 ✓' : '未分类',()=>setGroupId(null))}{groups.map(g=><View key={g.id}>{button(`${g.name}${groupId === g.id ? ' ✓' : ''}`,()=>setGroupId(g.id))}</View>)}</View></> : null}
          <Text style={muted}>已选择 {selected.length}/20；当前显示最多100条，更多记录可从原页面整理。</Text>
          {candidates.map(row=><Pressable key={row.id} accessibilityRole="checkbox" accessibilityState={{ checked:selected.some(item=>item.id === row.id) }} accessibilityLabel={`选择${entity === 'memo' ? '备忘录' : '待办'} ${row.title}`} disabled={busy || (entity === 'memo' && row.group_id === groupId)} onPress={()=>choose(row)} style={{ paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,opacity:entity === 'memo' && row.group_id === groupId ? 0.45 : 1 }}><Text style={{ fontSize:14,color:c.textPrimary }}>{selected.some(item=>item.id === row.id) ? '☑ ' : '□ '}{row.title || '未命名'}{entity === 'memo' ? ` · ${groupName(row.group_id)}` : ''}</Text></Pressable>)}
          {button('预览所选整理',()=>void perform(async active=>{ const result=await dailyService.previewOrganization({ type:entity === 'memo' ? 'memo.move' : 'task.trash',targets:selected.map(row=>({ id:row.id,expectedRevision:row.revision })),...(entity === 'memo' ? { groupId } : {}) },{ actor:'ui',batchId:Crypto.randomUUID() }); if (active()) setPreview(result); }),!loaded || !selected.length)}
          <Text style={{ fontSize:14,fontWeight:'600',color:c.textPrimary }}>整理历史</Text>
          {batches.length ? batches.map(row=><View key={row.id}>{button(`${new Date(row.created_at).toLocaleDateString()} · ${row.before.length}条${row.plan.type === 'memo.move' ? '备忘录' : '待办'} · ${row.status === 'preview' ? '待确认' : row.status === 'applied' ? '可撤销' : row.status === 'undone' ? '已撤销' : '恢复历史'}`,()=>setPreview(row))}</View>) : <Text style={muted}>还没有整理记录。</Text>}
          {moreHistory ? button('更多整理历史',()=>void perform(async active=>{ const last=batches[batches.length-1]; const older=await dailyService.listOrganizationBatches({ before:{ createdAt:last.created_at,id:last.id } }); if (active()) { setBatches(rows=>[...rows,...older]); setMoreHistory(older.length === 50); } })) : null}
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
