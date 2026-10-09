import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { database } from '../storage/database';
import { reminderService } from './native';
import { NOTIFICATION_PREFIX } from './planner';

export function ReminderLifecycle({ onOpen }: { onOpen: (kind: 'rule' | 'task', id: string) => void }) {
  useEffect(() => {
    void reminderService.refresh();
    const dispose = database.onChange({ onChange: () => { void reminderService.refresh(); } }, { tables: ['tasks', 'local_reminder_rules', 'local_meta'] });
    const active = AppState.addEventListener('change', state => { if (state === 'active') void reminderService.refresh(); });
    const received = Notifications.addNotificationReceivedListener(() => { void reminderService.refresh(); });
    let mounted = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!mounted || !response) return;
      const request = response.notification.request, data = request.content.data;
      if (!data || !request.identifier.startsWith(NOTIFICATION_PREFIX) || data.limeReminder !== true ||
        !['task', 'rule'].includes(String(data.sourceKind)) || typeof data.sourceId !== 'string') return;
      onOpen(data.sourceKind as 'task' | 'rule', data.sourceId);
      void Notifications.clearLastNotificationResponseAsync();
    };
    const response = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    return () => { mounted = false; dispose(); active.remove(); received.remove(); response.remove(); };
  }, [onOpen]);
  return null;
}
