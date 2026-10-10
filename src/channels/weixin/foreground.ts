import { WeixinError } from './protocol';
export function createForegroundOperation(deps: { active(): boolean; subscribe(fn: () => void): () => void }) {
  let controller: AbortController | null = null;
  return {
    cancel() { controller?.abort(); },
    async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (controller) throw new WeixinError('BUSY');
      if (!deps.active()) throw new WeixinError('CANCELLED');
      const local = new AbortController(); controller = local;
      const dispose = deps.subscribe(() => { if (!deps.active()) local.abort(); });
      try { return await fn(local.signal); }
      finally { local.abort(); dispose(); controller = null; }
    },
  };
}
