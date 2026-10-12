# 酸橙 · Lime

个人使用的 Android 应用：**习惯、待办、备忘录是基础功能，AI 根据自然语言和微信／QQ转发内容自主管理这些功能。** 数据保存在手机，模型使用用户配置的云 API。

2026-10-12用户确认：日记退出产品范围；生日、桌子规格、跑步感受、成绩和学生工作PDF都是广泛输入的例子。基础功能最初从 [Angelime](https://github.com/2742360657/Angelime) 迁移，此处仅声明代码来源。当前已移除日记入口/专用编辑器，补齐习惯命令、日常自主操作和按需历史查询；转发后自动处理与真实模型/真机验收仍待下一阶段。

## 开发入口

| 文档 | 职责 |
|---|---|
| [产品定义](docs/product-scope.md) | 用户确认的功能、自动处理方式和日常流程；需求依据 |
| [当前状态](docs/project-status.md) | 源码基线、已有实现与新范围之间的差距 |
| [开发路线](development-plan-revised.md) | 下一阶段的顺序和完成条件 |
| [工作流程](docs/development-workflow.md) | Git、实现、集中测试、构建与交付 |
| [目录与环境](docs/workspace-layout.md) | 唯一工作目录、工具、私密配置、临时产物 |
| [架构边界](docs/product-architecture.md) | 复用当前基础设施支持自主处理；不是重造平台 |
| [待测台账](docs/phase-test-ledger.md) | 新范围的流程验收，阶段完成后集中执行 |

[现有代码契约](docs/contracts/README.md) 用于核查实现；[技术基线](docs/technical-baseline.md)区分已验证范围与当前目标。旧文档从Git查询，不在工作目录维护另一套规划。

## 开始工作

本机唯一活动仓库：`/home/angelime/Projects/Lime`。工具与缓存留在用户目录；不需要启动产品后台。固定环境以 `toolchain.json`、`package-lock.json` 和 Android Gradle wrapper 为准。

```bash
source scripts/env.sh
bash scripts/check-environment.sh
npm start
```

全新clone缺少依赖时先运行 `npm ci`；已有依赖正常时直接使用。手机模型Key在应用设置，构建工具路径放在忽略的 `.local/dev.env`。

完成一个功能阶段后集中验证：

```bash
python3 scripts/repository-check.py
npm run typecheck
npm run test:phase
bash scripts/android-build.sh preview arm64-v8a
```

`debug`需要Metro；`preview`带JS可独立试用；`release`使用私密正式签名。当前APK只用于相应源码基线的技术验证，正式发布依据新的产品流程验收。签名、原件、用户数据、日志与生成包不进入Git。许可范围见 [NOTICE](NOTICE.md)。
