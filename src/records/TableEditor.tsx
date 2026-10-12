import { Pressable, Text, TextInput, View } from 'react-native';
import { useHabits } from '../state/HabitStore';
import type { TablePayload, Cell } from './model';
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
  {value.rows.map((row, index) => <View key={index} style={{ gap: 5, padding: 8, borderWidth: 1, borderColor: c.border }}><Text style={{ fontSize: 12, color: c.textSecondary }}>第{index + 1}行</Text>{value.columns.map(column => <View key={column.key}><Text style={{ fontSize: 12, color: c.textSecondary }}>{column.label}{column.unit ? ' · ' + column.unit : ''}</Text>{column.kind === 'boolean' ? <View style={{ flexDirection: 'row' }}>{button('未填写' + (row[column.key] === null ? ' ✓' : ''), () => cell(index, column.key, null))}{button('是' + (row[column.key] === true ? ' ✓' : ''), () => cell(index, column.key, true))}{button('否' + (row[column.key] === false ? ' ✓' : ''), () => cell(index, column.key, false))}</View> : <TextInput accessibilityLabel={`资料第${index + 1}行 ${column.label}`} editable={!disabled} value={String(row[column.key] ?? '')} onChangeText={entry => cell(index, column.key, entry === '' ? null : entry)} maxLength={column.kind === 'text' ? 2000 : 40} style={input}/>}</View>)}</View>)}

 </View>;
}
