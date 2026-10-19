import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { useHabits } from '../state/HabitStore';

export const FAB_SIZE = 64;
export const FAB_RIGHT = 20;
export const FAB_BOTTOM = 20;
/** 列表底部需要预留的空白：按钮顶部再留 24 的呼吸区。 */
export const FAB_CLEARANCE = FAB_BOTTOM + FAB_SIZE + 24;

/** 沿同一方向累计滚动这么多就切换按钮的显隐，避免误触抖动。 */
const SCROLL_TRIGGER = 16;
/** 回到列表顶部时总是重新露出按钮。 */
const TOP_REST = 24;

let lastOffset = 0;
let travel = 0;
let fabHidden = false;
const listeners = new Set<(hidden: boolean) => void>();

function applyHidden(next: boolean) {
  if (next === fabHidden) {
    return;
  }
  fabHidden = next;
  listeners.forEach((listener) => listener(next));
}

/**
 * 交给页面 ScrollView 的 onScroll 调用。
 * 向下滚动时收起按钮，让列表右侧的操作按钮不被挡住；向上滚动或回到顶部再露出来。
 */
export function handleFabScroll(offsetY: number) {
  const delta = offsetY - lastOffset;
  lastOffset = offsetY;
  if (offsetY <= TOP_REST) {
    travel = 0;
    applyHidden(false);
    return;
  }
  if (delta === 0) {
    return;
  }
  travel = (delta > 0) === (travel > 0) ? travel + delta : delta;
  if (travel > SCROLL_TRIGGER) {
    travel = 0;
    applyHidden(true);
  } else if (travel < -SCROLL_TRIGGER) {
    travel = 0;
    applyHidden(false);
  }
}

/** 右下角悬浮新建按钮；与页面上其它按钮保持一致的可点性。 */
export function FloatingAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useHabits();
  const scale = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(fabHidden ? 1 : 0)).current;
  const [hidden, setHidden] = useState(fabHidden);

  useEffect(() => {
    listeners.add(setHidden);
    return () => {
      listeners.delete(setHidden);
    };
  }, []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: hidden ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [hidden, slide]);

  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.holder,
        {
          opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [0, FAB_SIZE + FAB_BOTTOM],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={() => animateScale(0.92)}
        onPressOut={() => animateScale(1)}
        style={[styles.button, { backgroundColor: theme.colors.primary }]}
      >
        <Animated.View style={[styles.circle, { transform: [{ scale }] }]}>
          <Animated.View style={styles.plusIcon} accessibilityElementsHidden>
            <View style={styles.plusHorizontal} />
            <View style={styles.plusVertical} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  holder: {
    position: 'absolute',
    right: FAB_RIGHT,
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  circle: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  plusIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  plusHorizontal: { position: 'absolute', width: 28, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  plusVertical: { position: 'absolute', width: 3, height: 28, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
