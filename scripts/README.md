# 开发与构建命令

source scripts/env.sh 后复用系统/用户工具链，npm ci 按固定锁文件安装。`npm run check` 执行仓库结构/版本/链接、类型检查及本地测试。测试使用合成数据，不需要真实模型 Key。

```bash
bash scripts/check-environment.sh
bash scripts/android-build.sh preview arm64-v8a
bash scripts/android-build.sh release arm64-v8a,x86_64
```

preview 独立运行但使用开发签名和 .dev 包名；release 使用私密正式签名，独立包名 app.lime.personalassistant。产物写 artifacts/对应模式，每个 ABI 单独 APK 和 SHA256SUMS。

正式签名通过 LIME_SIGNING_PROPERTIES 指向私密 keystore.properties；storeFile 相对 properties 所在目录解析。不要在仓库内公开任何 Key、签名文件或正式口令。

已提交原生工程，常规工作不运行 prebuild。原有 device/fixtures 是阶段验证资源，使用前核对新界面与明确设备序列号；不要自动清手机数据、混用其它工作区或使用旧验收结果替代当前版本。
