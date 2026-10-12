import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useHabits } from '../state/HabitStore';
import type { TablePayload, CellKind, Cell } from './model';
const labels: Record<CellKind, string> = { text: '文字', decimal: '数值', date: '日期', boolean: '是/否' };
export function RecordTableEditor({ value, onChange, disabled = false }: {
    value: TablePayload;
    onChange(value: TablePayload): void;
    disabled?: boolean;
}) {
    const { theme } = useHabits(), c = theme.colors;
    const button = (label: string, fn: () => void, blocked = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || blocked} onPress={fn} style={{ padding: 8, opacity: disabled || blocked ? 0.4 : 1 }}><Text style={{ fontSize: 12, color: c.primary }}>{label}</Text></Pressable>;
    const input = { fontSize: 13, color: c.textPrimary, borderWidth: 1, borderColor: c.border, padding: 8, borderRadius: 5 };
    const cell = (index: number, key: string, entry: Cell) => onChange({ ...value, rows: value.rows.map((row, i) => i === index ? { ...row, [key]: entry } : row) });
    return <View style={{ gap: 8 }}>
  {value.columns.map((column, index) => <View key={column.key} style={{ gap: 5, padding: 7, borderWidth: 1, borderColor: c.border }}>
   <TextInput accessibilityLabel={'列名称 ' + (index + 1)} value={column.label} editable={!disabled} maxLength={80} onChangeText={label => onChange({ ...value, columns: value.columns.map(c => c.key === column.key ? { ...c, label } : c) })} style={input}/>
   <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(Object.keys(labels) as CellKind[]).map(kind => <View key={kind}>{button(labels[kind] + (column.kind === kind ? ' ✓' : ''), () => onChange({ ...value, columns: value.columns.map(c => c.key === column.key ? { ...c, kind } : c) }), value.rows.some(row => row[column.key] !== null && row[column.key] !== undefined) && column.kind !== kind)}</View>)}</View>
   <TextInput accessibilityLabel={'数值单位 ' + (index + 1)} value={column.unit} editable={!disabled} maxLength={40} onChangeText={unit => onChange({ ...value, columns: value.columns.map(c => c.key === column.key ? { ...c, unit } : c) })} placeholder="单位（可空）" placeholderTextColor={c.textMuted} style={input}/>
   {button('删除资料列 ' + (index + 1), () => Alert.alert('删除列', '这一列及对应内容将从草稿移除。保存后才生效。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => onChange({ ...value, columns: value.columns.filter(c => c.key !== column.key), rows: value.rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== column.key))) }) }]))}
  </View>)}
  {button('添加资料列', () => { const key = 'c' + Crypto.randomUUID().replace(/-/g, '').slice(0, 12); onChange({ ...value, columns: [...value.columns, { key, label: '新列', kind: 'text', unit: '' }], rows: value.rows.map(row => ({ ...row, [key]: null })) }); }, value.columns.length >= 24)}
  {value.rows.map((row, index) => <View key={index} style={{ gap: 5, padding: 8, borderWidth: 1, borderColor: c.border }}><Text style={{ fontSize: 12, color: c.textSecondary }}>第{index + 1}行</Text>{value.columns.map(column => <View key={column.key}><Text style={{ fontSize: 12, color: c.textSecondary }}>{column.label}{column.unit ? ' · ' + column.unit : ''}</Text>{column.kind === 'boolean' ? <View style={{ flexDirection: 'row' }}>{button('未填写' + (row[column.key] === null ? ' ✓' : ''), () => cell(index, column.key, null))}{button('是' + (row[column.key] === true ? ' ✓' : ''), () => cell(index, column.key, true))}{button('否' + (row[column.key] === false ? ' ✓' : ''), () => cell(index, column.key, false))}</View> : <TextInput accessibilityLabel={`资料第${index + 1}行 ${column.label}`} editable={!disabled} value={String(row[column.key] ?? '')} onChangeText={entry => cell(index, column.key, entry === '' ? null : entry)} maxLength={column.kind === 'text' ? 2000 : 40} style={input}/>}</View>)}{button('删除资料行 ' + (index + 1), () => Alert.alert('删除行', '这一行将从草稿移除。保存后才生效。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => onChange({ ...value, rows: value.rows.filter((_, i) => i !== index) }) }]))}</View>)}
  {button('添加资料行', () => onChange({ ...value, rows: [...value.rows, Object.fromEntries(value.columns.map(c => [c.key, null]))] }), !value.columns.length || value.rows.length >= 200)}
 </View>;
}
