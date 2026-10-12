# 开发工作流程

更新：2026-10-12。目录见[环境布局](workspace-layout.md)，产品依据见[产品定义](product-scope.md)。

## 日常开发

1. 在唯一仓库读取产品定义、当前状态和本阶段目标，检查Git状态；已有未提交改动先辨明来源。
2. 从`extended/dev` 开始一个聚焦分支，使用 `feat/<topic>`、`fix/<topic>` 或 `chore/<topic>`。实现与相关文档分成可评审提交，避免一项小改动就停止整个已授权阶段。
3. 先确认对应日常使用流程，再改共用接口和UI。保留成熟基础功能，优先固定依赖，不新建泛化平台或按场景堆模块。
4. 实现中记录有意义的验收条目；一个连贯阶段结束后集中检查。失败局部排查/重测，避免反复构建、UI套件和付费模型调用。
5. 更新状态、证据与未测项；需要发布时才创建最终发布产物，审查内容、许可、签名和实际能力。

`main`维护独立安装的纯本地正式版，`extended/dev` 是新范围工作的整合基线；旧检查点从 Git 历史查询，不保留重复工作目录。功能阶段验收后整合回 extended/dev。合并main、推送和正式发布按实际授权与验收进行，不在目录整理时自动执行。

## 固定环境与命令

```bash
source scripts/env.sh
bash scripts/check-environment.sh
# 缺少或需要按锁文件恢复依赖时
npm ci
# 开发调试，结束后停止本任务的进程
npm start
```

工具路径在 `.local/dev.env`，模板见根目录 `.env.example`；手机模型Key在应用设置。Node/JDK/SDK/Gradle wrapper/npm lock继续使用固定版本。原生工程已提交，日常无需prebuild；避免clean重生成和强制依赖升级。

纯文档/目录整理只运行环境、链接、脚本语法和必要的类型检查。功能阶段完成后：

```bash
python3 scripts/repository-check.py
npm run typecheck
npm run test:phase
bash scripts/android-build.sh preview arm64-v8a
```

构建支持debug、preview、release和arm64-v8a/x86_64，详细命令见[scripts说明](../scripts/README.md)。产物写入 `artifacts/release/` 或相应 debug/preview 目录，绑定commit/dirty/架构/包名/签名/摘要；旧包清理后不作为当前交付。正式签名只在私密目录。

## 设备与真实服务

设备脚本在 `scripts/device/`，合成协议夹具在 `scripts/fixtures/`。使用明确serial和当前debug/本仓库Metro；脚本输出集中 `.local/runs/device/`。旧UI检查带有旧布局假设，按当前状态审查后才使用。

真实设备/模型/渠道在功能阶段末集中验收。隔离合成库不能证明完整产品交互。保存本任务创建的服务PID、端口、偏好修改和临时文件清单，收尾只清理自身资源；不要杀其它工作区服务，不卸载/清应用数据。保持原件、草稿和可恢复修改。

## 交付与中断恢复

公开说明只包含必要证据，不上传个人原文、Key、签名、SQLite或完整日志。每个包报告其真实基线和未测项。打包成功不等于自主处理流程已验收，旧版本报告不跨版本复用。

中断前保存可评审提交/明确WIP、简要状态和本任务资源；恢复时先核对Git与进程，再接着做。当前产品定义、开发路线、状态和台账各司其职，日常记录不反复追加到所有文档。
