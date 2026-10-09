# 开发与发布流程规范

日期：2026-10-09。单一手机仓库；不启动任何产品后台服务。

## 1. 环境与工作目录

仓库可clone到任意开发目录；本机规范见忽略的 `.local/dev.env`。Node22/JDK17/Android SDK、Gradle wrapper与npm lock固定。SDK/AVD/缓存可继续使用现有数据盘工具，不能因换仓库复制数GB缓存进Git。

```bash
source scripts/env.sh
npm ci
npm start
```

env脚本只配置构建工具/缓存，支持外部工具目录与可选挂载检查；不是手机Key配置。Key在应用运行时设置。 `.local/`、artifacts、生成包、签名、用户文件和日志禁止提交。

## 2. Git管理

- `main`保存可评审基线；后续在 `feat/<phase>-<topic>`、`fix/<topic>` 或 `docs/<topic>` 分支工作，小提交可回滚。初始仓库公开发布已经获授权；以后推送按会话授权执行。
- 一份手机代码，不再根/手机两仓同步管理。源码来源提交记录保留；旧工作区本地冻结，不把其历史推到Lime。
- PR/提交说明写问题→行为变化→验证/未测项。阶段实现期间可标WIP；不能未验收却写“已完成”。跨阶段前更新status/plan/ledger，避免文档漂移。
- 不强制每个文档小改动建PR；功能合并前审查diff、结构和对应阶段验证。需要PR时附实际URL，不为本轮初始发布制造空PR。

## 3. 实现规范

普通页面和AI通过共用命令/仓储；校验、版本、来源授权、事务和操作回执属于确定性业务层。模型只产生参数与表达，不直接读写数据库或执行任意系统命令。

保留原文/草稿/失败副本。材料提导行动使用建议或用户授权的范围策略；提示词不能替代工具检查。角色背景和用户事实分开，默认不扫描完整日记/文件库。

新组件记录用途、固定版本、许可证和兼容证据；不凭可安装就写已采用。原生变更要同时检查app配置和已提交android工程，不能只改app.json。禁止prebuild --clean、强制跨版本audit fix及清数据掩盖失败。

## 4. 测试节奏

遵循用户要求：开发中记录 [阶段台账](phase-test-ledger.md)，先实现完整阶段，再集中跑静态、构建、关键自动化与真机。编辑器诊断、脚本语法检查和阻断问题局部排查可做，但不每小改动重复APK/云调用/UI回归。

迁移/权限变更先用隔离合成数据，实际数据部署前通过对应检查；延后阶段验收不能变成提前覆盖真人数据。失败后只重测受影响路径；无变更不重复已通过完整旧流程。纯文档只做仓库/链接检查。

手动GitHub Actions用于阶段静态检查，不每次push自动跑功能测试；不把Key/云模型调用放CI。真实模型/渠道/HyperOS验收在阶段末按台账集中执行。报告带提交、dirty、APK身份/签名/架构和设备，区分技术/人工体验/发布。

P2-A已按[修订版计划](../development-plan-revised.md)建立固定版本Jest/jest-expo基础。`npm run test:phase`在阶段末运行Node真实SQLite与Expo preset项目，Jest只扫描src/tests，不扫描.local私密快照。React Native Testing Library按组件交互需要引入，纯命令无需该库。对domain/工具重点验证版本、授权、幂等与原子提交；不按函数数机械补测试。自动化可随功能编写，阶段末统一运行；native mock不替代SQLite集成/重启验证。

P2-A原生命令探针：安装当前debug、连接本仓库Metro后，显式指定设备执行`python3 scripts/p2-domain-device-check.py --serial <device>`。它只使用独立合成库，支持真机；普通页面写入测试`python3 scripts/p2-domain-ui-emulator-check.py`则只允许模拟器。安装因手机USB限制失败时不卸载/清数据，等待手机允许或标记待测。preview独立运行，不保留任务临时ADB反向端口。

## 5. 构建与签名

```bash
# 开发热更新，需要Metro
bash scripts/android-build.sh debug arm64-v8a
# 可脱离Metro试用，仍是开发签名/开发应用ID
bash scripts/android-build.sh preview arm64-v8a
# 模拟器版本
bash scripts/android-build.sh preview x86_64
# 正式发布：先在私密目录配置keystore.properties和签名
bash scripts/android-build.sh release arm64-v8a
```

输出在忽略的artifacts；构建记录Git提交/dirty/包ID/架构/APK校验。debug/preview签名在本机生成，正式签名只从私密目录读。properties字段为storeFile、storePassword、keyAlias、keyPassword；不把示例口令当真实签名。不要日志输出口令或将签名纳入Release附件。

新包 `app.lime.personalassistant` 与旧应用隔离。安装指定ADB serial、使用 `install -r`；签名不匹配先报告，不自动卸载。无线连接提供当前连接端口，不在仓库保存个人设备IP/序列号/配对码。运行中文输入/IME与文件选择需要真机人工确认。

日常无需prebuild。必要时先保存diff，仅用项目受控命令，随后检查原生差异和本地签名路径；intent、label、应用ID与wrapper不能被重置后忽略。

## 6. 发布门槛

仓库发布：追踪文件清单、链接/JSON/脚本检查、Gitleaks脱敏扫描、无密钥/私人原文/生成物、新起始历史与来源记录、GitHub公开URL和提交校验。不是APK交付门槛。

应用发布：当前阶段静态/构建/完整流程通过、普通记录离线重启、真实模型/渠道实际能力、权限拒绝与失败出口、当前范围导出/合并恢复、人工紧凑UI/中文IME、新签名安装与依赖风险评估。渠道/Office未完成则明确范围，不能写全功能版。

发布说明不上传私人人格/用户材料/完整日志，只发真实构建的包及脱敏说明；独立备份目标暂缓，不强制云服务。需求变更须先更新范围与待测项，再开发。
