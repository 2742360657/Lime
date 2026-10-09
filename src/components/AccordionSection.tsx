import { PropsWithChildren, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LIST_LAYOUT } from '../theme/animation';
import { useHabits } from '../state/HabitStore';

type AccordionSectionProps = {
  title: string;
  /** 右侧次要说明，例如“3 项”“0/8”。 */
  meta?: string;
  collapsed: boolean;
  onToggle: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
};

/**
 * 可折叠分组。
 *
 * 折叠动画与列表条目统一使用 Reanimated 的 LinearTransition，
 * 且内容始终保持挂载（只切换 height 0 ↔ auto）：
 * layout 动画只能对「保持挂载的视图」补间尺寸，卸载/挂载不参与动画。
 * 不手动测量高度，因此不存在「测量到 0 后内容再也显示不出来」的问题。
 */
export function AccordionSection({
  title,
  meta,
  collapsed,
  onToggle,
  danger = false,
  accessibilityLabel,
  children,
}: PropsWithChildren<AccordionSectionProps>) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    /* 根节点必须带 layout：内容挂载/卸载时本分组自身的高度变化也要参与动画，
       否则外层高度会瞬间跳变，内层的让位动画就看不出来。 */
    <Animated.View layout={LIST_LAYOUT} style={styles.section}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `折叠${title}`}
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggle}
        style={styles.header}
      >
        <Text style={[styles.title, danger && styles.dangerTitle]}>{title}</Text>
        <View style={styles.headerRight}>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          <Text style={styles.chevron}>{collapsed ? '展开' : '收起'}</Text>
        </View>
      </TouchableOpacity>


      {/*
        内容始终保持挂载，只切换高度 0 ↔ auto。
        这样 LinearTransition 能真正对「尺寸变化」做补间（卸载的场景它无法补间），
        收起时呈现向上收回的效果；同时避免手动测量高度带来的各种坑。
      */}
      <Animated.View
        layout={LIST_LAYOUT}
        style={[styles.body, collapsed ? styles.bodyCollapsed : styles.bodyExpanded]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    section: { gap: 10 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 3,
      gap: 12,
    },
    title: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
    dangerTitle: { color: theme.colors.danger },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    meta: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
    chevron: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
    body: { overflow: 'hidden' },
    bodyExpanded: {},
    bodyCollapsed: { height: 0 },
  });
}
