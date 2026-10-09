import { PowerSyncDatabase } from '@powersync/react-native';
import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { createDatabaseSchema } from './databaseSchema';
import { LOCAL_MIGRATION_KEY, migrateLocalDatabase } from './localMigration';

export const LOCAL_DB_FILENAME = 'lime-local.sqlite';
export const LEGACY_DB_FILENAME = 'angelime-assistant.sqlite';
export const database = new PowerSyncDatabase({
  schema: createDatabaseSchema(),
  database: { dbFilename: LOCAL_DB_FILENAME },
});

let initialization: Promise<void> | null = null;
export function initializeDatabase(): Promise<void> {
  if (!initialization) {
    initialization = (async () => {
      await database.init();
      if (!await database.getOptional('SELECT value FROM local_meta WHERE id=?', [LOCAL_MIGRATION_KEY])) {
        const legacyPath = `file://${ANDROID_DATABASE_PATH.replace(/\/$/, '')}/${LEGACY_DB_FILENAME}`;
        const info = await FileSystem.getInfoAsync(legacyPath);
        if (info.exists) {
          const legacy = new PowerSyncDatabase({ schema: createDatabaseSchema(false), database: { dbFilename: LEGACY_DB_FILENAME } });
          try {
            await legacy.init();
            await migrateLocalDatabase(database, legacy);
          } finally {
            await legacy.close();
          }
        } else {
          await migrateLocalDatabase(database, null);
        }
      }
      await database.writeTransaction(async tx => {
        if (!await tx.getOptional('SELECT value FROM local_meta WHERE id=?', ['instance'])) {
          await tx.execute('INSERT INTO local_meta(id,value) VALUES(?,?)', ['instance', Crypto.randomUUID()]);
        }
      });
    })().catch(error => { initialization = null; throw error; });
  }
  return initialization;
}
