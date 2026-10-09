import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { database } from '../storage/database';
import { domain } from '../domain';
import { createAgentStore } from './store';
import { createAgentRuntime } from './runtime';
import { readApiKey } from './config';

export const agentStore = createAgentStore(database, { id: Crypto.randomUUID, now: Date.now });
let recovery: Promise<void> | null = null;
function prepare() {
  recovery ??= agentStore.recover().catch(error => { recovery = null; throw error; });
  return recovery;
}
export const agentRuntime = createAgentRuntime({ store: agentStore, domain, key: readApiKey, fetch: expoFetch as typeof globalThis.fetch,
  digest: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text), now: Date.now, prepare });
const AgentContext = createContext({ store: agentStore, runtime: agentRuntime });
export function AgentProvider({ children }: { children: ReactNode }) {
  // Chat start awaits the same recovery promise. Ordinary screens are never gated by AI.
  useEffect(() => { void prepare().catch(() => {}); }, []);
  return <AgentContext.Provider value={{ store: agentStore, runtime: agentRuntime }}>{children}</AgentContext.Provider>;
}
export function useAgent() {
  const value = useContext(AgentContext);
  const state = useSyncExternalStore(value.runtime.subscribe, value.runtime.getSnapshot, value.runtime.getSnapshot);
  return { ...value, state };
}
