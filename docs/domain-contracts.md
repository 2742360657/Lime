# P2 本地业务命令契约

本批为 P2-A：命令层与普通页面接入。聊天运行时、Key、人格导入在 P2-B 接入；本文件不是助手已上线的说明。

## 边界

`src/domain` 是产品业务接口，不是通用 Agent 框架。复用现有 SQLite 表和页面；用 Zod 同时定义运行时校验与 TypeScript 类型。模型未来只能访问封装后的工具，不能传 SQL、表名、文件路径或调用方身份。

调用方由应用建立：`ui` 是人工页面操作；`agent` 是助手工具执行。读取日记/备忘录必须具有应用传入的 `{id,revision}` 授权引用，不能由模型自行声明授权。UI 可读取本机记录，助手不会因此获得全库原文权限。任务、习惯、显式记忆和未完成活动可在聊天相关查询中使用；查询有数量限制，不自动扫描日记。

首版 Agent 写入走可编辑建议。`propose` 只保存候选，不修改业务数据；人工确认时通过 `acceptProposal` 提交指定建议的指定版本。编辑建议产生新版本，旧确认不能提交。今后的明确自然语言快捷执行需要单独实现可信意图授权，不用模型自报“用户已授权”代替检查。

## 写命令

所有命令由严格 schema 校验，多余字段拒绝。ID 保留旧数据的非 UUID 格式；新 ID 由应用生成。日期是合法 `YYYY-MM-DD`，时间是 `HH:mm`，没有日期不能独立保存截止时间。

| type | 必填及可选参数 | 行为 |
|---|---|---|
| `task.create` | title；note、dueDateKey、dueTime | 新建一个待办，ID/顺序由事务确定 |
| `task.update` | id、expectedRevision、title；note、dueDateKey、dueTime | 完整更新可编辑字段；不清除来源链接 |
| `task.complete` | id、expectedRevision、completed | 完成或恢复；相同状态不增加版本 |
| `task.trash` | id、expectedRevision | 单条软删除，无永久删除接口 |
| `habit.checkin` | id、expectedRevision；timestamp、dateKey、note | 新增一次打卡；日期必须与本机时间戳一致，归档/删除习惯拒绝 |
| `memory.remember` | kind=fact/preference、key、content | 只保存明确事实或偏好；相同有效 key 不静默覆盖 |
| `memory.correct` | id、expectedRevision、content | 更正一个显式记忆 |
| `memory.forget` | id、expectedRevision | 清空内容并标记忘记；不再进入查询/上下文 |
| `activity.start` | kind、title；note、habitId | 保存通用未完成活动；可关联一个有效习惯 |
| `activity.complete` | id、expectedRevision；note | 完成活动；有关联习惯时，完成与一次打卡在同一事务中 |
| `activity.cancel` | id、expectedRevision | 取消活动，不打卡 |

任务标题/备注保持现有编辑器的 80/300 字符限制。活动和记忆不是日记推断结果；没有全库分析、向量服务或训练专用表。训练在 P2 通过通用活动承接，详细统计在 P5。

## 事务与回执

`execute(command, {operationId, actor:'ui'})` 的 operationId 由应用为一次操作生成，重试保持不变。校验后的参数规范化、SHA-256 指纹及成功回执一起保存；相同 ID/相同命令返回 `replayed`，相同 ID/不同参数返回 `OPERATION_ID_REUSED`。回执先于目标版本检查，因此成功提交后重复发送不会因旧版本再写一次。

业务更改、相关打卡、建议状态和回执必须原子提交。数据库错误抛出，不能转换成成功。返回 `{operationId, disposition: committed/replayed/unchanged, entity:{kind,id,revision}, related?}`；回执不保存整段原文/记忆正文，忘记后不能从回执恢复内容。停止模型生成不会撤销已提交的操作。

更改已有目标必须匹配 expectedRevision，删除/归档目标不能被旧命令复活。活动已经完成后，换一个 operationId 再完成会返回 `ACTIVITY_CLOSED`，不再新增打卡；相同 operationId 可读回原成功回执。

`DomainError.code` 包括 INVALID_ARGUMENT、NOT_FOUND、VERSION_CONFLICT、PERMISSION_DENIED、OPERATION_ID_REUSED、ALREADY_EXISTS、ACTIVITY_CLOSED、SOURCE_CHANGED、PROPOSAL_CLOSED。字段不明/日期不合法不能自动猜测后写入。模型层负责询问，domain 负责拒绝不合法状态。

## 读取与建议

- `listTasks/listHabits/listMemories/listActivities` 返回明确版本及有限记录，排除删除/忘记项；习惯列表不会自动附上全部历史。
- `readDocument({id,revision},context)` 返回该版本完整原文；无引用或版本变化拒绝。`listCheckins` 用 habitId 和日期范围读取有限历史。
- `propose(command, {requestId, documentRefs})` 校验命令与当前来源版本，仅保存候选。来源内文字是数据，不能获得操作身份。P2来源限定documents；当前P3已扩展local_materials附件引用，kind/版本校验与原文授权规则见[材料契约](material-contracts.md)。
- `editProposal(id,expectedRevision,command)` 仅人工调用；`acceptProposal(id,expectedRevision,operationId)` 仅人工调用，重新核对来源/目标版本。重复确认同一建议返回原回执，不重复写。
- 来源变化时不套用旧建议；人工需重新选择材料再生成。拒绝建议时清空候选命令内容，保留最小状态。

## 普通页面迁移范围

本批先切换任务的查建改完成/软删除，以及习惯的新增打卡。现有分类、排序、历史打卡编辑/撤销、日记/备忘录编辑继续走已经有事务的旧业务层；不会为了改目录一次重写所有页面。模型没有这些尚未开放的命令。

页面持有读取时的目标 revision；编辑期间被其他操作改动则保留输入并提示重新核对。保存、完成提示及关闭编辑器发生在真实提交之后。其余消费者在后续阶段逐项切换，不能宣称全仓所有操作已统一。

新增 `local_operations/local_memories/local_activities/local_proposals` 全部 local-only，旧业务表不改字段或 ID；旧库搬运固定原 P1 表集合，不把将来的 Agent 对象反写历史库。当前基础记录导出不包含这些新对象，P5 扩展完整导出。
