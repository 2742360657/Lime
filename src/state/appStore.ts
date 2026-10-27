import type { DataRepository } from '../storage/snapshotRepository';
import type { AppData } from '../types/app';
import { createHabitActions } from './actions/habitActions';
import { createMemoActions } from './actions/memoActions';
import { createSettingsActions } from './actions/settingsActions';
import { createTodoActions } from './actions/todoActions';
import { appReducer } from './appReducer';
import { initialState, type AppAction, type AppState } from './storeTypes';

export type AppSnapshot = AppState & {
  loadError: string | null;
  saveStatus: 'saved' | 'saving' | 'error';
  saveError: string | null;
  storageNotice: string | null;
  isRestoring: boolean;
};

/** Synchronous business commands, selective subscriptions, and acknowledged serial persistence. */
export function createAppStore(repository: DataRepository<AppData>) {
  let state: AppSnapshot = {
    ...initialState, loadError: null, saveStatus: 'saved', saveError: null, storageNotice: null, isRestoring: false,
  };
  const listeners = new Set<() => void>();
  let revision = 0;
  let savedRevision = 0;
  let saving: Promise<void> | null = null;
  let loading: Promise<void> | null = null;
  let restoreRequested = false;

  const publish = (patch: Partial<AppSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };

  function save() {
    if (saving) return saving;
    if (!state.isHydrated || state.isRestoring || revision === savedRevision) return Promise.resolve();
    publish({ saveStatus: 'saving', saveError: null });
    saving = Promise.resolve().then(async () => {
      while (savedRevision < revision) {
        const targetRevision = revision;
        const data = state.appData;
        await repository.save(data);
        savedRevision = targetRevision;
      }
      publish({ saveStatus: 'saved', saveError: null });
    }).catch((error: unknown) => {
      publish({ saveStatus: 'error', saveError: '保存失败，当前修改尚未保存。请保留应用并重试。' });
      throw error;
    }).finally(() => {
      saving = null;
      if (state.saveStatus !== 'error' && savedRevision < revision) void save().catch(() => {});
    });
    return saving;
  }

  const dispatch = (action: AppAction) => {
    if ((!state.isHydrated || restoreRequested) && action.type !== 'clear-error' && action.type !== 'set-error') return;
    const next = appReducer(state, action);
    if (next === state) return;
    const changed = next.appData !== state.appData;
    if (changed) revision++;
    publish(next);
    if (changed) void save().catch(() => { /* Persistent error remains visible until a successful retry. */ });
  };

  async function load() {
    if (loading) return loading;
    if (state.isHydrated || restoreRequested) return;
    publish({ isLoading: true, loadError: null });
    loading = repository.load().then(({ data, recovered }) => {
      publish({ appData: data, isHydrated: true, isLoading: false,
        storageNotice: recovered ? '一份本地保存文件校验失败，已载入完整副本。请核对最近修改并导出备份。' : null });
    }).catch(() => {
      // No default-data hydration and no saving when the original could not be read.
      publish({ isLoading: false, isHydrated: false, loadError: '本地数据无法读取。原文件已保留，可以重新读取或从自己的备份恢复。' });
    }).finally(() => { loading = null; });
    return loading;
  }

  async function restore(data: AppData) {
    if (restoreRequested || state.isLoading) throw new Error('正在处理本地数据，请稍后重试。');
    restoreRequested = true;
    try {
      await save();
      publish({ isRestoring: true });
      await repository.preserveForRecovery();
      await repository.save(data);
      revision++;
      savedRevision = revision;
      publish({ appData: data, isHydrated: true, loadError: null, saveStatus: 'saved', saveError: null, storageNotice: null });
    } finally { restoreRequested = false; publish({ isRestoring: false }); }
  }

  const context = { dispatch, getData: () => state.appData };
  const actions = {
    ...createHabitActions(context), ...createTodoActions(context),
    ...createMemoActions(context), ...createSettingsActions(context),
    replaceAppData: restore,
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    async flush() {
      if (!state.isHydrated) throw new Error('本地数据尚未成功读取，已阻止覆盖保存。');
      const target = revision;
      do { await save(); } while (savedRevision < target);
    },
    actions,
    dismissStorageNotice: () => publish({ storageNotice: null }),
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
