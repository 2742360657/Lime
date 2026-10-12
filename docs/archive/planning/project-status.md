> 归档于2026-10-12：仅记录旧规划或原版本验证，不是当前产品要求或发布结论。

# 当前状态

更新：2026-10-12。当前分支 `fix/general-records-architecture`。本批按开发原文和用户纠正完成通用本机资料架构，并取消历史兼容层。详细契约见[通用记录](../../contracts/general-records-contracts.md)。

| 范围 | 当前行为与边界 |
|---|---|
| 广泛资料 | 统一local_records、text/table校验、自由类别/列/单位、标签与时间、稳定分页、手动编辑/软删除/恢复；不再有成绩专用表/工具/页面 |
| AI处理 | 元信息可查询，正文/表格必须本轮明确选择且版本相符；提取/修改用可编辑建议，确定统计用BigInt，不猜分制/公式/缺失值/单位 |
| 独立存储 | PowerSync/OP-SQLite全部local-only；SQLite单一权威，外观设置单独存local_meta；删除旧库搬运、JSON启动导入/持续镜像和旧服务器字段/来源缓存 |
| 完整数据包 | 当前v4覆盖27类普通对象与原件；旧格式拒绝，不维护转换。版本冲突保留当前记录及恢复包，来源快照保留但不授予重新执行权限；Key/渠道凭据不导出 |
| 成熟日用入口 | 紧凑日记、备忘录草稿/分类、待办、习惯打卡、个人记忆、活动计划/整理继续复用；QQ/微信仍为显式前台收件，普通入库不自动调用模型 |
| 主机检查 | 类型检查及16套231项Jest通过；真实SQLite、SDK合成流覆盖来源授权、精确计算、事务失败、恢复冲突及重开；不等于人工体验通过 |
| 本批构建/手机 | 在本批代码提交后集中构建与原生隔离验收，证据待补；目前手机仍为0367a46旧preview，不把旧包当新架构交付 |
| 发布 | 未发布正式Release；真实模型、中文输入体验、系统保存/恢复与渠道长期离线行为仍需人工确认 |

现有手机记录不会用清数据/卸载方式升级。当前数据与草稿保护继续执行；不兼容历史指删除历史运行时和转换分支，不是授权删除用户文件。

旧报告只描述当时基线：[前批真机](../validation/p5-offline-phone-validation.md)、[日用场景旧批次](../validation/p5-daily-validation.md)、[完整备份旧批次](../validation/p5-backup-validation.md)、[助手运行时](../validation/p2-local-assistant-validation.md)、[材料入口](../validation/p3-materials-validation.md)、[微信](../validation/p4-weixin-intake-validation.md)、[QQ验证](../validation/p4-qq-validation.md)。其中成绩专用模式、v1-v3兼容、旧JSON/旧聊天安排已被本次架构替代。
