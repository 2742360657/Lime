import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { database } from '../storage/database';
import { createReminderService, type NotificationDriver } from './service';

export const CHANNEL = 'lime-reminders';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
export async function requestReminderPermission() {
  await Notifications.setNotificationChannelAsync(CHANNEL, { name: '酸橙日常提醒', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default', description: '你设置的提醒与启用的待办到期提醒' });
  return (await Notifications.requestPermissionsAsync()).granted;
}
export const notificationDriver: NotificationDriver = {
  async allowed() {
    const permission = await Notifications.getPermissionsAsync();
    const channel = await Notifications.getNotificationChannelAsync(CHANNEL);
    return permission.granted && !!channel && channel.importance !== Notifications.AndroidImportance.NONE;
  },
  async pending() { return (await Notifications.getAllScheduledNotificationsAsync()).map(request => request.identifier); },
  cancel: Notifications.cancelScheduledNotificationAsync,
  async schedule(identifier, occurrence) {
    await Notifications.scheduleNotificationAsync({ identifier, content: { title: occurrence.title, body: occurrence.body, sound: 'default',
      data: { limeReminder: true, sourceKind: occurrence.sourceKind, sourceId: occurrence.sourceId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(occurrence.at), channelId: CHANNEL },
    });
  },
};
export const reminderService = createReminderService(database, notificationDriver, { now: Date.now, digest: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value) });
