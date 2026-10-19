import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MultiSelectBoard, SelectCircle } from '../components/MultiSelectBoard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { useNavigation } from '@react-navigation/native';
import type { NavigationTarget } from '../navigation/types';
import { useHabits } from '../state/HabitStore';

/** 回收站：默认删除的备忘录会先进这里，从这里删除才是真正删除。 */
export function TrashScreen() {
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void }>();
  const { trashedMemos, theme, restoreMemos, purgeMemos, purgeAllMemos, memoGroups } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** 长按直接进入整理模式，并预选被长按的那一条。 */
  const enterSelectMode = (id: string) => {
    setSelectedIds([id]);
    setSelectMode(true);
  };

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];

  const groupTitle = (groupId: string | null) =>
    memoGroups.find((group) => group.id === groupId)?.name ?? '未分类';

  if (selectMode) {
    return (
      <MultiSelectBoard
        title="整理回收站"
        hint="点按选中后批量删除，删除后不可恢复"
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
    );
  }

  return (
    <ScreenScaffold
      panelTitle="回收站"
      panelItems={[
        { id: 'back', label: '返回备忘录', onPress: () => navigation.navigate('memos') },
        ...(trashedMemos.length > 0
          ? [
              {
                id: 'empty',
                label: `清空回收站 · ${trashedMemos.length}`,
                bottom: true,
                onPress: () => purgeAllMemos(),
              },
            ]
          : []),
      ]}
    >
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                  onLongPress={() => enterSelectMode(memo.id)}
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
      </View>
    </ScreenScaffold>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 140, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    count: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    action: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: theme.colors.dangerSoft,
    },
    actionText: { fontSize: 13, fontWeight: '800', color: theme.colors.danger },
    hint: { fontSize: 12, color: theme.colors.textSecondary },
    list: { gap: 9 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: theme.radius.medium,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 68,
    },
    rowText: { flex: 1, gap: 4 },
    rowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    rowSubtitle: { fontSize: 12, color: theme.colors.textSecondary },
    rowMeta: { fontSize: 11, color: theme.colors.textMuted },
    restoreActionText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
    emptyCard: {
      borderRadius: theme.radius.large,
      padding: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  });
}
