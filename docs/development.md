# 开发与发布

## 持续维护职责

本项目按用户明确授权由 agent 管理实现、验证、版本、正常推送和正式发布，用户主要提供问题反馈与功能需求。常规维护不需要逐步确认；产品方向冲突、宿主运维、签名/凭据变更和不可恢复的用户数据操作应单独判断范围。授权入口见 [AGENTS.md](../AGENTS.md)。

每次发布都递增 Android versionCode；修复与兼容改进递增补丁版本，新能力递增次版本。版本同时更新 app.json、package.json 和锁文件。先发布经过验证的提交，再创建对应标签和 Release；已发布版本及附件不覆盖重写。正式发布提供 arm64-v8a、x86_64 APK、SHA256SUMS 与包含提交、版本、签名证书摘要、文件大小及哈希的 release-manifest.json。

## 工程边界与检查

结构与保存协议见[架构说明](architecture.md)，本轮决策和后续选型条件见[工程治理](engineering.md)。`npm run check` 包含仓库元数据、导入边界、严格类型及全部Node测试；`npm test` 可独立运行业务和故障注入测试，`npm run fix:imports` 使用项目固定TypeScript整理导入。禁止为了通过检查关闭noUnused或用any绕过领域边界。

GitHub Check在PR/main执行Node检查和无私密签名的x86_64预览构建；workflow_dispatch勾选android_ui可额外跑完整IME/六主题、小屏和工程场景。预览产物仅供测试，不能作为正式更新发布。远端CI与本地结果分别核对。

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
- main 为本地业务稳定线；extended/dev 为独立安装的 AI 扩展测试线，按需切换，不保留第二套常驻工程。
- 宿主运维独立在 server-infra 私有仓库；不把网络、凭据、VM/NAS 文档塞进公开应用仓库。

## 自动更新维护

运行时只匿名读取 `https://github.com/2742360657/Lime/releases/latest/download/release-manifest.json`，无需 GitHub API 令牌。清单格式由 `scripts/prepare-release.mjs` 生成，解析契约见 `src/update/manifest.ts`。保留 formatVersion、stable channel、applicationId、version/versionCode、tag、minimumAndroidApi、certificateSha256、notes，以及各 ABI 的 name/url/size/sha256。APK 地址必须精确对应本仓库的版本标签。不要删除旧发布或覆盖附件；保持递增 versionCode 和正式签名。

`npm run check` 包含清单拒绝边界、版本/架构选择、每日节流与旧备份迁移测试。原生安全校验需在隔离 Android 模拟器运行 `UpdateVerifierInstrumentation`，测试同签名新版、错误哈希/大小/路径/版本、其他包名/签名/ABI 和降级。测试夹具与专用旧版本元数据 APK 不公开发布。UI 验收需使用实际发布清单/下载，检查跳过与手动检查、取消/重试、缓存被篡改后的安装拒绝、未知来源许可、系统确认及覆盖升级后数据保留。

正式源码提交并通过构建后：

```bash
node scripts/prepare-release.mjs artifacts/release
# 推送当前正式提交与 vX.Y.Z 标签后，发布清单中的精确产物
python scripts/publish-release.py publish artifacts/release /绝对路径/发布说明.md
```

发布脚本从现有 Git credential helper 临时取得 GitHub 凭据，不写入源码、参数或应用；先创建草稿并上传，验证远端摘要与本地一致后发布。已发布附件不可覆盖。检查 latest 的清单版本及哈希，确认应用手动检查自己的版本时不会再次提示。构建/测试通过工作区公共入口运行，遵循外部全局资源限制。

### 隔离更新验收

`bash scripts/build-update-qa.sh 1.2.4 9` 会临时降低原生版本，构建完成或失败后恢复 app.json；测试包只在 `artifacts/update-qa/`。保持当前 Node/Gradle 环境和正式签名配置，以便测试同签名覆盖升级。不要发布该包。

准备 `fixtures/`：保留待升级正式版的两份原始 APK；把其 x86_64 包用仓库公开的 debug.keystore 重签后命名 `lime-1.2.6-x86_64.apk`（不同签名夹具），测试 APK 复制为 `lime-1.2.7-x86_64.apk`（不同包名），QA 主 APK 复制为 `lime-1.2.4-x86_64.apk`（旧版本）。这些名称只用于隔离的反例；签名口令通过临时文件传入工具，不放入命令行。原始正式版不得重新签名或上传覆盖。

