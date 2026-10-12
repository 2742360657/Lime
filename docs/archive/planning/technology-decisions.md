> 归档于2026-10-12：仅记录旧规划或原版本验证，不是当前产品要求或发布结论。

# 技术决策与官方依据

日期：2026-10-09。安装的基线见package lock；候选不写成已验证。优先复用成熟组件，业务适配仍需实现。

## ADR-001 单仓与单机职责（确定）

只保留Android工程；自建产品API、PostgreSQL、Directus、AstrBot、Mem0、Tika、pg-boss、PowerSync服务端和Tailscale访问全部不在当前产品范围。构建可以在现有Linux开发机上做，与应用部署无关。

## ADR-002 本地SQLite（优先复用，P1落地）

已有OP-SQLite18.2.5、PowerSync2.3.1与响应式查询，首选PowerSync客户端的local-only表，以最少改动保留事务/查询；不连接同步后端或引入身份注册。官方支持本地使用，同时提醒普通同步表的上传队列会无限增长，因此不能仅停connect。

新安装使用新的纯本地schema；旧记录由版本化导入迁移，保留稳定ID/关联/草稿/原文/回收站。既有数据库table flag直接改变不保证复制数据，必须有受控迁移；不调用disconnectAndClear或删除内部队列掩盖问题。

不同时换expo-sqlite/ORM。若local-only适配实际遇到不可解决的兼容问题，再单独ADR评估直接OP-SQLite；不在本轮预装一套新数据库。

