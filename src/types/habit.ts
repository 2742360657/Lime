import type { ThemeId } from '../theme';

export type CheckinRecord = {
  id: string;
  dateKey: string;
  timestamp: number;
  note: string;
  createdAt: number;
};

export type Habit = {
  id: string;
  name: string;
  groupId: string | null;
  order: number;
  cadence: HabitCadence;
  /** 0: free recording without a completion goal. */
  targetCount: number;
  createdAt: number;
  archivedAt: number | null;
  checkins: CheckinRecord[];
};

export type HabitGroup = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
};

export type HabitCadence = 'daily' | 'weekly' | 'monthly';

export type TodoItem = {
  id: string;
  title: string;
  note: string;
  dueDateKey: string | null;
  dueTime: string | null;
  order: number;
  createdAt: number;
  completedAt: number | null;
};

export type MemoGroup = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
};

export type Memo = {
  id: string;
  title: string;
  body: string;
  groupId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type AppSettings = {
  themeId: ThemeId;
  profileName: string;
  profileSignature: string;
  avatarUri: string | null;
  /** 已折叠的待办日期分组 id 列表（逾期/今天/明天/未来七天/稍后/无日期/已完成）。 */
  collapsedTodoBuckets: string[];
};

export type AppData = {
  version: 7;
  habits: Habit[];
  groups: HabitGroup[];
  todos: TodoItem[];
  memoGroups: MemoGroup[];
  memos: Memo[];
  settings: AppSettings;
};

export type AppBackupFile = AppData & {
  exportedAt: number;
};

export type LegacyV1HabitDataFile = {
  version: 1;
  habits: Array<{
    id: string;
    name: string;
    createdAt: number;
    checkins: number[];
  }>;
};

export type LegacyV2AppDataFile = {
  version: 2;
  habits: Array<{
    id: string;
    name: string;
    groupId: string | null;
    createdAt: number;
    hiddenAt?: number | null;
    checkins: number[];
  }>;
  groups: Array<Omit<HabitGroup, 'order'>>;
  settings: AppSettings;
};

export type LegacyV3CheckinRecord = {
  id: string;
  dateKey: string;
  hasTime: boolean;
  timestamp: number | null;
  createdAt: number;
};

export type LegacyV3AppDataFile = {
  version: 3;
  habits: Array<{
    id: string;
    name: string;
    groupId: string | null;
    createdAt: number;
    hiddenAt?: number | null;
    archivedAt?: number | null;
    checkins: Array<number | LegacyV3CheckinRecord>;
  }>;
  groups: Array<Omit<HabitGroup, 'order'>>;
  settings: AppSettings;
};

export type LegacyV4AppDataFile = {
  version: 4;
  habits: Array<Omit<Habit, 'order' | 'cadence' | 'targetCount'>>;
  groups: Array<Omit<HabitGroup, 'order'>>;
  settings: AppSettings;
};
