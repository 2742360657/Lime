import { ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';


type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
};

export function ScreenHeader({ eyebrow, title, action }: ScreenHeaderProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
  });
}
