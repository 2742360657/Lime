# 开发与发布

## 持续维护职责

本项目按用户明确授权由 agent 管理实现、验证、版本、正常推送和正式发布，用户主要提供问题反馈与功能需求。常规维护不需要逐步确认；产品方向冲突、宿主运维、签名/凭据变更和不可恢复的用户数据操作应单独判断范围。授权入口见 [AGENTS.md](../AGENTS.md)。

每次发布都递增 Android versionCode；修复与兼容改进递增补丁版本，新能力递增次版本。版本同时更新 app.json、package.json 和锁文件。先发布经过验证的提交，再创建对应标签和 Release；已发布版本及附件不覆盖重写。正式发布提供 arm64-v8a、x86_64 APK、SHA256SUMS 与包含提交、版本、签名证书摘要、文件大小及哈希的 release-manifest.json。

## 环境与初始化

Node 22、npm、JDK 17、Android SDK Platform/Build Tools 36，以及 Gradle wrapper 9.0.0。Android 原生工程已提交；常规开发不需要 prebuild。

```bash
source scripts/env.sh
npm ci
npm run check
npm start
# 另一终端，对明确选定的开发设备运行
npm run android
```

脚本优先复用系统工具；本机工具集中 `~/.local/share/toolchains/`，npm/Gradle 缓存集中 `~/.cache/`。可复制 `.env.example` 为忽略的 `.local/dev.env` 设置路径，不在新目录重复安装环境。

## 独立 APK

```bash
npm run build:preview
# 多架构一起构建，各自生成独立 APK
bash scripts/build-android.sh preview arm64-v8a,x86_64
```

preview 内嵌 JS、无需 Metro，使用开发签名；不能作为正式升级包发布。产物位于忽略的 `artifacts/preview/`。

正式构建需要自己的签名材料。创建私密 `keystore.properties`：

```properties
storeFile=release.keystore
storePassword=REPLACE_LOCALLY
keyAlias=REPLACE_LOCALLY
keyPassword=REPLACE_LOCALLY
```

相对 storeFile 以该 properties 所在目录为基准。将路径写入 `.local/dev.env` 的 `LIME_SIGNING_PROPERTIES`，或导出环境变量，再运行：

```bash
bash scripts/build-android.sh release arm64-v8a,x86_64
```

产物位于 `artifacts/release/`，包含 SHA256SUMS。复用源码不等于获得维护者私密签名；你的签名无法覆盖安装维护者正式版。从 v1.2.0 起正式维护必须保留新的私密签名与包名。旧签名曾公开，不再用于发布；旧用户先备份重装恢复，详见使用指南。

## 发布流程

1. 从最新 main 建聚焦分支。保持 app.json 的版本和 versionCode、package.json/锁文件版本一致；Gradle 从 app.json 读取原生身份。
2. `npm run check`；构建正式包，检查 aapt badging、合并权限、apksigner 校验与证书摘要。
3. 在隔离模拟器做页面、存储重启和导出/恢复检查；需要真实设备验收时明确设备和数据边界，不清用户数据。
4. 检查 Git 暂存内容及凭据泄漏，提交并按任务授权合并/推送 main。
5. 对对应提交建 vX.Y.Z 标签与 GitHub Release，上传 APK、SHA256SUMS 和发布说明。生成包不进入 Git。

## 目录与清理

- src/、android/、assets/ 是源码；docs/ 是持续更新的使用/开发/架构/隐私说明，截图只使用测试内容。
- .local/ 只保留工具配置和必要签名；artifacts/ 只保留当前产物。测试输出按任务清理，不堆日期归档、重复交接报告或源码副本。
- main 为纯本地稳定线；extended/dev 为独立安装的 AI 扩展测试线，按需切换，不保留第二套常驻工程。
- 宿主运维独立在 server-infra 私有仓库；不把网络、凭据、VM/NAS 文档塞进公开应用仓库。
