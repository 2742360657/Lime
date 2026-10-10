import { Alert } from 'react-native';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRoute } from '@react-navigation/native';
import { ReminderSettingsModal } from '../reminders/ReminderSettingsModal';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ArchivedHabitsModal } from '../components/ArchivedHabitsModal';
import { ProfileEditorModal } from '../components/ProfileEditorModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThemeSelectionModal } from '../components/ThemeSelectionModal';
import { exportFullBackup, pickFullBackup, restorePrepared, discardPrepared, type PreparedBackup } from '../backup/service';
import { BackupArchives } from '../backup/BackupArchives';
import { BackupError } from '../backup/model';
import {RecordRecovery} from '../assistant/RecordRecovery';
import { useHabits } from '../state/HabitStore';
import { AssistantSettingsModal } from '../agent/AssistantSettingsModal';

export function SettingsScreen() {
  const { appData, archivedHabits, theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const prepared = useRef<PreparedBackup | null>(null);
  useEffect(() => () => { if (prepared.current) void discardPrepared(prepared.current); }, []);
  const [busyAction, setBusyAction] = useState<'backup' | 'restore' | null>(null);
  const [themeVisible, setThemeVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [archivedVisible, setArchivedVisible] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [remindersVisible, setRemindersVisible] = useState(false);
  const route = useRoute();
  const reminderNonce = (route.params as { reminderNonce?: string } | undefined)?.reminderNonce;
  useEffect(() => { if (reminderNonce) setRemindersVisible(true); }, [reminderNonce]);

  const failure = (error: unknown) => error instanceof BackupError ? error.message : '操作未完成，请保留原文件并检查空间、权限或格式。';
  const handleBackup = async () => {
    setBusyAction('backup');
    try { if (await exportFullBackup()) Alert.alert('导出完成', '完整数据包已写入所选目录。请妥善保存这份私密文件。'); }
    catch (error) { Alert.alert('导出失败', failure(error)); }
    finally { setBusyAction(null); }
  };
  async function cancelPrepared() {
    const input = prepared.current; prepared.current = null;
    if (input) await discardPrepared(input);
  }
  const handleRestore = async () => {
    setBusyAction('restore');
    try {
      await cancelPrepared();
      const input = await pickFullBackup(); if (!input) return;
      prepared.current = input;
      const scope = input.kind === 'full'
        ? `包含 ${input.count} 条记录及历史对象、${input.manifest.blobs.length} 份原件/图片或恢复包。相同内容跳过；冲突及关联对象保留在可导出的恢复副本，不覆盖现有记录。聊天和未接受建议只恢复为历史；新增人格及提醒停用。`
        : `这是旧基础 JSON，包含 ${input.count} 条基础记录。相同记录跳过，不同内容另存副本；不包含新聊天、附件等对象。`;
      Alert.alert('恢复范围确认', scope, [
        { text: '取消', style: 'cancel', onPress: () => { void cancelPrepared(); } },
        { text: '恢复到本机', onPress: async () => {
          // Alert dismissal must not dispose the stage while the confirmed restore runs.
          prepared.current = null; setBusyAction('restore');
          try {
            const result = await restorePrepared(input);
            const conflicts = 'conflicts' in result ? result.conflicts : result.copies;
            Alert.alert('本机恢复完成', result.repeated ? '这份数据包已恢复，未重复写入。' : `新增 ${result.added} 条，跳过 ${result.skipped} 条。${conflicts ? `另有 ${conflicts} 条冲突或关联对象已保留为恢复副本。` : ''}恢复不会重放助手操作。`);
          } catch (error) { Alert.alert('恢复失败', failure(error)); }
          finally { await discardPrepared(input); setBusyAction(null); }
        } },
      ], { cancelable: true, onDismiss: () => { void cancelPrepared(); } });
    } catch (error) { await cancelPrepared(); Alert.alert('恢复失败', failure(error)); }
    finally { setBusyAction(null); }
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
          <SettingRow label="本地提醒" value="待办到期 · 单次 · 公历生日" onPress={() => setRemindersVisible(true)} />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>本机完整备份与恢复</Text>
          <Text style={styles.description}>包含记录、聊天、人格、记忆、活动、来源、附件及提醒规则。ZIP 为明文私密文件，不包含 API Key、渠道凭据或外观设置；请妥善保存。</Text>
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
        <View style={styles.sectionCard}><Text style={styles.sectionTitle}>恢复副本与草稿</Text><RecordRecovery/><BackupArchives disabled={busyAction !== null}/></View>
      </ScrollView>

      <ThemeSelectionModal visible={themeVisible} onClose={() => setThemeVisible(false)} />
      <ProfileEditorModal visible={profileVisible} onClose={() => setProfileVisible(false)} />
      <ArchivedHabitsModal visible={archivedVisible} onClose={() => setArchivedVisible(false)} />
      <AssistantSettingsModal visible={assistantVisible} onClose={() => setAssistantVisible(false)} />
      <ReminderSettingsModal visible={remindersVisible} onClose={() => setRemindersVisible(false)} />
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
