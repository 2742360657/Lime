import { TodoItem } from '../types/app';
import { addDaysToDateKey, compareDateKeys, formatFriendlyDate, getTodayKey } from './date';

export type TodoBucketId = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later' | 'no-date';

export type TodoBucket = {
  id: TodoBucketId;
  title: string;
  todos: TodoItem[];
};

function dueSortValue(todo: TodoItem) {
  if (!todo.dueDateKey) {
    return '9999-99-99 99:99';
  }
  return `${todo.dueDateKey} ${todo.dueTime ?? '23:59'}`;
}

export function compareTodosSmart(left: TodoItem, right: TodoItem) {
  const dueComparison = dueSortValue(left).localeCompare(dueSortValue(right));
  if (dueComparison !== 0) {
    return dueComparison;
  }
  return left.order - right.order;
}

export function buildTodoBuckets(todos: TodoItem[]): TodoBucket[] {
  const todayKey = getTodayKey();
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const nextWeekKey = addDaysToDateKey(todayKey, 7);
  const bucketMap: Record<TodoBucketId, TodoItem[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    soon: [],
    later: [],
    'no-date': [],
  };

  for (const todo of todos.filter((item) => item.completedAt === null)) {
    if (!todo.dueDateKey) {
      bucketMap['no-date'].push(todo);
    } else if (isTodoOverdue(todo)) {
      bucketMap.overdue.push(todo);
    } else if (todo.dueDateKey === todayKey) {
      bucketMap.today.push(todo);
    } else if (todo.dueDateKey === tomorrowKey) {
      bucketMap.tomorrow.push(todo);
    } else if (compareDateKeys(todo.dueDateKey, nextWeekKey) <= 0) {
      bucketMap.soon.push(todo);
    } else {
      bucketMap.later.push(todo);
    }
  }

  const definitions: Array<[TodoBucketId, string]> = [
    ['overdue', '已逾期'],
    ['today', '今天'],
    ['tomorrow', '明天'],
    ['soon', '未来 2–7 天'],
    ['later', '7 天以后'],
    ['no-date', '无日期'],
  ];

  return definitions
    .map(([id, title]) => ({ id, title, todos: bucketMap[id].sort(compareTodosSmart) }))
    .filter((bucket) => bucket.todos.length > 0);
}

export function formatTodoDue(todo: TodoItem) {
  if (!todo.dueDateKey) {
    return '无截止时间';
  }
  return `${formatFriendlyDate(todo.dueDateKey)}${todo.dueTime ? ` ${todo.dueTime}` : ''}`;
}

export const TODO_BUCKET_TITLES: Record<TodoBucketId, string> = {
  overdue: '已逾期',
  today: '今天',
  tomorrow: '明天',
  soon: '未来 2–7 天',
  later: '7 天以后',
  'no-date': '无日期',
};

export const TODO_COMPLETED_BUCKET_ID = 'completed';

/**
 * 多选时“移动到某个日期分组”对应的截止日期。
 * 已逾期与今天都落到今天；未来分组分别映射到 3 天、30 天后。
 */
export function bucketToDueDateKey(bucketId: string): string | null {
  const todayKey = getTodayKey();
  switch (bucketId) {
    case 'overdue':
    case 'today':
      return todayKey;
    case 'tomorrow':
      return addDaysToDateKey(todayKey, 1);
    case 'soon':
      return addDaysToDateKey(todayKey, 3);
    case 'later':
      return addDaysToDateKey(todayKey, 30);
    case 'no-date':
    case TODO_COMPLETED_BUCKET_ID:
      return null;
    default:
      return null;
  }
}

/** 多选页里待办所属的分组 id：未完成用日期分组，已完成单独一组。 */
export function todoGroupKey(todo: TodoItem, buckets: TodoBucket[]) {
  if (todo.completedAt !== null) {
    return TODO_COMPLETED_BUCKET_ID;
  }
  const bucket = buckets.find((entry) => entry.todos.some((item) => item.id === todo.id));
  return bucket?.id ?? 'no-date';
}

export function isTodoOverdue(todo: TodoItem) {
  if (!todo.dueDateKey) {
    return false;
  }
  const todayKey = getTodayKey();
  const dateComparison = compareDateKeys(todo.dueDateKey, todayKey);
  if (dateComparison < 0) {
    return true;
  }
  if (dateComparison > 0 || !todo.dueTime) {
    return false;
  }
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return todo.dueTime < currentTime;
}

/** Explicit dates for rescheduling, distinct from the automatically computed date buckets. */
export function getTodoDateOptions() {
  return [
    { id: 'today', label: '今天' },
    { id: 'tomorrow', label: '明天' },
    { id: 'soon', label: '3 天后' },
    { id: 'later', label: '30 天后' },
    { id: 'no-date', label: '无截止日期' },
  ].map((option) => ({ ...option, dueDateKey: bucketToDueDateKey(option.id),
    label: option.id === 'no-date' ? option.label : `${option.label} · ${bucketToDueDateKey(option.id)}` }));
}

/** Dragging within a date bucket cannot override differing deadlines. */
export function hasTodoDateOrderConflict(ordered: Array<{ id: string; groupId: string }>, todos: TodoItem[]) {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  const previous = new Map<string, TodoItem>();
  for (const entry of ordered) {
    const todo = byId.get(entry.id);
    if (!todo || todo.completedAt !== null) continue;
    const before = previous.get(entry.groupId);
    if (before && dueSortValue(before).localeCompare(dueSortValue(todo)) > 0) return true;
    previous.set(entry.groupId, todo);
  }
  return false;
}
