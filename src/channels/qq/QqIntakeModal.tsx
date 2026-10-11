import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHabits } from '../../state/HabitStore';
import { database } from '../../storage/database';
import { materialStore } from '../../materials/service';
import { MaterialViewer } from '../../materials/MaterialViewer';
import type { Material } from '../../materials/store';
import { QrCode } from '../weixin/QrCode';
import type { QqIntakeItem } from './intake';
import { qqService, qqErrorText } from './service';

export function QqIntakeModal({ visible, onClose, onPick, remaining = 4 }: { visible: boolean; onClose(): void; onPick?(material: Material): void; remaining?: number }) {
  const { theme } = useHabits(), c = theme.colors;
  const [bound, setBound] = useState(false), [items, setItems] = useState<QqIntakeItem[]>([]), [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(''), [message, setMessage] = useState(''), [preview, setPreview] = useState<string | null>(null);
  const alive = useRef(false), running = useRef(false), generation = useRef(0);
  useEffect(() => {
    if (!visible) return;
    alive.current = true; const current = ++generation.current;
    setQr(''); setMessage(''); setBusy(running.current);
    const refresh = async () => {
      const [isBound, rows] = await Promise.all([qqService.bound(), qqService.list()]);
      if (alive.current && generation.current === current) { setBound(isBound); setItems(rows); }
    };
    void refresh().catch(() => { if (alive.current && generation.current === current) setMessage('QQ收件状态暂时无法读取，请重开窗口。'); });
    const dispose = database.onChange({ onChange: () => void refresh().catch(() => {}) }, { tables: ['local_qq_items'] });
    return () => { alive.current = false; generation.current++; qqService.close(); dispose(); };
  }, [visible]);
  async function run(fn: (active: () => boolean) => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage(''); const current = generation.current;
    try { await fn(() => alive.current && generation.current === current); }
    catch (error) { if (alive.current && generation.current === current) setMessage(qqErrorText(error)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const close = () => { alive.current = false; generation.current++; qqService.close(); setQr(''); setPreview(null); onClose(); };
  const button = (label: string, fn: () => void, disabled = false, duringBusy = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy && !duringBusy} onPress={fn} style={{ padding: 9, opacity: disabled || busy && !duringBusy ? 0.4 : 1 }}><Text style={{ color: c.primary, fontSize: 12 }}>{label}</Text></Pressable>;
  const requestQr = () => void run(async active => { setQr(''); const value = await qqService.requestQr(); if (active()) setQr(value); });
  const unbind = () => Alert.alert('解除QQ绑定', '本机收件历史和已保存原件保留。未保存的附件需重新绑定后转发。', [
    { text: '取消', style: 'cancel' }, { text: '解除绑定', style: 'destructive', onPress: () => { if (alive.current) void run(async active => { await qqService.unbind(); const rows = await qqService.list(); if (active()) { setBound(false); setQr(''); setItems(rows); setMessage('已解除绑定，本机历史和材料保留。'); } }); } },
  ]);
  async function pick(item: QqIntakeItem, active: () => boolean) {
    const material = item.material_id ? await materialStore.get(item.material_id) : null;
    if (!material || material.deleted) throw new Error();
    if (!active()) return;
    if (material.status !== 'ready') { setMessage('当前格式已保留原件，暂不能供助手分析。'); return; }
    onPick?.(material); close();
  }
  const stateText = (item: QqIntakeItem) => item.state === 'superseded' ? '较早版本' : item.material_id ? '已保存到本机材料' : item.status === 'restored' ? '恢复的收件历史' : item.state === 'unsupported' ? '本次内容未能读取' : item.status === 'error' ? '这一件未保存' : '尚未保存到材料';
  return <Modal visible={visible} animationType="slide" onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>{button('关闭QQ收件', close, false, true)}<Text style={{ color: c.textPrimary, fontSize: 14 }}>QQ收件</Text>{busy ? button('停止QQ收件操作', qqService.cancel, false, true) : <View style={{ width: 70 }} />}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 10 }}>
      <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 19 }}>向绑定的QQ机器人发送文字、图片或文件，然后在这里手动读取约60秒。只收绑定本人发给机器人的内容。关闭期间可能漏收，读取失败或附件过期时请重新转发，也可直接导入文件。保存材料后，选中并发给助手才分析。</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><Text style={{ color: c.textPrimary, fontSize: 13 }}>{bound ? '已绑定QQ' : '尚未绑定QQ'}</Text>{button(bound ? '更新QQ绑定' : '获取QQ绑定二维码', requestQr)}{bound ? button('解除QQ绑定', unbind) : null}</View>
      {qr ? <View style={{ gap: 8 }}><QrCode value={qr} label="QQ绑定二维码"/><Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 19 }}>用QQ扫一扫，确认后回到这里查询。二维码仅在当前窗口保留约五分钟。</Text>{button('查询QQ扫码状态', () => void run(async active => {
        const status = await qqService.confirmQr(); const isBound = await qqService.bound();
        if (active()) { setBound(isBound); if (status === 2 || status === 3) setQr(''); setMessage(status === 2 ? 'QQ绑定成功，可以手动读取。' : status === 3 ? '二维码已过期，请重新获取。' : '等待QQ扫码确认，请确认后再次查询。'); }
      }))}</View> : null}
      {button('读取QQ消息', () => void run(async active => {
        const result = await qqService.read(), rows = await qqService.list();
        if (active()) { setItems(rows); setMessage(`本次登记${result.saved}条消息，重复${result.duplicates}条。${result.mode === 'new' ? '已建立新连接，关闭期间的消息可能无法补收。' : '已恢复短期连接，未收到的内容请重新转发。'}附件需逐件保存。`); }
      }), !bound)}
      {busy ? <Text style={{ color: c.textMuted, fontSize: 12 }}>正在处理，可停止；进入后台后停止网络操作。</Text> : null}
      {message ? <Text accessibilityLabel="QQ收件提示" style={{ color: c.textSecondary, fontSize: 12, lineHeight: 19 }}>{message}</Text> : null}
      {items.map(item => <View key={item.id} style={{ borderBottomWidth: 1, borderColor: c.border, paddingVertical: 8, gap: 6 }}>
        <Text style={{ color: c.textPrimary, fontSize: 13 }}>{item.filename}</Text>
        {item.body ? <Text selectable numberOfLines={6} style={{ color: c.textSecondary, fontSize: 13, lineHeight: 20 }}>{item.body}</Text> : null}
        <Text style={{ color: c.textMuted, fontSize: 11 }}>{item.created_at ? new Date(item.created_at).toLocaleString() + ' · ' : ''}{stateText(item)}</Text>
        {item.note ? <Text style={{ color: c.textMuted, fontSize: 11, lineHeight: 17 }}>{item.note}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {item.material_id ? <>{button('查看原件', () => setPreview(item.material_id))}{onPick ? button('选中 ' + item.filename, () => void run(active => pick(item, active)), remaining <= 0) : null}</> : button(item.status === 'error' ? '重试保存 ' + item.filename : '保存到材料 ' + item.filename, () => void run(async active => {
            await qqService.save(item.id); const rows = await qqService.list();
            if (active()) { setItems(rows); setMessage('已保存到本机材料，可以查看原件或在聊天中选用。'); }
          }), item.state !== 'complete' || item.status === 'restored' || item.kind === 'unsupported' || item.kind === 'media' && !item.capability_id)}
        </View>
      </View>)}
      {!items.length ? <Text style={{ color: c.textMuted, fontSize: 13 }}>还没有QQ收件记录。</Text> : null}
      <Text style={{ color: c.textMuted, fontSize: 11 }}>显示最近200件内容。完整收件历史与已保存原件由设置中的完整数据包保留。</Text>
    </ScrollView>
    <MaterialViewer id={preview} onClose={() => setPreview(null)} />
  </SafeAreaView></Modal>;
}
