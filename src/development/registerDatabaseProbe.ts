import { Alert, DevSettings, DeviceEventEmitter } from 'react-native';

// Only development builds register this manual probe. It uses its own database
// and never reads or migrates the application's existing JSON records.
export function registerDatabaseProbe(): void {
  if (!__DEV__) return;
  DevSettings.addMenuItem('验证日用记录与整理', async () => {
    try { const { runDailyProbe } = await import('./dailyProbe'); await runDailyProbe(); Alert.alert('日用记录验证通过', '隔离合成备忘录授权、成绩精确统计、活动打卡、整理守卫与重开撤销通过；没有读取普通库或调用模型。'); }
    catch { Alert.alert('日用记录验证失败', '请检查当前原生包及私密阶段诊断；普通记录未参与验证。'); }
  });
  DevSettings.addMenuItem('验证QQ手机组件', async () => {
    try { const {runQqProbe}=await import('./qqProbe');await runQqProbe();Alert.alert('QQ组件验证通过','隔离合成HTTP/WS、系统GCM、本人过滤、序号重开、会话恢复/失效、附件和P3解析通过；未连接QQ账号或模型。'); }
    catch { Alert.alert('QQ组件验证失败','请检查当前原生包、Metro与8094合成服务，普通记录未修改。'); }
  });
  DevSettings.addMenuItem('打开QQ账号验证',()=>DeviceEventEmitter.emit('lime-open-qq-validation'));
  DevSettings.addMenuItem('验证完整备份组件', async () => {
    try { const { runBackupProbe } = await import('./backupProbe'); await runBackupProbe(); Alert.alert('完整备份验证通过', '隔离合成库的完整ZIP、原件、冲突副本、回滚、只读历史和重开通过，未读取普通记录或调用模型。'); }
    catch { Alert.alert('完整备份验证失败', '请检查当前原生包及私密阶段诊断；普通内容仍保留。'); }
  });
  DevSettings.addMenuItem('验证微信手机组件', async () => {
    try { const { runWeixinProbe } = await import('./weixinProbe'); await runWeixinProbe(); Alert.alert('微信组件验证通过', '隔离合成消息：前台网络、无损ID、本人过滤、游标重开、安全存储、取消、系统AES/下载及材料解析通过；未接实际账号或模型。'); }
    catch { Alert.alert('微信组件验证失败', '请检查当前原生包、Metro与8093合成响应；没有读取实际记录或Key。'); }
  });
  DevSettings.addMenuItem('获取微信验证二维码', async () => {
    try { const { requestWeixinValidationQr } = await import('./weixinProbe'); await requestWeixinValidationQr(); Alert.alert('微信验证二维码就绪', '请使用本次私密二维码扫码；尚未读取消息。'); }
    catch (e) { Alert.alert('微信验证未完成', e instanceof Error && e.name === 'WeixinError' ? e.message : '请检查网络后重试。'); }
  });
  DevSettings.addMenuItem('确认微信验证绑定', async () => {
    try { const { confirmWeixinValidationQr } = await import('./weixinProbe'); const status = await confirmWeixinValidationQr(); Alert.alert('微信验证状态', status); }
    catch (e) { Alert.alert('微信验证未完成', e instanceof Error && e.name === 'WeixinError' ? e.message : '请重新获取二维码。'); }
  });
  DevSettings.addMenuItem('读取微信验证消息', async () => {
    try { const { readWeixinValidationInbox } = await import('./weixinProbe'); const result = await readWeixinValidationInbox(); Alert.alert('微信验证收件完成', `保存${result.saved}，重复${result.duplicates}，其它来源${result.ignored}。仅验证沙箱，未分析。`); }
    catch (e) { Alert.alert('微信验证未完成', e instanceof Error && e.name === 'WeixinError' ? e.message : '内容仍留在验证沙箱，请重试。'); }
  });
  DevSettings.addMenuItem('下载微信验证附件', async () => {
    try { const { downloadWeixinValidationAttachments } = await import('./weixinProbe'); const result = await downloadWeixinValidationAttachments(); Alert.alert('微信附件验证完成', `保存${result.saved}，失败${result.failed}，已有${result.skipped}。未交给AI。`); }
    catch { Alert.alert('微信附件验证未完成', '原消息仍留在验证沙箱，可重新点击。'); }
  });
  DevSettings.addMenuItem('取消微信验证读取', async () => { const { cancelWeixinValidation } = await import('./weixinProbe'); cancelWeixinValidation(); });
  DevSettings.addMenuItem('验证本机提醒排程', async () => {
    try { const { runReminderProbe } = await import('./reminderProbe'); await runReminderProbe(); Alert.alert('提醒验证通过', '隔离合成规则：系统预排、重开不重复、改期撤旧、停用取消与零上传队列通过。未请求通知权限，未测送达。'); }
    catch { Alert.alert('提醒验证失败', '未修改普通记录，请检查当前原生通知组件与Metro。'); }
  });
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