在包含 emulator、platform-tools 和 Android36 default/x86_64 系统镜像的 SDK 上运行：

```bash
python tests/android/update_e2e.py --sdk /local/test-sdk --out /local/task-evidence \
  --manifest /local/official-release/release-manifest.json --fixtures /local/fixtures \
  --qa-apk artifacts/update-qa/lime-updater-qa.apk --test-apk artifacts/update-qa/verifier-test.apk
# 恢复正式版本并构建后，在同一隔离 AVD 上继续覆盖升级验收
python tests/android/update_e2e.py --sdk /local/test-sdk --out /local/task-evidence \
  --final-apk artifacts/release/lime-X.Y.Z-x86_64.apk
```

首次验收时 latest 必须指向提供的正式夹具版本。脚本只启动自己的 `.local/update-avd/LimeUpdater.avd`（端口 5584），只操作明确的 `emulator-5584`，使用合成数据并在退出时关闭模拟器；不连接真实手机、不复用个人 AVD。证据含截图、原生校验结果和 JSON 结果。结束后按任务清理独立 AVD 与测试 APK。

## 输入与色系回归

多行备忘录正文使用有界原生 TextInput 独立滚动，不嵌套另一个纵向 ScrollView。键盘出现后保留实际正文视口；禁止通过光标跳末尾或只滑动外层留白来判定正文可用。`tests/android/memo_theme_e2e.py` 在文字区域发起拖动，OCR验证实际首末行，再长按末词、替换、核对自动保存和放弃回滚；另检查六套主题的设置、输入/开关、确认框和重启。

应用内输入、开关和确认框分别使用 ThemedTextInput、ThemedSwitch、ThemedAlert，避免原生固定强调色。危险操作仍需确认，旧确认按钮的回调/取消语义不变，队列以请求ID防止重复触发。系统键盘、选取器与安装界面由Android管理。

UI脚本使用本机已有的 Tesseract 和 ImageMagick 读取截图；控件区域颜色允许3级通道取整误差，仍区分六套调色板，不以“看起来是绿色”代替校验。

若现有测试SDK不可用，在项目环境中运行 `python scripts/setup-android-test.py`，从官方SDK清单获取并校验归档，仅安装到本任务 `.local/android-test-sdk`；不修改宿主SDK和个人AVD。测试入口：

```bash
python tests/android/memo_theme_e2e.py --sdk "$PWD/.local/android-test-sdk" \
  --out /local/task-evidence --final-apk artifacts/release/lime-X.Y.Z-x86_64.apk
```

可用 `--scroll-only`、`--themes-only` 隔离失败场景；`--small-only` 验证手势导航、1.3倍字体、小屏中文连续长段落和末词编辑。基线模式使用 `--qa-apk` 指定已校验正式旧包，只记录复现结果；修复模式 `--final-apk` 必须全部通过。测试仅使用脚本创建的 LimeMemoTheme/emulator-5586 和合成数据。编译、测试和安装测试工具通过工作区公共run入口运行。

## 存储、恢复与规模验收

`tests/persistence.test.cjs` 使用注入的文件故障验证截断写、读取失败保护、校验损坏、串行保存、重试和恢复原件保留；不替代Android文件权限或系统选取器验收。

```bash
python tests/android/memo_theme_e2e.py --sdk /local/test-sdk --out /local/task-evidence \
  --final-apk artifacts/release/lime-X.Y.Z-x86_64.apk --engineering-only \
  --old-apk /local/verified-old-release.apk
```

工程场景仅使用脚本自己的LimeMemoTheme/emulator-5586，覆盖旧版实际覆盖升级、旧JSON迁移、应用UID不可写时保存失败及重试、切后台草稿、损坏快照启动保护、真实DocumentsUI恢复，以及千条数据的原生View数量、多选和搜索。`--old-apk`省略时不执行旧版覆盖升级，不能把它记为通过。测试夹具重置可以移除该隔离应用的快照，不得将此方法用于真机或个人数据。

测试读取状态通过`storage_helpers.py`识别旧JSON及新快照，不把旧data.json当成新版本最新状态。新备份结构不变，内部快照格式与版本号不同。正式签名及安装包检查仍走既有发布流程。
