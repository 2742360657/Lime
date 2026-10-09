import { Alert } from 'react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ArchivedHabitsModal } from '../components/ArchivedHabitsModal';
import { ProfileEditorModal } from '../components/ProfileEditorModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThemeSelectionModal } from '../components/ThemeSelectionModal';
import {pickBackupFile} from '../storage/habitStorage';
import {exportRecordBackup,readRecordBackup,restoreRecordBackup} from '../storage/recordBackup';
import {RecordRecovery} from '../assistant/RecordRecovery';
import { useHabits } from '../state/HabitStore';
import { AssistantSettingsModal } from '../agent/AssistantSettingsModal';

export function SettingsScreen() {
  const { appData, archivedHabits, theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [busyAction, setBusyAction] = useState<'backup' | 'restore' | null>(null);
  const [themeVisible, setThemeVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [archivedVisible, setArchivedVisible] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);

  const handleBackup = async () => {
    try {
      setBusyAction('backup');
      if(await exportRecordBackup())Alert.alert('导出完成','记录文件已写入所选目录。');
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

      const imported = await readRecordBackup(fileAsset.uri);
      setBusyAction(null);

      Alert.alert(
        '合并恢复确认',
        `包含 ${imported.count} 条基础记录、${imported.backup.drafts.length} 份草稿和 ${imported.backup.recovery.length} 份恢复副本。相同记录跳过，不同内容另存为副本；保留现有记录和设置。历史来源、聊天和附件不在此备份中。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '合并恢复',
            onPress: async () => {
              setBusyAction('restore');
              try {const result=await restoreRecordBackup(imported);
                Alert.alert('本机恢复完成',result.repeated?'这份备份已导入，未重复写入。':`新增 ${result.added} 条，跳过 ${result.skipped} 条；草稿和恢复副本仍保留。${result.detached?'部分缺失分类或历史来源已解除关联。':''}`);
              } catch(e) {Alert.alert('恢复失败',e instanceof Error?e.message:'原有内容仍保留。');}
              finally {setBusyAction(null);}
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
    <ScreenScaffold panelTitle="设置" panelItems={[]} fab={null}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="设置" />
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>外观与整理</Text>

          <SettingRow
            label="个人资料"
            value={appData.settings.profileName}
            onPress={() => setProfileVisible(true)}
          />
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
          <SettingRow label="助手配置" value="模型 · 可选人格 · 个人记忆" onPress={() => setAssistantVisible(true)} />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>本机记录备份与恢复</Text>
          <Text style={styles.description}>包含日记、备忘录、待办、习惯、打卡、草稿与恢复副本。不包含聊天、附件和个人记忆。</Text>
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
        <View style={styles.sectionCard}><Text style={styles.sectionTitle}>恢复副本与草稿</Text><RecordRecovery/></View>
      </ScrollView>

      <ThemeSelectionModal visible={themeVisible} onClose={() => setThemeVisible(false)} />
      <ProfileEditorModal visible={profileVisible} onClose={() => setProfileVisible(false)} />
      <ArchivedHabitsModal visible={archivedVisible} onClose={() => setArchivedVisible(false)} />
      <AssistantSettingsModal visible={assistantVisible} onClose={() => setAssistantVisible(false)} />
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
        <Text style={styles.settingArrow}>进入</Text>
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
      gap: 14,
    },
    sectionCard: {
      borderRadius: theme.radius.large,
      padding: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 14,
      ...theme.shadow,
    },
    description: {fontSize:12,lineHeight:20,color:theme.colors.textSecondary},
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
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
