import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useHabits } from '../state/HabitStore';

const SIZE = 76;

/** 右下角悬浮新建按钮；与页面上其它按钮保持一致的可点性。 */
export function FloatingAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useHabits();
  const scale = useRef(new Animated.Value(1)).current;
  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => animateScale(0.92)}
      onPressOut={() => animateScale(1)}
      style={[styles.button, { backgroundColor: theme.colors.primary }]}
    >
      <Animated.View style={[styles.circle, { transform: [{ scale }] }]}>
        <View style={styles.plusIcon} accessibilityElementsHidden>
          <View style={styles.plusHorizontal} />
          <View style={styles.plusVertical} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 22,
    bottom: 104,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  circle: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  plusIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  plusHorizontal: { position: 'absolute', width: 28, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  plusVertical: { position: 'absolute', width: 3, height: 28, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
