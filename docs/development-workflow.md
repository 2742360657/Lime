# 开发与发布流程规范

日期：2026-10-09。单一手机仓库；不启动任何产品后台服务。

## 1. 环境与工作目录

仓库可clone到任意开发目录；本机唯一活动目录为 `/home/angelime/Projects/Lime`，环境配置见忽略的 `.local/dev.env`。工具位于用户 `.local/share/toolchains`，缓存位于 `.cache`，模拟器位于 `.android/avd`；[主机迁移验收](host-migration.md)记录实际结果。Node22/JDK17/Android SDK、Gradle wrapper与npm lock固定。SDK/AVD/缓存不能复制进Git。

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

P2-B/C原生运行时探针：在debug包和本仓库Metro就绪后，先启动`python3 scripts/agent-fixture-server.py`（仅本机回环8092合成SSE，不是产品服务），为目标设备临时映射8092，再执行`python3 scripts/p2-agent-device-check.py --serial <device>`。使用隔离合成库/测试SecureStore项，不输入真人材料或真实Key。已有8081被其它checkout占用时，本仓库Metro可选8091，并显式核对设备实际bundle来源；模拟器默认`10.0.2.2:8081`会绕过ADB反向映射，不能仅凭reverse成功认定加载了本仓库代码。修改开发bundle host前保存原值，结束恢复。测试后停止本任务fixture/Metro，移除本任务新增的ADB端口及合成下载文件；不清应用数据、不杀其它工作区服务。preview验收须脱离Metro，报告分开记录Native合成流、Node真实API和人工手机体验。

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

## 本机环境恢复（2026-10-09）

工作目录不变，已迁移到容量充足的系统分区。按用户要求不挂载、不使用三星数据盘；工具/缓存继续使用现有路径。环境文件支持根挂载路径及可选文件系统UUID核对，具体设备UUID只写忽略的`.local/dev.env`。可用`LIME_AVD_DIR`/`LIME_AVD_NAME`复用已有模拟器，运行`bash scripts/emulator-run.sh`，不清AVD或应用数据。恢复初次没有真机，先在API36模拟器执行；同日已补小米14验收，见[P3真机报告](p3-phone-validation.md)。人工手机体验仍单独保留。

## P3阶段验收入口

当前源码debug + 本仓库Metro就绪后，用`python3 scripts/p3-material-device-check.py --serial <device>`执行随机隔离库/合成原件探针；普通数据不被重置。`python3 scripts/p3-material-ui-emulator-check.py`只允许模拟器，实际系统选择/分享/原件/建议/来源流程使用合成件。失败可按`--from-stage picker`或`proposal`从已记录完成的阶段续跑；不能在没有前段结果时声称全流程通过。debug菜单“准备模拟器材料建议”不调用模型且拒绝真机普通库。

当前开发机localhost默认优先IPv6，Metro可用`NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --localhost --port 8081`绑定本任务IPv4回环，确保模拟器`10.0.2.2`加载当前源码；不修改系统DNS。结束只停止本任务Metro，preview必须停Metro独立检查。P3本批UI为定位修正后分段续跑，手机云聊天/中文IME与未覆盖组合仍待测，见[P3报告](p3-materials-validation.md)。

## P4-A验收入口

本批实现和准确证据见[P4-A报告](p4-reminders-validation.md)。debug/当前Metro下显式指定设备运行`python3 scripts/p4-reminder-device-check.py --serial <device>`，使用独立SQLite/系统通知ID，收尾只取消自己的合成队列并删除自己的测试库；不请求通知权限、不测试送达。独立preview且提醒关闭时可运行`python3 scripts/p4-reminder-settings-check.py --serial <device>`检查只读设置/编辑取消/日期选择取消/重开。与生产提醒队列分开，不用cancelAll清其它通知。

P4-A可靠性探针已扩展迟到队列保留和单项失败/重试。迟到部分用模拟逻辑时钟核对真实Android队列，不是系统实际投递证据。已排队宽限、全局失败与本批构建证据见[修正报告](p4-reminder-reliability-validation.md)；手机锁屏时不填写新原生探针通过，不保留依赖Metro的开发包作为最终试用状态。

## P4-B微信验收入口

本仓库debug/Metro就绪后，启动`python3 scripts/weixin-fixture-server.py`（仅回环8093合成响应），临时映射8093，再执行`python3 scripts/p4-weixin-device-check.py --serial <device>`。探针使用独立随机库/私密测试项，没有实际账号或模型调用；失败只输出固定阶段/分类，先修夹具再复测受影响路径。

真实账号验证使用`python3 scripts/p4-weixin-account-step.py --serial <device> --action qr`，QR展示内容只写忽略的`.local`，不打印或提交。由所有者扫码确认后执行`--action status`；约定少量合成材料、关闭应用期间发送后再`--action read`及`--action download`。只输出状态/计数；实际消息、账号与媒体能力不进入公开报告。账号独立验证库与SecureStore不属于普通导出，普通收件UI尚未上线。不要用实际群通知做第一轮验证。

