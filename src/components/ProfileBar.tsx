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
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.name}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date())}</Text>
        <Text style={styles.signature}>{new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date())}</Text>
      </View>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    bar: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    menuButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
    menuIcon: { fontSize: 21, color: theme.colors.textPrimary },
    profileButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
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
    name: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
    signature: { fontSize: 11, color: theme.colors.textSecondary },
  });
}
