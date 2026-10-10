# P4-B 手机显式收件核查

更新：2026-10-10。微信正式前台收件已接入；QQ独立验证取得真实绑定、短期Resume/ACK及TXT/PNG下载/原件一致证据，正式QQ入口未接入。长时补收/媒体过期仍未测，拒绝后的QQ附件曾未获平台重投。准确范围见[微信接入报告](p4-weixin-intake-validation.md)与[QQ报告](p4-qq-validation.md)；以下保留协议研究及早期验证语境。

## 微信

[腾讯官方协议](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol_zh_CN.md)有扫码绑定、HTTP getupdates 和媒体接口。扫码确认返回绑定用户、机器人ID、token和baseurl；后续仅收绑定本人的消息。token进入SecureStore，游标和回执进入本地数据库。官方OpenClaw插件依赖Node，不能直接装到React Native中。

前台点“读取”启动有界长轮询，退出/取消立即中断，不常驻。一次批次先事务保存消息及唯一收件回执，再推进非空get_updates_buf；不能把下载完成作为游标推进前提，否则一份坏文件堵住所有消息。媒体下载独立可重试，复用P3有界私有复制；原件保存不自动分析。需要核查返回主机白名单、AES-128-ECB/PKCS#7媒体解密、大小/链接有效期、session失效等手机兼容。优先系统成熟加密实现，不自写密码算法。

本批手机取得二维码后，用户通过微信扫码绑定成功；强停期间发送的3条测试消息稍后取回，图片/UTF-8文件下载/类型识别成功。仅验证本次短时间窗口；长时补收、文件过期/其它格式、合并转发及同一手机从相册扫码的UX仍未测。协议中的类型声明不证明所有类型可收到；没有证据时不承诺任意历史消息恢复。

## QQ

[腾讯官方插件](https://github.com/tencent-connect/openclaw-qqbot)支持开放平台机器人身份，当前提供扫码和AppID/AppSecret两种配置入口，默认WebSocket连接。不是普通个人QQ用户账号登录，也无需因此让用户先提交密码。Node插件需核查手机协议适配，不作为可直接复用的RN运行时。

QQ新WebSocket会话能否获取应用关闭期间的消息，不能从连接成功推断；Resume的短期恢复也不是无限历史查询。若显式读取不能补收则如实降级实时前台收件，不引入隐藏服务器或读取QQ私有数据库。微信/QQ各自验证后单独交付，不阻塞本地提醒。

### 2026-10-10补充核查

[官方事件协议](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)明确将Resume描述为短时间断线重连后的事件补发，需保存session_id及处理完毕的seq；收到Invalid Session仍须重新鉴权。因此QQ探针必须区分新会话、有效Resume、失效会话与强停后重开，不将连接成功记成离线补收成功。该次只读核查时尚无QQ真机账号或补收证据；后续实测如下。

[官方插件扫码入口](https://github.com/tencent-connect/openclaw-qqbot/blob/main/src/setup/login.ts)采用@tencent-connect/qqbot-connector的绑定任务。已只读核查1.2.0分发包：扫码通过create_bind_task/poll_bind_result取得加密机器人凭据，使用AES-256-GCM；运行时依赖node:crypto、node:https及终端二维码，并非RN可直接安装的SDK。该包package.json声明UNLICENSED，不能仅凭上层插件MIT许可把分发代码搬入产品。手机方案应独立按接口适配、复用系统加密并保留凭据隔离；该次只读核查未运行绑定任务，后续独立适配也没有安装此依赖或运行插件。

### QQ手机实测结论

fc0a762在小米14通过扫码及绑定重开、完整60秒Resume/心跳、文字取回、TXT/PNG下载/原件校验；再读新增0、下载跳过2。自动化和原生合成探针覆盖本人过滤、事务/防重、Invalid Session退新鉴权与取消，实际强停期间文字取回。正式业务入口/备份未接，长时/过期/合并转发未测，结论为受限可用。

早期附件因地址兼容被拒绝后没有在后续Resume中重投。修正官方媒体主机/协议相对地址及实际grouptalk.c2c.qq.com精确白名单后，用户重发两份附件才完成下载；本地seq保留不能保证平台再次提供。普通接入须先保存可见失败/未支持回执再推进seq，提示必要重发，不以后台服务器补洞。详细失败与修正见[QQ报告](p4-qq-validation.md)。

## 集成前门槛

绑定本人/拒绝其它发送者；手机前台网络、取消及凭据隔离；文本和实际附件流入P3；重复消息/中断游标不丢失；关闭后晚些读取与媒体过期；错误可解释且日志不含token/原文。渠道原型与真实凭据先在忽略的.local目录验证，再接产品入口。直接分享、打开文件与聊天附件始终保留。

## 本批采用与下一步

微信正式收件与v2完整备份已接入，证据见[接入报告](p4-weixin-intake-validation.md)。QQ协议/隔离探针可审查，私人捕获/凭据/二维码不进入Git。下一步冻结QQ普通收件的失败回执、材料/备份映射、媒体索引释放与原生生命周期；不将debug验证菜单视为正式日用功能。
