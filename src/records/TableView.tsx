import { ScrollView, View, Text } from 'react-native';
import { useHabits } from '../state/HabitStore';
import {tablePayloadSchema} from './model';
import type { TablePayload } from './model';
export function RecordTableView({ table }: {
    table: TablePayload;
}) { const { theme } = useHabits(); return <ScrollView horizontal><View>{table.rows.map((row, index) => <View key={index} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.colors.border }}>{table.columns.map(c => <Text selectable key={c.key} style={{ fontSize: 13, lineHeight: 21, color: theme.colors.textPrimary }}>{c.label}：{row[c.key] === null || row[c.key] === undefined ? '未填写' : typeof row[c.key] === 'boolean' ? row[c.key] ? '是' : '否' : String(row[c.key])}{c.unit ? ' ' + c.unit : ''}</Text>)}</View>)}</View></ScrollView>; }

export function RecordSourceView({body}:{body:string}) {
  const {theme}=useHabits();
  let source: {typeKey?:string;body?:string;payload?:unknown}|null=null;
  try {source=JSON.parse(body);}catch {}
  const table=tablePayloadSchema.safeParse(source?.payload);
  return <View style={{gap:8}}>
    {source?.typeKey?<Text style={{fontSize:12,color:theme.colors.textSecondary}}>{source.typeKey}</Text>:null}
    <Text selectable style={{fontSize:14,lineHeight:23,color:theme.colors.textPrimary}}>{source&&typeof source.body==='string'?source.body:body}</Text>
    {table.success?<RecordTableView table={table.data}/>:null}
  </View>;
}