测试结束停止本任务Metro/8093夹具，移除新增的8081/8093映射，恢复本批独立preview并核对APK摘要。普通记录摘要在可run-as的debug期间检查；preview不可run-as时不声称安装后SQL逐项比较已通过，也不为重复摘要检查来回安装旧包。详见[P4-B报告](p4-weixin-validation.md)。

## P5-04完整备份验收入口

debug/本仓库Metro就绪后，执行 `python3 scripts/p5-backup-device-check.py --serial <device>`。仅两个随机隔离库及合成文本/图片/PDF，原生ZIP/SQLite，无HTTP夹具、模型调用或通知许可请求。普通业务库不参与恢复；收尾只删除探针明确登记的新增合成文件、自己的缓存阶段与随机库，不扫描删除所有新文件。

Node重点验证白名单、引用、惰性历史、防重、冲突依赖及事务；原生重点验证实际ZIP与跨目录原件/重开。失败只复测受影响模块；记录APK原生基线与Metro JS基线，不能混用。收尾恢复当前独立preview、核对手机APK摘要、停止本任务Metro/映射；系统保存/选择/确认取消和真实旧JSON提供方单独验收，不自动导出或恢复真人材料来做UI测试。完整结果见[P5报告](p5-backup-validation.md)。

## 正式微信入口验收补充

正式产品使用独立lime-wx-product-v1 SecureStore命名空间，不搬运验证沙箱账号。P5隔离备份探针新增生产收件投影/回执与v2惰性历史回环，报告中的weixinHistory=true证明这一合成范围；原始验证沙箱与真实账号端到端分别记录。实际收件入口在设置与助手页面栏，网络仅显式操作，窗口关闭/后台取消；详情见[正式接入报告](p4-weixin-intake-validation.md)。

## QQ独立验收与恢复入口

本仓库debug/Metro就绪后，启动`python3 scripts/qq-fixture-server.py`（仅回环8094合成HTTP/WS/媒体），临时映射8094，执行`python3 scripts/p4-qq-device-check.py --serial <device>`。随机隔离库/测试SecureStore和原件只由探针清理，不清普通数据、调用模型或请求通知许可。

真实账号在debug菜单“打开QQ账号验证”中手动扫码/查询/读取/下载，用户只在手机确认；账号/二维码/正文/URL不打印或提交。真实结果、合成结果和原生/Metro提交分开记录；不因本地seq保留就认定平台必然重投失败消息。结束在debug期间核对普通记录摘要，恢复当前独立preview及APK摘要、脱离Metro冷启动；停止本任务Metro/8094夹具、移除自己的8081/8094映射及Download测试文件，不删除用户截图或真实绑定。详见[QQ报告](p4-qq-validation.md)。


## P5连续开发统一验收入口（2026-10-11）

本批不每个模块构建/测试，跨模块实现后统一检查；Git由主任务在feat/p5-daily-workflows分层提交，构建基线与文档提交分别记录。真机相关统一放在末尾，设备不在adb时明确待验，不用模拟器结果冒充手机结果。

当前debug/同基线Metro下，显式指定设备执行 `python3 scripts/p5-daily-device-check.py --serial <device>` 和 `python3 scripts/p5-backup-device-check.py --serial <device>`。两者只用随机隔离库/合成件，成功后关闭自身结果弹窗，便于串行执行；失败不能将旧JSON当新证据。QQ传输继续使用8094回环夹具及p4-qq-device-check.py，正式账号绑定与发送内容单独在产品窗口完成，不搬运旧验证沙箱。

调试界面验收记录设置/助手两入口、成绩编辑取消、所选整理空状态、冷启动与普通对象摘要。独立preview检查前停止本任务Metro/夹具、移除自身映射，核对设备APK hash再离线启动；preview不可run-as，不声称安装后SQL逐项摘要。当前结果见[p5-daily-validation.md](p5-daily-validation.md)。

## 离线日用管理的后续统一验收

2026-10-11用户本轮明确要求测试后续统一执行。本批可做静态编辑诊断/类型与语法、文档/秘密检查；不执行功能套件、云模型、APK构建或ADB操作，未执行的用例不能标通过。

待统一验收时，先运行新SQLite用例tests/domain/offline-management.test.js及受影响service/agent/backup/daily回归，确认授权、幂等、事务与v3回环；再集中构建当前基线。scripts/p5-offline-ui-emulator-check.py供明确的模拟器serial和debug/preview模式使用，不允许真机、不写普通记录，启动时删除自身旧结果，整段完成才写通过结果；中文输入与真实写入/关闭重开使用集中人工项目。旧会话work/p5-ui-smoke.py对应a980edd旧入口，不能用于本批新默认活动页。准确待验清单见[p5-offline-management.md](p5-offline-management.md)。
