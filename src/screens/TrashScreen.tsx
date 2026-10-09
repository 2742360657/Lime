import {FlatList,Pressable,Text,View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useHabits} from '../state/HabitStore';
export function TrashScreen(){
 const {trashedMemos,memoGroups,restoreMemos,theme}=useHabits(),navigation=useNavigation<any>(),c=theme.colors;
 return <ScreenScaffold panelTitle="备忘录回收站" panelItems={[{id:'back',label:'返回备忘录',onPress:()=>navigation.navigate('memos')}]}>
  <FlatList data={trashedMemos} keyExtractor={m=>m.id} contentContainerStyle={{padding:18,gap:12}} ListHeaderComponent={<View style={{gap:8,paddingBottom:12}}><Text style={{fontSize:18,color:c.textPrimary}}>已删除备忘录</Text><Text style={{fontSize:12,lineHeight:20,color:c.textMuted}}>原文和服务器历史保留，点击记录可以恢复。</Text></View>} ListEmptyComponent={<Text style={{fontSize:14,color:c.textMuted}}>回收站是空的</Text>} renderItem={({item})=><Pressable accessibilityLabel={'恢复 '+(item.title||'未命名备忘录')} onPress={()=>restoreMemos([item.id])} style={{paddingVertical:14,borderBottomWidth:0.5,borderColor:c.border,gap:5}}><Text numberOfLines={1} style={{fontSize:15,color:c.textPrimary}}>{item.title||'未命名备忘录'}</Text><Text numberOfLines={2} style={{fontSize:13,lineHeight:20,color:c.textSecondary}}>{item.body}</Text><Text style={{fontSize:11,color:c.textMuted}}>{memoGroups.find(g=>g.id===item.groupId)?.name||'未分类'} · 恢复</Text></Pressable>}/>
 </ScreenScaffold>;
}
