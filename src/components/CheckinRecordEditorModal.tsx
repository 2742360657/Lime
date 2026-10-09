import { Alert } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useHabits } from '../state/HabitStore';
import {
  buildFallbackTimestamp,
  buildTimestampForDateTime,
  getHourMinuteFromTimestamp,
  parseFlexibleTimeInput,
} from '../utils/date';

type CheckinRecordEditorModalProps = {
  visible: boolean;
  dateKey: string;
  title: string;
  initialTimestamp?: number;
  initialNote?: string;
  onClose: () => void;
  onSubmit: (timestamp: number, note: string) => void;
};

function getInitialParts(dateKey: string, initialTimestamp?: number) {
  const baseTimestamp = initialTimestamp ?? buildFallbackTimestamp(dateKey);
  return getHourMinuteFromTimestamp(baseTimestamp);
}

export function CheckinRecordEditorModal({
  visible,
  dateKey,
  title,
  initialTimestamp,
  initialNote = '',
  onClose,
  onSubmit,
}: CheckinRecordEditorModalProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [time, setTime] = useState('08:00');
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const next = getInitialParts(dateKey, initialTimestamp);
    setTime(`${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`);
    setNote(initialNote);
  }, [dateKey, initialNote, initialTimestamp, visible]);

  const handleSubmit = () => {
    const normalized = parseFlexibleTimeInput(time);
    if (!normalized) {
      Alert.alert('没认出这个时间', '可以试试 8:30、830、下午3点或 3pm。');
      return;
    }
    const [hour, minute] = normalized.split(':').map(Number);
    const timestamp = buildTimestampForDateTime(dateKey, hour, minute);
    if (timestamp === null) return;

    onSubmit(timestamp, note);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            autoFocus
            maxLength={20}
            value={time}
            onChangeText={setTime}
            onBlur={() => {
              const normalized = parseFlexibleTimeInput(time);
              if (normalized) setTime(normalized);
            }}
            placeholder="时间"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.timeInput}
          />
          <View style={styles.quickRow}>
            <TouchableOpacity
              onPress={() => {
                const now = new Date();
                setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
              }}
              style={styles.quickButton}
            >
              <Text style={styles.quickButtonText}>现在</Text>
            </TouchableOpacity>
            {['08:00', '12:00', '20:00'].map((value) => (
              <TouchableOpacity key={value} onPress={() => setTime(value)} style={styles.quickButton}>
                <Text style={styles.quickButtonText}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.noteField}>
            <Text style={styles.noteLabel}>备注</Text>
            <TextInput
              multiline
              maxLength={120}
              value={note}
              onChangeText={setNote}
              placeholder="备注"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.noteInput}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
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
      maxHeight: '84%',
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
    timeInput: {
      height: 64,
      borderRadius: 18,
      textAlign: 'center',
      fontSize: 24,
      fontWeight: '800',
      color: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    quickRow: {
      flexDirection: 'row',
      gap: 7,
    },
    quickButton: {
      flex: 1,
      borderRadius: 11,
      paddingVertical: 9,
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    quickButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    noteField: {
      gap: 8,
    },
    noteLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    noteInput: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.small,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.background,
      textAlignVertical: 'top',
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
