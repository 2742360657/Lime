import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import { ThemedTextInput as TextInput } from './ThemedTextInput';


type TextEntryModalProps = {
  visible: boolean;
  title: string;
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  maxLength?: number;
  onClose: () => void;
  onSubmit: (value: string) => boolean;
};

export function TextEntryModal({
  visible,
  title,
  placeholder,
  submitLabel,
  initialValue = '',
  maxLength = 24,
  onClose,
  onSubmit,
}: TextEntryModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [initialValue, visible]);

  const handleSubmit = () => {
    const success = onSubmit(value);
    if (success) {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            accessibilityLabel={placeholder}
            returnKeyType="done"
            onSubmitEditing={() => { if (value.trim()) handleSubmit(); }}
            autoFocus
            maxLength={maxLength}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textMuted}
            value={value}
            onChangeText={setValue}
            style={styles.input}
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={!value.trim()} onPress={handleSubmit} style={[styles.button, styles.primaryButton, !value.trim() && { opacity: 0.4 }]}>
              <Text style={styles.primaryButtonText}>{submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: theme.colors.scrim,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
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
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.small,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.background,
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
      borderRadius: theme.radius.action,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.onPrimary,
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
