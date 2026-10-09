import { Alert, DevSettings } from 'react-native';

// Only development builds register this manual probe. It uses its own database
// and never reads or migrates the application's existing JSON records.
export function registerDatabaseProbe(): void {
  if (!__DEV__) return;
  DevSettings.addMenuItem('验证 PowerSync 本地数据库', async () => {
    try {
      const { PowerSyncDatabase, Schema, Table, column } = await import('@powersync/react-native');
      const database = new PowerSyncDatabase({
        schema: new Schema({
          development_probe: new Table({ runs: column.integer }, { localOnly: true }),
        }),
        database: { dbFilename: 'angelime-development-probe.sqlite' },
      });
      try {
        await database.init();
        await database.writeTransaction(async transaction => {
          const previous = await transaction.getOptional<{ runs: number }>(
            'SELECT runs FROM development_probe WHERE id = ?',
            ['local-probe'],
          );
          await transaction.execute(
            'INSERT OR REPLACE INTO development_probe(id, runs) VALUES (?, ?)',
            ['local-probe', (previous?.runs ?? 0) + 1],
          );
        });
        const result = await database.get<{ runs: number }>(
          'SELECT runs FROM development_probe WHERE id = ?',
          ['local-probe'],
        );
        Alert.alert('本地数据库验证', `已完成 ${result.runs} 次写入。重启后再次运行，检查计数保留。此验证没有连接服务器。`);
      } finally {
        await database.close();
      }
    } catch (error) {
      Alert.alert('数据库验证失败', error instanceof Error ? error.message : String(error));
    }
  });
}
