import { canonicalJson, type Command } from './commands';

// Retain one operation ID after an ambiguous failure. Changed input is a new operation.
export function createUiRetry(id: () => string) {
  let pending: { fingerprint: string; operationId: string } | null = null;
  return {
    operation(command: Command) {
      const fingerprint = canonicalJson(command);
      if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, operationId: id() };
      return pending.operationId;
    },
    committed() { pending = null; },
  };
}
