更新：2026-10-12。依据[当前产品定义](../product-scope.md)修订。

# 备忘录保留与助手接入契约

更新：2026-10-11。实现状态与集中验收结果由[当前状态](../technical-baseline.md)及[待测台账](../technical-baseline.md)登记；本契约不把历史真机结果当成本批验收。

## 来源与保留范围

Lime 的基础备忘录来自用户原项目 [Angelime](https://github.com/2742360657/Angelime)，导出基线为 `3248b4f402160a062a4107788ae51f6aa5984f7a`、`codex/memo-record-closure`。原项目当前公开 [MemosScreen](https://github.com/2742360657/Angelime/blob/main/src/screens/MemosScreen.tsx) 和 [Reducer](https://github.com/2742360657/Angelime/blob/main/src/state/habitReducer.ts) 用于只读核对。Lime 继续维护已迁入的页面及交互，没有再次复制原仓库历史、个人内容或旧服务器组件；导出边界见[源码来源](../technical-baseline.md)。

标题、正文、分类、标题/正文/分类本机搜索、自动保存、批量移动与排序、软删除和回收站恢复继续保留。成熟的紧凑编辑器从 `MemosScreen` 抽到 `src/memos/MemoEditor.tsx`，保持标题/分类/正文和“完成”返回路径。现有备忘录仍使用 `documents.kind='memo'`、`document_groups.kind='memo'` 和 `local_drafts`；不新增独立备忘录表、不改已有ID或日期、不自动分析正文。

## 保存与恢复

- 打开时先读取本机草稿，完成前暂时禁止输入；读取失败可重试或返回，不能覆盖尚未读出的草稿。已存在但格式无效或超限的草稿保持原样，不静默截断。
- 输入立即排队写草稿，800ms 后保存普通备忘录；保存前仍先写当前草稿。完成/Android 返回和应用进入非前台状态使用同一串行保存路径。系统立即终止进程仍可能中断进行中的事务，不能承诺尚未提交的最后按键已写盘。
- 保存带已打开的内容基线和 `revision`，并发改写、分类变动或删除发生后不覆盖原文。旧异步保存只能更新自己的基线，不能将后续输入误标为“已保存”。
- 完成返回须等待实际提交，再清除草稿。失败时保留当前输入及原基线；可继续编辑，或在草稿写入成功后返回，在设置的“恢复副本与草稿”另存后比较。
- 助手命令不删除或改写 `local_drafts`。用户编辑中的草稿与助手改变后的普通版本分别保留，后续保存需处理版本冲突。
- 手动编辑也必须核对目标为未删除的memo、分类为有效memo分类；删除分类造成版本变化时严格保留冲突，不自动重建基线。用户可选择有效分类/未分类，或保留草稿返回后另存；恢复副本对已缺失分类使用未分类，不覆盖当前版本。
- 保存标题与正文保持原字符和换行，不因模型命令自动 trim。标题上限300字符、正文100000字符。助手新建要求标题或正文至少有一项非空；普通手动新建仍沿用成熟编辑流程。

## 本地命令

`src/memos/commands.ts` 导出 `memoCommandSchemas` / `MemoCommand`；`src/memos/domain.ts` 提供事务内 `mutateMemo(tx, command, {id, now})`。权限和持久操作回执由共享 domain 层处理，不能将该内部事务函数直接提供给模型。

| 命令 | 字段与结果 |
|---|---|
| `memo.create` | title/body/groupId；原文、创建日期和稳定ID写入普通 documents，返回 memo 回执 |
| `memo.update` | id/expectedRevision/title/body/groupId；完整新内容均须明确提供，匹配版本后更新，相同内容不增版本 |
| `memo.trash` | id/expectedRevision；只做软删除，正文、分类和草稿保留 |
| `memo.restore` | id/expectedRevision；恢复原文，原分类已不存在时移到未分类，追加到现有排序末尾 |

分类必须存在、未删除且 `kind='memo'`。其它 document 类型不能被备忘录命令修改。每次实质更改增加普通记录版本；旧版本、写入失败和回执提交失败由上层事务统一拒绝或回滚。助手没有永久清空或任意 SQL 工具。

## 查找与来源

listMemoMetadata按标题、正文、分类字面匹配关键词，返回有限ID/标题/分类/版本；列表不返回完整正文。助手可用read_document按准确版本取得相关内容，应用记录本轮来源快照；无需用户先手选历史备忘录。每轮来源数量/正文限额见[助手契约](agent-runtime-contracts.md)。

明确的新信息可自主创建备忘录，包括从本轮提供的材料提取内容。整段改写、删除保留具体预览，并带本轮读取的目标版本；恢复由手动回收站处理。来源文字不改变权限。

引用到聊天先完成手动保存再取得真实版本。查看来源包含自主提交与接受预览的快照，当前备份恢复后的已保存结果仍可追溯；展开来源不重新解析或调用模型。后来的原文变化不改写历史快照。
