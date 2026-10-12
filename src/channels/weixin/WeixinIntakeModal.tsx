import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHabits } from '../../state/HabitStore';
import { database } from '../../storage/database';
import { materialStore } from '../../materials/service';
import { MaterialViewer } from '../../materials/MaterialViewer';
import type { Material } from '../../materials/store';
import type { IntakeItem } from './intake';
import { weixinService, weixinErrorText } from './service';
import { QrCode } from './QrCode';

const stateText: Record<string, string> = { pending: '消息尚未完整', deleted: '已撤回', unsupported: '类型暂不支持', superseded: '较早版本' };
const qrText: Record<string, string> = { wait: '等待扫码，请扫码后再查询。', scaned: '已扫码，请在微信确认后再次查询。', confirmed: '绑定成功，可以手动读取消息。', expired: '二维码已过期，请重新获取。', need_verifycode: '请输入微信显示的验证码后再次查询。', verify_code_blocked: '验证次数过多，请稍后重新获取。', scaned_but_redirect: '已切换微信服务区域，请再次查询。', binded_redirect: '绑定发生变化，请重新获取二维码。' };
export function WeixinIntakeModal({ visible, onClose, onPick, onSend, remaining = 4 }: { visible: boolean; onClose(): void; onPick?(material: Material): void; onSend?(materials: Material[]): void; remaining?: number }) {
  const { theme } = useHabits(), c = theme.colors;
  const [bound, setBound] = useState(false), [items, setItems] = useState<IntakeItem[]>([]), [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(''), [qrStatus, setQrStatus] = useState(''), [code, setCode] = useState(''), [message, setMessage] = useState(''), [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const alive = useRef(false), running = useRef(false), generation = useRef(0);
  useEffect(() => {
    if (!visible) return;
    alive.current = true; const current = ++generation.current;
    setQr(''); setQrStatus(''); setCode(''); setMessage(''); setBusy(running.current); setSelected([]);
    const refresh = async () => {
      const [isBound, rows] = await Promise.all([weixinService.bound(), weixinService.list()]);
      if (alive.current && generation.current === current) { setBound(isBound); setItems(rows); }
    };
    void refresh().catch(() => { if (alive.current) setMessage('收件状态暂时无法读取，请重开窗口。'); });
    const dispose = database.onChange({ onChange: () => void refresh().catch(() => {}) }, { tables: ['local_weixin_items'] });
    return () => { alive.current = false; generation.current++; weixinService.close(); dispose(); };
  }, [visible]);
  async function run(fn: (active: () => boolean) => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage(''); const current = generation.current;
    try { await fn(() => alive.current && generation.current === current); }
    catch (error) { if (alive.current && generation.current === current) setMessage(weixinErrorText(error)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const close = () => { weixinService.close(); setQr(''); setCode(''); setPreview(null); setSelected([]); onClose(); };
  const toggleSelect = (materialId: string) => setSelected(prev => prev.includes(materialId) ? prev.filter(id => id !== materialId) : [...prev, materialId]);
  async function sendSelected() {
    if (!onSend || !selected.length) return;
    const materials: Material[] = [];
    for (const id of selected) { const m = await materialStore.get(id); if (m && !m.deleted && m.status === 'ready') materials.push(m); }
    if (!materials.length) { setMessage('选中的材料暂不能分析，请确认已保存且格式受支持。'); return; }
    onSend(materials); close();
  }
  const button = (label: string, fn: () => void, disabled = false, duringBusy = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy && !duringBusy} onPress={fn} style={{ padding: 9, opacity: disabled || busy && !duringBusy ? 0.4 : 1 }}><Text style={{ color: c.primary, fontSize: 12 }}>{label}</Text></Pressable>;
  const requestQr = () => void run(async active => { setQr(''); setCode(''); const value = await weixinService.requestQr(); if (active()) { setQr(value); setQrStatus('wait'); } });
  const unbind = () => Alert.alert('解除微信绑定', '本机收件历史和已保存原件保留。未保存的附件需重新绑定后转发。', [
    { text: '取消', style: 'cancel' }, { text: '解除绑定', style: 'destructive', onPress: () => { if (alive.current) void run(async active => { await weixinService.unbind(); if (active()) { setBound(false); setQr(''); setQrStatus(''); setMessage('已解除绑定，本机内容保留。'); } }); } },
  ]);
  async function pick(item: IntakeItem, active: () => boolean) {
    const material = item.material_id ? await materialStore.get(item.material_id) : null;
    if (!material || material.deleted) throw new Error();
    if (!active()) return;
    if (material.status !== 'ready') { setMessage('当前文件格式仅保存原件，暂不能供助手分析。'); return; }
    onPick?.(material); close();
  }
  return <Modal visible={visible} animationType="slide" onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>{button('关闭微信收件', close, false, true)}<Text style={{ color: c.textPrimary, fontSize: 14 }}>微信收件</Text>{busy ? button('停止收件操作', weixinService.cancel, false, true) : <View style={{ width: 70 }} />}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 10 }}>
      <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 19 }}>把文本、图片或文件发送给绑定的微信机器人，再到这里手动读取。已保存内容在本机材料中，勾选后点"发给助手处理"自动分析。长时间离线可能无法补收，过期附件请重新转发。</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><Text style={{ color: c.textPrimary, fontSize: 13 }}>{bound ? '已绑定微信' : '尚未绑定微信'}</Text>{button(bound ? '更新微信绑定' : '获取绑定二维码', requestQr)}{bound ? button('解除微信绑定', unbind) : null}</View>
      {qr ? <View style={{ gap: 8 }}>
        <QrCode value={qr} />
        <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 19 }}>用微信扫一扫；同一手机可截图后从扫一扫相册识别。确认后点“查询扫码状态”。二维码仅在当前窗口保留。</Text>
        {qrStatus === 'need_verifycode' ? <TextInput accessibilityLabel="微信绑定验证码" value={code} onChangeText={setCode} keyboardType="number-pad" secureTextEntry maxLength={12} placeholder="微信显示的验证码" placeholderTextColor={c.textMuted} style={{ color: c.textPrimary, borderWidth: 1, borderColor: c.border, padding: 10 }} /> : null}
        {button('查询扫码状态', () => void run(async active => { const status = await weixinService.confirmQr(code); if (active()) { setQrStatus(status); setMessage(qrText[status] ?? '请重新获取二维码。'); if (['confirmed','expired','verify_code_blocked','binded_redirect'].includes(status)) { setQr(''); setCode(''); } const boundNow = await weixinService.bound(); if (active()) setBound(boundNow); } }))}
      </View> : null}
      {button('读取微信消息', () => void run(async active => { const result = await weixinService.read(); const rows = await weixinService.list(); if (active()) { setItems(rows); setMessage(`本次保存${result.saved}条消息，重复${result.duplicates}条。附件需逐件保存。`); } }), !bound)}
      {busy ? <Text style={{ color: c.textMuted, fontSize: 12 }}>正在处理，可停止；进入后台后停止网络操作。</Text> : null}
      {message ? <Text accessibilityLabel="微信收件提示" style={{ color: c.textSecondary, fontSize: 12, lineHeight: 19 }}>{message}</Text> : null}
      {items.map(item => <View key={item.id} style={{ borderBottomWidth: 1, borderColor: c.border, paddingVertical: 8, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          {item.material_id ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.material_id) }} accessibilityLabel={'选择 ' + item.filename} onPress={() => toggleSelect(item.material_id!)} style={{ paddingTop: 2 }}><Text style={{ fontSize: 15, color: selected.includes(item.material_id) ? c.primary : c.textMuted }}>{selected.includes(item.material_id) ? '☑' : '☐'}</Text></Pressable> : null}
          <Text style={{ flex: 1, color: c.textPrimary, fontSize: 13 }}>{item.filename}</Text>
        </View>
        {item.body ? <Text selectable numberOfLines={6} style={{ color: c.textSecondary, fontSize: 13, lineHeight: 20 }}>{item.body}</Text> : null}
        <Text style={{ color: c.textMuted, fontSize: 11 }}>{item.created_at ? new Date(item.created_at).toLocaleString() + ' · ' : ''}{stateText[item.state] ?? (item.material_id ? '已保存到本机材料' : item.status === 'restored' ? '恢复的收件历史' : item.kind === 'unsupported' ? '类型暂不支持' : '尚未保存到材料')}</Text>
        {item.note ? <Text style={{ color: c.textMuted, fontSize: 11, lineHeight: 17 }}>{item.note}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {item.material_id ? <>{button('查看原件', () => setPreview(item.material_id))}{onPick ? button('选中 ' + item.filename, () => void run(active => pick(item, active)), remaining <= 0) : null}</> : button(item.status === 'error' ? '重试保存 ' + item.filename : '保存到材料 ' + item.filename, () => void run(async active => { await weixinService.save(item.id); const rows = await weixinService.list(); if (active()) { setItems(rows); setMessage('已保存到本机材料，可以查看原件或在聊天中选用。'); } }), item.state !== 'complete' || item.status === 'restored' || item.kind === 'unsupported')}
        </View>
      </View>)}
      {!items.length ? <Text style={{ color: c.textMuted, fontSize: 13 }}>还没有收件记录。</Text> : null}
      <Text style={{ color: c.textMuted, fontSize: 11 }}>显示最近200件内容。完整收件历史可随设置中的数据包导出。</Text>
    </ScrollView>
    {onSend && selected.length > 0 ? <View style={{ padding: 12, borderTopWidth: 1, borderColor: c.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`发给助手处理，已选${selected.length}件`} onPress={() => void sendSelected()} style={{ alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: c.primary }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>发给助手处理（已选 {selected.length} 件）</Text>
      </Pressable>
    </View> : null}
    <MaterialViewer id={preview} onClose={() => setPreview(null)} />
  </SafeAreaView></Modal>;
}