官方：[PowerSync本地使用](https://docs.powersync.com/client-sdks/advanced/local-only-usage)、[RN/Expo客户端](https://docs.powersync.com/client-sdks/reference/react-native-and-expo)。

## ADR-003 Agent通信与工具循环（P2采用，证据分层）

优先评估开源AI SDK：显式DeepSeek provider、同进程Agent/DirectChatTransport、schema工具、expo/fetch流式。文档组合能支持此方向，但Expo55/Hermes、DeepSeek当前模型/工具多轮与停止必须实测；选择受支持稳定版本再锁定。不得默认使用模型字符串引入另一Gateway，不依赖Next.js产品后端。

SDK负责通信/流/工具循环，业务命令负责校验/事务/来源/回执。不得自造复杂Agent框架，亦不能把开源工具execute函数当作完整业务鉴权。

官方：[Expo接入](https://ai-sdk.dev/docs/getting-started/expo)、[进程内Agent](https://ai-sdk.dev/docs/reference/ai-sdk-ui/direct-chat-transport)、[DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)、[工具调用](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)。

## ADR-004 用户Key与人格（P2实现）

运行时输入用户自己的Key，使用已有Expo SecureStore/Android Keystore；不写进EXPO_PUBLIC、APK、普通SQLite、日志/备份。人格文本私密导入、预览、保存、替换或停用；公开仓库不复制原始角色附件。明确事实用已有SQLite存储/查询，不搬Python Mem0/Qdrant进APK；数据量证明需要后才增加语义检索。

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

2026-10-10阶段结论：微信已正式接入，QQ独立手机适配采用Android系统GCM、专用受限WebSocket、有界下载及现有SecureStore/P3，没有新增Node插件依赖。实际绑定、短期Resume/心跳及TXT/PNG原件一致通过；曾被拒绝的附件没有再次补发。QQ普通接入先补可见失败回执、媒体能力释放与生命周期，再接业务材料/完整备份；不能承诺任意历史，详见[QQ报告](../validation/p4-qq-validation.md)。

## ADR-008 本地通知（P4-A已接入，送达待验）

选Expo Notifications预排确定时间提醒；到点不用唤醒模型。手机后台不能保证常驻Agent，Doze/WorkManager/特定前台服务都有约束；本项目已无需实时后台收件，不加入长期轮询服务。

官方：[Expo55 Notifications](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/)、[Doze](https://developer.android.com/training/monitoring-device-state/doze-standby)、[前台服务限制](https://developer.android.com/develop/background-work/services/fgs/timeout)。HyperOS送达以真机结果为准。

## ADR-009 测试与公开发布（确定）

开发中记录条目；阶段实现后统一静态/构建/功能/真机验收；手动触发CI，不每次push跑全套或调用付费模型。Git小提交和阶段验收分开。

P2-A已锁定Jest29.7.0、jest-expo55.0.22（匹配Expo55的bundledNativeModules）和@types/jest29.5.14。分开运行Node真实SQLite命令测试与Expo preset兼容测试；后者不模拟证明原生SQLite。React Native Testing Library尚未引入，仅在需要组件交互测试时选择。手动CI增加阶段测试命令，不自动调用模型。官方依据：[Expo测试指南](https://docs.expo.dev/develop/unit-testing/)。

公开仓库仅当前手机源码与规划，清洁起始历史保留来源；不将旧混合工作区的所有分支/签名/运行数据推送。仅源码发布不等于APKRelease或开源授权条款，许可由所有者决定。

## ADR-010 本地业务校验与回执（P2-A采用）

Zod4.6.5（MIT）用于严格命令schema与共享类型；不自行编写通用JSON schema引擎。命令校验还在domain边界执行，未来工具参数schema不能替代版本、来源授权和事务检查。已在当前Expo/Hermes真机的隔离原生探针验证，未因此宣称AI SDK的流式/工具循环已兼容。Jest/jest-expo亦为MIT，依赖通过npm固定，未复制第三方库源码。

回执存命令规范化指纹和最小实体引用；不存原始记忆正文。训练通过通用活动和关联习惯完成，不新增训练服务。详见[命令契约](../../contracts/domain-contracts.md)。官方：[Zod](https://zod.dev/)、[Zod许可](https://github.com/colinhacks/zod/blob/main/LICENSE)。

P2-A安装后的production audit仍有39项告警（1 low/10 moderate/28 high），新增测试工具后的完整依赖树为62项；没有进行强制跨版本升级。记录不等于已完成漏洞处置；P5正式发布需按生产用途审查现有依赖链，私密audit报告留在.local。

## P2-B/C固定依赖与验证范围

AI SDK Core `ai@7.0.136`（Apache-2.0）与 `@ai-sdk/deepseek@3.0.63`（Apache-2.0）使用相同provider v4协议；Node22满足构建要求。直接传入createDeepSeek生成的模型对象与expo/fetch，不使用字符串模型Gateway、自建后端或SDK工作流服务。SDK承担SSE/schema/工具循环，产品模块仅保存请求、授权和业务回执。

默认模型为官方别名`deepseek-flash`；[官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/)将其指向V4.1-Flash。本批仅文本和工具接入，模型支持视觉不等于应用附件入口已经实现。人格文件只保存在手机私有库，不预置个人角色原文。31项Jest通过；Android/Hermes隔离探针和Node真实DeepSeek生产运行时分项通过，模拟器设置UI分段验收通过。实际手机Key聊天与人工角色表达待验；证据见[P2助手报告](../validation/p2-local-assistant-validation.md)，不以npm安装作为兼容证据。

真机发现RN自带AbortController缺少现代AbortSignal接口。采用`abortcontroller-polyfill@1.7.8`（MIT）的完整`cjs-ponyfill`补齐reason/any/throwIfAborted与一次性事件；不加载其fetch补丁，网络仍使用Expo原生fetch。产品超时用可清理的控制器定时器，避免每轮留下timeout信号定时器。补丁来源为[官方项目](https://github.com/mo/abortcontroller-polyfill)，包完整性按npm发布的SHA-512核对，未复制源码进仓库。当前真机SDK流、工具循环、SecureStore、隔离数据库关闭重开及一次打卡已通过；真实API与界面体验分别记录。

延迟验证进一步发现：RN缺少全局DOMException，signal-only补丁在旧控制器上重复派发事件，使once监听丢失。最终使用包内完整控制器/信号ponyfill，不加载fetch补丁；DOMException复用固定RN0.83.10内置WebIDL实现并安装到global。该RN导入是私有路径，后续升级RN/Expo必须复测现代取消、超时、once监听和原生SDK流；不得盲目删掉兼容模块。短超时与合并取消事件已在当前真机验证。

## P3本机材料实现与分项证据

采用既有Expo DocumentPicker/FileSystem/Sharing与Android ContentResolver/Bitmap/PdfRenderer；新增小型Android适配负责有界私有复制、持久入站批次和SEND/VIEW，不自写PDF/OCR引擎。文件选择器禁用提前缓存复制，临时content授权在本次操作内用于限流存入私有目录，不删除外部原件。图片按当前AI SDK provider协议使用JPEG file part，最终序列化为本次请求的image_url，没有云Files持久上传。

原生API36隔离合成探针通过文本/图片/PDF文本与扫描页、限流/保留原件、来源阻断/去重/重开及零队列。Node真实生产运行时一次DeepSeek视觉请求识别合成图片成功；不以此声称手机真实Key聊天通过。完整本批结果、界面与构建身份及限制见[P3报告](../validation/p3-materials-validation.md)。Office仅保存，加密/复杂PDF和真机提供方仍按限制与待测项记录。

P4-A锁定expo-notifications55.0.27（MIT）；现有已提交Android工程通过依赖manifest合并加入通知/重启组件，未执行prebuild --clean、未索取精确闹钟权限。真机实际队列/改期取消与独立preview入口已验证，实际送达仍待验，见[P4-A报告](../validation/p4-reminders-validation.md)。
