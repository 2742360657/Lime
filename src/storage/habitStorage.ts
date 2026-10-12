import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { Habit, Memo } from '../types/habit';

const DATA_DIRECTORY = `${FileSystem.documentDirectory}lime-profile/`;
async function ensureStorageDirectory() {
  const directoryInfo = await FileSystem.getInfoAsync(DATA_DIRECTORY);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(DATA_DIRECTORY, { intermediates: true });
  }
}

export async function pickAndSaveProfileAvatar() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  await ensureStorageDirectory();
  const asset = result.assets[0];
  const extensionMatch = asset.name?.toLowerCase().match(/\.(png|jpe?g|webp)$/);
  const extension = extensionMatch?.[0] ?? '.jpg';
  const destination = `${DATA_DIRECTORY}profile-avatar-${Date.now()}${extension}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  return destination;
}

export function getGroupUsageCount(habits: Habit[], groupId: string) {
  return habits.filter((habit) => habit.groupId === groupId).length;
}

export function getMemoGroupUsageCount(memos: Memo[], groupId: string) {
  return memos.filter((memo) => memo.deletedAt === null && memo.groupId === groupId).length;
}
