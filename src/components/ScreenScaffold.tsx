import { useNavigation, useRoute } from '@react-navigation/native';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRegisterPanel } from '../navigation/panel';
import type { NavigationTarget, PanelItem } from '../navigation/types';
import { GLOBAL_NAV_ITEMS } from '../navigation/types';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import { pageHeading } from '../theme/layout';
import { SCREEN_ENTERING } from '../theme/animation';
import { AppIcon } from './AppIcon';

export type ScreenScaffoldProps = {
  panelTitle: string;
  panelItems: PanelItem[];
  createAction?: { label: string; onPress: () => void } | null;
  onOrganize?: () => void;
  organizing?: boolean;
  children: ReactNode;
};
const TITLES: Record<string, string> = { today: '今日', tasks: '待办', habits: '习惯', memos: '备忘录', settings: '设置', trash: '回收站' };

export function ScreenScaffold({ panelTitle, panelItems, createAction, onOrganize, organizing = false, children }: ScreenScaffoldProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void; openDrawer: () => void }>();
  const route = useRoute();
  useRegisterPanel(route.name, panelTitle, panelItems);
  const date = new Date();
  const todayLabel = `${date.getMonth() + 1}月${date.getDate()}日 · 星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
  const title = TITLES[route.name] ?? panelTitle;
  return (
    <View style={styles.screenRoot}>
      {!organizing && <View style={styles.header}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {route.name === 'today' && <Text numberOfLines={1} style={styles.subtitle}>{todayLabel}</Text>}
        </View>
        {onOrganize && <Pressable accessibilityRole="button" accessibilityLabel="多选与排序" onPress={onOrganize} style={styles.action}><Text style={styles.actionText}>整理</Text></Pressable>}
        {!organizing && panelItems.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`打开${panelTitle}菜单`} onPress={() => navigation.openDrawer()} style={styles.action}>
          <AppIcon name="menu" color={theme.colors.textSecondary} />
          <Text style={styles.actionText}>{route.name === 'tasks' ? '日期' : route.name === 'habits' ? '分组' : route.name === 'memos' ? '分类' : '菜单'}</Text>
        </Pressable>}
        {createAction && <Pressable accessibilityRole="button" accessibilityLabel={createAction.label} onPress={createAction.onPress} style={[styles.action, styles.createAction]}>
          <Text style={styles.createText}>＋ 新建</Text>
        </Pressable>}
      </View>}
      <Animated.View entering={SCREEN_ENTERING} style={styles.content}>
        {children}
      </Animated.View>
      <View style={[styles.bottomBar, { paddingBottom: 4 + insets.bottom }]}>
        {GLOBAL_NAV_ITEMS.map((item) => {
          const selected = route.name === item.id;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => navigation.navigate(item.id)} style={styles.bottomItem}>
            <View style={[styles.navIcon, selected && styles.selectedIcon]}><AppIcon name={item.id === 'trash' ? 'memos' : item.id} color={selected ? theme.colors.primary : theme.colors.textSecondary} /></View>
            <Text style={[styles.bottomLabel, selected && styles.selectedText]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  );
}
function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screenRoot: { flex: 1, backgroundColor: theme.colors.background },
    header: { minHeight: 60, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
    heading: { flex: 1, gap: 2 },
    title: pageHeading(theme),
    subtitle: { fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
    action: { minHeight: 44, paddingHorizontal: 10, borderRadius: theme.radius.action, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'transparent' },
    actionText: { fontSize: 13, fontWeight: '500', color: theme.colors.textSecondary },
    createAction: { backgroundColor: theme.colors.primary, paddingHorizontal: 12 },
    createText: { fontSize: 13, fontWeight: '600', color: theme.colors.onPrimary },
    content: { flex: 1 },
    bottomBar: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
    bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
    navIcon: { width: 48, height: 28, borderRadius: theme.radius.small, alignItems: 'center', justifyContent: 'center' },
    selectedIcon: { backgroundColor: theme.colors.primarySoft },
    bottomLabel: { fontSize: 12, fontWeight: '400', color: theme.colors.textSecondary },
    selectedText: { color: theme.colors.primaryText, fontWeight: '600' },
  });
}
