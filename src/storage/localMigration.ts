import type { PowerSyncDatabase, Transaction } from '@powersync/react-native';
import { migrationTables, tableColumns } from './databaseSchema';

export const LOCAL_MIGRATION_KEY = 'lime-local-migration-v1';
type Row = Record<string, string | number | null>;
type Database = Pick<PowerSyncDatabase, 'getOptional' | 'readTransaction' | 'writeTransaction'>;

// The source schema is never changed to local-only. Commit all copies and the receipt together.
export async function migrateLocalDatabase(target: Database, source: Database | null) {
  if (await target.getOptional('SELECT value FROM local_meta WHERE id=?', [LOCAL_MIGRATION_KEY])) return;

  async function copy(read: Pick<Transaction, 'getAll' | 'getOptional'> | null) {
    await target.writeTransaction(async write => {
      if (await write.getOptional('SELECT value FROM local_meta WHERE id=?', [LOCAL_MIGRATION_KEY])) return;
      for (const table of migrationTables) {
        if (await write.getOptional(`SELECT id FROM ${table} LIMIT 1`)) {
          throw new Error('本地库存在尚未确认的迁移内容，请保留应用数据，不要清空或覆盖。');
        }
      }
      const counts: Record<string, number> = {};
      for (const table of migrationTables) {
        const fields = ['id', ...Object.keys(tableColumns[table])];
        let count = 0, lastId: string | null = null;
        if (read) {
          while (true) {
            const rows: Row[] = await read.getAll<Row>(
              `SELECT ${fields.join(',')} FROM ${table}${lastId === null ? '' : ' WHERE id>?'} ORDER BY id LIMIT 200`,
              lastId === null ? [] : [lastId],
            );
            for (const row of rows) {
              await write.execute(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`, fields.map(field => row[field]));
              const saved = await write.getOptional<Row>(`SELECT ${fields.join(',')} FROM ${table} WHERE id=?`, [row.id]);
              if (!saved || fields.some(field => saved[field] !== row[field])) throw new Error('本地记录搬运校验未通过，旧库仍保留。');
            }
            count += rows.length;
            if (rows.length < 200) break;
            lastId = String(rows[rows.length - 1].id);
          }
          const originalCount = await read.getOptional<{ count: number }>(`SELECT count(*) AS count FROM ${table}`);
          if (originalCount?.count !== count) throw new Error('旧库记录数量校验未通过，迁移尚未完成。');
        }
        counts[table] = count;
      }
      await write.execute('INSERT INTO local_meta(id,value) VALUES(?,?)', [LOCAL_MIGRATION_KEY, JSON.stringify({ version: 1, source: source ? 'legacy-database' : 'fresh', counts })]);
    });
  }

  if (source) await source.readTransaction(read => copy(read));
  else await copy(null);
}
