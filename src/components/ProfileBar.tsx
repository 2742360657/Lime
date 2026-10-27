import { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useHabits } from '../state/HabitStore';

type ProfileBarProps = {
  onPress: () => void;
  onMenuPress?: () => void;
};

export function ProfileBar({ onPress, onMenuPress }: ProfileBarProps) {
  const { settings, theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initial = settings.profileName.trim().slice(0, 1).toUpperCase() || '酸';

  return (
    <View style={styles.bar}>
      {onMenuPress ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="打开页面菜单" onPress={onMenuPress} style={styles.menuButton}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity accessibilityLabel="编辑个人资料" activeOpacity={0.78} onPress={onPress} style={styles.profileButton}>
      {settings.avatarUri ? (
        <Image source={{ uri: settings.avatarUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{settings.profileName}</Text>
        {settings.profileSignature ? (
          <Text numberOfLines={1} style={styles.signature}>{settings.profileSignature}</Text>
        ) : null}
      </View>
      <Text style={styles.signature}>编辑 ›</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    bar: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1,
      borderRadius: theme.radius.large,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    menuButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
    menuIcon: { fontSize: 21, color: theme.colors.textPrimary },
    profileButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.colors.primarySoft,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    avatarInitial: {
      fontSize: 19,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    copy: { flex: 1, gap: 3 },
    name: { fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary },
    signature: { fontSize: 11, color: theme.colors.textSecondary },
  });
}
