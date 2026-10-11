export type MemoValue = { title: string; body: string; groupId: string | null };
export type MemoBase = { title: string; body: string; date: string; group_id: string | null };
export type MemoDraft = { value: MemoValue; revision: number; base: MemoBase };
export type MemoDraftState = MemoDraft & { status: string; ready: boolean; loading: boolean };
type Persistence = {
  read: () => Promise<MemoDraft | null>;
  write: (draft: MemoDraft) => Promise<void>;
  save: (value: MemoValue, revision: number, base: MemoBase) => Promise<number>;
  updateBase: (revision: number, base: MemoBase) => Promise<void>;
  remove: () => Promise<void>;
};

// Serializes the existing editor's draft/canonical saves without UI or database imports.
// Loading blocks edits, so a late draft cannot overwrite fresh input.
export function createMemoDraftSession(initial: MemoDraft, persistence: Persistence, delay = 800) {
  let state: MemoDraftState = { ...initial, status: '正在读取本机草稿…', ready: false, loading: true };
  let tail: Promise<unknown> = Promise.resolve(), timer: ReturnType<typeof setTimeout> | null = null;
  let initialization: Promise<void> | null = null, closing: Promise<void> | null = null;
  let sequence = 0, disposed = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<MemoDraftState>) => {
    state = { ...state, ...patch };
    if (!disposed) for (const listener of listeners) listener();
  };
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const result = tail.catch(() => {}).then(action);
    tail = result;
    return result;
  };
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  const draft = (value = state.value): MemoDraft => ({ value: { ...value }, revision: state.revision, base: { ...state.base } });
  async function initialize() {
    if (state.ready) return;
    if (initialization) return initialization;
    publish({ loading: true, status: '正在读取本机草稿…' });
    initialization = persistence.read().then(saved => {
      publish({ ...(saved ?? initial), ready: true, loading: false, status: saved ? '已恢复本机草稿' : '输入后自动保存' });
    }).catch(() => {
      publish({ ready: false, loading: false, status: '草稿暂时无法读取，请重试后继续编辑' });
    }).finally(() => { initialization = null; });
    return initialization;
  }
  async function save(value: MemoValue, version: number) {
    // Draft first: even a failed version check leaves the current input recoverable.
    await persistence.write(draft(value));
    const revision = await persistence.save(value, state.revision, state.base);
    const base = { ...state.base, title: value.title, body: value.body, group_id: value.groupId };
    publish({ revision, base });
    await persistence.updateBase(revision, base);
    if (version === sequence) publish({ status: '已保存到本机' });
  }
  function change(field: keyof MemoValue, value: string | null) {
    if (!state.ready || closing || disposed) return;
    const snapshot = { ...state.value, [field]: value } as MemoValue, version = ++sequence;
    publish({ value: snapshot, status: '正在保存…' });
    void enqueue(() => persistence.write(draft(snapshot))).catch(() => {
      if (version === sequence) publish({ status: '草稿保存失败，请保留页面并重试' });
    });
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void enqueue(() => save(snapshot, version)).catch(() => {
        if (version === sequence) publish({ status: '保存未完成，输入仍保留，请重试' });
      });
    }, delay);
  }
  function flush() {
    clearTimer();
    if (!state.ready) return Promise.reject(new Error('DRAFT_NOT_READY'));
    const snapshot = { ...state.value }, version = sequence;
    return enqueue(() => save(snapshot, version)).catch(error => {
      if (version === sequence) publish({ status: '保存未完成，输入仍保留，请重试' });
      throw error;
    });
  }
  function finish() {
    if (closing) return closing;
    clearTimer();
    if (!state.ready) return Promise.reject(new Error('DRAFT_NOT_READY'));
    const snapshot = { ...state.value }, version = sequence;
    closing = enqueue(async () => { await save(snapshot, version); await persistence.remove(); })
      .finally(() => { closing = null; });
    return closing;
  }
  function keepDraft() { return enqueue(() => persistence.write(draft())); }
  return {
    initialize, change, flush, finish, keepDraft,
    getSnapshot: () => state,
    subscribe(listener: () => void) { disposed = false; listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; clearTimer(); listeners.clear(); },
  };
}

// Legacy draft rows lack a structured base. Preserve their content and use the
// opened document as fallback; a present malformed base must never be overwritten.
export function decodeMemoDraft(row: {
  title: unknown; body: unknown; group_id: unknown; base_revision: unknown; base_content: unknown;
}, fallback: MemoDraft): MemoDraft {
  if (typeof row.title !== 'string' || row.title.length > 300 || typeof row.body !== 'string' || row.body.length > 100000 ||
    !(row.group_id === null || typeof row.group_id === 'string')) throw new Error('INVALID_DRAFT');
  const revision = row.base_revision === null ? fallback.revision : row.base_revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) throw new Error('INVALID_DRAFT');
  let base = fallback.base;
  if (row.base_content !== null) {
    if (typeof row.base_content !== 'string') throw new Error('INVALID_DRAFT');
    const parsed = JSON.parse(row.base_content);
    if (!parsed || typeof parsed.title !== 'string' || parsed.title.length > 300 || typeof parsed.body !== 'string' || parsed.body.length > 100000 ||
      typeof parsed.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) || !(parsed.group_id === null || typeof parsed.group_id === 'string'))
      throw new Error('INVALID_DRAFT');
    base = { title: parsed.title, body: parsed.body, date: parsed.date, group_id: parsed.group_id };
  }
  return { value: { title: row.title, body: row.body, groupId: row.group_id }, revision, base: { ...base } };
}
