import { createContext } from 'react';

import { DEFAULT_PROFILE_NAME, DEFAULT_PROFILE_SIGNATURE } from '../storage/habitStorage';
import { DEFAULT_THEME_ID, getTheme, ThemeId } from '../theme';
import type {
  AppData,
  AppSettings,
  CheckinRecord,
  Habit,
  HabitCadence,
  HabitGroup,
  Memo,
  MemoGroup,
  TodoItem,
} from '../types/habit';

export type HabitInput = {
  name: string;
  groupId: string | null;
  cadence: HabitCadence;
  targetCount: number;
};

export type TodoInput = {
  title: string;
  note: string;
  dueDateKey: string | null;
  dueTime: string | null;
};

export type HabitState = {
  appData: AppData;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
};

export type UpdatePreferences = Pick<AppSettings, 'autoCheckUpdates' | 'lastUpdateCheckAt' | 'skippedUpdateVersionCode'>;

export type HabitAction =
  | { type: 'update-preferences'; patch: Partial<UpdatePreferences> }
  | { type: 'memo-add'; memo: Memo }
  | { type: 'memo-update'; id: string; patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>> }
  | { type: 'memo-soft-delete'; ids: string[] }
  | { type: 'memo-restore'; ids: string[] }
  | { type: 'memo-purge'; ids: string[] }
  | { type: 'memo-purge-all' }
  | { type: 'memo-move-group'; ids: string[]; groupId: string | null }
  | { type: 'memo-reorder'; orderedIds: string[]; groupId: string | null }
  | { type: 'memo-group-add'; group: MemoGroup }
  | { type: 'memo-group-rename'; groupId: string; name: string }
  | { type: 'memo-group-delete'; groupId: string }
  | { type: 'memo-group-reorder'; groupIds: string[] }
  | { type: 'set-todo-bucket-collapsed'; bucketId: string; collapsed: boolean }
  | { type: 'move-todos-to-bucket'; todoIds: string[]; dueDateKey: string | null }
  | { type: 'hydrate'; appData: AppData }
  | { type: 'set-error'; error: string | null }
  | { type: 'clear-error' }
  | { type: 'replace-app-data'; appData: AppData }
  | { type: 'set-theme-id'; themeId: ThemeId }
  | { type: 'update-profile'; name: string; signature: string; avatarUri: string | null }
  | { type: 'add-group'; group: HabitGroup }
  | { type: 'rename-group'; groupId: string; name: string }
  | { type: 'delete-group'; groupId: string }
  | { type: 'reorder-groups'; groupIds: string[] }
  | { type: 'add-habit'; habit: Habit }
  | {
      type: 'update-habit';
      habitId: string;
      name: string;
      groupId: string | null;
      cadence: HabitCadence;
      targetCount: number;
      order: number;
    }
  | { type: 'reorder-habits'; groupId: string | null; habitIds: string[] }
  | { type: 'move-habits-to-group'; ids: string[]; groupId: string | null }
  | { type: 'delete-habits'; ids: string[] }
  | { type: 'archive-habit'; habitId: string }
  | { type: 'restore-archived-habit'; habitId: string }
  | { type: 'delete-habit'; habitId: string }
  | { type: 'add-checkin-now'; habitId: string; record: CheckinRecord }
  | { type: 'add-checkin'; habitId: string; timestamp: number; note: string }
  | {
      type: 'update-checkin';
      habitId: string;
      recordId: string;
      timestamp: number;
      note: string;
    }
  | { type: 'delete-checkin'; habitId: string; recordId: string }
  | { type: 'add-todo'; todo: TodoItem }
  | {
      type: 'update-todo';
      todoId: string;
      title: string;
      note: string;
      dueDateKey: string | null;
      dueTime: string | null;
    }
  | { type: 'set-todo-completed'; todoId: string; completedAt: number | null }
  | { type: 'delete-todo'; todoId: string }
  | { type: 'reorder-todos'; todoIds: string[] };

export type HabitContextValue = HabitState & {
  setUpdatePreferences: (patch: Partial<UpdatePreferences>) => void;
  setTodoBucketCollapsed: (bucketId: string, collapsed: boolean) => void;
  allHabits: Habit[];
  habits: Habit[];
  archivedHabits: Habit[];
  groups: HabitGroup[];
  todos: TodoItem[];
  settings: AppSettings;
  theme: ReturnType<typeof getTheme>;
  memos: Memo[];
  trashedMemos: Memo[];
  activeMemos: Memo[];
  memoGroups: MemoGroup[];
  addMemo: (groupId: string | null) => string;
  updateMemo: (id: string, patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>) => void;
  trashMemos: (ids: string[]) => void;
  restoreMemos: (ids: string[]) => void;
  purgeMemos: (ids: string[]) => void;
  purgeAllMemos: () => void;
  moveMemosToGroup: (ids: string[], groupId: string | null) => void;
  reorderMemos: (groupId: string | null, orderedIds: string[]) => void;
  addMemoGroup: (name: string) => boolean;
  renameMemoGroup: (groupId: string, name: string) => boolean;
  deleteMemoGroup: (groupId: string) => void;
  reorderMemoGroups: (groupIds: string[]) => void;
  moveTodosToBucket: (todoIds: string[], dueDateKey: string | null) => void;
  moveHabitsToGroup: (ids: string[], groupId: string | null) => void;
  deleteHabits: (ids: string[]) => void;
  clearError: () => void;
  addGroup: (name: string) => boolean;
  renameGroup: (groupId: string, name: string) => boolean;
  deleteGroup: (groupId: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  addHabit: (input: HabitInput) => boolean;
  updateHabit: (habitId: string, input: HabitInput) => boolean;
  reorderHabits: (groupId: string | null, habitIds: string[]) => void;
  archiveHabit: (habitId: string) => void;
  restoreArchivedHabit: (habitId: string) => void;
  deleteHabit: (habitId: string) => void;
  addCheckinNow: (habitId: string) => string;
  addCheckin: (habitId: string, timestamp: number, note: string) => void;
  updateCheckin: (habitId: string, recordId: string, timestamp: number, note: string) => void;
  deleteCheckin: (habitId: string, recordId: string) => void;
  setThemeId: (themeId: ThemeId) => void;
  updateProfile: (name: string, signature: string, avatarUri: string | null) => boolean;
  replaceAppData: (appData: AppData) => void;
  addTodo: (input: TodoInput) => boolean;
  updateTodo: (todoId: string, input: TodoInput) => boolean;
  setTodoCompleted: (todoId: string, completed: boolean) => void;
  deleteTodo: (todoId: string) => void;
  reorderTodos: (todoIds: string[]) => void;
};

export const HabitContext = createContext<HabitContextValue | null>(null);

export const initialState: HabitState = {
  appData: {
      version: 7,
      habits: [],
      groups: [],
      todos: [],
      memoGroups: [],
      memos: [],
    settings: {
      themeId: DEFAULT_THEME_ID,
      profileName: DEFAULT_PROFILE_NAME,
      profileSignature: DEFAULT_PROFILE_SIGNATURE,
      avatarUri: null,
      collapsedTodoBuckets: [],
      autoCheckUpdates: true,
      lastUpdateCheckAt: 0,
      skippedUpdateVersionCode: 0,
    },
  },
  isLoading: true,
  isHydrated: false,
  error: null,
};
