import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { DEFAULT_PROFILE_NAME, DEFAULT_PROFILE_SIGNATURE } from './defaults';
import { createSnapshotRepository } from './snapshotRepository';
export { DEFAULT_PROFILE_NAME, DEFAULT_PROFILE_SIGNATURE } from './defaults';

import { DEFAULT_THEME_ID, THEME_PRESETS, ThemeId } from '../theme';
import {
  AppBackupFile,
  AppData,
  AppSettings,
  CheckinRecord,
  Habit,
  HabitCadence,
  HabitGroup,
  LegacyV1HabitDataFile,
  LegacyV2AppDataFile,
  LegacyV3AppDataFile,
  LegacyV3CheckinRecord,
  LegacyV4AppDataFile,
  Memo,
  MemoGroup,
  TodoItem,
} from '../types/app';
import { buildFallbackTimestamp, clampToMinute, toCheckinDateKey } from '../utils/date';
import { normalizeHabitTarget } from '../utils/habitTarget';
import { createId } from '../utils/id';

const DATA_DIRECTORY = `${FileSystem.documentDirectory}habit-checkin/`;
const BACKUP_FILE_PREFIX = 'angelime-backup';


function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, value);
}

function migrateTimestampToRecord(timestamp: number): CheckinRecord {
  return {
    id: createId(),
    dateKey: toCheckinDateKey(timestamp),
    timestamp,
    note: '',
    createdAt: timestamp,
  };
}

function migrateLegacyRecord(record: LegacyV3CheckinRecord): CheckinRecord {
  const timestamp =
    typeof record.timestamp === 'number' ? record.timestamp : buildFallbackTimestamp(record.dateKey);

  return {
    id: record.id,
    dateKey: record.dateKey,
    timestamp,
    note: '',
    createdAt: record.createdAt,
  };
}

function sanitizeCheckinRecord(candidate: unknown): CheckinRecord | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Partial<CheckinRecord> & Partial<LegacyV3CheckinRecord>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.dateKey !== 'string' ||
    typeof raw.createdAt !== 'number'
  ) {
    return null;
  }

  if (typeof raw.timestamp === 'number') {
    return {
      id: raw.id,
      dateKey: raw.dateKey,
      timestamp: raw.timestamp,
      note: typeof raw.note === 'string' ? raw.note : '',
      createdAt: raw.createdAt,
    };
  }

  if (typeof raw.hasTime === 'boolean') {
    return migrateLegacyRecord({
      id: raw.id,
      dateKey: raw.dateKey,
      hasTime: raw.hasTime,
      timestamp: raw.timestamp ?? null,
      createdAt: raw.createdAt,
    });
  }

  return null;
}

function sanitizeHabitGroup(candidate: unknown, fallbackOrder = 0): HabitGroup | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Partial<HabitGroup>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    id: raw.id,
    name: raw.name.trim(),
    order: typeof raw.order === 'number' ? raw.order : fallbackOrder,
    createdAt: raw.createdAt,
  };
}

function isHabitCadence(value: unknown): value is HabitCadence {
  return value === 'daily' || value === 'weekly' || value === 'monthly';
}

function sanitizeHabit(candidate: unknown, fallbackOrder = 0): Habit | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Partial<Habit> & {
    hiddenAt?: unknown;
    archivedAt?: unknown;
    checkins?: unknown;
  };
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.createdAt !== 'number' ||
    !Array.isArray(raw.checkins)
  ) {
    return null;
  }

  const normalizedCheckins = raw.checkins
    .map((item) => {
      if (typeof item === 'number') {
        return migrateTimestampToRecord(item);
      }
      return sanitizeCheckinRecord(item);
    })
    .filter((record): record is CheckinRecord => record !== null)
    .map((record) => ({
      ...record,
      dateKey: toCheckinDateKey(record.timestamp),
      timestamp: clampToMinute(record.timestamp),
      note: record.note.trim(),
    }));

  return {
    id: raw.id,
    name: raw.name.trim(),
    groupId: typeof raw.groupId === 'string' ? raw.groupId : null,
    order: typeof raw.order === 'number' ? raw.order : fallbackOrder,
    cadence: isHabitCadence(raw.cadence) ? raw.cadence : 'daily',
    targetCount: normalizeHabitTarget(raw.targetCount),
    createdAt: raw.createdAt,
    archivedAt:
      typeof raw.archivedAt === 'number'
        ? raw.archivedAt
        : typeof raw.hiddenAt === 'number'
          ? raw.hiddenAt
          : null,
    checkins: normalizedCheckins,
  };
}

