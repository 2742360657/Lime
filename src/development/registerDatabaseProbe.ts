import { Alert, DevSettings } from 'react-native';

// Only development builds register this manual probe. It uses its own database
// and never reads or migrates the application's existing JSON records.
export function registerDatabaseProbe(): void {
  if (!__DEV__) return;
  DevSettings.addMenuItem('准备模拟器材料建议', async () => {
    try { const { prepareMaterialUiFixture } = await import('./materialUiFixture'); await prepareMaterialUiFixture(); Alert.alert('材料交互样本就绪', '仅模拟器合成材料：重开助手，编辑确认建议后查看待办来源。没有调用模型。'); }
    catch { Alert.alert('未创建交互样本', '此入口仅允许模拟器与合成数据。'); }
  });
  DevSettings.addMenuItem('验证本机材料处理', async () => {
    try { const { runMaterialProbe } = await import('./materialProbe'); await runMaterialProbe(); Alert.alert('材料验证通过', '隔离合成原件：文本、图片、PDF文本/扫描、限流、来源授权、去重、重开和一次提交通过。未调用模型。'); }
    catch { Alert.alert('材料验证失败', '没有操作实际记录，请检查当前调试原生工程和Metro。'); }
  });
  DevSettings.addMenuItem('验证本机助手运行时', async () => {
    try {
      const { runAgentProbe } = await import('./agentProbe');
      await runAgentProbe();
      Alert.alert('本机助手验证通过', '隔离合成数据：SDK流与工具循环、人格重开、安全存储、跨会话活动、中断重试一次打卡和零上传队列通过。未调用真实模型。');
    } catch {
      Alert.alert('本机助手验证失败', '请检查本仓库的调试构建、Metro与8092合成响应服务；没有读取实际记录或Key。');
    }
  });
  DevSettings.addMenuItem('验证本地助手命令', async () => {
    try {
      const { runDomainProbe } = await import('./domainProbe');
      await runDomainProbe();
      Alert.alert('本地命令验证通过', '合成活动与一次打卡、建议确认、显式记忆、事务失败回滚与关闭重开已验证。本地上传队列为0。');
    } catch {
      Alert.alert('本地命令验证失败', '合成验证未通过，没有操作实际记录或调用模型。');
    }
  });
  DevSettings.addMenuItem('验证本地迁移与记录', async () => {
    try {
      const { runLocalMigrationProbe } = await import('./localMigrationProbe');
      const result = await runLocalMigrationProbe();
      Alert.alert('本地迁移验证通过', `${result.documents} 条合成原文、草稿、打卡和关闭重开已验证。本地上传队列为0。`);
    } catch {
      Alert.alert('本地迁移验证失败', '合成验证未通过，未操作日记或其他实际记录。');
    }
  });
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
