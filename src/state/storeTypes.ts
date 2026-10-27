import { DEFAULT_PROFILE_NAME, DEFAULT_PROFILE_SIGNATURE } from '../storage/defaults';
import { DEFAULT_THEME_ID, ThemeId } from '../theme';
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
} from '../types/app';

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

export type AppState = {
  appData: AppData;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
};

export type UpdatePreferences = Pick<AppSettings, 'autoCheckUpdates' | 'lastUpdateCheckAt' | 'skippedUpdateVersionCode'>;

export type AppAction =
  | { type: 'organize-memos'; placements: import('./organize').Placement[] }
  | { type: 'organize-habits'; placements: import('./organize').Placement[] }
  | { type: 'organize-todos'; ids: string[]; moves: Array<{ id: string; dueDateKey: string | null }> }
  | { type: 'delete-todos'; ids: string[] }
  | { type: 'update-preferences'; patch: Partial<UpdatePreferences> }
  | { type: 'memo-add'; memo: Memo }
  | { type: 'memo-update'; id: string; patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>> }
  | { type: 'memo-soft-delete'; ids: string[] }
  | { type: 'memo-restore'; ids: string[] }
  | { type: 'memo-purge'; ids: string[] }
  | { type: 'memo-purge-all' }
  | { type: 'memo-move-group'; ids: string[]; groupId: string | null }
  | { type: 'memo-group-add'; group: MemoGroup }
  | { type: 'memo-group-rename'; groupId: string; name: string }
  | { type: 'memo-group-delete'; groupId: string }
  | { type: 'memo-group-reorder'; groupIds: string[] }
  | { type: 'set-todo-bucket-collapsed'; bucketId: string; collapsed: boolean }
  | { type: 'move-todos-to-bucket'; todoIds: string[]; dueDateKey: string | null }
  | { type: 'set-error'; error: string | null }
  | { type: 'clear-error' }
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

export const initialState: AppState = {
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
