import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';


/** 多选状态下条目左侧的选择圆圈。传了 onPress 才可点，否则只作为选中状态指示。 */
export function SelectCircle({
  checked,
  accessibilityLabel,
  onPress,
}: {
  checked: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const circleStyle = [styles.circle, checked && styles.circleOn];
  const tick = checked ? <Text style={styles.tick}>✓</Text> : null;

  if (!onPress) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={circleStyle}>
        {tick}
      </View>
    );
  }

  return (
    <View accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} style={circleStyle}>
      {tick}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    circle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: theme.colors.controlBorder,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
    tick: { fontSize: 14, fontWeight: '900', color: theme.colors.onPrimary },
  });
}
