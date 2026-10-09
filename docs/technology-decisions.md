# 技术决策与官方依据

日期：2026-10-09。安装的基线见package lock；候选不写成已验证。优先复用成熟组件，业务适配仍需实现。

## ADR-001 单仓与单机职责（确定）

只保留Android工程；自建产品API、PostgreSQL、Directus、AstrBot、Mem0、Tika、pg-boss、PowerSync服务端和Tailscale访问全部不在当前产品范围。构建可以在现有Linux开发机上做，与应用部署无关。

## ADR-002 本地SQLite（优先复用，P1落地）

已有OP-SQLite18.2.5、PowerSync2.3.1与响应式查询，首选PowerSync客户端的local-only表，以最少改动保留事务/查询；不连接同步后端或引入身份注册。官方支持本地使用，同时提醒普通同步表的上传队列会无限增长，因此不能仅停connect。

新安装使用新的纯本地schema；旧记录由版本化导入迁移，保留稳定ID/关联/草稿/原文/回收站。既有数据库table flag直接改变不保证复制数据，必须有受控迁移；不调用disconnectAndClear或删除内部队列掩盖问题。

不同时换expo-sqlite/ORM。若local-only适配实际遇到不可解决的兼容问题，再单独ADR评估直接OP-SQLite；不在本轮预装一套新数据库。

官方：[PowerSync本地使用](https://docs.powersync.com/client-sdks/advanced/local-only-usage)、[RN/Expo客户端](https://docs.powersync.com/client-sdks/reference/react-native-and-expo)。

## ADR-003 Agent通信与工具循环（候选，P2验证）

优先评估开源AI SDK：显式DeepSeek provider、同进程Agent/DirectChatTransport、schema工具、expo/fetch流式。文档组合能支持此方向，但Expo55/Hermes、DeepSeek当前模型/工具多轮与停止必须实测；选择受支持稳定版本再锁定。不得默认使用模型字符串引入另一Gateway，不依赖Next.js产品后端。

SDK负责通信/流/工具循环，业务命令负责校验/事务/来源/回执。不得自造复杂Agent框架，亦不能把开源工具execute函数当作完整业务鉴权。

官方：[Expo接入](https://ai-sdk.dev/docs/getting-started/expo)、[进程内Agent](https://ai-sdk.dev/docs/reference/ai-sdk-ui/direct-chat-transport)、[DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)、[工具调用](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)。

## ADR-004 用户Key与人格（确定方案，待实现）

运行时输入用户自己的Key，使用已有Expo SecureStore/Android Keystore；不写进EXPO_PUBLIC、APK、普通SQLite、日志/备份。人格文本私密导入/编辑；公开仓库不复制原始角色附件。明确事实用已有SQLite存储/查询，不搬Python Mem0/Qdrant进APK；数据量证明需要后才增加语义检索。

官方：[Expo55 SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)。

## ADR-005 分享/打开文件（优先现有组件，P3）

SDK55已安装expo-sharing含接收分享API，但仍标实验性；优先现有组件与React Navigation，集中验证冷/热启动、多文件与重复intent。若无法满足，再选SDK55对应expo-share-intent6.x，不并装两套或迁移导航。

外部文件ACTION_VIEW与SEND/SEND_MULTIPLE分别实现/验收。临时URI先复制到私有目录，已有FileSystem/DocumentPicker复用；必要Intent/native桥接属于少量产品适配，不自己写整套文件系统。

官方/源码：[Expo55 Sharing](https://docs.expo.dev/versions/v55.0.0/sdk/sharing/)、[expo-share-intent](https://github.com/achorein/expo-share-intent)、[Android接收分享](https://developer.android.com/develop/ui/compose/sharing/receive)。不照搬第三方prebuild --clean步骤。

## ADR-006 图片与文档（明确格式边界，P3）

图片走DeepSeek已确认支持的视觉输入，用实际字节/base64或文件ID，不传手机content URI让云端“直接看”。当前Files API文档支持图片，不是Office/PDF解析器；需要明确文件过期/删除策略。

纯文本先手机解析；PDF在API35+可用原生PdfRenderer文本提取，扫描页按需渲染配视觉或ML Kit中文OCR。大小/页数有限，复杂表格提取需原文核对。原件始终保留。

Office/复杂表格移动端解析尚未定型，不在本轮承诺全格式支持或引入整套桌面引擎。先核查成熟组件的许可、维护、Android/Hermes兼容与结果，再扩支持清单。仅文件能保存不代表内容已解析。

官方：[DeepSeek文件接口](https://api-docs.deepseek.com/guides/files_api/)、[视觉](https://api-docs.deepseek.com/guides/vision/)、[PdfRenderer](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer.Page)、[ML Kit中文识别](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)。

## ADR-007 微信/QQ前台手动收件（协议可行，P4账号实测）

微信优先ClawBot：腾讯维护的HTTP长轮询/收取游标和媒体代码提供依据；QQ优先官方机器人C2C/WebSocket外连，不要求公开回调。这是协议层面的可行性，现有Node/OpenClaw插件不能原样装进RN。

复用允许移植的协议/媒体逻辑，网络、加解密和私有存储用成熟组件；仅补平台/前台生命周期适配。QQ机器人不等于普通个人QQ号。已有源码说明不证明账号权限或合并转发能力。

用户无需实时接收，点击读取时连接。微信游标/QQRESUME不能据此承诺任意离线历史；必须验收关闭应用后转发、晚些打开、凭据过期及文件URL失效。不得用通知监听/无障碍模拟读私有聊天数据库代替正式入口。

官方源码：[腾讯微信协议](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol_zh_CN.md)、[微信插件依赖](https://github.com/Tencent/openclaw-weixin/blob/main/package.json)、[QQ插件](https://github.com/tencent-connect/openclaw-qqbot)、[Android应用沙箱](https://source.android.com/docs/security/app-sandbox)。

## ADR-008 本地通知（成熟组件，P4）

选Expo Notifications预排确定时间提醒；到点不用唤醒模型。手机后台不能保证常驻Agent，Doze/WorkManager/特定前台服务都有约束；本项目已无需实时后台收件，不加入长期轮询服务。

官方：[Expo55 Notifications](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/)、[Doze](https://developer.android.com/training/monitoring-device-state/doze-standby)、[前台服务限制](https://developer.android.com/develop/background-work/services/fgs/timeout)。HyperOS送达以真机结果为准。

## ADR-009 测试与公开发布（确定）

开发中记录条目；阶段实现后统一静态/构建/功能/真机验收；手动触发CI，不每次push跑全套或调用付费模型。Git小提交和阶段验收分开。

P1后、P2实现前计划采用Jest + 匹配Expo55的jest-expo；实际依赖尚未安装/锁定。React Native Testing Library仅在需要组件交互测试时引入。先覆盖命令校验、版本/授权、幂等和事务边界，不建立大规模快照套件；原生数据库持久化另做集成验证。官方依据：[Expo测试指南](https://docs.expo.dev/develop/unit-testing/)。

公开仓库仅当前手机源码与规划，清洁起始历史保留来源；不将旧混合工作区的所有分支/签名/运行数据推送。仅源码发布不等于APKRelease或开源授权条款，许可由所有者决定。
