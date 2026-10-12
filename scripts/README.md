# 开发脚本

在仓库根目录执行。工具路径统一由 `source scripts/env.sh`配置；无需产品后台服务。

| 脚本 | 用途 |
|---|---|
| `check-environment.sh` | 只读核对Node/JDK/SDK、锁文件与已安装依赖 |
| `env.sh` | 载入本机构建配置、固定工具和缓存路径 |
| `android-build.sh` | 构建与记录包身份/基线 |
| `emulator-run.sh` | 使用已配置AVD，不清模拟器数据 |
| `repository-check.py` | 追踪结构、品牌和文档链接 |
| `apply-*.mjs` | 受控prebuild时保持原生签名/开发配置 |
| `device/` | 显式serial的原生/界面检查；输出`.local/runs/device/` |
| `fixtures/` | 仅回环的合成SSE/微信/QQ协议服务；阶段验收时按需启动 |

```bash
source scripts/env.sh
bash scripts/check-environment.sh
bash scripts/android-build.sh debug arm64-v8a
bash scripts/android-build.sh preview arm64-v8a
bash scripts/android-build.sh preview x86_64
# 配置私密正式签名并达到发布门槛后
bash scripts/android-build.sh release arm64-v8a
```

设备示例：`python3 scripts/device/p5-backup-device-check.py --serial <device>`。先核对脚本适用源码、debug与本仓库Metro，旧UI脚本不直接代表新布局验收。合成夹具位于 `scripts/fixtures/`，启动时记录自己的PID/端口，结束只清理自己的资源。

常规开发不用prebuild；不要用清数据、卸载应用、重复模型调用或依赖强制升级绕过失败。阶段测试方式见[开发流程](../docs/development-workflow.md)。
