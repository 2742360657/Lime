# 开发目录与环境

更新：2026-10-12。本机唯一活动仓库为 `/home/angelime/Projects/Lime`。会话附件/交付目录仅用于沟通，不是另一份源码checkout。

```text
Lime/
  README.md / AGENTS.md       开发入口与执行规则
  development-plan-revised.md 当前路线
  src/                       现有手机源码；下一功能阶段对齐新范围
  android/                   提交的原生工程与固定Gradle wrapper
  assets/ / plugins/         应用资源与现有Expo原生插件
  tests/                     自动化测试、SQLite与Expo基础
  scripts/
    env.sh                   统一工具路径
    check-environment.sh     只读工具/依赖核对
    android-build.sh          debug/preview/release构建
    device/                  显式设备验证脚本
    fixtures/                本机合成协议夹具
  docs/
    product-scope.md          当前产品定义
    product-architecture.md   后续架构边界
    project-status.md         当前实现/差距
    development-workflow.md   日常工作方式
    phase-test-ledger.md      当前待测项
    contracts/               已有代码契约快照
    archive/                 旧规划与原版本验收
  .local/                    全部忽略，私密权限
    dev.env                  本机构建配置
    signing/                 私密签名
    cache/                   未使用全局路径时的缓存
    runs/workspace-reset/    本轮环境检查
    runs/device/             此后设备检查输出
    archive/                 旧临时脚本、日志、截图、快照和研究资料
  artifacts/                 全部忽略
    apks/                    此后构建的包和元信息
    archive/                 之前的技术包及元信息
```

工具沿用已安装路径：`~/.local/share/toolchains/{node,jdk17,android-sdk}`，npm/Gradle缓存为 `~/.cache/{npm,gradle}`，AVD为 `~/.android/avd`。这些路径由 `.local/dev.env`配置，机器信息不写入公开工具脚本。保留现有SDK、锁文件、依赖、原生构建缓存与签名；不重复安装或复制一套工具。

本轮私密历史材料移动到 `.local/archive/2026-10-12-workspace-reset/`，其私密manifest记录原位置和归档位置。旧APK集中 `artifacts/archive/2026-10-12-pre-scope-reset/`。归档保存证据和数据，不是运行时兼容代码，后续工作不调用其中临时脚本或加载个人快照。

源码仍可追溯至90a6d25；当前源码的目录调整、日记移除与自主处理逻辑改造留在下一功能阶段。整理目录不要求先重新安装手机或运行模型。
