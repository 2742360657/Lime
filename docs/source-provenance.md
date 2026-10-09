# 源码来源与整理边界

日期：2026-10-09。

以下导出边界描述P0基线；最新实施进度见[当前状态](project-status.md)。

| 项目 | 来源 |
|---|---|
| 原手机项目 | https://github.com/2742360657/Angelime |
| 手机导出基线 | `3248b4f402160a062a4107788ae51f6aa5984f7a`，分支 `codex/memo-record-closure` |
| 历史工作区规划参考 | `24b971e`；仅用于审查，不复制整套历史部署文档 |
| 导出方式 | 仅导出手机仓库HEAD已追踪文件，建立新的单仓历史；原仓库和历史留在本地 |

本轮改变：品牌统一“酸橙 / Lime”；npm项目名与Expo slug为lime；新Android身份 `app.lime.personalassistant`，Kotlin包名同步；移除公开签名文件、旧机器签名绝对路径，增加本地生成/读取签名与便携构建脚本；重写评估/计划/规范；添加手动阶段静态检查和仓库检查。

未改变：业务记录/日记/习惯交互、SQL事务实现、服务器耦合业务逻辑。本轮不借清理仓库实施尚未验收的数据或Agent迁移；耦合源码明确作为P1/P2改造对象，不能宣称新软件已完成独立运行。

不复制：旧服务器源码/Compose/Directus/PostgreSQL/AstrBot/Mem0/Tika配置、私密目录、节点依赖、构建缓存、历史运行日志、任何APK/keystore、真人记录、角色原文、参考APK及截图、旧Git历史。旧环境不会被卸载或清空。

历史模拟器/小米证据只证明旧基线相应功能。新包名、签名与构建脚本需新的集中验收；新仓库不上传旧APK冒充Lime发布版本。

P1另从历史工作区移植了独立合成`business-store-test.mjs`为`scripts/business-store-check.mjs`，调整手机单仓路径和当前数据库适配。它只校验本地记录/恢复，不引入历史服务器测试调用、部署代码、日志或实际数据。新增原生探针和迁移/模拟器校验均在Lime维护；对应证据见[P1报告](p1-local-records-validation.md)。
