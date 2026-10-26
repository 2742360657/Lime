# 源码结构与产品边界

本地主线是 Expo/React Native Android 应用，TypeScript strict 模式；没有服务端、AI 模型调用或消息平台客户端。

| 路径 | 职责 |
|---|---|
| App.tsx、src/components/AppNavigator.tsx | 加载、本地状态 Provider、页面导航与返回处理 |
| src/screens/ | 今日、习惯、待办、备忘录、回收站和设置 |
| src/components/ | 共用编辑器、分组、历史和排序界面 |
| src/state/HabitStore.tsx | 提供业务操作与派生状态，加载并保存数据 |
| src/state/habitReducer.ts、storeTypes.ts | 状态动作与数据变更 |
| src/storage/habitStorage.ts | JSON 存储、规范化、历史 v1–v7 迁移、导出/导入 |
| src/types/habit.ts、src/utils/ | 业务类型、日期/频次/排序工具 |
| src/theme.ts、src/theme/ | 六套主题与动画 |
| app.json | 应用名称、包名、版本、versionCode 和权限策略；Gradle 读取该身份 |
| android/ | 已提交的原生工程、Gradle wrapper 与签名接入 |

数据流：界面调用 HabitStore → reducer 更新 AppData → 本地文件保存；启动从文件读取并规范化。这里使用文件存储，不能声称每次 UI 操作都已有数据库事务或服务端回执。

备忘录软删除可恢复，其余高影响操作按现有 UI 提示处理；版本升级必须保持数据路径和历史迁移。不要在整理/发布过程中重写存储架构或替用户清数据。

AI/微信/QQ 扩展历史保留在 extended/dev，不是 main 的架构依赖。Agent 执行宿主命令的权限不能被应用中的用户输入或文件内容继承。

页面职责、日期分组与整理交互的约定见[交互与信息组织](interaction-design.md)。
