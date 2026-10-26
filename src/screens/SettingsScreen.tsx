import { Alert } from 'react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ArchivedHabitsModal } from '../components/ArchivedHabitsModal';
import { ProfileEditorModal } from '../components/ProfileEditorModal';
import { ProfileBar } from '../components/ProfileBar';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThemeSelectionModal } from '../components/ThemeSelectionModal';
import {
  exportBackupFile,
  importBackupFile,
  pickBackupFile,
} from '../storage/habitStorage';
import { useHabits } from '../state/HabitStore';

export function SettingsScreen() {
  const { appData, archivedHabits, theme, replaceAppData } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [busyAction, setBusyAction] = useState<'backup' | 'restore' | null>(null);
  const [themeVisible, setThemeVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [archivedVisible, setArchivedVisible] = useState(false);

  const handleBackup = async () => {
    try {
      setBusyAction('backup');
      await exportBackupFile(appData);
      Alert.alert('导出备份', '已打开系统分享面板，请将备份 JSON 保存到文件、网盘或聊天工具中。');
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '导出备份失败，请稍后重试。');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestore = async () => {
    try {
      setBusyAction('restore');
      const fileAsset = await pickBackupFile();
      if (!fileAsset) {
        setBusyAction(null);
        return;
      }

      const importedData = await importBackupFile(fileAsset.uri);
      setBusyAction(null);

      Alert.alert(
        '覆盖恢复确认',
        `即将使用“${fileAsset.name ?? '所选文件'}”覆盖当前本地全部数据，包括待办、习惯、备忘录、个人资料和主题。此操作无法撤销。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确认恢复',
            style: 'destructive',
            onPress: () => {
              replaceAppData(importedData);
              Alert.alert('恢复成功', '本地数据已覆盖恢复。');
            },
          },
        ]
      );
    } catch (error) {
      setBusyAction(null);
      Alert.alert('恢复失败', error instanceof Error ? error.message : '恢复数据失败，请检查备份文件。');
    }
  };

  return (
    <ScreenScaffold panelTitle="设置" panelItems={[]} createAction={null}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ProfileBar onPress={() => setProfileVisible(true)} />
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>外观与整理</Text>


          <SettingRow
            label="色系选择"
            value={theme.label}
            onPress={() => setThemeVisible(true)}
          />
          <SettingRow
            label="归档习惯"
            value={`${archivedHabits.length} 个`}
            onPress={() => setArchivedVisible(true)}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>数据备份与恢复</Text>
          <Text style={styles.backupHint}>定期导出到应用之外。恢复备份会覆盖当前全部数据。</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              disabled={busyAction !== null}
              onPress={handleBackup}
              style={[styles.primaryAction, busyAction !== null && styles.disabledAction]}
            >
              <Text style={styles.primaryActionText}>
                {busyAction === 'backup' ? '正在导出...' : '数据备份'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busyAction !== null}
              onPress={handleRestore}
              style={[styles.secondaryAction, busyAction !== null && styles.disabledAction]}
            >
              <Text style={styles.secondaryActionText}>
                {busyAction === 'restore' ? '正在读取...' : '数据恢复'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <ThemeSelectionModal visible={themeVisible} onClose={() => setThemeVisible(false)} />
      <ProfileEditorModal visible={profileVisible} onClose={() => setProfileVisible(false)} />
      <ArchivedHabitsModal visible={archivedVisible} onClose={() => setArchivedVisible(false)} />
    </ScreenScaffold>
  );

  function SettingRow({
    label,
    value,
    onPress,
  }: {
    label: string;
    value: string;
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.settingValue}>{value}</Text>
        </View>
        <Text style={styles.settingArrow}>›</Text>
      </TouchableOpacity>
    );
  }
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 16,
      gap: 18,
    },
    backupHint: { fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary },
    sectionCard: {
      borderRadius: theme.radius.large,
      padding: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 14,
      ...theme.shadow,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    settingRow: {
      borderRadius: theme.radius.medium,
      padding: 14,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    settingText: {
      flex: 1,
      gap: 4,
    },
    settingLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    settingValue: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    settingArrow: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryAction: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryActionText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.white,
    },
    secondaryAction: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
    },
    secondaryActionText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    disabledAction: {
      opacity: 0.6,
    },
  });
}
