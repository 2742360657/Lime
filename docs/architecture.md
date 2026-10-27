# 源码结构与产品边界

Lime 是离线 Android 应用，使用 Expo/React Native 与 TypeScript strict。业务范围是今日概览、习惯、待办、备忘录、主题和 JSON 备份；没有账号、业务服务器或后台常驻计时器。

## 职责与数据流

| 路径 | 职责 |
|---|---|
| App.tsx | 加载、读取失败恢复页、保存失败提示、导航和退出前保存 |
| src/state/AppProvider.tsx、selection.ts | 稳定 Store 接入 React、按数据片段订阅、主题和领域查询 |
| src/state/appStore.ts | 命令调度、读取状态、串行保存、合并连续修改、保存确认和显式恢复 |
| src/state/actions/ | 各领域的输入校验和业务命令；始终读取当前状态，不捕获旧页面数据 |
| src/state/reducers/、appReducer.ts | 习惯、待办、备忘录和设置的状态变更 |
| src/state/organize.ts | 过滤后的子集排序、跨组移动与排序的一次性提交 |
| src/types/app.ts、src/utils/ | 数据类型、日期/频次/排序规则 |
| src/storage/habitStorage.ts | 平台文件适配、JSON v1–v7 规范化/迁移、导入导出 |
| src/storage/snapshotRepository.ts | 平台无关的两槽快照协议与损坏检测，可注入文件故障测试 |
| src/screens/ | 各页面的展示、筛选与入口，按领域订阅数据 |
| src/components/MemoEditor.tsx | 备忘录草稿、自动保存、放弃快照、键盘与正文视口 |
| src/components/VirtualList.tsx、SectionHeading.tsx | 日常浏览和多选的平铺虚拟列表、日期/分类标题 |
| src/hooks/useTodoOrganize.ts、useBackupRestore.ts | 统一改期确认、系统文件选择与恢复确认流程 |
| src/components/DraggableList.tsx | 排序模式的跨组拖拽、自动滚动及辅助排序操作 |
| src/theme.ts、src/theme/、Themed* | 六主题、语义颜色、统一输入/开关/确认框 |
| src/update/、src/native/、android/…/LimeUpdate* | 更新检查、下载、安装包校验及系统安装授权 |

界面 → 领域命令 → reducer → AppData → 保存队列 → 快照仓库。选择器让未变化的数据片段保持引用稳定，备忘录自动保存不应使仅依赖主题的控件重新订阅整个业务状态。

移动分类与排序、批量删除按一个业务命令改变内存状态，保存队列只处理完整 AppData。这里没有数据库，不把一个业务动作称为数据库事务。

## 本地保存协议

目录仍是应用私有的 `habit-checkin/`；对外导出仍是 v7 JSON，接受历史 v1–v7 备份。

- `data.json`：v1.3.x 及更早的文件，只作为首次读取的迁移来源，不在新版本正常保存时覆盖。
- `data.0.json`、`data.1.json`：交替快照，包含格式号、递增序号、JSON 字符串及覆盖序号与内容的意外损坏校验值。
- 保存只写非活动槽，完成后读回并核对。成功前不报告已保存，上一份完整槽不被此次写入覆盖。
- 启动选取通过校验的最高序号。一个槽损坏时显示核对提示；两个槽都损坏时进入恢复页，不静默加载更旧的 data.json，也不把默认空数据写回。
- 完全没有快照时读取旧 data.json；旧文件损坏、结构不完整或版本不支持时停止加载。没有任何存储文件才视作新安装。
- 显式恢复先把原文件逐字节保留在私有 `recovery-*/`，再写新快照，成功后才替换当前界面和显示成功。归档失败则停止恢复。

校验值用于检测意外损坏，不用于防恶意篡改。写入成功和读回校验不等于硬件断电后的 fsync 保证；两个槽也不能保护卸载、手机丢失、整块存储损坏。仍需要用户主动导出到应用之外。恢复原件留在私有目录供排障，不自动上传或删除。

备忘录手动保存和正常退出会等待队列；切后台会提交备忘录尚在600ms防抖窗口内的草稿。写失败保留内存内容、持续显示重试入口。系统强杀仍可能中断未完成写入，不能承诺任何时刻强杀都不丢最后几字。

旧版 APK 不认识新快照，不能把降级当作数据回滚；需要跨版本取回数据时使用已核对的外部 JSON 备份。

## 约束与决策

本轮工程评估、取舍与后续触发条件见[工程治理](engineering.md)。页面职责及日期规则见[交互与信息组织](interaction-design.md)。发布前验证见[开发指南](development.md)。

main 是本地稳定线；extended/dev 的 AI/消息平台历史不是其依赖。应用输入和备份文件不能继承 agent 的宿主权限。包名、签名和更新原生校验保持独立的保护边界。
