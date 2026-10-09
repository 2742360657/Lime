import {SafeAreaView} from 'react-native-safe-area-context';
import {database,localDate,type DocumentContent} from '../assistant/database';
import { Alert,Pressable,KeyboardAvoidingView,Platform } from 'react-native';
import { useCallback, useEffect, useMemo, useState,useRef } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { GroupManagerModal } from '../components/GroupManagerModal';
import { GroupPickerModal } from '../components/GroupPickerModal';
import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TextEntryModal } from '../components/TextEntryModal';
import { useBackHandler } from '../navigation/back';
import type { NavigationTarget } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import Animated from 'react-native-reanimated';

import { LIST_ITEM_ENTERING, LIST_ITEM_EXITING, LIST_LAYOUT } from '../theme/animation';
import { useHabits } from '../state/HabitStore';
import { Memo } from '../types/habit';

const UNCATEGORIZED_FILTER = 'uncategorized';

export function MemosScreen() {
  const navigation = useNavigation<any>();
  const {
    activeMemos,
    trashedMemos,
    memoGroups,
    theme,
    addMemo,
    updateMemo,
    trashMemos,
    moveMemosToGroup,
    reorderMemos,
    deleteMemoGroup: removeMemoGroup,
    addMemoGroup,
    renameMemoGroup,
    reorderMemoGroups,
  } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const closeEditor=useRef<()=>void>(()=>{});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manageVisible, setManageVisible] = useState(false);
  const [newGroupVisible, setNewGroupVisible] = useState(false);

  const orderedGroups = useMemo(
    () => [...memoGroups].sort((left, right) => left.order - right.order),
    [memoGroups]
  );

  const baseList = useMemo(
    () =>
      [...activeMemos].sort(
        (left, right) => left.order - right.order || right.updatedAt - left.updatedAt
      ),
    [activeMemos]
  );

  const list = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return baseList.filter((memo) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === UNCATEGORIZED_FILTER
            ? memo.groupId === null
            : memo.groupId === filter;
      if (!matchesFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const groupName = orderedGroups.find((group) => group.id === memo.groupId)?.name ?? '未分类';
      return `${memo.title}\n${memo.body}\n${groupName}`.toLowerCase().includes(keyword);
    });
  }, [baseList, filter, orderedGroups, query]);

  const editingMemo = editingId ? activeMemos.find((memo) => memo.id === editingId) ?? null : null;

  const groupLabel = (groupId: string | null) =>
    orderedGroups.find((group) => group.id === groupId)?.name ?? '未分类';

  const groupOptions = useMemo(
    () => [
      { id: null, label: '未分类' },
      ...orderedGroups.map((group) => ({ id: group.id, label: group.name })),
    ],
    [orderedGroups]
  );

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];

  useBackHandler(
    useCallback(() => {
      setSelectedIds([]);
      setSelectMode(false);
      return true;
    }, []),
    selectMode
  );

  const createMemo = async () => {
    const groupId =
      filter !== 'all' && filter !== UNCATEGORIZED_FILTER ? filter : null;
    try{setEditingId(await addMemo(groupId));}catch{Alert.alert('未能创建','本机保存未完成，请重试。');}
  };

  if (selectMode) {
    return (
      <MultiSelectBoard
        title="整理备忘录"
        onClose={() => { setSelectMode(false); setSelectedIds([]); }}
        items={list.map((memo) => ({
          id: memo.id,
          groupId: memo.groupId ?? UNCATEGORIZED_FILTER,
          label: memo.title || '未命名备忘录',
          subtitle: memo.body.trim().slice(0, 40) || '暂无正文',
          leading: (
            <SelectCircle
              checked={selectedIds.includes(memo.id)}
              accessibilityLabel={`选择 ${memo.title || '未命名备忘录'}`}
              onPress={() => setSelectedIds((current) => toggleId(current, memo.id))}
            />
          ),
        }))}
        groups={[
          { id: UNCATEGORIZED_FILTER, title: '未分类', acceptsDrop: true },
          ...orderedGroups.map((group) => ({ id: group.id, title: group.name, acceptsDrop: true })),
        ]}
        selectedIds={selectedIds}
        onSetSelection={setSelectedIds}
        onCommit={(ordered) => {
          ordered.forEach((entry) => {
            moveMemosToGroup(
              [entry.id],
              entry.groupId === UNCATEGORIZED_FILTER ? null : entry.groupId
            );
          });
          for (const groupId of new Set(ordered.map((entry) => entry.groupId))) {
            reorderMemos(groupId === UNCATEGORIZED_FILTER ? null : groupId,
              ordered.filter((entry) => entry.groupId === groupId).map((entry) => entry.id));
          }
        }}
        onDelete={(ids) => {
          trashMemos(ids);
          setSelectedIds([]);
          setSelectMode(false);
        }}
        groupOptions={groupOptions}
        onMoveToGroup={moveMemosToGroup}
        moveTitle="移动到分类"
        deleteLabel="删除"
      />
    );
  }

  return (
    <ScreenScaffold
      panelTitle="备忘录分类"
      panelItems={[
        { id: 'all', label: `全部备忘录 · ${activeMemos.length}`, selected: filter === 'all', onPress: () => setFilter('all') },
        { id: UNCATEGORIZED_FILTER, label: `未分类 · ${activeMemos.filter((memo) => memo.groupId === null).length}`, selected: filter === UNCATEGORIZED_FILTER, onPress: () => setFilter(UNCATEGORIZED_FILTER) },
        ...orderedGroups.map((group) => ({
          id: group.id,
          label: `${group.name} · ${activeMemos.filter((memo) => memo.groupId === group.id).length}`,
          selected: filter === group.id,
          onPress: () => setFilter(group.id),
        })),
        { id: 'add-group', label: '＋ 新建分类', onPress: () => setNewGroupVisible(true) },
        { id: 'manage-group', label: '管理分类', onPress: () => setManageVisible(true) },
        {
          id: 'trash',
          label: `回收站 · ${trashedMemos.length}`,
          bottom: true,
          onPress: () => navigation.navigate('trash'),
        },
      ]}
      fab={selectMode ? null : { label: '新建备忘录', onPress:()=>void createMemo() }}
    >
      {/* 编辑器用原生 Modal + slide 转场，与待办/习惯的编辑器保持一致；
          onRequestClose 让系统返回键等待本机保存。 */}
      {editingMemo ? (
        <Modal
          visible
          animationType="slide"
          onRequestClose={()=>closeEditor.current()}
        >
          <MemoEditor
            registerClose={fn=>{closeEditor.current=fn;}}
            memo={editingMemo}
            initialGroupId={editingMemo.groupId}
            groupOptions={groupOptions}
            onClose={() => setEditingId(null)}
            onChange={(patch,revision,base) => updateMemo(editingMemo.id, patch,revision,base)}
            onQuote={async()=>{setEditingId(null);const doc=await database.get<{revision:number}>('SELECT revision FROM documents WHERE id=?',[editingMemo.id]);navigation.navigate('assistant',{documentId:editingMemo.id,quoteNonce:String(Date.now()),documentRevision:doc.revision});}}
          />
        </Modal>
      ) : null}
      <View style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            accessibilityLabel="搜索备忘录"
            placeholder="搜索标题、正文或分类"
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={styles.search}
          />

          {list.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>还没有备忘录</Text>
              <Text style={styles.emptyHint}>点右下角 + 新建，可以写标题和正文。</Text>
            </View>
          ) : (
            <Animated.View layout={LIST_LAYOUT} style={styles.list}>
              {list.map((memo) => (
                <Animated.View
                  key={memo.id}
                  entering={LIST_ITEM_ENTERING}
                  exiting={LIST_ITEM_EXITING}
                  layout={LIST_LAYOUT}
                >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`打开 ${memo.title || '未命名备忘录'}`}
                  onPress={() => setEditingId(memo.id)}
                  onLongPress={() => setSelectMode(true)}
                  delayLongPress={360}
                  style={styles.card}
                >
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {memo.title || '未命名备忘录'}
                  </Text>
                  <Text numberOfLines={2} style={styles.cardBody}>
                    {memo.body.trim() || '暂无正文'}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {groupLabel(memo.groupId)} · {formatMemoTime(memo.updatedAt)}
                  </Text>
                </TouchableOpacity>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </ScrollView>

        <TextEntryModal
          visible={newGroupVisible}
          title="新建分类"
          placeholder="分类名称"
          submitLabel="保存"
          onClose={() => setNewGroupVisible(false)}
          onSubmit={addMemoGroup}
        />
        <GroupManagerModal
          visible={manageVisible}
          onClose={() => setManageVisible(false)}
          title="管理分类"
          groups={orderedGroups}
          onAdd={addMemoGroup}
          onRename={renameMemoGroup}
          onDelete={removeMemoGroup}
          onReorder={reorderMemoGroups}
          usageLabel={(groupId) => `${activeMemos.filter((memo) => memo.groupId === groupId).length} 条`}
          deleteConfirmText={(name, usage) =>
            `删除分类“${name}”？其中 ${usage} 条备忘录会移到未分类。`
          }
        />
      </View>
    </ScreenScaffold>
  );
}

function formatMemoTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** Saving and drafting share the canonical document; no JSON-only memo editor. */
function MemoEditor({registerClose,memo,initialGroupId,groupOptions,onClose,onChange,onQuote}:{
 registerClose:(fn:()=>void)=>void;memo:Memo;initialGroupId:string|null;groupOptions:{id:string|null;label:string}[];onClose:()=>void;
 onChange:(patch:Partial<Pick<Memo,'title'|'body'|'groupId'>>,revision?:number,base?:DocumentContent)=>Promise<number>;onQuote:()=>Promise<void>;
}) {
 const {theme}=useHabits(),c=theme.colors;
 const [value,setValue]=useState({title:memo.title,body:memo.body,groupId:initialGroupId}),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[picker,setPicker]=useState(false);
 const base=useRef<DocumentContent>({title:memo.title,body:memo.body,date:memo.date??localDate(),group_id:memo.groupId});
 const current=useRef(value),revision=useRef(memo.revision??1),queue=useRef<Promise<void>>(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
 useEffect(()=>{database.getOptional<{title:string;body:string;group_id:string|null;base_revision:number|null;base_content:string|null}>('SELECT * FROM local_drafts WHERE id=? AND kind=\'memo\'',[memo.id]).then(d=>{if(d&&mounted.current){const next={title:d.title,body:d.body,groupId:d.group_id};current.current=next;setValue(next);revision.current=d.base_revision??memo.revision??1;if(d.base_content)base.current=JSON.parse(d.base_content);}}).catch(()=>setStatus('草稿暂时无法读取'));return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 const enqueue=(action:()=>Promise<void>)=>{queue.current=queue.current.catch(()=>{}).then(action);return queue.current;};
 async function save(snapshot:typeof value){revision.current=await onChange(snapshot,revision.current,base.current);base.current={...base.current,title:snapshot.title,body:snapshot.body,group_id:snapshot.groupId};await database.execute('UPDATE local_drafts SET base_revision=?,base_content=? WHERE id=?',[revision.current,JSON.stringify(base.current),memo.id]);}
 function change(field:keyof typeof value,text:string|null){const snapshot={...current.current,[field]:text} as typeof value;current.current=snapshot;setValue(snapshot);setStatus('正在保存…');
  enqueue(async()=>{await database.execute('INSERT OR REPLACE INTO local_drafts(id,document_id,kind,title,body,date,group_id,base_revision,base_content) VALUES(?,?,?,?,?,?,?,?,?)',[memo.id,memo.id,'memo',snapshot.title,snapshot.body,memo.date??localDate(),snapshot.groupId,revision.current,JSON.stringify(base.current)]);}).catch(()=>setStatus('草稿保存失败，请保留页面'));
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{enqueue(async()=>{await save(snapshot);if(mounted.current)setStatus('已保存到本机');}).catch(()=>{if(mounted.current)setStatus('保存未完成，草稿仍保留');});},800);
 }
 async function close(quote=false){if(busy)return;setBusy(true);if(timer.current)clearTimeout(timer.current);
  try{await enqueue(async()=>{await save(current.current);await database.execute('DELETE FROM local_drafts WHERE id=?',[memo.id]);});if(quote)await onQuote();else onClose();}
  catch{let persisted=false;try{const v=current.current;await database.execute('INSERT OR REPLACE INTO local_drafts(id,document_id,kind,title,body,date,group_id,base_revision,base_content) VALUES(?,?,?,?,?,?,?,?,?)',[memo.id,memo.id,'memo',v.title,v.body,memo.date??localDate(),v.groupId,revision.current,JSON.stringify(base.current)]);persisted=true;}catch{}
   setStatus(persisted?'未能保存，草稿已保留':'草稿也未能保存，请保留页面');Alert.alert('保存未完成',persisted?'输入已保留，可在恢复副本中另存后比较。':'本机草稿保存失败，请保留页面并重试。',[{text:'继续编辑'},...(persisted?[{text:'保留草稿并返回',onPress:onClose}]:[])]);
  }finally{if(mounted.current)setBusy(false);}
 }
 registerClose(()=>void close());
 // The enclosing native Modal forwards Android Back through the same save path.
 return <SafeAreaView style={{flex:1,backgroundColor:c.surface}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={{paddingHorizontal:18,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:16,borderBottomWidth:0.5,borderColor:c.border}}>
   <Pressable accessibilityLabel="返回备忘录列表" disabled={busy} onPress={()=>void close()} style={{paddingVertical:10}}><Text style={{fontSize:14,color:c.primary}}>{busy?'保存中…':'完成'}</Text></Pressable><Text style={{flex:1,fontSize:16,textAlign:'center',color:c.textPrimary}}>备忘录</Text>
   <Pressable accessibilityLabel="备忘录操作" disabled={busy} onPress={()=>Alert.alert('备忘录操作','',[{text:'引用到聊天',onPress:()=>void close(true)},{text:'取消'}])}><Text style={{fontSize:20,color:c.textSecondary}}>⋯</Text></Pressable>
  </View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,flexGrow:1}}>
   <TextInput accessibilityLabel="备忘录标题" editable={!busy} maxLength={300} value={value.title} onChangeText={v=>change('title',v)} placeholder="标题（可选）" placeholderTextColor={c.textMuted} style={{fontSize:18,color:c.textPrimary,paddingVertical:10}}/>
   <Pressable accessibilityLabel="选择分类" disabled={busy} onPress={()=>setPicker(true)} style={{paddingVertical:8}}><Text style={{fontSize:12,color:c.textSecondary}}>{groupOptions.find(g=>g.id===value.groupId)?.label??'未分类'} ▾</Text></Pressable>
   <TextInput accessibilityLabel="备忘录正文" editable={!busy} multiline maxLength={100000} value={value.body} onChangeText={v=>change('body',v)} placeholder="开始记录…" placeholderTextColor={c.textMuted} style={{flex:1,minHeight:270,fontSize:15,lineHeight:25,textAlignVertical:'top',paddingVertical:12,color:c.textPrimary}}/>
  </ScrollView>
  <Text style={{fontSize:11,color:c.textMuted,paddingHorizontal:20,paddingVertical:8}}>{memo.revision!==revision.current||memo.title!==base.current.title||memo.body!==base.current.body||memo.groupId!==base.current.group_id?'原文已更新，保存前需要处理版本变化':status||'输入后自动保存'}</Text>
  <GroupPickerModal visible={picker} title="选择分类" options={groupOptions} nullLabel="未分类" selectedGroupId={value.groupId} onClose={()=>setPicker(false)} onSubmit={id=>{change('groupId',id);setPicker(false);}}/>
 </KeyboardAvoidingView></SafeAreaView>;
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screenOuter: { flex: 1 },
    screen: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 150, gap: 16 },
    search: {
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.medium,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    list: { gap: 9 },
    card: {
      borderRadius: theme.radius.medium,
      padding: 16,
      gap: 6,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
    cardBody: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
    cardMeta: { fontSize: 11, color: theme.colors.textMuted },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 6,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
    emptyHint: { fontSize: 12, color: theme.colors.textSecondary },
    backLink: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12 },
    backLinkText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
    editorContent: { padding: 20, gap: 14, paddingBottom: 80 },
    titleInput: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      paddingVertical: 6,
    },
    groupField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: theme.radius.medium,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    groupFieldLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    groupFieldValue: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
    bodyInput: {
      minHeight: 340,
      fontSize: 15,
      lineHeight: 24,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.medium,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
  });
}
