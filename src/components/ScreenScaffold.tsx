import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import type { NavigationTarget, PanelItem } from '../navigation/types';
import { GLOBAL_NAV_ITEMS } from '../navigation/types';
import { useRegisterPanel } from '../navigation/panel';
import { SCREEN_ENTERING } from '../theme/animation';
import { useHabits } from '../state/HabitStore';
import { AppIcon } from './AppIcon';

export type ScreenScaffoldProps = {
  panelTitle: string;
  panelItems: PanelItem[];
  createAction?: { label: string; onPress: () => void } | null;
  onOrganize?: () => void;
  organizing?: boolean;
  children: ReactNode;
};
const TITLES: Record<string, [string, string]> = {
  today: ['今日', '所有需要处理和可以推进的事'],
  tasks: ['待办', '看清内容，再安排时间'],
  habits: ['习惯', '按自己的节奏，持续记录'],
  memos: ['备忘录', '随手记录，慢慢整理'],
  settings: ['设置', '个人资料、外观与本地数据'],
  trash: ['回收站', '找回暂时移除的备忘录'],
};

export function ScreenScaffold({ panelTitle, panelItems, createAction, onOrganize, organizing = false, children }: ScreenScaffoldProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void; openDrawer: () => void }>();
  const route = useRoute();
  useRegisterPanel(route.name, panelTitle, panelItems);
  const date = new Date();
  const todayLabel = `${date.getMonth() + 1}月${date.getDate()}日 · 星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
  const [title, subtitle] = TITLES[route.name] ?? [panelTitle, ''];
  return (
    <View style={styles.screenRoot}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>{route.name === 'today'
            ? todayLabel
            : subtitle}</Text>
        </View>
        {onOrganize && <Pressable accessibilityRole="button" accessibilityLabel="多选与排序" onPress={onOrganize} style={styles.action}><Text style={styles.actionText}>整理</Text></Pressable>}
        {!organizing && panelItems.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`打开${panelTitle}菜单`} onPress={() => navigation.openDrawer()} style={styles.action}>
          <AppIcon name="menu" color={theme.colors.primary} />
          <Text style={styles.actionText}>{route.name === 'tasks' ? '日期' : route.name === 'habits' ? '分组' : route.name === 'memos' ? '分类' : '菜单'}</Text>
        </Pressable>}
        {createAction && <Pressable accessibilityRole="button" accessibilityLabel={createAction.label} onPress={createAction.onPress} style={[styles.action, styles.createAction]}>
          <Text style={styles.createText}>＋ 新建</Text>
        </Pressable>}
      </View>
      <Animated.View entering={SCREEN_ENTERING} style={styles.content}>
        {children}
      </Animated.View>
      <View style={[styles.bottomBar, { paddingBottom: 4 + insets.bottom }]}>
        {GLOBAL_NAV_ITEMS.map((item) => {
          const selected = route.name === item.id;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => navigation.navigate(item.id)} style={styles.bottomItem}>
            <View style={[styles.iconPill, selected && styles.selectedPill]}><AppIcon name={item.id === 'trash' ? 'memos' : item.id} color={selected ? theme.colors.primary : theme.colors.textSecondary} /></View>
            <Text style={[styles.bottomLabel, selected && styles.selectedText]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  );
}
function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screenRoot: { flex: 1, backgroundColor: theme.colors.background },
    header: { minHeight: 68, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    heading: { flex: 1, gap: 4 },
    title: { fontSize: 23, fontWeight: '700', color: theme.colors.textPrimary },
    subtitle: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
    action: { minHeight: 48, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'transparent' },
    actionText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
    createAction: { backgroundColor: theme.colors.primary, paddingHorizontal: 12 },
    createText: { fontSize: 13, fontWeight: '700', color: theme.colors.white },
    content: { flex: 1 },
    bottomBar: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
    bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
    iconPill: { width: 44, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    selectedPill: { backgroundColor: theme.colors.primarySoft },
    bottomLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
    selectedText: { color: theme.colors.primary, fontWeight: '800' },
  });
}
