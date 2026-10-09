import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useHabits } from '../state/HabitStore';

type GroupPickerModalProps = {
  visible: boolean;
  title: string;
  selectedGroupId: string | null;
  onClose: () => void;
  onSubmit: (groupId: string | null) => void;
  /** 自定义候选分组；不传则使用习惯分组。 */
  options?: Array<{ id: string | null; label: string }>;
  /** 是否提供“未分组/未分类”这一项。 */
  allowNull?: boolean;
  nullLabel?: string;
};

export function GroupPickerModal({
  visible,
  title,
  selectedGroupId,
  onClose,
  onSubmit,
  options,
  allowNull = true,
  nullLabel = '未分组',
}: GroupPickerModalProps) {
  const { theme, groups } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [nextGroupId, setNextGroupId] = useState<string | null>(selectedGroupId);

  const candidates = useMemo(
    () => options ?? groups.map((group) => ({ id: group.id, label: group.name })),
    [groups, options]
  );

  useEffect(() => {
    if (visible) {
      setNextGroupId(selectedGroupId);
    }
  }, [selectedGroupId, visible]);

  const handleClose = () => {
    setNextGroupId(selectedGroupId);
    onClose();
  };

  const handleSubmit = () => {
    onSubmit(nextGroupId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <ScrollView contentContainerStyle={styles.groupList} showsVerticalScrollIndicator={false}>
            {allowNull ? (
              <GroupRow
                label={candidates.find((candidate) => candidate.id === null)?.label ?? nullLabel}
                selected={nextGroupId === null}
                onPress={() => setNextGroupId(null)}
              />
            ) : null}
            {candidates
              .filter((candidate) => candidate.id !== null)
              .map((candidate) => (
                <GroupRow
                  key={candidate.id ?? '__none__'}
                  label={candidate.label}
                  selected={nextGroupId === candidate.id}
                  onPress={() => setNextGroupId(candidate.id)}
                />
              ))}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity onPress={handleClose} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>确认</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  function GroupRow({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity onPress={onPress} style={[styles.groupRow, selected && styles.groupRowActive]}>
        <Text style={[styles.groupRowText, selected && styles.groupRowTextActive]}>{label}</Text>
        {selected ? <Text style={styles.selectedMark}>已选</Text> : null}
      </TouchableOpacity>
    );
  }
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: 'rgba(18, 31, 24, 0.22)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxHeight: '74%',
      borderRadius: theme.radius.large,
      padding: 20,
      backgroundColor: theme.colors.surface,
      gap: 14,
      ...theme.shadow,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    groupList: {
      gap: 10,
    },
    groupRow: {
      borderRadius: theme.radius.medium,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    groupRowActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    groupRowText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    groupRowTextActive: {
      color: theme.colors.primary,
    },
    selectedMark: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    button: {
      minWidth: 92,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.white,
    },
    secondaryButton: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });
}
