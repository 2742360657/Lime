> 归档于2026-10-12：仅记录旧规划或原版本验证，不是当前产品要求或发布结论。

# 开发主机目录迁移验收

日期：2026-10-10。仅调整开发主机，不改变手机业务代码、数据库格式或产品范围。

唯一活动仓库已迁入 `/home/angelime/Projects/Lime`，位于 Micron 系统盘。三星盘不再承担开发职责。`scripts/env.sh` 继续读取忽略的 `.local/dev.env`：

| 内容 | 本机位置 |
| --- | --- |
| Node / JDK / Android SDK | `/home/angelime/.local/share/toolchains` |
| Gradle / npm 缓存 | `/home/angelime/.cache/gradle`、`/home/angelime/.cache/npm` |
| Android 模拟器 | `/home/angelime/.android/avd` |
| 签名、私密开发设置和阶段证据 | 本仓库 `.local/`，签名在 `.local/signing/` |
| 生成 APK 与身份元数据 | 本仓库 `artifacts/apks/` |

迁移采用同文件系统完整移动。修改环境文件前，58,466 个文件的设备号、inode、大小、修改时间与迁移前一致；全部 Git 引用、工作区状态和签名文件 SHA256 也一致。唯一 worktree 被完整移动；没有子模块或已配置的 Git 提交签名依赖。迁移前已生成 Git bundle 和包含 Git、源码与私密文件的必要恢复归档。Gradle、npm 和原生生成目录允许重建。

集中验收：仓库检查、98 项阶段测试、类型检查、ARM64 和 x86_64 独立 preview 构建通过。新 SDK 启动 ADB 后识别 USB 真机；保留已有 ADB 身份，没有安装或清除真机应用。迁移后的原 AVD 使用 KVM 成功启动，安装新 x86_64 preview 后启动及应用进程重启通过，原有合成记录仍可见。模拟器完成后正常停止。详细构建日志和界面 XML 保存在 `.local/host-migration-*`，安装包元数据在 `artifacts/apks/`。

旧混合项目和后台数据移至 `/home/angelime/Archive/server-legacy/2026-10-10`，仅作受限历史档案；相关系统服务及旧远程入口已退役，不再开发或启动。三个忽略的历史 API 验证辅助脚本已改为引用档案中的私密参考文件；本批未调用真实模型。迁移恢复副本仍保留，不能把同盘副本当独立备份。

主机配置由独立私有 `server-infra` 仓库管理。其 Docker、Cockpit、libvirt、fnOS 配置不属于 Lime 产品；Lime 继续是完全独立的手机应用。下一批产品开发仍按原来的正式微信收件阶段推进，不能因主机整理跳过未完成的渠道与日用验收。
