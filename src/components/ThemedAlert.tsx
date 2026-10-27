import { useSyncExternalStore } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useHabits } from '../state/HabitStore';
import { alertStore } from '../theme/alertStore';
export { Alert } from '../theme/alertStore';

/** Shared app confirmations use the chosen palette, including destructive actions. */
export function ThemedAlertHost() {
  const request = useSyncExternalStore(alertStore.subscribe, alertStore.getSnapshot);
  const { theme } = useHabits();
  if (!request) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={() => alertStore.dismiss(request.id)}>
    <View style={[styles.overlay, { backgroundColor: theme.colors.scrim }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => alertStore.dismiss(request.id)} accessibilityElementsHidden importantForAccessibility="no" />
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.textPrimary }]}>{request.title}</Text>
        {!!request.message && <ScrollView style={styles.messageScroll}><Text style={[styles.message, { color: theme.colors.textSecondary }]}>{request.message}</Text></ScrollView>}
        <View style={[styles.buttons, request.buttons.length > 2 && styles.stacked]}>
          {request.buttons.map((button, index) => {
            const danger = button.style === 'destructive';
            const primary = !danger && button.style !== 'cancel' && index === request.buttons.length - 1;
            return <Pressable key={index} accessibilityRole="button" accessibilityLabel={button.text ?? '确定'}
              onPress={() => alertStore.choose(request.id, index)}
              style={[styles.button, request.buttons.length > 2 && styles.fullButton, { backgroundColor: danger ? theme.colors.dangerSoft : primary ? theme.colors.primary : theme.colors.surfaceMuted }]}>
              <Text style={[styles.buttonText, { color: danger ? theme.colors.danger : primary ? theme.colors.white : theme.colors.textSecondary }]}>{button.text ?? '确定'}</Text>
            </Pressable>;
          })}
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, maxHeight: '80%', borderRadius: 14, padding: 20, gap: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  messageScroll: { flexGrow: 0 }, message: { fontSize: 14, lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 }, stacked: { flexDirection: 'column' },
  button: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  fullButton: { flex: 0 }, buttonText: { fontSize: 14, fontWeight: '600' },
});
