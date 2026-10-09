import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { HabitInput, useHabits } from '../state/HabitStore';
import { Habit, HabitCadence } from '../types/habit';

type AddHabitModalProps = {
  visible: boolean;
  habit?: Habit | null;
  onClose: () => void;
};

const CADENCE_OPTIONS: Array<{ id: HabitCadence; label: string }> = [
  { id: 'daily', label: '每天' },
  { id: 'weekly', label: '每周' },
  { id: 'monthly', label: '每月' },
];

export function AddHabitModal({ visible, habit = null, onClose }: AddHabitModalProps) {
  const { theme, groups, addHabit, updateHabit } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [cadence, setCadence] = useState<HabitCadence>('daily');
  const [targetCount, setTargetCount] = useState('1');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(habit?.name ?? '');
    setSelectedGroupId(habit?.groupId ?? null);
    setCadence(habit?.cadence ?? 'daily');
    setTargetCount(String(habit?.targetCount ?? 1));
  }, [habit, visible]);

  const handleSubmit = () => {
    const numericTarget = Math.max(1, Math.min(999, Number.parseInt(targetCount, 10) || 1));
    const input: HabitInput = {
      name,
      groupId: selectedGroupId,
      cadence,
      targetCount: numericTarget,
    };
    const success = habit ? updateHabit(habit.id, input) : addHabit(input);
    if (success) {
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{habit ? '编辑习惯' : '新建习惯'}</Text>
          <TouchableOpacity onPress={handleSubmit} style={[styles.headerButton, styles.saveButton]}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>习惯名称</Text>
            <TextInput
              autoFocus
              maxLength={40}
              placeholder="习惯名称"
              placeholderTextColor={theme.colors.textMuted}
              value={name}
              onChangeText={setName}
              style={styles.titleInput}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>目标周期</Text>
            <View style={styles.cadenceList}>
              {CADENCE_OPTIONS.map((option) => {
                const active = cadence === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => setCadence(option.id)}
                    style={[styles.cadenceCard, active && styles.cadenceCardActive]}
                  >
                    <Text style={[styles.cadenceLabel, active && styles.cadenceLabelActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.targetRow}>
            <View style={styles.targetCopy}>
              <Text style={styles.label}>周期内目标次数</Text>
            </View>
            <TextInput
              keyboardType="number-pad"
              maxLength={3}
              value={targetCount}
              onChangeText={setTargetCount}
              selectTextOnFocus
              style={styles.targetInput}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>所属分组</Text>
            <View style={styles.groupList}>
              <GroupOption label="未分组" selected={selectedGroupId === null} onPress={() => setSelectedGroupId(null)} />
              {groups
                .slice()
                .sort((left, right) => left.order - right.order)
                .map((group) => (
                  <GroupOption
                    key={group.id}
                    label={group.name}
                    selected={selectedGroupId === group.id}
                    onPress={() => setSelectedGroupId(group.id)}
                  />
                ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  function GroupOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.groupChip, selected && styles.groupChipActive]}>
        <Text style={[styles.groupChipText, selected && styles.groupChipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
    headerButton: { minWidth: 60, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
    headerButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
    saveButton: { borderRadius: 12, backgroundColor: theme.colors.primary },
    saveButtonText: { fontSize: 14, fontWeight: '800', color: theme.colors.white },
    content: { padding: 20, gap: 24, paddingBottom: 44 },
    field: { gap: 11 },
    label: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary },
    titleInput: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 14,
      fontSize: 21,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    cadenceList: { flexDirection: 'row', gap: 9 },
    cadenceCard: {
      flex: 1,
      minHeight: 54,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      padding: 12,
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    cadenceCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    cadenceLabel: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary },
    cadenceLabelActive: { color: theme.colors.primary },
    targetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    targetCopy: { flex: 1 },
    targetInput: {
      width: 66,
      height: 48,
      borderRadius: 13,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    groupList: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    groupChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    groupChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    groupChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    groupChipTextActive: { color: theme.colors.primary },
  });
}
