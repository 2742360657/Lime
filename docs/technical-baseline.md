# 技术基线与历史记录

当前产品依据[产品定义](product-scope.md)，源码实现差距见[当前状态](project-status.md)。旧文档已从工作目录清理，Lime Git历史保留。

源码90a6d25：16套231项Jest及类型检查通过；ARM64 debug/独立preview构建，真机隔离日用/完整ZIP备份验证通过，local-only上传队列为零。普通记录ID/字段摘要在升级前后相符。这些证据属于当时实现，不证明日记退出、AI完整自主管理、真实模型/渠道与新产品流程已验收。

仅保留该技术基线的ARM64独立preview及真实构建元信息在忽略的 `artifacts/apks/`；没有在清理任务中重新构建或发布。必要原生结果在 `.local/runs/technical-baseline/`，个人原文/数据与凭据不进入Git。

历史文件可从已保留提交查询，例如：

```bash
git show 06f8b35:docs/archive/validation/p5-offline-phone-validation.md
git show 90a6d25:docs/general-records-contracts.md
```

早期接口快照如引用旧验收报告，以Git中对应版本为准，不能作为当前交互要求。全服务器清理和目录说明见[环境布局](workspace-layout.md)。