function sanitizeTodo(candidate: unknown, fallbackOrder = 0): TodoItem | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Partial<TodoItem>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title.trim(),
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
    dueDateKey: typeof raw.dueDateKey === 'string' ? raw.dueDateKey : null,
    dueTime: typeof raw.dueTime === 'string' ? raw.dueTime : null,
    order: typeof raw.order === 'number' ? raw.order : fallbackOrder,
    createdAt: raw.createdAt,
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null,
  };
}

function sanitizeMemoGroup(candidate: unknown, fallbackOrder = 0): MemoGroup | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Partial<MemoGroup>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name.trim()) {
    return null;
  }

  return {
    id: raw.id,
    name: raw.name.trim(),
    order: typeof raw.order === 'number' ? raw.order : fallbackOrder,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

/** v6 及更早版本用字符串 `category` 存分类，这里迁移成 `memoGroups` + `groupId`。 */
function migrateLegacyMemos(candidate: unknown, groups: MemoGroup[]) {
  if (!Array.isArray(candidate)) {
    return { memos: [] as Memo[], groups };
  }

  const nextGroups = [...groups];
  const groupIdByName = new Map(nextGroups.map((group) => [group.name, group.id]));
  const memos: Memo[] = [];

  for (const item of candidate) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const raw = item as Partial<Memo> & { category?: unknown; pinned?: unknown };
    if (
      typeof raw.id !== 'string' ||
      typeof raw.title !== 'string' ||
      typeof raw.body !== 'string' ||
      !Number.isFinite(raw.createdAt) ||
      !Number.isFinite(raw.updatedAt)
    ) {
      continue;
    }

    let groupId: string | null = null;
    if (typeof raw.groupId === 'string' && nextGroups.some((group) => group.id === raw.groupId)) {
      groupId = raw.groupId;
    } else if (typeof raw.category === 'string' && raw.category.trim()) {
      const name = raw.category.trim();
      let existingId = groupIdByName.get(name);
      if (!existingId) {
        existingId = createId();
        groupIdByName.set(name, existingId);
        nextGroups.push({
          id: existingId,
          name,
          order: nextGroups.length,
          createdAt: raw.createdAt as number,
        });
      }
      groupId = existingId;
    }

    memos.push({
      id: raw.id,
      title: raw.title,
      body: raw.body,
      groupId,
      order: typeof raw.order === 'number' ? raw.order : memos.length,
      createdAt: raw.createdAt as number,
      updatedAt: raw.updatedAt as number,
      deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : null,
    });
  }

  return { memos, groups: nextGroups };
}

function sanitizeSettings(candidate: unknown): AppSettings {
  const raw = candidate && typeof candidate === 'object' ? (candidate as Partial<AppSettings>) : {};

  const collapsedTodoBuckets = Array.isArray(raw.collapsedTodoBuckets)
    ? [...new Set(raw.collapsedTodoBuckets.filter((id): id is string => typeof id === 'string'))]
    : [];

  return {
    collapsedTodoBuckets,
    autoCheckUpdates: typeof raw.autoCheckUpdates === 'boolean' ? raw.autoCheckUpdates : true,
    lastUpdateCheckAt: typeof raw.lastUpdateCheckAt === 'number' && Number.isFinite(raw.lastUpdateCheckAt) && raw.lastUpdateCheckAt >= 0 ? raw.lastUpdateCheckAt : 0,
    skippedUpdateVersionCode: typeof raw.skippedUpdateVersionCode === 'number' && Number.isInteger(raw.skippedUpdateVersionCode) && raw.skippedUpdateVersionCode >= 0 && raw.skippedUpdateVersionCode <= 2_100_000_000 ? raw.skippedUpdateVersionCode : 0,
    themeId: isThemeId(raw.themeId) ? raw.themeId : DEFAULT_THEME_ID,
    profileName:
      typeof raw.profileName === 'string' && raw.profileName.trim()
        ? raw.profileName.trim()
        : DEFAULT_PROFILE_NAME,
    profileSignature:
      typeof raw.profileSignature === 'string'
        ? raw.profileSignature.trim()
        : DEFAULT_PROFILE_SIGNATURE,
    avatarUri: typeof raw.avatarUri === 'string' && raw.avatarUri ? raw.avatarUri : null,
  };
}

