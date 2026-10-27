import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { appRepository } from '../storage/habitStorage';
import { getTheme } from '../theme';
import { createAppStore, type AppSnapshot, type AppStore } from './appStore';
import { createSelectionReader } from './selection';

const StoreContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => createAppStore(appRepository));
  useEffect(() => {
    void store.load();
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') void store.flush().catch(() => {});
    });
    return () => { subscription.remove(); };
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('AppProvider is missing');
  return store;
}

/** Subscribe to a selected slice; snapshot/status updates elsewhere do not invalidate it. */
export function useAppSelector<T>(selector: (state: AppSnapshot) => T) {
  const store = useAppStore();
  const committed = useRef<{ value: T } | undefined>(undefined);
  const getSelected = useMemo(() => createSelectionReader(store.getSnapshot, selector, committed.current), [store, selector]);
  const selected = useSyncExternalStore(store.subscribe, getSelected, getSelected);
  useEffect(() => { committed.current = { value: selected }; }, [selected]);
  return selected;
}

export function useAppActions() { return useAppStore().actions; }

export function useTheme() {
  const id = useAppSelector(s => s.appData.settings.themeId);
  return useMemo(() => getTheme(id), [id]);
}

export function useSettings() {
  const settings = useAppSelector(s => s.appData.settings);
  return { settings };
}

export function useTodos() {
  const todos = useAppSelector(s => s.appData.todos);
  return { todos };
}

export function useHabitData() {
  const { allHabits, groups } = useAppSelector(s => ({ allHabits: s.appData.habits, groups: s.appData.groups }));
  return useMemo(() => ({ allHabits, groups,
    habits: allHabits.filter(habit => habit.archivedAt === null),
    archivedHabits: allHabits.filter(habit => habit.archivedAt !== null),
  }), [allHabits, groups]);
}

export function useMemos() {
  const { memos, memoGroups } = useAppSelector(s => ({ memos: s.appData.memos, memoGroups: s.appData.memoGroups }));
  return useMemo(() => ({ memos, memoGroups,
    activeMemos: memos.filter(memo => memo.deletedAt === null),
    trashedMemos: memos.filter(memo => memo.deletedAt !== null).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  }), [memos, memoGroups]);
}
