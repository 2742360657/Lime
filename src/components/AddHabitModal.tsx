import { Alert } from './ThemedAlert';
import { ThemedTextInput as TextInput } from './ThemedTextInput';
import { ThemedSwitch as Switch } from './ThemedSwitch';
import { EditorLayout, useConfirmDiscard } from './EditorLayout';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { HabitInput, useHabits } from '../state/HabitStore';
import { Habit, HabitCadence } from '../types/habit';
import { parseHabitTarget } from '../utils/habitTarget';

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
  const [hasTarget, setHasTarget] = useState(false);
  const snapshot = useRef('');
  const dirty = visible && snapshot.current !== JSON.stringify({ name, selectedGroupId, cadence, targetCount, hasTarget });
  const requestClose = useConfirmDiscard(dirty, onClose);


  useEffect(() => {
    if (!visible) {
      return;
    }
    snapshot.current = JSON.stringify({ name: habit?.name ?? '', selectedGroupId: habit?.groupId ?? null, cadence: habit?.cadence ?? 'daily', targetCount: String(habit?.targetCount || 1), hasTarget: !!habit && habit.targetCount > 0 });
    setName(habit?.name ?? '');
    setSelectedGroupId(habit?.groupId ?? null);
    setCadence(habit?.cadence ?? 'daily');
    setHasTarget(!!habit && habit.targetCount > 0);
    setTargetCount(String(habit?.targetCount || 1));
  }, [habit, visible]);

  const handleSubmit = () => {
    const numericTarget = parseHabitTarget(hasTarget, targetCount);
    if (numericTarget === null) {
      Alert.alert('检查目标次数', '请输入 1–9999 的整数，或关闭“设置目标次数”。');
      return;
    }
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
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
      <EditorLayout title={habit ? '编辑习惯' : '新建习惯'} onClose={requestClose} onSave={handleSubmit} disabled={!name.trim()}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>习惯名称</Text>
            <TextInput
              autoFocus
              maxLength={40}
              accessibilityLabel="习惯名称"
              placeholder="例如：阅读 20 分钟"
              placeholderTextColor={theme.colors.textMuted}
              value={name}
              onChangeText={setName}
              style={styles.titleInput}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>记录周期</Text>
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
              <Text style={styles.label}>设置目标次数</Text>
              <Text style={styles.hint}>可选；不设置时只记录次数，不计算达标。</Text>
            </View>
            <Switch accessibilityLabel="设置目标次数" value={hasTarget} onValueChange={setHasTarget} />
          </View>

          {hasTarget && <View style={styles.targetRow}>
            <View style={styles.targetCopy}>
              <Text style={styles.label}>周期内目标次数</Text>
            </View>
            <TextInput
              keyboardType="number-pad"
              accessibilityLabel="周期内目标次数"
              maxLength={4}
              value={targetCount}
              onChangeText={setTargetCount}
              selectTextOnFocus
              style={styles.targetInput}
            />
          </View>}

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
      </EditorLayout>
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
    content: { padding: 16, gap: 18, paddingBottom: 44 },
    field: { gap: 11 },
    label: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary },
    hint: { marginTop: 6, fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
    titleInput: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 14,
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    cadenceList: { flexDirection: 'row', gap: 9 },
    cadenceCard: {
      flex: 1,
      minHeight: 54,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
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
      borderRadius: 10,
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
      borderRadius: 8,
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
