import {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import { loadAppDataFromDisk, saveAppDataToDisk } from '../storage/habitStorage';
import { getTheme, ThemeId } from '../theme';
import {type DocumentContent, database } from '../assistant/database';
import { migrateLegacyBusiness, readBusiness, writeBusiness } from '../assistant/businessStore';
import type { AppData, Memo } from '../types/habit';
import { clampToMinute, getTodayKey } from '../utils/date';
import { createId } from '../utils/id';

import { habitReducer } from './habitReducer';
import { createCheckinRecord } from './reducerHelpers';
import { HabitContext, initialState, type HabitInput, type TodoInput, type HabitAction } from './storeTypes';

// 对外保持原有导入路径，避免调用方改动。
export type { HabitInput, TodoInput } from './storeTypes';

export function HabitProvider({ children }: PropsWithChildren) {
  const [state, rawDispatch] = useReducer(habitReducer, initialState);
  const current = useRef(state);
  const mutationQueue = useRef(Promise.resolve());
  const publish = useCallback((next: typeof state) => {
    current.current = next;
    rawDispatch({type:'hydrate',appData:next.appData});
    rawDispatch({type:'set-error',error:next.error});
  }, []);
  const commitAction = useCallback((action: HabitAction) => {
    const operation=mutationQueue.current.then(async()=>{
      const next=await database.writeTransaction(async tx=>{
        if(action.type==='memo-update'&&action.expectedRevision!==undefined) {
          const doc=await tx.getOptional<{revision:number;deleted:number;title:string;body:string;date:string;group_id:string|null}>('SELECT * FROM documents WHERE id=?',[action.id]);
          const base=action.expectedContent;if(doc&&base&&(doc.title!==base.title||doc.body!==base.body||doc.group_id!==base.group_id))throw new Error('SOURCE_CHANGED');
          if(!doc||doc.deleted||doc.revision!==action.expectedRevision)throw new Error('SOURCE_CHANGED');
        }
        const fresh={...current.current,appData:await readBusiness(tx,current.current.appData)};
        const updated=habitReducer(fresh,action);
        await writeBusiness(tx,fresh.appData,updated.appData);
        return {...updated,appData:await readBusiness(tx,updated.appData)};
      });publish(next);return next;
    });
    mutationQueue.current=operation.then(()=>{}).catch(()=>{
      // Awaited memo calls render their own save/draft error; avoid competing dialogs.
      if(action.type==='memo-update'||action.type==='memo-add')return;
      current.current={...current.current,error:'操作未保存，请重试。原有记录仍保留。'};
      rawDispatch({type:'set-error',error:current.current.error});
    });
    return operation;
  },[publish]);
  const dispatch = useCallback((action: HabitAction) => {
    if(['hydrate','set-error','clear-error'].includes(action.type)) {
      current.current=habitReducer(current.current,action);rawDispatch(action);return;
    }
    void commitAction(action).catch(()=>{});
  },[commitAction]);
  const saveQueue = useRef(Promise.resolve());
  const addMemo = useCallback(async (groupId: string | null) => {
    const id = createId();
    const now = Date.now();
    await commitAction({
      type: 'memo-add',
      memo: {
        id,
        title: '',
        body: '',
        groupId,
        order: state.appData.memos.filter((memo) => memo.deletedAt === null && memo.groupId === groupId).length,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });
    return id;
  }, [state.appData.memos]);
  const updateMemo = useCallback(
    async (id: string, patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>,expectedRevision?:number,expectedContent?:DocumentContent) => {
      const next=await commitAction({ type: 'memo-update', id, patch,expectedRevision,expectedContent });return next.appData.memos.find(m=>m.id===id)?.revision??0;
    },
    []
  );
  const trashMemos = useCallback((ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'memo-soft-delete', ids });
  }, []);
  const restoreMemos = useCallback((ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'memo-restore', ids });
  }, []);
  const purgeMemos = useCallback((ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'memo-purge', ids });
  }, []);
  const purgeAllMemos = useCallback(() => dispatch({ type: 'memo-purge-all' }), []);
  const moveMemosToGroup = useCallback((ids: string[], groupId: string | null) => {
    if (ids.length > 0) dispatch({ type: 'memo-move-group', ids, groupId });
  }, []);
  const reorderMemos = useCallback((groupId: string | null, orderedIds: string[]) => {
    dispatch({ type: 'memo-reorder', orderedIds, groupId });
  }, []);
  const setTodoBucketCollapsed = useCallback((bucketId: string, collapsed: boolean) => {
    dispatch({ type: 'set-todo-bucket-collapsed', bucketId, collapsed });
  }, []);
  const moveTodosToBucket = useCallback((todoIds: string[], dueDateKey: string | null) => {
    if (todoIds.length > 0) dispatch({ type: 'move-todos-to-bucket', todoIds, dueDateKey });
  }, []);
  const moveHabitsToGroup = useCallback((ids: string[], groupId: string | null) => {
    if (ids.length > 0) dispatch({ type: 'move-habits-to-group', ids, groupId });
  }, []);
  const deleteHabits = useCallback((ids: string[]) => {
    if (ids.length > 0) dispatch({ type: 'delete-habits', ids });
  }, []);

  const addMemoGroup = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分类名称不能为空。' });
        return false;
      }
      const exists = state.appData.memoGroups.some(
        (group) => group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分类名称已存在，请换一个。' });
        return false;
      }
      dispatch({
        type: 'memo-group-add',
        group: { id: createId(), name: trimmed, order: state.appData.memoGroups.length, createdAt: Date.now() },
      });
      return true;
    },
    [state.appData.memoGroups]
  );

  const renameMemoGroup = useCallback(
    (groupId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分类名称不能为空。' });
        return false;
      }
      const exists = state.appData.memoGroups.some(
        (group) => group.id !== groupId && group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分类名称已存在，请换一个。' });
        return false;
      }
      dispatch({ type: 'memo-group-rename', groupId, name: trimmed });
      return true;
    },
    [state.appData.memoGroups]
  );

  const deleteMemoGroup = useCallback((groupId: string) => {
    dispatch({ type: 'memo-group-delete', groupId });
  }, []);

  const reorderMemoGroups = useCallback((groupIds: string[]) => {
    dispatch({ type: 'memo-group-reorder', groupIds });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const appData = await migrateLegacyBusiness(await loadAppDataFromDisk());
        if (!isMounted) {
          return;
        }
        dispatch({ type: 'hydrate', appData });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        dispatch({
          type: 'set-error',
          error: error instanceof Error ? error.message : '读取本地数据失败，请稍后重试。',
        });
        // Do not replace a failed database/import with an empty, writable dataset.
      }
    }

    hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!state.isHydrated) {
      return;
    }

    saveQueue.current = saveQueue.current.then(() => saveAppDataToDisk(state.appData)).catch((error: unknown) => {
      dispatch({
        type: 'set-error',
        error: error instanceof Error ? error.message : '保存本地数据失败，请稍后重试。',
      });
    });
  }, [state.appData, state.isHydrated]);

  useEffect(() => {
    if(!state.isHydrated)return;
    const refresh = () => {
      mutationQueue.current=mutationQueue.current.then(async () => {
        const appData=await database.readTransaction(tx => readBusiness(tx,current.current.appData));
        if(JSON.stringify(appData)!==JSON.stringify(current.current.appData))publish({...current.current,appData});
      }).catch(() => dispatch({type:'set-error',error:'读取本地记录失败，请保留数据并重试。'}));
    };
    const dispose = database.onChange({onChange:refresh},{tables:['tasks','habit_groups','habits','checkins','documents','document_groups']});
    refresh();
    return dispose;
  }, [state.isHydrated,dispatch,publish]);

  const clearError = useCallback(() => {
    dispatch({ type: 'clear-error' });
  }, []);

  const addGroup = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分组名称不能为空。' });
        return false;
      }

      const exists = state.appData.groups.some(
        (group) => group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分组名称已存在，请换一个。' });
        return false;
      }

      dispatch({
        type: 'add-group',
        group: {
          id: createId(),
          name: trimmed,
          order: state.appData.groups.length,
          createdAt: Date.now(),
        },
      });
      return true;
    },
    [state.appData.groups]
  );

  const renameGroup = useCallback(
    (groupId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '分组名称不能为空。' });
        return false;
      }

      const exists = state.appData.groups.some(
        (group) => group.id !== groupId && group.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        dispatch({ type: 'set-error', error: '分组名称已存在，请换一个。' });
        return false;
      }

      dispatch({ type: 'rename-group', groupId, name: trimmed });
      return true;
    },
    [state.appData.groups]
  );

  const deleteGroup = useCallback((groupId: string) => {
    dispatch({ type: 'delete-group', groupId });
  }, []);

  const reorderGroups = useCallback((groupIds: string[]) => {
    dispatch({ type: 'reorder-groups', groupIds });
  }, []);

  const addHabit = useCallback(
    (input: HabitInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '习惯名称不能为空。' });
        return false;
      }

      const normalizedGroupId =
        input.groupId && state.appData.groups.some((group) => group.id === input.groupId)
          ? input.groupId
          : null;
      const nextOrder = state.appData.habits.filter(
        (habit) => habit.groupId === normalizedGroupId
      ).length;

      dispatch({
        type: 'add-habit',
        habit: {
          id: createId(),
          name: trimmed,
          groupId: normalizedGroupId,
          order: nextOrder,
          cadence: input.cadence,
          targetCount: Math.max(1, Math.floor(input.targetCount)),
          createdAt: Date.now(),
          archivedAt: null,
          checkins: [],
        },
      });
      return true;
    },
    [state.appData.groups, state.appData.habits]
  );

  const updateHabit = useCallback(
    (habitId: string, input: HabitInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) {
        dispatch({ type: 'set-error', error: '习惯名称不能为空。' });
        return false;
      }
      const normalizedGroupId =
        input.groupId && state.appData.groups.some((group) => group.id === input.groupId)
          ? input.groupId
          : null;
      const currentHabit = state.appData.habits.find((habit) => habit.id === habitId);
      const nextOrder =
        currentHabit && currentHabit.groupId === normalizedGroupId
          ? currentHabit.order
          : state.appData.habits.filter((habit) => habit.groupId === normalizedGroupId).length;
      dispatch({
        type: 'update-habit',
        habitId,
        name: trimmed,
        groupId: normalizedGroupId,
        cadence: input.cadence,
        targetCount: Math.max(1, Math.floor(input.targetCount)),
        order: nextOrder,
      });
      return true;
    },
    [state.appData.groups, state.appData.habits]
  );

  const reorderHabits = useCallback((groupId: string | null, habitIds: string[]) => {
    dispatch({ type: 'reorder-habits', groupId, habitIds });
  }, []);

  const archiveHabit = useCallback((habitId: string) => {
    dispatch({ type: 'archive-habit', habitId });
  }, []);

  const restoreArchivedHabit = useCallback((habitId: string) => {
    dispatch({ type: 'restore-archived-habit', habitId });
  }, []);

  const deleteHabit = useCallback((habitId: string) => {
    dispatch({ type: 'delete-habit', habitId });
  }, []);

  const addCheckinNow = useCallback((habitId: string) => {
    const timestamp = clampToMinute(Date.now());
    const record = createCheckinRecord(getTodayKey(), timestamp, '');
    dispatch({ type: 'add-checkin-now', habitId, record });
    return record.id;
  }, []);

  const addCheckin = useCallback((habitId: string, dateKey: string, timestamp: number, note: string) => {
    dispatch({ type: 'add-checkin', habitId, dateKey, timestamp, note });
  }, []);

  const updateCheckin = useCallback(
    (habitId: string, recordId: string, timestamp: number, note: string) => {
      dispatch({ type: 'update-checkin', habitId, recordId, timestamp, note });
    },
    []
  );

  const deleteCheckin = useCallback((habitId: string, recordId: string) => {
    dispatch({ type: 'delete-checkin', habitId, recordId });
  }, []);

  const setThemeId = useCallback((themeId: ThemeId) => {
    dispatch({ type: 'set-theme-id', themeId });
  }, []);

  const replaceAppData = useCallback((appData: AppData) => {
    dispatch({ type: 'replace-app-data', appData });
  }, []);

  const updateProfile = useCallback((name: string, signature: string, avatarUri: string | null) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      dispatch({ type: 'set-error', error: '用户名不能为空。' });
      return false;
    }
    dispatch({
      type: 'update-profile',
      name: trimmedName,
      signature: signature.trim(),
      avatarUri,
    });
    return true;
  }, []);

  const addTodo = useCallback(
    (input: TodoInput) => {
      const title = input.title.trim();
      if (!title) {
        dispatch({ type: 'set-error', error: '待办标题不能为空。' });
        return false;
      }

      dispatch({
        type: 'add-todo',
        todo: {
          id: createId(),
          title,
          note: input.note.trim(),
          dueDateKey: input.dueDateKey,
          dueTime: input.dueTime,
          order: state.appData.todos.length,
          createdAt: Date.now(),
          completedAt: null,
        },
      });
      return true;
    },
    [state.appData.todos.length]
  );

  const updateTodo = useCallback((todoId: string, input: TodoInput) => {
    const title = input.title.trim();
    if (!title) {
      dispatch({ type: 'set-error', error: '待办标题不能为空。' });
      return false;
    }

    dispatch({
      type: 'update-todo',
      todoId,
      title,
      note: input.note.trim(),
      dueDateKey: input.dueDateKey,
      dueTime: input.dueTime,
    });
    return true;
  }, []);

  const setTodoCompleted = useCallback((todoId: string, completed: boolean) => {
    dispatch({ type: 'set-todo-completed', todoId, completedAt: completed ? Date.now() : null });
  }, []);

  const deleteTodo = useCallback((todoId: string) => {
    dispatch({ type: 'delete-todo', todoId });
  }, []);

  const reorderTodos = useCallback((todoIds: string[]) => {
    dispatch({ type: 'reorder-todos', todoIds });
  }, []);

  const value = useMemo(() => {
    const allHabits = state.appData.habits;
    const habits = allHabits.filter((habit) => habit.archivedAt === null);
    const archivedHabits = allHabits.filter((habit) => habit.archivedAt !== null);

    return {
      ...state,
      setTodoBucketCollapsed,
      allHabits,
      habits,
      archivedHabits,
      groups: state.appData.groups,
      todos: state.appData.todos,
      settings: state.appData.settings,
      theme: getTheme(state.appData.settings.themeId),
      memos: state.appData.memos,
      activeMemos: state.appData.memos.filter((memo) => memo.deletedAt === null),
      trashedMemos: state.appData.memos
        .filter((memo) => memo.deletedAt !== null)
        .sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0)),
      memoGroups: state.appData.memoGroups,
      addMemo,
      updateMemo,
      trashMemos,
      restoreMemos,
      purgeMemos,
      purgeAllMemos,
      moveMemosToGroup,
      reorderMemos,
      addMemoGroup,
      renameMemoGroup,
      deleteMemoGroup,
      reorderMemoGroups,
      moveTodosToBucket,
      moveHabitsToGroup,
      deleteHabits,
      clearError,
      addGroup,
      renameGroup,
      deleteGroup,
      reorderGroups,
      addHabit,
      updateHabit,
      reorderHabits,
      archiveHabit,
      restoreArchivedHabit,
      deleteHabit,
      addCheckinNow,
      addCheckin,
      updateCheckin,
      deleteCheckin,
      setThemeId,
      updateProfile,
      replaceAppData,
      addTodo,
      updateTodo,
      setTodoCompleted,
      deleteTodo,
      reorderTodos,
    };
  }, [
    state,
    setTodoBucketCollapsed,
    addMemo,
    updateMemo,
    trashMemos,
    restoreMemos,
    purgeMemos,
    purgeAllMemos,
    moveMemosToGroup,
    reorderMemos,
    addMemoGroup,
    renameMemoGroup,
    deleteMemoGroup,
    reorderMemoGroups,
    moveTodosToBucket,
    moveHabitsToGroup,
    deleteHabits,
    clearError,
    addGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    addHabit,
    updateHabit,
    reorderHabits,
    archiveHabit,
    restoreArchivedHabit,
    deleteHabit,
    addCheckinNow,
    addCheckin,
    updateCheckin,
    deleteCheckin,
    setThemeId,
    updateProfile,
    replaceAppData,
    addTodo,
    updateTodo,
    setTodoCompleted,
    deleteTodo,
    reorderTodos,
  ]);

  return <HabitContext.Provider value={value}>{children}</HabitContext.Provider>;
}

export function useHabits() {
  const context = useContext(HabitContext);
  if (!context) {
    throw new Error('useHabits must be used within HabitProvider');
  }
  return context;
}
