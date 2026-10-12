# 工作目录与环境

本机只保留一个 Lime 应用源码工作区：/home/angelime/Projects/Lime。main 为纯本地稳定线，extended/dev 为独立安装的 AI 测试线；开发时在同一工作区切换分支，不保留第二份常驻工程。

工具使用 ~/.local/share/toolchains，缓存集中 ~/.cache，用户现有 AVD/ADB 身份留在 ~/.android。配置模板是根目录 .env.example，可选本机工具路径放在忽略的 .local/dev.env；签名和 keystore.properties 放在 .local/signing，不提交。旧 AI 私人记录/凭据已从宿主清理，不能恢复为默认导入。

artifacts 只放当前可重建 APK；发布包上传 GitHub Releases。会话 work 只放本任务临时日志、测试数据和隔离模拟器，完成后清理；持久状态直接更新既有 docs，不堆日期归档和重复交接报告。

宿主运维由相邻 server-infra 私有仓库管理。应用开发不修改 SSH/Tailscale/Mihomo、宿主磁盘或 fnOS 内部设置。
