import { Alert } from '../components/ThemedAlert';
import { ThemedSwitch as Switch } from '../components/ThemedSwitch';
import { useBackupRestore } from '../hooks/useBackupRestore';
import { useAppActions, useAppStore, useHabitData, useSettings, useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ArchivedHabitsModal } from '../components/ArchivedHabitsModal';
import { ProfileBar } from '../components/ProfileBar';
import { ProfileEditorModal } from '../components/ProfileEditorModal';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThemeSelectionModal } from '../components/ThemeSelectionModal';
import {
  exportBackupFile
} from '../storage/habitStorage';
import { useAppUpdate } from '../update/UpdateProvider';

export function SettingsScreen() {
  const store = useAppStore();
  const { restore: handleRestore, restoring } = useBackupRestore();
  const { archivedHabits } = useHabitData();
  const theme = useTheme();
  const { setUpdatePreferences } = useAppActions();
  const { settings } = useSettings();
  const update = useAppUpdate();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [busyAction, setBusyAction] = useState<'backup' | null>(null);
  const [themeVisible, setThemeVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [archivedVisible, setArchivedVisible] = useState(false);

  const handleBackup = async () => {
    try {
      setBusyAction('backup');
      await exportBackupFile(store.getSnapshot().appData);
      Alert.alert('导出备份', '已打开系统分享面板，请将备份 JSON 保存到文件、网盘或聊天工具中。');
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '导出备份失败，请稍后重试。');
    } finally {
      setBusyAction(null);
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
          <Text style={styles.sectionTitle}>软件更新</Text>
          <View style={styles.updateRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>自动检查更新</Text>
              <Text style={styles.settingValue}>打开应用时检查，每天最多一次</Text>
            </View>
            <Switch accessibilityLabel="自动检查更新" value={settings.autoCheckUpdates}
              onValueChange={autoCheckUpdates => setUpdatePreferences({ autoCheckUpdates })}
 />
          </View>
          <Text style={styles.backupHint}>
            {update.installed ? `当前版本 ${update.installed.version}` : '正在读取版本…'}
            {update.message ? ` · ${update.message}` : ''}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="检查更新"
              disabled={!update.installed || ['checking', 'downloading', 'installing'].includes(update.stage)}
              onPress={update.stage === 'ready' ? update.showUpdate : update.checkNow}
              style={[styles.primaryAction, update.stage === 'checking' && styles.disabledAction]}>
              <Text style={styles.primaryActionText}>{update.stage === 'checking' ? '正在检查…' : update.stage === 'ready' ? '继续安装' : '检查更新'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={update.candidate ? '查看更新' : '查看发布页'}
              onPress={update.candidate ? update.showUpdate : update.openReleasePage} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>{update.candidate ? '查看更新' : '发布页'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.settingValue}>仅检查版本和下载更新；安装前由你确认。</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>数据备份与恢复</Text>
          <Text style={styles.backupHint}>定期导出到应用之外。恢复备份会覆盖当前全部数据。</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              disabled={busyAction !== null || restoring}
              onPress={handleBackup}
              style={[styles.primaryAction, busyAction !== null && styles.disabledAction]}
            >
              <Text style={styles.primaryActionText}>
                {busyAction === 'backup' ? '正在导出...' : '数据备份'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busyAction !== null || restoring}
              onPress={handleRestore}
              style={[styles.secondaryAction, busyAction !== null && styles.disabledAction]}
            >
              <Text style={styles.secondaryActionText}>
                {restoring ? '正在读取...' : '数据恢复'}
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 16,
      gap: 14,
    },
    backupHint: { fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary },
    updateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sectionCard: {
      borderRadius: theme.radius.medium,
      padding: 16,
      backgroundColor: theme.colors.surface,
      gap: 10,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    settingRow: {
      minHeight: 48,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
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
      fontSize: 14,
      fontWeight: '600',
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
      borderRadius: theme.radius.pill,
      minHeight: 44,
      paddingVertical: 11,
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
      borderRadius: theme.radius.pill,
      minHeight: 44,
      paddingVertical: 11,
      alignItems: 'center',
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
