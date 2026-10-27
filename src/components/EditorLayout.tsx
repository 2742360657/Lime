import { type PropsWithChildren, useCallback } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../state/AppProvider';
import { Alert } from './ThemedAlert';

export function useConfirmDiscard(dirty: boolean, onClose: () => void) {
  return useCallback(() => {
    if (!dirty) { onClose(); return; }
    Alert.alert('放弃未保存的修改？', '当前修改还没有保存。', [
      { text: '继续编辑', style: 'cancel' },
      { text: '放弃修改', style: 'destructive', onPress: onClose },
    ]);
  }, [dirty, onClose]);
}

export function EditorLayout({ title, onClose, onSave, disabled, children }: PropsWithChildren<{
  title: string; onClose: () => void; onSave: () => void; disabled?: boolean;
}>) {
  const theme = useTheme();
  return <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: theme.colors.background }]}>
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="取消编辑" onPress={onClose} style={styles.action}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 15 }}>取消</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`保存${title.includes('习惯') ? '习惯' : '待办'}`} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onSave} style={[styles.action, { backgroundColor: theme.colors.primary, opacity: disabled ? 0.4 : 1, borderRadius: 8 }]}>
          <Text style={{ color: theme.colors.white, fontSize: 15, fontWeight: '700' }}>保存</Text>
        </TouchableOpacity>
      </View>
      {children}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, header: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  action: { minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
});