function buildDefaultAppData(): AppData {
  return {
    version: 7,
    habits: [],
    groups: [],
    todos: [],
    memoGroups: [],
    memos: [],
    settings: sanitizeSettings(null),
  };
}

function normalizeAppData(candidate: unknown): AppData {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('数据格式无效。');
  }

  const raw = candidate as Partial<AppData>;
  const groups = Array.isArray(raw.groups)
    ? raw.groups
        .map((group, index) => sanitizeHabitGroup(group, index))
        .filter((group): group is HabitGroup => group !== null)
        .sort((left, right) => left.order - right.order)
    : [];

  const groupIds = new Set(groups.map((group) => group.id));

  const habits = Array.isArray(raw.habits)
    ? raw.habits
        .map((habit, index) => sanitizeHabit(habit, index))
        .filter((habit): habit is Habit => habit !== null)
        .map((habit) => ({
          ...habit,
          groupId: habit.groupId && groupIds.has(habit.groupId) ? habit.groupId : null,
        }))
        .sort((left, right) => left.order - right.order)
    : [];

  const todos = Array.isArray(raw.todos)
    ? raw.todos
        .map((todo, index) => sanitizeTodo(todo, index))
        .filter((todo): todo is TodoItem => todo !== null)
        .sort((left, right) => left.order - right.order)
    : [];

  const memoGroups = Array.isArray(raw.memoGroups)
    ? raw.memoGroups
        .map((group, index) => sanitizeMemoGroup(group, index))
        .filter((group): group is MemoGroup => group !== null)
        .sort((left, right) => left.order - right.order)
    : [];

  const migratedMemos = migrateLegacyMemos(raw.memos, memoGroups);
  const memoGroupIds = new Set(migratedMemos.groups.map((group) => group.id));
  const memos = migratedMemos.memos
    .map((memo) => ({
      ...memo,
      groupId: memo.groupId && memoGroupIds.has(memo.groupId) ? memo.groupId : null,
    }))
    .sort((left, right) => left.order - right.order);

  return {
    version: 7,
    habits,
    groups,
    todos,
    memoGroups: migratedMemos.groups
      .slice()
      .sort((left, right) => left.order - right.order),
    memos,
    settings: sanitizeSettings(raw.settings),
  };
}

function migrateLegacyV1Data(candidate: unknown): AppData {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('旧版数据格式无效。');
  }

  const raw = candidate as LegacyV1HabitDataFile;
  if (raw.version !== 1 || !Array.isArray(raw.habits)) {
    throw new Error('旧版数据格式无效。');
  }

  const habits = raw.habits
    .map((habit, index) =>
      sanitizeHabit({
        ...habit,
        groupId: null,
        archivedAt: null,
      }, index)
    )
    .filter((habit): habit is Habit => habit !== null)
    .sort((left, right) => left.createdAt - right.createdAt);

  return {
    version: 7,
    habits,
    groups: [],
    todos: [],
    memoGroups: [],
    memos: [],
    settings: sanitizeSettings(null),
  };
}

function migrateLegacyV2Data(candidate: unknown): AppData {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('旧版数据格式无效。');
  }

  const raw = candidate as LegacyV2AppDataFile;
  if (raw.version !== 2) {
    throw new Error('旧版数据格式无效。');
  }

  return normalizeAppData({
    ...raw,
    version: 7,
    habits: raw.habits.map((habit) => ({
      ...habit,
      archivedAt: habit.hiddenAt ?? null,
    })),
  });
}

