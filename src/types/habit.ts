import type { ThemeId } from '../theme';

export type CheckinRecord = {
  id: string;
  dateKey: string;
  timestamp: number;
  note: string;
  createdAt: number;
};

export type Habit = {
  revision?: number;
  id: string;
  name: string;
  groupId: string | null;
  order: number;
  cadence: HabitCadence;
  /** 0 means free recording without a completion goal. */
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
  revision?: number;
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
  revision?: number;
  date?: string;
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
  habits: Habit[];
  groups: HabitGroup[];
  todos: TodoItem[];
  memoGroups: MemoGroup[];
  memos: Memo[];
  settings: AppSettings;
};
