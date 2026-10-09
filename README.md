# 酸橙 · Lime

面向个人使用的 Android 日常记录与 AI 助手应用：待办、习惯、日记、备忘录和聊天使用同一份手机数据。

**当前是手机独立版的源码迁移基线与评估仓库，尚未交付独立助手 APK。** 本地记录代码已有历史技术验证；聊天等模块仍含待移除的旧服务器调用。不能把源码整理、改名或旧版本验收当作手机直连已经实现。

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
| [开发路线](docs/development-plan.md) | 分阶段范围、依赖、交付门槛与明确暂缓项 |
| [开发规范](docs/development-workflow.md) | 单仓Git、环境、构建、阶段测试和发布管理 |
| [待测台账](docs/phase-test-ledger.md) | 实现中记录，阶段完成后统一验收 |
| [当前状态](docs/project-status.md) | 本轮完成与下一步；历史验证不能跨版本冒用 |
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
bash scripts/android-build.sh preview arm64-v8a
```

`debug`需要Metro；`preview`包含JS用于独立试用；`release`使用本地私密正式签名。构建脚本在本机生成开发签名，不将任何keystore提交。新增应用ID为 `app.lime.personalassistant`，开发包加 `.dev`，与旧应用隔离；不自动卸载旧应用或抹掉记录。要迁移旧记录，先在旧应用导出，再按格式合并导入；不声称旧聊天/服务器记忆能随基础记录一并迁移。

不要运行 `expo prebuild --clean`；必要的原生再生成须先检查diff。**本轮没有重新编译或运行新应用身份的APK**，相关验证留到P1集中验收。GitHub上发布的是源码与规划，不是可日用版本或APK Release。
