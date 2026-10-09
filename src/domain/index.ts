import * as Crypto from 'expo-crypto';
import { database } from '../storage/database';
import { createDomain } from './service';
export { DomainError } from './types';
export type { Command } from './commands';
export type { DocumentRef, Receipt } from './types';

export const domain = createDomain(database, {
  id: () => Crypto.randomUUID(), now: () => Date.now(),
  digest: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
});
