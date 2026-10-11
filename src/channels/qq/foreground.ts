import { QqError } from './protocol';

export function createQqForegroundOperation(deps: { active(): boolean; subscribe(fn: () => void): () => void }) {
  let controller: AbortController | null = null;
  const abort = (value: AbortController | null) => { if (value && !value.signal.aborted) value.abort(); };
  return {
    cancel() { abort(controller); },
    async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (controller) throw new QqError('BUSY');
      if (!deps.active()) throw new QqError('CANCELLED');
      const local = new AbortController(); controller = local;
      const dispose = deps.subscribe(() => { if (!deps.active()) abort(local); });
      try { return await fn(local.signal); }
      finally { abort(local); dispose(); controller = null; }
    },
  };
}
