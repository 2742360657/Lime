# 酸橙 · Lime

面向个人使用的 Android 日常记录与 AI 助手应用：待办、习惯、日记、备忘录和聊天使用同一份手机数据。

2026-10-11连续批次已实现正式QQ前台收件、备忘录草稿/版本保护及受限助手命令、成绩精确统计、活动/打卡依据和可撤销整理；完整备份升到v3，覆盖28类对象并兼容v1/v2。集中主机检查、ARM64/x86_64构建和API36隔离原生/调试界面已通过，独立preview两入口及冷启动也已通过；真机未连接，账号与人工体验单列待验。详见[本批报告](docs/p5-daily-validation.md)。

**P1与P2本地助手已完成关键技术验收，P3材料入口已完成本批实现和关键技术验收，人工日用体验仍待确认。** DeepSeek直连、持久化聊天、受限记录工具与可选人格设置已接入。人格可手动选择文件、预览后保存/替换、停用或移除，未启用时为中性助手。真实API运行时、小米原生探针、模拟器人格设置及独立preview已分项验证；手机真实Key聊天和中文输入体验不因此自动算通过。见[P1报告](docs/p1-local-records-validation.md)、[P2-A报告](docs/p2-domain-validation.md)与[P2助手报告](docs/p2-local-assistant-validation.md)。

P3增加应用内文件/图片、系统分享/打开文件与本地材料来源管理：仅选中发送才分析，文本/图片/有界PDF支持解析，Office仅保存。原生探针、一次真实视觉API、模拟器分段UI与独立preview已有分项结果，详见[P3报告](docs/p3-materials-validation.md)。

P4-A本地提醒已接入：单次、公历年度提前/当天和可选待办到期提醒，设置集中管理，聊天生成确认建议。排程及可靠性修正已有自动化、小米原生探针和独立preview证据，实际通知送达仍待验，见[提醒报告](docs/p4-reminders-validation.md)和[修正报告](docs/p4-reminder-reliability-validation.md)。微信独立验证及正式前台收件已接入设置与助手；小米14扫码绑定、文字/TXT/图片保存、原件回看和明确选择通过，真机模型主线待验，见[接入报告](docs/p4-weixin-intake-validation.md)。P5-04完整手动ZIP导出/受控恢复已完成本批关键技术验收，v2包含正式微信收件历史并兼容v1，见[备份报告](docs/p5-backup-validation.md)。

QQ独立验证已有小米14扫码、短期Resume/心跳、文字及TXT/PNG下载和原件一致证据，见[QQ报告](docs/p4-qq-validation.md)。本批正式入口使用独立产品绑定、可见失败回执、逐件保存及明确选用；正式产品扫码结果另记。先前被拒绝的附件未获平台重投，不能承诺完整离线历史。

## 本轮确定的范围

- 应用独立运行，数据保存在手机；不设计或部署自建服务器、账号系统与同步后台。
- 助手直接调用用户配置的 DeepSeek API，通过受限本地工具查询、编辑业务记录。
- 人格、个人事实/偏好、聊天和活动状态在手机管理；日记按需授权，保存不触发全库分析。
- 保留应用内直接发图片/文件、系统分享/打开文件、微信/QQ机器人窗口三类材料入口。
- 微信/QQ无需实时收件，在应用内显式读取；平台离线补收和文件有效期必须实测。
- 日记保持紧凑日期流、独立阅读与专注写作，AI交互集中在助手聊天。

手机独立运行仍需联网调用模型与腾讯消息服务；普通记录可离线。公开源码不包含个人Key、平台凭据、真人日记、私人角色文件或签名。开源组件采用前先核对许可；本仓库暂未授予额外开源许可证，见 [NOTICE](NOTICE.md)。

## 评审入口

| 文档 | 内容 |
|---|---|
| [仓库评估](docs/repository-assessment.md) | 可复用代码、服务器耦合清单、风险及实际完成度 |
| [产品与架构](docs/product-architecture.md) | 页面职责、数据/人格/记忆、AI工具与文件收件逻辑 |
| [技术选型](docs/technology-decisions.md) | 成熟组件、官方依据、采用/待验证/不采用的区分 |
| [修订版开发路线](development-plan-revised.md) | 代码核查后的阶段范围、接口先行、独立验证线与交付门槛 |
| [开发规范](docs/development-workflow.md) | 单仓Git、环境、构建、阶段测试和发布管理 |
| [待测台账](docs/phase-test-ledger.md) | 实现中记录，阶段完成后统一验收 |
| [当前状态](docs/project-status.md) | 本轮完成与下一步；历史验证不能跨版本冒用 |
| [当前复评与下一批](docs/next-development-review.md) | 原需求覆盖、提醒可靠性问题、渠道门槛与数据保护前移 |
| [源码来源](docs/source-provenance.md) | 原始项目、基线提交、复制范围和本轮变更 |

## 目录

```text
App.tsx / index.ts          应用入口
src/                       现有手机源码；耦合处见评估
android/                   已提交的原生工程和固定Gradle wrapper
assets/                    现有应用图标与资源
scripts/                   手机工程环境、构建与仓库检查
docs/                     当前评估、设计、开发流程与状态
.github/                   PR模板、手动触发的阶段静态检查
.local/                    私密设置、签名、日志与缓存（忽略）
artifacts/                 生成包及构建信息（忽略）
```

这是单一 Git 仓库，不需要子模块、另一个手机checkout或服务器仓库。Node `22.23.3`、Expo `55.0.31`、React Native `0.83.10`、JDK17与Gradle `8.14.5`为基线；实际锁定见 `package-lock.json`、Gradle wrapper及 [toolchain.json](toolchain.json)。

## 开发启动

安装Node22与JDK17，配置Android SDK。已有环境可以通过忽略的 `.local/dev.env` 指向工具目录，示例见 [.env.example](.env.example)。不需要启动任何后台业务服务。

```bash
source scripts/env.sh
npm ci
npm start
```

开发中记录待测项。完整阶段实现后集中运行：

```bash
python3 scripts/repository-check.py
npm run typecheck
npm run test:phase
bash scripts/android-build.sh preview arm64-v8a
```

`debug`需要Metro；`preview`包含JS用于独立试用；`release`使用本地私密正式签名。构建脚本在本机生成开发签名，不将任何keystore提交。新增应用ID为 `app.lime.personalassistant`，开发包加 `.dev`，与旧应用隔离；不自动卸载旧应用或抹掉记录。要迁移旧记录，先在旧应用导出，再按格式合并导入；不声称旧聊天/服务器记忆能随基础记录一并迁移。

不要运行 `expo prebuild --clean`；必要的原生再生成须先检查diff。P2新preview已在模拟器与真机覆盖安装并启动，构建身份与限制见本批报告。GitHub初始发布的是源码与规划；本地阶段APK不自动成为GitHub Release。
