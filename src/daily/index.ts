import * as Crypto from 'expo-crypto';
import { database } from '../storage/database';
import { createDailyService } from './service';
export { createDailyService, DailyError } from './service';
export { dailyTables } from './schema';
export { validateOrganizationBatch, organizationDependencies } from './model';
export const dailyService = createDailyService(database, {
  id: () => Crypto.randomUUID(), now: () => Date.now(),
  digest: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
});