function migrateLegacyV3Data(candidate: unknown): AppData {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('旧版数据格式无效。');
  }

  const raw = candidate as LegacyV3AppDataFile;
  if (raw.version !== 3) {
    throw new Error('旧版数据格式无效。');
  }

  return normalizeAppData({
    ...raw,
    version: 7,
  });
}

function migrateLegacyV4Data(candidate: unknown): AppData {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('旧版数据格式无效。');
  }

  const raw = candidate as LegacyV4AppDataFile;
  if (raw.version !== 4) {
    throw new Error('旧版数据格式无效。');
  }

  return normalizeAppData({
    ...raw,
    version: 7,
    todos: [],
    memoGroups: [],
    memos: [],
  });
}

export function coerceAppData(candidate: unknown): AppData {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('数据格式无效。');
  }

  const raw = candidate as Record<string, unknown>;
  if (!Array.isArray(raw.habits)) throw new Error('数据中的习惯列表缺失或损坏。');
  for (const key of ['groups', 'todos', 'memoGroups', 'memos']) {
    if ((raw.version === 7 || raw[key] !== undefined) && !Array.isArray(raw[key])) {
      throw new Error('数据列表缺失或损坏，已停止读取以保护原文件。');
    }
  }
  if (raw.version === 7 || raw.version === 6 || raw.version === 5) {
    return normalizeAppData(candidate);
  }
  if (raw.version === 4) {
    return migrateLegacyV4Data(candidate);
  }
  if (raw.version === 3) {
    return migrateLegacyV3Data(candidate);
  }
  if (raw.version === 2) {
    return migrateLegacyV2Data(candidate);
  }
  if (raw.version === 1) {
    return migrateLegacyV1Data(candidate);
  }

  throw new Error('不支持的数据版本。');
}

export function buildBackupPayload(appData: AppData): string {
  const backup: AppBackupFile = {
    ...appData,
    exportedAt: Date.now(),
  };

  return JSON.stringify(backup, null, 2);
}

async function ensureStorageDirectory() {
  const directoryInfo = await FileSystem.getInfoAsync(DATA_DIRECTORY);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(DATA_DIRECTORY, { intermediates: true });
  }
}

export const appRepository = createSnapshotRepository<AppData>({
  exists: async path => (await FileSystem.getInfoAsync(path)).exists,
  read: path => FileSystem.readAsStringAsync(path),
  write: (path, contents) => FileSystem.writeAsStringAsync(path, contents),
  mkdir: async path => {
    if (!(await FileSystem.getInfoAsync(path)).exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  },
}, DATA_DIRECTORY, coerceAppData, buildDefaultAppData);

export async function loadAppDataFromDisk(): Promise<AppData> {
  return (await appRepository.load()).data;
}

export async function saveAppDataToDisk(appData: AppData) {
  await appRepository.save(appData);
}

export async function exportBackupFile(appData: AppData) {
  const fileName = `${BACKUP_FILE_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`;
  const exportUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(exportUri, buildBackupPayload(appData));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('当前环境不支持系统分享，请在支持分享的设备上操作。');
  }

  await Sharing.shareAsync(exportUri, {
    mimeType: 'application/json',
    dialogTitle: '导出备份',
    UTI: 'public.json',
  });
}

export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  return result.assets[0] ?? null;
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

export async function importBackupFile(fileUri: string): Promise<AppData> {
  const fileContents = await FileSystem.readAsStringAsync(fileUri);
  return coerceAppData(JSON.parse(fileContents));
}

export function getGroupUsageCount(habits: Habit[], groupId: string) {
  return habits.filter((habit) => habit.groupId === groupId).length;
}

export function getMemoGroupUsageCount(memos: Memo[], groupId: string) {
  return memos.filter((memo) => memo.deletedAt === null && memo.groupId === groupId).length;
}
