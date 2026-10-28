import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../components/ThemedAlert';
import { useAppActions, useMemos, useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';

import { useNavigation } from '@react-navigation/native';
import { ItemActionSheet } from '../components/ItemActionSheet';
import { OrganizePanel } from '../components/OrganizePanel';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SelectCircle } from '../components/SelectCircle';
import type { NavigationTarget } from '../navigation/types';

/** 回收站：默认删除的备忘录会先进这里，从这里删除才是真正删除。 */
export function TrashScreen() {
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void }>();
  const { trashedMemos, memoGroups } = useMemos();
  const theme = useTheme();
  const { restoreMemos, purgeMemos, purgeAllMemos } = useAppActions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** 长按直接进入整理模式，并预选被长按的那一条。 */
  const [actionMemoId, setActionMemoId] = useState<string | null>(null);
  const actionMemo = trashedMemos.find((memo) => memo.id === actionMemoId) ?? null;

  const scrollYRef = useRef(0);
  const [organizeScrollY, setOrganizeScrollY] = useState(0);

  const enterSelectMode = (id: string) => {
    setOrganizeScrollY(scrollYRef.current);
    setSelectedIds([id]);
    setSelectMode(true);
  };



  const groupTitle = (groupId: string | null) =>
    memoGroups.find((group) => group.id === groupId)?.name ?? '未分类';

  return (
    <ScreenScaffold
      organizing={selectMode}
      panelTitle="回收站"
      panelItems={[
        { id: 'back', label: '返回备忘录', onPress: () => navigation.navigate('memos') },
        ...(trashedMemos.length > 0
          ? [
              {
                id: 'empty',
                label: `清空回收站 · ${trashedMemos.length}`,
                bottom: true,
                onPress: () => Alert.alert('清空回收站？', `将永久删除 ${trashedMemos.length} 条备忘录，无法恢复。`, [{ text: '取消', style: 'cancel' }, { text: '永久删除', style: 'destructive', onPress: purgeAllMemos }]),
              },
            ]
          : []),
      ]}
    >
      <View style={styles.screen}>
        {selectMode ? (
          <OrganizePanel
            title="整理回收站"
            allowSort={false}
            initialScrollY={organizeScrollY}
            onClose={() => { setSelectMode(false); setSelectedIds([]); }}
            items={trashedMemos.map((memo) => ({
              id: memo.id,
              groupId: '__trash__',
              label: memo.title || '未命名备忘录',
              subtitle: `原分类：${groupTitle(memo.groupId)}`,
              leading: (
                <SelectCircle checked={selectedIds.includes(memo.id)} accessibilityLabel={`选择 ${memo.title || '未命名备忘录'}`} />
              ),
            }))}
            groups={[{ id: '__trash__', title: '回收站', acceptsDrop: false }]}
            selectedIds={selectedIds}
            onSetSelection={setSelectedIds}
            onCommit={() => {}}
            onDelete={(ids) => {
              purgeMemos(ids);
              setSelectedIds([]);
              setSelectMode(false);
            }}
            deleteLabel="彻底删除"
          />
        ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => { scrollYRef.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          <View style={styles.header}>
            <Text style={styles.count}>{trashedMemos.length} 条已删除</Text>
            {trashedMemos.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="批量整理回收站"
                onPress={() => setSelectMode(true)}
                style={styles.action}
              >
                <Text style={styles.actionText}>批量删除</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.hint}>在回收站删除的备忘录无法恢复。长按条目也可以进入批量整理。</Text>

          {trashedMemos.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>回收站是空的</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {trashedMemos.map((memo) => (
                <TouchableOpacity
                  key={memo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`恢复 ${memo.title || '未命名备忘录'}`}
                  onPress={() => restoreMemos([memo.id])}
                  onLongPress={() => setActionMemoId(memo.id)}
                  delayLongPress={360}
                  style={styles.row}
                >
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowLabel}>
                      {memo.title || '未命名备忘录'}
                    </Text>
                    <Text numberOfLines={2} style={styles.rowSubtitle}>
                      {memo.body.trim() || '暂无正文'}
                    </Text>
                    <Text style={styles.rowMeta}>原分类：{groupTitle(memo.groupId)}</Text>
                  </View>
                  <Text style={styles.restoreActionText}>恢复</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
        )}

        <ItemActionSheet
          visible={actionMemo !== null}
          title={actionMemo?.title || '未命名备忘录'}
          subtitle="长按后可以恢复、进整理或彻底删除"
          actions={[
            { label: '恢复这条', onPress: () => { if (actionMemo) { restoreMemos([actionMemo.id]); } } },
            { label: '多选整理', onPress: () => { if (actionMemo) { enterSelectMode(actionMemo.id); } } },
            { label: '彻底删除', danger: true, onPress: () => { if (actionMemo) Alert.alert('永久删除备忘录？', `“${actionMemo.title || '未命名备忘录'}”将无法恢复。`, [{ text: '取消', style: 'cancel' }, { text: '永久删除', style: 'destructive', onPress: () => purgeMemos([actionMemo.id]) }]); } },
          ]}
          onClose={() => setActionMemoId(null)}
        />
      </View>
    </ScreenScaffold>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 140, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    count: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    action: {
      borderRadius: theme.radius.small,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: theme.colors.dangerSoft,
    },
    actionText: { fontSize: 13, fontWeight: '600', color: theme.colors.danger },
    hint: { fontSize: 12, color: theme.colors.textSecondary },
    list: { gap: 9 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 68,
    },
    rowText: { flex: 1, gap: 4 },
    rowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    rowSubtitle: { fontSize: 12, color: theme.colors.textSecondary },
    rowMeta: { fontSize: 11, color: theme.colors.textMuted },
    restoreActionText: { fontSize: 13, fontWeight: '600', color: theme.colors.primaryText },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      backgroundColor: theme.colors.surface,
    },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary },
  });
}
