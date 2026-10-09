import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated from 'react-native-reanimated';

import type { NavigationTarget, PanelItem } from '../navigation/types';
import { GLOBAL_NAV_ITEMS } from '../navigation/types';
import { useRegisterPanel } from '../navigation/panel';
import { SCREEN_ENTERING } from '../theme/animation';
import { useHabits } from '../state/HabitStore';
import { FloatingAddButton } from './FloatingAddButton';
import { ProfileBar } from './ProfileBar';

export type ScreenScaffoldProps = {
  /** 右侧页面操作栏标题。 */
  panelTitle: string;
  panelItems: PanelItem[];
  /** 悬浮新建按钮；传 null / 不传则不渲染。 */
  fab?: { label: string; onPress: () => void } | null;
  children: ReactNode;
};

/**
 * 页面脚手架：顶部资料条、中间页面内容、底部主导航。
 * 页面操作项注册到唯一的左侧抽屉，主导航不再参与横向手势竞争。
 */
export function ScreenScaffold({ panelTitle, panelItems, fab, children }: ScreenScaffoldProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<{ navigate: (name: NavigationTarget) => void; openDrawer: () => void }>();
  const route = useRoute();
  useRegisterPanel(route.name, panelTitle, panelItems);

  /**
   * 全局滑动：屏幕任意位置起手，只按方向区分左右。
   *   右滑 → 左侧全局导航
   *   左滑 → 右侧页面操作栏
   * 两层抽屉自带的手势都已关闭，滑动只在这里判定一次，不存在争抢。
   */
  return (
    <View style={styles.screenRoot}>
      <ProfileBar onPress={() => navigation.navigate('settings')} onMenuPress={() => navigation.openDrawer()} />
      <Animated.View entering={SCREEN_ENTERING} style={styles.content}>
        {children}
        {fab ? <FloatingAddButton label={fab.label} onPress={fab.onPress} /> : null}
      </Animated.View>
      <View style={styles.bottomBar}>
        {GLOBAL_NAV_ITEMS.map((item) => {
          const selected = route.name === item.id;
          return (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
              accessibilityState={{ selected }} onPress={() => navigation.navigate(item.id)}
              style={[styles.bottomItem, selected && styles.bottomItemSelected]}>
              <Text style={[styles.bottomIcon, selected && styles.bottomTextSelected]}>{item.icon}</Text>
              <Text style={[styles.bottomText, selected && styles.bottomTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    screenRoot: { flex: 1, backgroundColor: theme.colors.background },
    content: { flex: 1 },
    bottomBar: { height: 76, flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 5, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
    bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, gap: 2 },
    bottomItemSelected: { backgroundColor: theme.colors.primarySoft },
    bottomIcon: { fontSize: 19, color: theme.colors.textSecondary },
    bottomText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
    bottomTextSelected: { color: theme.colors.primary },
  });
}
