# 最终开发目录与环境

更新：2026-10-12。本机只保留Lime这一份应用源码仓库：`/home/angelime/Projects/Lime`。会话目录只是说明/交付文件，不是代码checkout。

```text
/home/angelime/
  AGENTS.md                    本机唯一开发入口
  Projects/
    Lime/                      唯一Git源码仓库
      README.md / AGENTS.md
      development-plan-revised.md
      App.tsx / index.ts
      src/                     当前手机源码
      android/                 提交的原生工程与Gradle wrapper
      assets/ / plugins/       资源与现有Expo插件
      tests/                   SQLite与Expo检查
      scripts/                 环境/构建/仓库检查
        device/                显式设备检查
        fixtures/              本机合成协议夹具
      docs/                    当前产品、架构、状态、流程、技术基线
        contracts/             已有接口契约
      .local/                  忽略、私密
        dev.env                本机工具配置
        signing/               活动签名和必要留存签名
        private/               原始资料/记录、人格与模型凭据
        runs/                  开发检查与清理记录
      artifacts/apks/          最近技术包与真实元信息
      node_modules/            当前锁定依赖
      .git/                    Lime完整历史、分支与检查点
  .local/share/toolchains/     固定Node、JDK17、Android SDK
  .cache/npm/ / .cache/gradle/ 当前构建与包缓存
  .android/                    ADB配对身份和现有AVD
  .config/host/                已有服务位置说明，无开发仓库
  Documents/Codex/             仅剩Lime会话交付说明/当前会话目录
```

旧server-infra、AngelimeAssistant/迁移/容器恢复归档、会话中的Angelime/AstrBot/QQ参考源码和Python临时环境已删除。重复APK、原始调试日志/截图/一次性脚本、已完成的系统迁移脚本和旧编译产物已清理；不保留第二份开发工程。过期规划与验收文档从Lime Git历史查询。

必要签名、云模型凭据、原始人格、记录导出和少量私有数据备份保存在 `.local`，复制/压缩后做完整性核对。它们不自动导入手机、不建立旧后台，也不公开。当前活动签名与ADB身份摘要未变；当前手机数据未操作。

系统SSH/Tailscale/代理/现有fnOS继续使用 `/etc`、`/usr/local/libexec`、`/var/lib/libvirt` 等标准目录，服务和NAS数据未更改；这些是现有运行环境，不是另一项软件开发。

工具沿用 `~/.local/share/toolchains/{node,jdk17,android-sdk}`，缓存为 `~/.cache/{npm,gradle}`，AVD为 `~/.android/avd`，由 `.local/dev.env`配置。保留固定SDK、依赖、缓存和原生工程，使用 `source scripts/env.sh` 及 `bash scripts/check-environment.sh`核对。清理后源码的范围改造仍是下一功能阶段。
